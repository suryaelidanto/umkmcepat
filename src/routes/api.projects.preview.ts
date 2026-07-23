import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  validateUIMessages,
} from "ai";

import { getAiModel } from "@/lib/ai";
import { getDefaultAiModel } from "@/lib/ai-models";
import { moderateProjectRequest } from "@/lib/ai-moderation";
import { auth } from "@/lib/auth";
import { isBoundedJsonError, readBoundedJson } from "@/lib/bounded-json";
import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import {
  mergeProjectBriefPatch,
  parseProjectBrief,
} from "@/lib/projects/brief";
import { parseWorkspaceCard } from "@/lib/projects/brief-flow";
import {
  buildProjectChatContext,
  dedupeUiMessages,
  getTextFromUIMessage,
  parseProjectChatMessages,
  parseProjectChatSummary,
  parseProjectMemoryFacts,
} from "@/lib/projects/chat-memory";
import { buildCardSystemPrompt } from "@/lib/projects/discuss-tool";
import { claimDiscussTurn } from "@/lib/projects/discuss-turn";
import {
  readTurnState,
  subscribeProgress,
} from "@/lib/projects/discuss-turn-pubsub";
import {
  persistProjectChatTurn,
  repairDiscussCardWithTool,
  scrubBriefForStorage,
} from "@/lib/projects/discuss-turn-shared";
import { runDiscussTurn } from "@/lib/projects/discuss-turn-worker";
import { DISCUSS_SYSTEM_PROMPT } from "@/lib/projects/prompts/discuss-system";
import { markStaleProjectBuilds } from "@/lib/projects/stale-builds";
import { buildBriefPatchFromWorkspaceAnswers } from "@/lib/projects/workspace-answers";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  chargeEnergyForAiUsage,
  checkEnergy,
  isUserVerified,
  MIN_ENERGY_DISCUSS,
} from "@/lib/user-credits";

// Re-export so external importers (e.g. the preview test) keep resolving after
// the discuss tool/prompt builders moved to the pure module.
export { buildOneCallSystemPrompt } from "@/lib/projects/discuss-tool";

type PreviewRequest = {
  message?: UIMessage;
  messages?: UIMessage[];
  mode?: "discuss" | "build" | "repair_card";
  projectId?: string;
  workspaceAnswers?: unknown;
};

export const Route = createFileRoute("/api/projects/preview")({
  server: {
    handlers: {
      POST: ({ request }) => handlePreviewPost(request),
    },
  },
});

