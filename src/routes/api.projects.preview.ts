import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  streamText,
  type UIMessage,
  validateUIMessages,
} from "ai";

import { getAiModel, getAiTelemetry } from "@/lib/ai";
import { getDefaultAiModel } from "@/lib/ai-models";
import { moderateProjectRequest } from "@/lib/ai-moderation";
import { writeAiRequestLog } from "@/lib/ai-request-log";
import {
  DISCUSS_CARD_SEMANTIC_ATTEMPTS,
  DISCUSS_CARD_SERVER_DEADLINE_MS,
  getAiTimeoutMs,
} from "@/lib/ai-timeouts";
import { auth } from "@/lib/auth";
import { isBoundedJsonError, readBoundedJson } from "@/lib/bounded-json";
import { isDiscussOneCallToolsEnabled } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { getSafeAiErrorLog } from "@/lib/projects/ai-error-log";
import {
  mergeProjectBriefPatch,
  parseProjectBrief,
} from "@/lib/projects/brief";
import {
  normalizeWorkspaceTurn,
  parseWorkspaceCard,
} from "@/lib/projects/brief-flow";
import { maybeCompactProjectChat } from "@/lib/projects/chat-compaction";
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
  persistProjectChatCompaction,
  persistProjectChatTurn,
  repairDiscussCardWithTool,
  scrubBriefForStorage,
} from "@/lib/projects/discuss-turn-shared";
import { runDiscussTurn } from "@/lib/projects/discuss-turn-worker";
import { DISCUSS_SYSTEM_PROMPT } from "@/lib/projects/prompts/discuss-system";
import { markStaleProjectBuilds } from "@/lib/projects/stale-builds";
import { stripTransportDiagnosticMessages } from "@/lib/projects/strip-transport-diagnostic-messages";
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

// In-flight discuss lock: a single Node process serves all requests, so an
// in-memory set is sufficient to dedupe concurrent discuss turns for the same
// project. Prevents a client double-fire (e.g. remount, retry) from running
// two LLM turns in parallel â€” which wastes energy and makes the workspace card
// flicker between two non-deterministic answers. Released in onFinish of the
// discuss stream (or immediately for the synchronous path). Headroom above
// the worst case (stream timeout + one repair deadline) so an auto-retry
// never pushes the lock past TTL and re-admits a concurrent turn.
// ponytail: the in-memory discuss lock is superseded by the DB turn lease
// (`claimDiscussTurn`/`finalizeDiscussTurn`) as of Task 5. `acquireDiscussLock`
// was removed; `releaseDiscussLock` stays only because the legacy two-call
// `handleDiscussTurn` body (dead under the one-call flag) still calls it.
// Task 8 removes the legacy body + `releaseDiscussLock` + these maps.
const discussInFlight = new Set<string>();
const discussLockTimers = new Map<string, ReturnType<typeof setTimeout>>();

function releaseDiscussLock(projectId: string): void {
  const timer = discussLockTimers.get(projectId);
  if (timer) {
    clearTimeout(timer);
    discussLockTimers.delete(projectId);
  }
  discussInFlight.delete(projectId);
}

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
  // and flickering the workspace card between two answers.
  // ponytail: the in-memory discuss lock (acquireDiscussLock/releaseDiscussLock
  // defined above) used to guard this POST. Task 5 moved the dedup gate to the
  // DB turn lease (`claimDiscussTurn` inside `handleDiscussTurnOneCall`), which
  // survives restarts + is the single source of truth for "one turn at a time".
  // The legacy two-call `handleDiscussTurn` body still calls releaseDiscussLock
  // below; Task 8 removes both the call sites + the definitions.
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

  return handleDiscussTurn({
    chatContext,
    effectiveBrief,
    memoryFacts,
    messages,
    project,
    summary: chatSummary,
    userId,
  });
}

