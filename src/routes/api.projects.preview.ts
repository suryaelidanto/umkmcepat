import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  validateUIMessages,
} from "ai";

import { getAiModel } from "@/lib/ai/ai";
import { getDiscussModel } from "@/lib/ai/ai-models";
import { auth } from "@/lib/auth/auth";
import { isBoundedJsonError, readBoundedJson } from "@/lib/bounded-json";
import { checkEnergy, getEnergyConfig } from "@/lib/payment/user-credits";
import { prisma } from "@/lib/prisma";
import { enqueueAttemptJob } from "@/lib/projects/attempt-queue";
import {
  groundProjectBriefToOwnerFacts,
  mergeProjectBriefPatch,
  parseProjectBrief,
} from "@/lib/projects/brief";
import { parseWorkspaceCard } from "@/lib/projects/brief-flow";
import { hasSuccessfulBuildEvidence } from "@/lib/projects/build-checkpoint";
import { prepareBuildHandoff } from "@/lib/projects/build-planner";
import { describeBuildRecommendation } from "@/lib/projects/build-recommendation-summary";
import {
  collectPendingUpdateInstructions,
  resolveBuildUpdateContext,
} from "@/lib/projects/build-update-context";
import { parseCanonicalBrief } from "@/lib/projects/canonical-brief";
import {
  buildProjectChatContext,
  dedupeUiMessagesForPersistence,
  getTextFromUIMessage,
  parseProjectChatMessages,
  parseProjectChatSummary,
  parseProjectMemoryFacts,
  resolveProjectChatState,
} from "@/lib/projects/chat-memory";
import { isPreflightBlockedByWorkspaceCard } from "@/lib/projects/discuss-preflight";
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
import { markStaleProjectBuilds } from "@/lib/projects/stale-builds";
import { buildBriefPatchFromWorkspaceAnswers } from "@/lib/projects/workspace-answers";
import { checkRateLimit } from "@/lib/rate-limit";
import { mapToUserFacingError } from "@/lib/user-facing-error";

// Keep the shared prompt available to the route test and other callers.
export { buildOneCallSystemPrompt } from "@/lib/projects/discuss-tool";

type PreviewRequest = {
  message?: UIMessage;
  messages?: UIMessage[];
  intent?: "prepare_build" | "prepare_update";
  mode?: "discuss" | "build" | "repair_card";
  projectId?: string;
  workspaceAnswers?: unknown;
};

const UI_MESSAGE_STREAM_EVENT_TYPES = new Set([
  "start",
  "finish",
  "text-start",
  "text-delta",
  "text-end",
  "tool-input-start",
  "tool-input-delta",
  "tool-input-available",
  "tool-output-available",
  "error",
]);

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

  const energy = await checkEnergy(userId, getEnergyConfig().minDiscuss);
  if (!energy.allowed) {
    return sseError({
      message: "Energi kamu sudah habis. Tambah energi untuk lanjut.",
      code: "energy_exhausted",
      remaining: energy.remaining,
    });
  }

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, userId },
    select: {
      buildStatus: true,
      buildCheckpoints: {
        orderBy: { createdAt: "desc" },
        where: { build: { status: "succeeded" } },
        take: 1,
        select: { chatMessageId: true, chatMessageIndex: true, id: true },
      },
      builds: {
        orderBy: { createdAt: "desc" },
        where: { status: "succeeded" },
        take: 1,
        select: { id: true },
      },
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

  const hasBuiltSite = hasSuccessfulBuildEvidence({
    checkpointCount: project.buildCheckpoints?.length ?? 0,
    projectBuildStatus: project.buildStatus,
    projectStatus: project.status,
    successfulBuildCount: project.builds?.length ?? 0,
  });
  const preflight =
    body.intent === "prepare_build"
      ? ("build" as const)
      : body.intent === "prepare_update"
        ? ("update" as const)
        : undefined;

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
  const canonicalBrief = parseCanonicalBrief(chatRow?.brief, project.prompt);
  const chatState = resolveProjectChatState({
    chatMessages: chatRow?.chatMessages,
    chatSummary: chatRow?.chatSummary,
    memoryFacts: chatRow?.memoryFacts,
    fallback: canonicalBrief.discussionContext,
  });
  const storedMessages = chatState.messages;
  const chatSummary = {
    ...chatState.summary,
    compactedMessageCount: Math.max(
      chatState.summary.compactedMessageCount,
      typeof chatRow?.lastCompactedMessageCount === "number"
        ? chatRow.lastCompactedMessageCount
        : 0,
    ),
  };
  const memoryFacts = chatState.memoryFacts;
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

  const currentBrief = parseProjectBrief(canonicalBrief, project.prompt);
  const storedWorkspaceCard = parseWorkspaceCard(
    chatRow?.workspaceCard,
    currentBrief,
  );
  if (preflight && isPreflightBlockedByWorkspaceCard(storedWorkspaceCard)) {
    return Response.json(
      {
        code: "workspace_answer_required",
        message: "Jawab pertanyaan yang sedang aktif sebelum melanjutkan.",
      },
      { status: 409 },
    );
  }
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
  const updateContext = resolveBuildUpdateContext({
    checkpoint: project.buildCheckpoints?.[0] ?? null,
    compactedMessageCount: chatSummary.compactedMessageCount,
    fallbackMessages: canonicalBrief.discussionContext?.messages,
    messages: storedMessages,
  });
  const pendingUpdateInstructions = collectPendingUpdateInstructions(
    updateContext.pendingMessages,
    "",
  );
  const hasPendingUpdate = pendingUpdateInstructions.length > 0;

  if (body.mode === "repair_card") {
    return repairWorkspaceCard({
      brief: effectiveBrief,
      memoryFacts,
      messages: storedMessages,
      project,
      summary: chatSummary,
      userId,
    });
  }

  if (!incoming.length && !preflight) {
    return Response.json(
      { message: "Pesan tidak boleh kosong." },
      { status: 400 },
    );
  }

  const messages = await validateUIMessages({
    messages: dedupeUiMessagesForPersistence(
      parseProjectChatMessages(
        preflight ? storedMessages : [...storedMessages, ...incoming],
      ),
    ),
  });
  const chatContext = buildProjectChatContext({
    factLedger: canonicalBrief.factLedger,
    fieldState: currentBrief.fieldState,
    memoryFacts,
    messages,
    summary: chatSummary,
  });

  // Moderation runs in the worker after persist; the POST stays sub-second.
  return handleDiscussTurnOneCall({
    chatContext,
    effectiveBrief,
    hasBuiltSite,
    hasPendingUpdate,
    pendingUpdateInstructions,
    memoryFacts,
    messages,
    preflight,
    project,
    summary: chatSummary,
    userId,
  });
}

