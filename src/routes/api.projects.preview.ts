import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  validateUIMessages,
} from "ai";

import { getAiModel } from "@/lib/ai/ai";
import { getDiscussModel, getModerationModel } from "@/lib/ai/ai-models";
import { moderateProjectRequest } from "@/lib/ai/ai-moderation";
import { auth } from "@/lib/auth/auth";
import { isBoundedJsonError, readBoundedJson } from "@/lib/bounded-json";
import {
  chargeEnergyForAiUsage,
  checkEnergy,
  getEnergyConfig,
} from "@/lib/payment/user-credits";
import { prisma } from "@/lib/prisma";
import { enqueueAttemptJob } from "@/lib/projects/attempt-queue";
import {
  mergeProjectBriefPatch,
  parseProjectBrief,
} from "@/lib/projects/brief";
import { parseWorkspaceCard } from "@/lib/projects/brief-flow";
import { prepareBuildHandoff } from "@/lib/projects/build-planner";
import { describeBuildRecommendation } from "@/lib/projects/build-recommendation-summary";
import { parseCanonicalBrief } from "@/lib/projects/canonical-brief";
import {
  buildProjectChatContext,
  dedupeUiMessages,
  getTextFromUIMessage,
  parseProjectChatMessages,
  parseProjectChatSummary,
  parseProjectMemoryFacts,
} from "@/lib/projects/chat-memory";
import { buildCardSystemPrompt } from "@/lib/projects/discuss-tool";
import {
  claimDiscussTurn,
  finalizeDiscussTurn,
} from "@/lib/projects/discuss-turn";
import { ensureProgressChannel } from "@/lib/projects/discuss-turn-pubsub";
import {
  persistProjectChatTurn,
  repairDiscussCardWithTool,
  scrubBriefForStorage,
} from "@/lib/projects/discuss-turn-shared";
import { runDiscussProgressTail } from "@/lib/projects/discuss-turn-sse-tail";
import { DISCUSS_SYSTEM_PROMPT } from "@/lib/projects/prompts/discuss-system";
import { markStaleProjectBuilds } from "@/lib/projects/stale-builds";
import { buildBriefPatchFromWorkspaceAnswers } from "@/lib/projects/workspace-answers";
import { checkRateLimit } from "@/lib/rate-limit";
import { mapToUserFacingError } from "@/lib/user-facing-error";