async function handlePreviewPost(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const userId = session.user.id;

  const verified = await isUserVerified(userId);
  if (!verified) {
    return Response.json(
      {
        message: "Verifikasi nomor telepon diperlukan.",
        code: "verification_required",
      },
      { status: 403 },
    );
  }

  const rateLimitResponse = await checkRateLimit(request, "ai", userId);

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let body: PreviewRequest;

  try {
    body = (await readBoundedJson(request, {
      maxBytes: 256 * 1024,
    })) as PreviewRequest;
  } catch (error) {
    if (isBoundedJsonError(error)) {
      return Response.json(
        {
          code: error.code,
          message:
            error.code === "request_body_too_large"
              ? "Pesan terlalu besar. Ringkas dulu sebelum dikirim."
              : "Format pesan belum valid.",
        },
        { status: error.code === "request_body_too_large" ? 413 : 400 },
      );
    }

    throw error;
  }

  if (!body.projectId) {
    return Response.json({ message: "Proyek tidak valid." }, { status: 400 });
  }

  if (body.mode !== "repair_card") {
    const energy = await checkEnergy(userId, MIN_ENERGY_DISCUSS);
    if (!energy.allowed) {
      return sseError({
        message: "Energi harian habis. Coba lagi besok.",
        code: "energy_exhausted",
        remaining: energy.remaining,
      });
    }
  }

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, userId },
    select: { id: true, prompt: true, status: true, title: true },
  });

  if (!project) {
    return Response.json(
      { message: "Proyek tidak ditemukan." },
      { status: 404 },
    );
  }

  if (project.status === "building") {
    const prunedCount = await markStaleProjectBuilds(project.id);

    if (prunedCount > 0) {
      project.status = "failed";
    }
  }

  if (project.status === "building") {
    return Response.json(
      {
        message:
          "AI sedang membangun. Tunggu sampai selesai atau hentikan dulu.",
      },
      { status: 409 },
    );
  }

  const [chatRow] = await prisma.$queryRaw<
    [
      {
        brief: unknown;
        chatMessages: unknown;
        chatSummary: unknown;
        lastCompactedMessageCount: unknown;
        memoryFacts: unknown;
        workspaceCard: unknown;
      },
    ]
  >`
    SELECT "chatMessages", "chatSummary", "memoryFacts", "lastCompactedMessageCount", "brief", "workspaceCard" FROM "Project" WHERE id = ${project.id} AND "userId" = ${userId}
  `;
  const storedMessages = parseProjectChatMessages(chatRow?.chatMessages);
  const parsedChatSummary = parseProjectChatSummary(chatRow?.chatSummary);
  const chatSummary = {
    ...parsedChatSummary,
    compactedMessageCount: Math.max(
      parsedChatSummary.compactedMessageCount,
      typeof chatRow?.lastCompactedMessageCount === "number"
        ? chatRow.lastCompactedMessageCount
        : 0,
    ),
  };
  const memoryFacts = parseProjectMemoryFacts(chatRow?.memoryFacts);
  const incoming = body.message ? [body.message] : (body.messages ?? []);

  if (incoming.length > 1) {
    return Response.json(
      {
        code: "chat_turn_count_exceeded",
        message: "Kirim satu pesan baru dalam satu waktu, ya.",
      },
      { status: 400 },
    );
  }

  const incomingPartCount = incoming.reduce(
    (count, message) => count + message.parts.length,
    0,
  );
  const incomingBytes = Buffer.byteLength(JSON.stringify(incoming), "utf8");

  if (incomingPartCount > 32 || incomingBytes > 16 * 1024) {
    return Response.json(
      {
        code: "chat_turn_too_large",
        message: "Pesan terlalu panjang. Ringkas dulu sebelum dikirim.",
      },
      { status: 413 },
    );
  }

  let latestUserText = incoming
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ");

  // ponytail: fail-safe if client sent empty text but valid workspaceAnswers
  if (
    !latestUserText.trim() &&
    Array.isArray(body.workspaceAnswers) &&
    body.workspaceAnswers.length > 0
  ) {
    const summary = body.workspaceAnswers
      .map((item) => {
        const ans = item as Record<string, unknown> | null;
        const q =
          typeof ans?.question === "string" ? ans.question : "Pertanyaan";
        const a =
          typeof ans?.answer === "string" && ans.answer
            ? ans.answer
            : "(lewati)";
        return `${q}\nJawaban: ${a}`;
      })
      .join("\n\n");

    if (incoming[0]) {
      if (!incoming[0].parts) {
        incoming[0].parts = [];
      }
      const textPart = incoming[0].parts.find((p) => p.type === "text");
      if (textPart && "text" in textPart) {
        textPart.text = summary;
      } else {
        incoming[0].parts.push({
          type: "text",
          text: summary,
        } as UIMessage["parts"][number]);
      }
    }
    latestUserText = summary;
  }

  if (latestUserText.trim()) {
    let moderation;
    try {
      moderation = await moderateProjectRequest(latestUserText);
    } catch (error) {
      console.error(
        "[moderation] failed:",
        error instanceof Error ? error.message : error,
      );
      return Response.json(
        {
          code: "moderation_unavailable",
          message: "Pemeriksaan keamanan belum berhasil. Coba lagi sebentar.",
        },
        { status: 503, headers: { "Retry-After": "3" } },
      );
    }

    if (moderation.usage) {
      await chargeEnergyForAiUsage({
        userId,
        modelId: moderation.modelId || getDefaultAiModel(),
        inputTokens: moderation.usage.inputTokens,
        outputTokens: moderation.usage.outputTokens,
        reason: "moderation",
      });
    }

    if (!moderation.allowed) {
      return Response.json(
        {
          code: "project_request_blocked",
          message: moderation.message || "Permintaan belum bisa diproses.",
        },
        { status: 400 },
      );
    }
  }

  const currentBrief = parseProjectBrief(chatRow?.brief, project.prompt);
  const storedWorkspaceCard = parseWorkspaceCard(
    chatRow?.workspaceCard,
    currentBrief,
  );
  let workspaceAnswerPatch = buildBriefPatchFromWorkspaceAnswers({
    card: storedWorkspaceCard,
    fallbackText: latestUserText,
    workspaceAnswers: body.workspaceAnswers,
  });

  if (!hasBriefPatchValue(workspaceAnswerPatch)) {
    const recentStoredAnswerTexts = storedMessages
      .filter((message) => message.role === "user")
      .slice(-6)
      .reverse()
      .map(getTextFromUIMessage)
      .filter((text) => /Jawaban:/i.test(text));

    for (const text of recentStoredAnswerTexts) {
      workspaceAnswerPatch = buildBriefPatchFromWorkspaceAnswers({
        card: storedWorkspaceCard,
        fallbackText: text,
        workspaceAnswers: undefined,
      });

      if (hasBriefPatchValue(workspaceAnswerPatch)) {
        break;
      }
    }
  }
  const effectiveBrief = mergeProjectBriefPatch(
    currentBrief,
    workspaceAnswerPatch,
  );

  if (body.mode === "repair_card") {
    return repairWorkspaceCard({
      brief: effectiveBrief,
      messages: storedMessages,
      project,
      userId,
    });
  }

  if (!incoming.length) {
    return Response.json(
      { message: "Pesan tidak boleh kosong." },
      { status: 400 },
    );
  }

  // Dedupe concurrent discuss turns for the same project. A second in-flight
  // turn (client double-fire) gets a 409 instead of burning a second LLM call
  // and flickering the workspace card between two answers. The DB turn lease
  // (`claimDiscussTurn` inside `handleDiscussTurnOneCall`) is the single source
  // of truth for "one turn at a time" and survives restarts.
  await persistProjectBrief({
    brief: effectiveBrief,
    projectId: project.id,
    userId,
  });

  const messages = await validateUIMessages({
    messages: dedupeUiMessages(
      parseProjectChatMessages([...storedMessages, ...incoming]),
    ),
  });
  const chatContext = buildProjectChatContext({
    fieldState: {},
    memoryFacts,
    messages,
    summary: chatSummary,
  });

  return handleDiscussTurnOneCall({
    chatContext,
    effectiveBrief,
    memoryFacts,
    messages,
    project,
    summary: chatSummary,
    userId,
  });
}