async function handleDiscussTurn({
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
  if (isDiscussOneCallToolsEnabled()) {
    return handleDiscussTurnOneCall({
      chatContext,
      effectiveBrief,
      memoryFacts,
      messages,
      project,
      summary,
      userId,
    });
  }

  const modelName = getDefaultAiModel();
  const model = getAiModel(modelName);
  const chatSystemPrompt = buildChatSystemPrompt({
    context: chatContext.systemContext,
    brief: effectiveBrief,
    hasBuiltSite: project.status === "ready",
  });
  const cardSystemPrompt = buildCardSystemPrompt();
  const modelMessages = await convertToModelMessages(chatContext.messages);

  await writeAiRequestLog({
    event: "discuss:start",
    model: modelName,
    projectId: project.id,
    messageCount: messages.length,
    briefConfidence: effectiveBrief.confidence,
  });

  const phase1 = streamText({
    model,
    system: chatSystemPrompt,
    messages: modelMessages,
    maxRetries: 2,
    temperature: 0.35,
    timeout: getAiTimeoutMs("discuss"),
    telemetry: getAiTelemetry("project-guided-discuss", {
      briefConfidence: effectiveBrief.confidence,
      mode: "discuss",
      model: modelName,
      projectId: project.id,
      route: "api.projects.preview",
      userId,
    }),
    onError({ error }) {
      console.error(
        "[preview-chat] phase 1 stream error",
        getSafeAiErrorLog(error),
      );
    },
  });

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        const messageId = `discuss-${crypto.randomUUID()}`;
        const textPartId = "discuss-text";

        writer.write({ type: "start", messageId });
        writer.write({ type: "text-start", id: textPartId });

        let fullText = "";
        let hadError = false;
        const phase1ResponsePromise = Promise.resolve(phase1.response).catch(
          () => null,
        );

        try {
          for await (const delta of phase1.textStream) {
            fullText += delta;
            writer.write({ type: "text-delta", id: textPartId, delta });
          }
        } catch (error) {
          hadError = true;
          const servedModel =
            (await phase1ResponsePromise)?.modelId ?? modelName;
          const safeError = getSafeAiErrorLog(error);
          console.error("[preview-chat] legacy stream consume error", {
            projectId: project.id,
            model: servedModel,
            error: safeError,
          });
          await writeAiRequestLog({
            event: "discuss:stream_error",
            model: servedModel,
            mode: "legacy",
            projectId: project.id,
            error: safeError,
          });
        }

        writer.write({ type: "text-end", id: textPartId });

        // Capture phase1 (chat) token usage + actual model that served it
        const phase1Usage = await phase1.usage;
        const phase1Response = await Promise.resolve(phase1.response).catch(
          () => null,
        );
        let totalInputTokens = phase1Usage?.inputTokens ?? 0;
        let totalOutputTokens = phase1Usage?.outputTokens ?? 0;
        const discussModelId = phase1Response?.modelId || modelName;

        if (hadError || !fullText.trim()) {
          // AI already ran â€” charge even on stream error / empty text.
          await chargeEnergyForAiUsage({
            userId,
            modelId: discussModelId,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            reason: "discuss_turn",
          });
          writer.write({
            type: "error",
            errorText: hadError
              ? "Jawaban AI terputus. Coba lagi."
              : "AI belum memberi jawaban. Coba lagi.",
          });
          return;
        }

        const chatText = fullText.trim();
        const assistantMessage: UIMessage = {
          id: messageId,
          role: "assistant",
          parts: [{ type: "text", text: chatText, state: "done" }],
        };

        const workspaceTurn = await generateWorkspaceTurn({
          brief: effectiveBrief,
          cardSystemPrompt,
          chatText,
          hasBuiltSite: project.status === "ready",
          model,
          modelMessages,
          modelName,
          projectId: project.id,
          userId,
        });

        // Capture phase2 (card) token usage
        if (workspaceTurn && "usage" in workspaceTurn) {
          totalInputTokens +=
            (
              workspaceTurn as {
                usage?: { inputTokens: number; outputTokens: number };
              }
            ).usage?.inputTokens ?? 0;
          totalOutputTokens +=
            (
              workspaceTurn as {
                usage?: { inputTokens: number; outputTokens: number };
              }
            ).usage?.outputTokens ?? 0;
        }

        const phase2Failed = !workspaceTurn;

        const hasCard =
          workspaceTurn !== null && workspaceTurn.workspaceCard.type !== "none";

        const safeMessages = stripTransportDiagnosticMessages(
          dedupeUiMessages([...messages, assistantMessage]),
        );

        if (hasCard && workspaceTurn) {
          const title = workspaceTurn.projectTitle || project.title;

          await writeAiRequestLog({
            event: "discuss:finish",
            model: modelName,
            projectId: project.id,
            didWorkspaceToolUpdate: true,
            primaryToolFailed: phase2Failed,
            workspaceCard: workspaceTurn.workspaceCard,
          });

          await persistProjectChatTurn({
            brief: scrubBriefForStorage(
              workspaceTurn.brief,
              workspaceTurn.readyForBuild,
              project.id,
            ),
            messages: safeMessages,
            projectId: project.id,
            title,
            userId,
            workspaceCard: workspaceTurn.workspaceCard,
          });
        } else {
          await writeAiRequestLog({
            event: "discuss:finish",
            model: modelName,
            projectId: project.id,
            didWorkspaceToolUpdate: false,
            primaryToolFailed: phase2Failed,
            workspaceCard: { type: "none" },
          });

          await persistProjectChatTurn({
            messages: safeMessages,
            projectId: project.id,
            userId,
            workspaceCard: { type: "none" },
          });
        }

        const compaction = await maybeCompactProjectChat({
          memoryFacts,
          messages: safeMessages,
          summary,
        }).catch(() => null);

        if (compaction) {
          await persistProjectChatCompaction({
            compactedMessageCount: compaction.compactedMessageCount,
            memoryFacts: compaction.memoryFacts,
            projectId: project.id,
            summary: compaction.summary,
            userId,
          });
          totalInputTokens += compaction.usage?.inputTokens ?? 0;
          totalOutputTokens += compaction.usage?.outputTokens ?? 0;
        }

        await chargeEnergyForAiUsage({
          userId,
          modelId: discussModelId,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          reason: "discuss_turn",
        });

        if (workspaceTurn?.workspaceCard.type === "build_recommendation") {
          releaseDiscussLock(project.id);
        }

        writer.write({ type: "finish" });
      },
      onError: (error) =>
        `Stream error: ${error instanceof Error ? error.message : "unknown"}`,
      onFinish: () => releaseDiscussLock(project.id),
    }),
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
  // Server-side discuss flow (Task 5): persist the user message first so the
  // reply is never lost even if generation never starts, claim the DB turn
  // lease, fire the detached worker, then return a tail stream that replays
  // the worker's pub/sub events. The old in-stream streamText + persist-from-
  // execute path moved to `runDiscussTurn`. The legacy two-call `handleDiscussTurn`
  // body below stays as dead code under the one-call flag; Task 8 removes it.

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
    const stored = parseProjectChatMessages(row.chatMessages);
    const lastAssistant = [...stored]
      .reverse()
      .find((m) => m.role === "assistant");
    if (lastAssistant) {
      for (const part of lastAssistant.parts) {
        writeSafe(part as { type: string; [k: string]: unknown });
      }
    }
    writeSafe({ type: "finish" });
    return;
  }
  // running but channel gone = lost to a restart; failed/cancelled = surfaced.
  const reason =
    row.errorMessage ??
    (row.status === "running" ? "turn_stalled" : row.status);
  writeSafe({ type: "error", errorText: `Turn unavailable: ${reason}` });
}