async function handleDiscussTurnOneCall({
  chatContext: _chatContext,
  effectiveBrief: _effectiveBrief,
  hasBuiltSite,
  hasPendingUpdate,
  pendingUpdateInstructions,
  memoryFacts: _memoryFacts,
  messages,
  preflight,
  project,
  summary: _summary,
  userId,
}: {
  chatContext: ReturnType<typeof buildProjectChatContext>;
  effectiveBrief: ReturnType<typeof parseProjectBrief>;
  hasBuiltSite: boolean;
  hasPendingUpdate: boolean;
  pendingUpdateInstructions: string;
  memoryFacts: ReturnType<typeof parseProjectMemoryFacts>;
  messages: UIMessage[];
  preflight?: "build" | "update";
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

  const userMessage = preflight ? undefined : messages[messages.length - 1];
  if (!preflight && !userMessage) {
    return sseError({ message: "Pesan tidak boleh kosong." });
  }

  // Role guard: reject a discuss turn whose last message claims assistant role.
  if (!preflight && userMessage && userMessage.role !== "user") {
    return Response.json(
      {
        code: "chat_turn_not_user",
        message: "Posisi pesan terakhir harus berperan sebagai pengguna.",
      },
      { status: 409 },
    );
  }

  if (!preflight) {
    const groundedEffectiveBrief = groundProjectBriefToOwnerFacts(
      _effectiveBrief,
      {
        ownerTexts: messages
          .filter((message) => message.role === "user")
          .map(getTextFromUIMessage),
      },
    );
    await persistProjectChatTurn({
      brief: scrubBriefForStorage(
        groundedEffectiveBrief,
        groundedEffectiveBrief.readyForBuild,
        project.id,
      ),
      discussionContext: {
        memoryFacts: _memoryFacts,
        summary: _summary,
      },
      messages,
      projectId: project.id,
      title: project.title,
      userId,
      workspaceCard: null,
    });
  }

  // 2. Claim the DB turn lease. A second concurrent POST gets a 409.
  const { claimed, turnId } = await claimDiscussTurn({
    projectId: project.id,
    userId,
    userMessageId:
      userMessage?.id ?? `preflight-${preflight}-${crypto.randomUUID()}`,
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
      hasBuiltSite,
      hasPendingUpdate,
      pendingUpdateInstructions,
      preflight,
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
          if (event.type === "workspace-card-delta") {
            try {
              writer.write({
                type: "data-workspaceCard",
                data: event.workspaceCard,
                transient: true,
              } as never);
            } catch {
              // Client disconnected mid-tail
            }
            return;
          }
          if (!UI_MESSAGE_STREAM_EVENT_TYPES.has(event.type)) {
            return;
          }
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
  memoryFacts,
  messages,
  project,
  summary,
  userId,
}: {
  brief: ReturnType<typeof parseProjectBrief>;
  memoryFacts: ReturnType<typeof parseProjectMemoryFacts>;
  messages: UIMessage[];
  project: { id: string; prompt: string; status: string; title: string };
  summary: ReturnType<typeof parseProjectChatSummary>;
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
    ownerTexts: messages
      .filter((message) => message.role === "user")
      .map(getTextFromUIMessage),
    projectId: project.id,
    sourceTurnId: "repair",
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
      discussionContext: { messages, memoryFacts, summary },
    });
    if (prepared.state === "ready") {
      const base = finalWorkspaceCard as {
        type: "build_recommendation";
        title: string;
        summary: string[];
        postBuildUpdate?: boolean;
      };
      finalWorkspaceCard = {
        type: "build_recommendation",
        engine: "contract" as const,
        ...(base.postBuildUpdate ? { postBuildUpdate: true } : {}),
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
    discussionContext: { memoryFacts, summary },
    messages,
    projectId: project.id,
    title,
    userId,
    workspaceCard: finalWorkspaceCard,
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