async function handleDiscussTurnOneCall({
  chatContext,
  effectiveBrief,
  memoryFacts,
  messages,
  project,
  summary,
  userId,
}: {
  chatContext: ReturnType<typeof buildProjectChatContext>;
  effectiveBrief: ReturnType<typeof parseProjectBrief>;
  memoryFacts: ReturnType<typeof parseProjectMemoryFacts>;
  messages: UIMessage[];
  project: { id: string; prompt: string; status: string; title: string };
  summary: ReturnType<typeof parseProjectChatSummary>;
  userId: string;
}) {
  // Server-side discuss flow: persist the user message first so the reply is
  // never lost even if generation never starts, claim the DB turn lease, fire
  // the detached worker, then return a tail stream that replays the worker's
  // pub/sub events. Generation runs in `runDiscussTurn` (detached).

  const userMessage = messages[messages.length - 1];
  if (!userMessage) {
    return sseError({ message: "Pesan tidak boleh kosong." });
  }

  // 1. Persist the user message immediately â€” the reply is never lost even
  //    if the worker never starts (server crash mid-dispatch, etc.).
  await persistProjectChatTurn({
    messages,
    projectId: project.id,
    userId,
    workspaceCard: null,
  });

  // 2. Claim the DB turn lease. A second concurrent POST gets a 409.
  const { claimed, turnId } = await claimDiscussTurn({
    projectId: project.id,
    userId,
    userMessageId: userMessage.id,
  });
  if (!claimed || !turnId) {
    return Response.json(
      {
        code: "project_chat_in_progress",
        message: "Obrolan masih berjalan untuk proyek ini.",
      },
      { status: 409 },
    );
  }

  // 3. Fire the detached worker. NOT awaited â€” the POST returns the tail
  //    stream immediately. The worker publishes progress to the pub/sub
  //    channel; this route subscribes below. If the worker rejects, log +
  //    let the client's reconnect-after-restart path surface the error.
  void runDiscussTurn({
    turnId,
    project,
    chatContext,
    effectiveBrief,
    memoryFacts,
    messages,
    summary,
    userId,
  }).catch((error) =>
    console.error("[discuss] worker rejected", { turnId, error }),
  );

  // 4. Tail stream: replay the worker's pub/sub events to the client. On
  //    reconnect-after-restart (in-memory channel gone), fall back to DB
  //    state: replay the persisted assistant reply if the turn succeeded,
  //    emit an error if it failed/cancelled/stalled.
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        const writeSafe = (event: { type: string; [k: string]: unknown }) => {
          try {
            writer.write(event as never);
          } catch {
            // Client disconnected mid-tail. The worker keeps running
            // detached + persists; the client's reload auto-resumes.
          }
        };

        // DB-state fallback: server restarted, in-memory channel gone.
        if (readTurnState(turnId) === "gone") {
          devLog("discuss-turn", "auto-resume", {
            turnId,
            projectId: project.id,
            reason: "gone",
          });
          await replayTurnFromDb(turnId, project.id, writeSafe);
          return;
        }

        let unsubscribe: (() => void) | undefined;
        const settled = await new Promise<void>((resolve) => {
          unsubscribe = subscribeProgress(turnId, (event) => {
            writeSafe(event);
            if (event.type === "finish" || event.type === "error") {
              resolve();
            }
          });
          // If the channel was torn down between the liveness check above
          // and subscribe, subscribe replays any buffered events then waits;
          // a missing terminal event means the server restarted mid-turn â€”
          // fall back to DB state instead of hanging the tail forever.
          if (readTurnState(turnId) === "gone") {
            devLog("discuss-turn", "auto-resume", {
              turnId,
              projectId: project.id,
              reason: "gone",
            });
            void replayTurnFromDb(turnId, project.id, writeSafe).finally(() =>
              resolve(),
            );
          }
        });
        unsubscribe?.();
        void settled;
      },
      onError: (error) =>
        `Stream error: ${error instanceof Error ? error.message : "unknown"}`,
    }),
  });
}