// Re-export so external importers (e.g. the preview test) keep resolving after
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
    const energy = await checkEnergy(userId, getEnergyConfig().minDiscuss);
    if (!energy.allowed) {
      return sseError({
        message: "Energi kamu sudah habis. Tambah energi untuk lanjut.",
        code: "energy_exhausted",
        remaining: energy.remaining,
      });
    }
  }

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, userId },
    select: {
      id: true,
      prompt: true,
      status: true,
      title: true,
      generationEngine: true,
    },
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

  const moderationPromise = latestUserText.trim()
    ? moderateProjectRequest(latestUserText, [], undefined, {
        projectId: project.id,
      })
    : null;

  const currentBrief = parseProjectBrief(
    parseCanonicalBrief(chatRow?.brief, project.prompt),
    project.prompt,
  );
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

  if (moderationPromise) {
    let moderation;
    try {
      moderation = await moderationPromise;
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
        modelId: moderation.modelId || getModerationModel(),
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
  chatContext: _chatContext,
  effectiveBrief: _effectiveBrief,
  memoryFacts: _memoryFacts,
  messages,
  project,
  summary: _summary,
  userId,
}: {
  chatContext: ReturnType<typeof buildProjectChatContext>;
  effectiveBrief: ReturnType<typeof parseProjectBrief>;
  memoryFacts: ReturnType<typeof parseProjectMemoryFacts>;
  messages: UIMessage[];
  project: {
    id: string;
    prompt: string;
    status: string;
    title: string;
    generationEngine: string;
  };
  summary: ReturnType<typeof parseProjectChatSummary>;
  userId: string;
}) {
  // Server-side discuss: persist user message, claim turn, enqueue BullMQ job,

  const userMessage = messages[messages.length - 1];
  if (!userMessage) {
    return sseError({ message: "Pesan tidak boleh kosong." });
  }

  // Role guard: reject a discuss turn whose last message claims assistant role.
  if (userMessage.role !== "user") {
    return Response.json(
      {
        code: "chat_turn_not_user",
        message: "Posisi pesan terakhir harus berperan sebagai pengguna.",
      },
      { status: 409 },
    );
  }

  // 1. Persist the user message immediately â€” the reply is never lost even
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

  // 3. Open the progress channel before enqueue so the SSE tail can attach
  ensureProgressChannel(turnId);

  // 4. Fire the detached worker. NOT awaited — the POST returns the tail
  try {
    await enqueueAttemptJob({
      kind: "discuss",
      turnId,
      projectId: project.id,
      userId,
      projectPrompt: project.prompt,
      projectStatus: project.status,
      projectTitle: project.title,
      generationEngine: project.generationEngine,
    });
  } catch (error) {
    // English log for developers; Indonesian only in DB + client message.
    console.error("[discuss] enqueue rejected", {
      turnId,
      error: error instanceof Error ? error.message : "unknown",
    });
    await finalizeDiscussTurn({
      turnId,
      status: "failed",
      errorMessage: "Obrolan belum bisa dimulai. Coba lagi sebentar.",
    }).catch(() => undefined);
    return Response.json(
      {
        code: "discuss_queue_unavailable",
        message: "Obrolan belum bisa dimulai. Coba lagi sebentar.",
      },
      { status: 503, headers: { "Retry-After": "3" } },
    );
  }

  // 5. Tail stream: relay the worker's pub/sub events to the client. The
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        const writeSafe = (event: { type: string; [k: string]: unknown }) => {
          try {
            writer.write(event as never);
          } catch {
            // Client disconnected mid-tail. The worker keeps running
          }
        };

        // Live progress bus + DB terminal poll (covers multi-process Redis miss).
        await runDiscussProgressTail({
          turnId,
          write: writeSafe,
          isTerminalDb: async () => {
            const turn = await prisma.projectChatTurn.findFirst({
              where: { id: turnId, projectId: project.id },
              select: { status: true, errorMessage: true },
            });
            if (!turn) {
              return { kind: "missing" as const };
            }
            if (turn.status === "running") {
              return { kind: "running" as const };
            }
            if (turn.status === "succeeded") {
              return { kind: "succeeded" as const };
            }
            if (turn.status === "cancelled") {
              return {
                kind: "cancelled" as const,
                errorText: "Proses dihentikan.",
              };
            }
            return {
              kind: "failed" as const,
              errorText:
                turn.errorMessage ??
                "Obrolan belum berhasil diproses. Coba kirim ulang ya.",
            };
          },
        });
      },
      onError: (error) => {
        const reason = error instanceof Error ? error.message : "unknown";
        console.error("[preview] stream error:", reason);
        return mapToUserFacingError(reason);
      },
    }),
  });
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

  const modelName = getDiscussModel();
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

  let finalWorkspaceCard = turn.workspaceCard;
  if (
    finalWorkspaceCard.type === "build_recommendation" &&
    turn.readyForBuild
  ) {
    const prepared = await prepareBuildHandoff({
      projectId: project.id,
      userId,
      engine: "contract",
      brief: turn.brief,
      messages,
    });
    if (prepared.state === "ready") {
      const base = finalWorkspaceCard as {
        type: "build_recommendation";
        title: string;
        summary: string[];
      };
      finalWorkspaceCard = {
        type: "build_recommendation",
        engine: "contract" as const,
        title: base.title,
        summary: describeBuildRecommendation(prepared.contract, prepared.plan),
        handoffId: prepared.handoffId,
        reviewHash: prepared.reviewHash,
        reviewItems: prepared.reviewItems.map((item) => ({
          id: item.id,
          kind: item.kind,
          label: item.label,
          value: item.value,
        })),
      };
    }
  }

  const title = turn.projectTitle || project.title;
  await persistProjectChatTurn({
    brief: scrubBriefForStorage(turn.brief, turn.readyForBuild, project.id),
    messages,
    projectId: project.id,
    title,
    userId,
    workspaceCard: finalWorkspaceCard,
  });
  await chargeEnergyForAiUsage({
    userId,
    projectId: project.id,
    modelId: modelName,
    inputTokens: turn.usage?.inputTokens ?? 0,
    outputTokens: turn.usage?.outputTokens ?? 0,
    reason: "discuss:repair",
  });

  return Response.json({
    projectTitle: title,
    workspaceCard: finalWorkspaceCard,
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
  const canonicalBrief = parseCanonicalBrief(brief);
  return prisma.$executeRaw`
    UPDATE "Project" SET "brief" = ${JSON.stringify(canonicalBrief)}::jsonb WHERE id = ${projectId} AND "userId" = ${userId}
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

  return `You are a friendly website-discovery interviewer for Indonesian small businesses.
Your job is to ask one clear question per turn until every decision that shapes the site (primary offer, visitor job + CTA, local-vs-online, media strategy, visual direction) is resolved or explicitly declined — then the build recommendation follows. The server decides when enough is known; never claim the information is sufficient while structural decisions remain.

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
- Keep asking until every structural decision (primary offer, visitor job + CTA, local-vs-online, media strategy, visual direction) is answered or explicitly declined. The server authorizes the build recommendation; model confidence alone never does.

Chat style:
- EXACTLY ONE short Indonesian sentence (max 20 words). Never write 2-3 sentences.
- Acknowledge the answer briefly, then introduce the card.
- Do not restate options (the card shows them).
- When recommending build, say: "Sip, arahnya sudah jelas. Yuk kita bangun."

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