async function generateWorkspaceTurn({
  brief,
  cardSystemPrompt,
  chatText,
  hasBuiltSite,
  model,
  modelMessages,
  modelName,
  projectId,
  userId,
}: {
  brief: ReturnType<typeof parseProjectBrief>;
  cardSystemPrompt: string;
  chatText: string;
  hasBuiltSite: boolean;
  model: ReturnType<typeof getAiModel>;
  modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
  modelName: string;
  projectId: string;
  userId: string;
}) {
  const abortController = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;

  const attempts = (async () => {
    for (
      let semanticAttempt = 0;
      semanticAttempt < DISCUSS_CARD_SEMANTIC_ATTEMPTS;
      semanticAttempt += 1
    ) {
      try {
        const phase2 = await generateText({
          abortSignal: abortController.signal,
          model,
          system: cardSystemPrompt,
          messages: [
            ...modelMessages,
            { role: "assistant", content: chatText },
          ],
          // Reasoning models spend tokens on hidden reasoning_content before
          // emitting visible text; a small budget starves the JSON output.
          maxOutputTokens: 12_000,
          maxRetries: 2,
          temperature: 0.35,
          timeout: getAiTimeoutMs("discussCard"),
          telemetry: getAiTelemetry("project-guided-discuss-card", {
            mode: "discuss",
            model: modelName,
            phase: semanticAttempt === 0 ? "card" : "card-repair",
            projectId,
            route: "api.projects.preview",
            userId,
          }),
        });

        const parsed = parseJsonLenient(phase2.text);
        console.error("[preview-chat] phase 2 parsed:", {
          projectId,
          parsedType: typeof parsed,
          parsedPreview: JSON.stringify(parsed)?.slice(0, 200),
        });

        const turn = normalizeWorkspaceTurn(parsed, brief, { hasBuiltSite });

        if (turn.workspaceCard.type !== "none") {
          return {
            ...turn,
            usage: {
              inputTokens: phase2.usage?.inputTokens ?? 0,
              outputTokens: phase2.usage?.outputTokens ?? 0,
            },
          };
        }

        console.error("[preview-chat] phase 2 returned no valid card", {
          projectId,
          semanticAttempt,
          cardType: turn.workspaceCard.type,
        });
      } catch (error) {
        console.error(
          "[preview-chat] phase 2 card error",
          getSafeAiErrorLog(error),
        );
      }
    }

    return null;
  })();

  try {
    return await Promise.race([
      attempts,
      new Promise<null>((resolve) => {
        deadline = setTimeout(() => {
          abortController.abort();
          resolve(null);
        }, DISCUSS_CARD_SERVER_DEADLINE_MS);
      }),
    ]);
  } finally {
    if (deadline) {
      clearTimeout(deadline);
    }
  }
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

function parseJsonLenient(text: string): unknown {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }

    throw new Error("No JSON object found in response");
  }
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