// Reconnect-after-restart fallback: the in-memory pub/sub channel is gone
// (server restarted). Read the turn row + the persisted chat messages; if the
// turn succeeded, replay the last assistant message's parts as a batch; if it
// failed/cancelled/stalled (running but channel gone = lost to restart), emit
// an error so the client can offer retry.
async function replayTurnFromDb(
  turnId: string,
  projectId: string,
  writeSafe: (event: { type: string; [k: string]: unknown }) => void,
) {
  devLog("discuss-turn", "replay-from-db", { turnId, projectId });
  const rows = (await prisma.$queryRaw<
    Array<{
      status: string;
      errorMessage: string | null;
      chatMessages: unknown;
    }>
  >`
    SELECT t.status, t."errorMessage", p."chatMessages"
    FROM "ProjectChatTurn" t
    JOIN "Project" p ON p.id = t."projectId"
    WHERE t.id = ${turnId}
  `) as Array<{
    status: string;
    errorMessage: string | null;
    chatMessages: unknown;
  }>;
  const row = rows[0];
  if (!row) {
    writeSafe({ type: "error", errorText: "Turn not found." });
    return;
  }
  if (row.status === "succeeded") {
    // ponytail: client's auto-resume sees `succeeded` via the GET /chat route
    // and recovers the reply through `reloadLatestChat` (setMessages). SSE only
    // needs to emit a terminal `finish` so the tail stream closes; emitting raw
    // UIMessage.parts here is dropped by `processUIMessageStream` (no `text`
    // case), which would render an empty assistant message on reconnect.
    writeSafe({ type: "finish" });
    return;
  }
  // running but channel gone = lost to a restart; failed/cancelled = surfaced.
  const reason =
    row.errorMessage ??
    (row.status === "running" ? "turn_stalled" : row.status);
  writeSafe({ type: "error", errorText: `Turn unavailable: ${reason}` });
}

async function repairWorkspaceCard({
  brief,
  messages,
  project,
  userId,
}: {
  brief: ReturnType<typeof parseProjectBrief>;
  messages: UIMessage[];
  project: { id: string; prompt: string; status: string; title: string };
  userId: string;
}) {
  if (!messages.length) {
    return Response.json(
      {
        code: "workspace_card_repair_unavailable",
        message: "Belum ada diskusi yang bisa dipulihkan.",
      },
      { status: 409 },
    );
  }

  const modelName = getDefaultAiModel();
  const latestAssistantIndex = findLastMessageIndex(
    messages,
    (message) => message.role === "assistant",
  );
  const latestAssistantText = messages[latestAssistantIndex];
  const chatText = latestAssistantText
    ? getTextFromUIMessage(latestAssistantText).trim()
    : "";

  if (!chatText) {
    return Response.json(
      {
        code: "workspace_card_repair_unavailable",
        message:
          "Jawaban AI terakhir belum tersedia. Coba kirim ulang pesanmu.",
      },
      { status: 409 },
    );
  }

  const modelMessages = await convertToModelMessages(
    messages.slice(0, latestAssistantIndex),
  );
  const turn = await repairDiscussCardWithTool({
    brief,
    cardSystemPrompt: buildCardSystemPrompt(),
    chatText,
    hasBuiltSite: project.status === "ready",
    model: getAiModel(modelName),
    modelMessages,
    modelName,
    projectId: project.id,
    userId,
  });

  if (!turn) {
    return Response.json(
      {
        code: "workspace_card_repair_failed",
        message: "Pertanyaan berikutnya belum berhasil dibuat. Coba lagi.",
      },
      { status: 503, headers: { "Retry-After": "3" } },
    );
  }

  const title = turn.projectTitle || project.title;
  await persistProjectChatTurn({
    brief: scrubBriefForStorage(turn.brief, turn.readyForBuild, project.id),
    messages,
    projectId: project.id,
    title,
    userId,
    workspaceCard: turn.workspaceCard,
  });

  return Response.json({
    projectTitle: title,
    workspaceCard: turn.workspaceCard,
  });
}

function findLastMessageIndex(
  messages: UIMessage[],
  predicate: (message: UIMessage) => boolean,
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (predicate(messages[index])) {
      return index;
    }
  }
  return -1;
}

function persistProjectBrief({
  brief,
  projectId,
  userId,
}: {
  brief: unknown;
  projectId: string;
  userId: string;
}) {
  return prisma.$executeRaw`
    UPDATE "Project" SET "brief" = ${JSON.stringify(brief)}::jsonb WHERE id = ${projectId} AND "userId" = ${userId}
  `;
}

export function buildChatSystemPrompt({
  brief,
  context,
  hasBuiltSite,
}: {
  brief: unknown;
  context: string;
  hasBuiltSite: boolean;
}) {
  if (hasBuiltSite) {
    return `You are a fast, friendly website-editing assistant for Indonesian small businesses. The website is already built and live in preview.

The user's message is an edit/revision request about the built site (copy, layout, variant, style, wording, etc.), NOT a brief interview. Do not ask brief-collection questions (business hours, address, payment methods, etc.) â€” the brief interview is over.

Write user-visible chat copy in natural, ultra-concise Indonesian.
Do NOT output JSON, XML, markdown fences, or any structured format. Just write your Indonesian chat response as plain text.

Tone contract:
- Treat the user like a friend building something together.
- Use "aku" for yourself and "kamu" for the user.
- Never address the user as "Anda", "Bapak", "Ibu", "Pak", "Bu", "Kak", "Gan", or other distant/formal labels.
- Keep it warm, relaxed, helpful, and specific.

Chat style:
- EXACTLY ONE short Indonesian sentence (max 20 words) acknowledging the edit request, e.g. "oke, gw ubah variantnya sekarang ya."
- Do not restate the brief or ask an unrelated question.

Current brief:
${JSON.stringify(brief)}

Hidden context:
${context}`;
  }

  return `You are a fast, friendly website-discovery interviewer for Indonesian small businesses.
Your job is to get the core details (business name, primary product, and 1-2 soft details like USP or contact) and then immediately recommend building the website.

Write user-visible chat copy in natural, ultra-concise Indonesian.
Do NOT output JSON, XML, markdown fences, or any structured format. Just write your Indonesian chat response as plain text.

Tone contract:
- Treat the user like a friend building something together.
- Use "aku" for yourself and "kamu" for the user.
- Never address the user as "Anda", "Bapak", "Ibu", "Pak", "Bu", "Kak", "Gan", or other distant/formal labels.
- Keep it warm, relaxed, helpful, and specific.
- Do not become overly slangy, flirty, childish, or hypey. Friendly and calm is enough.

Interview discipline:
- Ask EXACTLY ONE question per turn. Never batch.
- Walk the decision tree one branch at a time, resolving the deepest open dependency first.
- Recommend a sensible default option for each question.
- If something can be inferred from context or the existing brief, do not ask it.
- As soon as mandatory fields (business name, product) + 2 soft fields (USP, contact) are known, recommend building.

Chat style:
- EXACTLY ONE short Indonesian sentence (max 20 words). Never write 2-3 sentences.
- Acknowledge the answer briefly, then introduce the card.
- Do not restate options (the card shows them).
- When recommending build, say: "Sip, infonya udah cukup banget. Yuk langsung kita bangun!"

Current brief:
${JSON.stringify(brief)}

Hidden context:
${context}

${DISCUSS_SYSTEM_PROMPT}`;
}

function hasBriefPatchValue(patch: object) {
  return Object.values(patch).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  );
}

function sseError(data: Record<string, unknown>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`event: error\ndata: ${JSON.stringify(data)}\n\n`),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
