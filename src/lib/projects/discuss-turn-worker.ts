// Detached discuss-turn worker. Runs the one-call AI generation + persists the
// reply + finalizes the turn, independent of the SSE stream that tails
// `subscribeProgress`. Task 5 rewires the POST route to call this detached
// (`void runDiscussTurn(...).catch(...)`) instead of the old in-stream path.
//
// ponytail: this is a MOVE of `handleDiscussTurnOneCall` from
// `src/routes/api.projects.preview.ts` (lines 781-1292) plus the four private
// helpers it calls (`repairDiscussCardWithTool`, `persistProjectChatTurn`,
// `persistProjectChatCompaction`, `scrubBriefForStorage`). The route keeps its
// own copies until Task 5 rewires it to import from here. When Task 5 lands,
// delete the duplicates from the route.

import {
  convertToModelMessages,
  generateText,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type UIMessage,
} from "ai";

import { getAiModel, getAiTelemetry } from "@/lib/ai";
import { getDefaultAiModel } from "@/lib/ai-models";
import { writeAiRequestLog } from "@/lib/ai-request-log";
import {
  DISCUSS_CARD_SEMANTIC_ATTEMPTS,
  DISCUSS_CARD_SERVER_DEADLINE_MS,
  getAiTimeoutMs,
} from "@/lib/ai-timeouts";
import { prisma } from "@/lib/prisma";
import { getSafeAiErrorLog } from "@/lib/projects/ai-error-log";
import { parseProjectBrief } from "@/lib/projects/brief";
import { normalizeWorkspaceTurn } from "@/lib/projects/brief-flow";
import { validateBrief } from "@/lib/projects/brief-rich-fields";
import { maybeCompactProjectChat } from "@/lib/projects/chat-compaction";
import {
  buildProjectChatContext,
  dedupeUiMessages,
  parseProjectChatSummary,
  parseProjectMemoryFacts,
} from "@/lib/projects/chat-memory";
import {
  buildCardSystemPrompt,
  buildOneCallSystemPrompt,
  PRESENT_WORKSPACE_CARD_TOOL_NAME,
  presentWorkspaceCardTool,
} from "@/lib/projects/discuss-tool";
import { finalizeDiscussTurn } from "@/lib/projects/discuss-turn";
import { publishProgress } from "@/lib/projects/discuss-turn-pubsub";
import { stripTransportDiagnosticMessages } from "@/lib/projects/strip-transport-diagnostic-messages";
import { chargeEnergyForAiUsage } from "@/lib/user-credits";

// `parseJsonLenient` is only used by the legacy two-call `generateWorkspaceTurn`
// in the route (not by the one-call path moved here). Not duplicated.

function scrubBriefForStorage(
  brief: ReturnType<typeof parseProjectBrief>,
  readyForBuild: boolean,
  projectId: string,
): ReturnType<typeof parseProjectBrief> {
  const { cleaned, dropped } = validateBrief(brief);
  if (dropped.length > 0) {
    console.warn("brief: dropped hallucinated fields", { dropped, projectId });
  }
  return {
    ...brief,
    ...cleaned,
    businessName: cleaned.businessName ?? brief.businessName,
    targetCustomer: cleaned.targetCustomer ?? brief.targetCustomer,
    readyForBuild,
  };
}

function persistProjectChatTurn({
  brief,
  messages,
  projectId,
  title,
  userId,
  workspaceCard,
}: {
  brief?: unknown;
  messages: UIMessage[];
  projectId: string;
  title?: string;
  userId: string;
  workspaceCard: unknown;
}) {
  if (brief !== undefined && title !== undefined) {
    return prisma.$executeRaw`
      UPDATE "Project" SET "chatMessages" = ${JSON.stringify(messages)}::jsonb, "brief" = ${JSON.stringify(brief)}::jsonb, "workspaceCard" = ${JSON.stringify(workspaceCard)}::jsonb, "title" = ${title} WHERE id = ${projectId} AND "userId" = ${userId}
    `;
  }
  return prisma.$executeRaw`
    UPDATE "Project" SET "chatMessages" = ${JSON.stringify(messages)}::jsonb, "workspaceCard" = ${JSON.stringify(workspaceCard)}::jsonb WHERE id = ${projectId} AND "userId" = ${userId}
  `;
}

function persistProjectChatCompaction({
  compactedMessageCount,
  memoryFacts,
  projectId,
  summary,
  userId,
}: {
  compactedMessageCount: number;
  memoryFacts: unknown;
  projectId: string;
  summary: unknown;
  userId: string;
}) {
  return prisma.$executeRaw`
    UPDATE "Project" SET "chatSummary" = ${JSON.stringify(summary)}::jsonb, "memoryFacts" = ${JSON.stringify(memoryFacts)}::jsonb, "lastCompactedMessageCount" = ${compactedMessageCount} WHERE id = ${projectId} AND "userId" = ${userId}
  `;
}

async function repairDiscussCardWithTool({
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
  model: LanguageModel;
  modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
  modelName: string;
  projectId: string;
  userId: string;
}) {
  const abortController = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const attempts = (async () => {
    for (
      let semanticAttempt = 0;
      semanticAttempt < DISCUSS_CARD_SEMANTIC_ATTEMPTS;
      semanticAttempt += 1
    ) {
      try {
        const repaired = await generateText({
          abortSignal: abortController.signal,
          model,
          system: `${cardSystemPrompt}

REPAIR attempt ${semanticAttempt + 1}: previous card was invalid or missing.
Call ${PRESENT_WORKSPACE_CARD_TOOL_NAME} exactly once with a valid workspace card.
Emit type="question" with a single question (never type="questions"), or type="build_recommendation" only at 95%+ confidence.
Keep a short Indonesian chat preface only if needed. Prefer 2-5 options per choice question and set recommendedOptionLabel.`,
          messages: [
            ...modelMessages,
            ...(chatText
              ? [{ role: "assistant" as const, content: chatText }]
              : []),
            {
              role: "user" as const,
              content:
                'Berdasarkan jawaban terakhirku, buat ulang workspace card yang valid: satu pertanyaan jelas (type="question") dengan opsi konkret, atau build_recommendation kalau udah 95%+. Tanpa JSON di chat.',
            },
          ],
          tools: {
            [PRESENT_WORKSPACE_CARD_TOOL_NAME]: presentWorkspaceCardTool,
          },
          toolChoice: {
            type: "tool",
            toolName: PRESENT_WORKSPACE_CARD_TOOL_NAME,
          },
          temperature: 0.2,
          maxRetries: 1,
          timeout: getAiTimeoutMs("discussCard"),
          telemetry: getAiTelemetry("project-guided-discuss-one-call-repair", {
            mode: "discuss-one-call-repair",
            model: modelName,
            phase: semanticAttempt === 0 ? "repair" : "repair-retry",
            projectId,
            route: "api.projects.preview",
            userId,
          }),
        });

        totalInputTokens += repaired.usage?.inputTokens ?? 0;
        totalOutputTokens += repaired.usage?.outputTokens ?? 0;

        const toolCall = repaired.toolCalls?.[0] as
          { input?: unknown; args?: unknown } | undefined;
        const input = toolCall?.input ?? toolCall?.args ?? null;
        const turn = normalizeWorkspaceTurn(input, brief, { hasBuiltSite });
        if (turn.workspaceCard.type !== "none") {
          return {
            ...turn,
            repairsUsed: semanticAttempt + 1,
            usage: {
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
            },
          };
        }
      } catch (error) {
        console.error(
          "[preview-chat] one-call repair error",
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

// In-turn repair layer: when the primary streamText emits a tool call with
// malformed args, the AI SDK invokes `repairToolCall`. We re-prompt once with
// the forced card tool and return a `LanguageModelV4ToolCall`-shaped value.
type RepairedToolCall = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: string;
};

async function repairToolCallInTurn({
  error,
  messages,
  model,
  modelName,
  projectId,
  toolCall,
}: {
  error: unknown;
  messages: ModelMessage[];
  model: LanguageModel;
  modelName: string;
  projectId: string;
  toolCall: { toolCallId: string; toolName: string; input?: unknown };
}): Promise<RepairedToolCall | null> {
  console.error("[preview-chat] invalid tool args, attempting in-turn repair", {
    projectId,
    model: modelName,
    failedToolCallId: toolCall.toolCallId,
    failedToolName: toolCall.toolName,
    error: getSafeAiErrorLog(error),
  });
  try {
    const result = await generateText({
      model,
      messages,
      tools: { [PRESENT_WORKSPACE_CARD_TOOL_NAME]: presentWorkspaceCardTool },
      toolChoice: { type: "tool", toolName: PRESENT_WORKSPACE_CARD_TOOL_NAME },
      maxRetries: 2,
      temperature: 0.25,
      maxOutputTokens: 1024,
      timeout: getAiTimeoutMs("discussCard"),
    });
    const repaired = result.toolCalls[0];
    if (!repaired) {
      return null;
    }
    return {
      type: "tool-call",
      toolCallId: repaired.toolCallId,
      toolName: repaired.toolName,
      input:
        typeof repaired.input === "string"
          ? repaired.input
          : JSON.stringify(repaired.input ?? {}),
    };
  } catch (repairError) {
    console.error("[preview-chat] in-turn repair failed", {
      projectId,
      model: modelName,
      error: getSafeAiErrorLog(repairError),
    });
    return null;
  }
}

export async function runDiscussTurn({
  turnId,
  project,
  chatContext,
  effectiveBrief,
  memoryFacts,
  messages,
  summary,
  userId,
  modelOverride,
}: {
  turnId: string;
  project: { id: string; prompt: string; status: string; title: string };
  chatContext: ReturnType<typeof buildProjectChatContext>;
  effectiveBrief: ReturnType<typeof parseProjectBrief>;
  memoryFacts: ReturnType<typeof parseProjectMemoryFacts>;
  messages: UIMessage[];
  summary: ReturnType<typeof parseProjectChatSummary>;
  userId: string;
  // ponytail: production omits → uses the real model via getAiModel(modelName).
  // Tests pass a mock so streamText's stream/usage/response can be controlled.
  modelOverride?: LanguageModel;
}): Promise<void> {
  try {
    const modelName = getDefaultAiModel();
    const model = modelOverride ?? getAiModel(modelName);
    const systemPrompt = buildOneCallSystemPrompt({
      brief: effectiveBrief,
      context: chatContext.systemContext,
      hasBuiltSite: project.status === "ready",
    });
    const cardSystemPrompt = buildCardSystemPrompt();
    const modelMessages = await convertToModelMessages(chatContext.messages);

    await writeAiRequestLog({
      event: "discuss:start",
      model: modelName,
      mode: "one_call_tools",
      projectId: project.id,
      messageCount: messages.length,
      briefConfidence: effectiveBrief.confidence,
    });

    const primary = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools: { [PRESENT_WORKSPACE_CARD_TOOL_NAME]: presentWorkspaceCardTool },
      toolChoice: "auto",
      repairToolCall: async ({ toolCall, error, messages }) =>
        repairToolCallInTurn({
          error,
          messages,
          model,
          modelName,
          projectId: project.id,
          toolCall,
        }),
      maxRetries: 2,
      temperature: 0.25,
      maxOutputTokens: 1024,
      timeout: getAiTimeoutMs("discussOneCall"),
      telemetry: getAiTelemetry("project-guided-discuss-one-call", {
        briefConfidence: effectiveBrief.confidence,
        mode: "discuss-one-call",
        model: modelName,
        projectId: project.id,
        route: "api.projects.preview",
        userId,
      }),
      onError({ error }) {
        console.error(
          "[preview-chat] one-call stream error",
          getSafeAiErrorLog(error),
        );
      },
    });

    const messageId = `discuss-${crypto.randomUUID()}`;
    const textPartId = "discuss-text";
    const toolCallId = `tool-${crypto.randomUUID()}`;

    publishProgress(turnId, { type: "start", messageId });
    publishProgress(turnId, { type: "text-start", id: textPartId });

    let fullText = "";
    let hadError = false;
    let toolInput: unknown = null;
    let streamToolCallId: string | null = null;
    const primaryResponsePromise = Promise.resolve(primary.response).catch(
      () => null,
    );

    try {
      for await (const part of primary.stream) {
        if (part.type === "text-delta") {
          const delta =
            "text" in part && typeof part.text === "string"
              ? part.text
              : "delta" in part && typeof part.delta === "string"
                ? part.delta
                : "";
          if (!delta) {
            continue;
          }
          fullText += delta;
          publishProgress(turnId, {
            type: "text-delta",
            id: textPartId,
            delta,
          });
          continue;
        }

        if (part.type === "tool-call") {
          streamToolCallId =
            "toolCallId" in part && typeof part.toolCallId === "string"
              ? part.toolCallId
              : streamToolCallId;
          toolInput =
            "input" in part
              ? part.input
              : "args" in part
                ? (part as { args?: unknown }).args
                : toolInput;
        }
      }
    } catch (error) {
      hadError = true;
      const servedModel = (await primaryResponsePromise)?.modelId ?? modelName;
      const safeError = getSafeAiErrorLog(error);
      console.error("[preview-chat] one-call stream consume error", {
        projectId: project.id,
        model: servedModel,
        error: safeError,
      });
      await writeAiRequestLog({
        event: "discuss:stream_error",
        model: servedModel,
        mode: "one_call_tools",
        projectId: project.id,
        error: safeError,
      });
    }

    publishProgress(turnId, { type: "text-end", id: textPartId });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let discussModelId = modelName;
    try {
      const primaryUsage = await primary.usage;
      totalInputTokens = primaryUsage?.inputTokens ?? 0;
      totalOutputTokens = primaryUsage?.outputTokens ?? 0;
      const primaryResponse = await Promise.resolve(primary.response).catch(
        () => null,
      );
      if (primaryResponse?.modelId) {
        discussModelId = primaryResponse.modelId;
      }
    } catch {
      // usage is best-effort
    }

    const chatText = fullText.trim();
    if (hadError) {
      if (chatText) {
        // Stream threw mid-flight but text already reached the client.
        // Degrade to a plain textbox (type:"none" card) instead of a
        // blind error toast, mirroring the primaryToolFailed else-tail.
        const resolvedToolCallId = streamToolCallId || toolCallId;
        publishProgress(turnId, {
          type: "tool-input-available",
          toolCallId: resolvedToolCallId,
          toolName: PRESENT_WORKSPACE_CARD_TOOL_NAME,
          input: {},
        });
        publishProgress(turnId, {
          type: "tool-output-available",
          toolCallId: resolvedToolCallId,
          output: {
            workspaceCard: { type: "none" },
            projectTitle: project.title,
            repairsUsed: 0,
          },
        });
        const assistantMessage: UIMessage = {
          id: messageId,
          role: "assistant",
          parts: [
            { type: "text", text: chatText, state: "done" },
            {
              type: `tool-${PRESENT_WORKSPACE_CARD_TOOL_NAME}`,
              toolCallId: resolvedToolCallId,
              state: "output-available",
              input: {},
              output: {
                workspaceCard: { type: "none" },
                projectTitle: project.title,
              },
            } as UIMessage["parts"][number],
          ],
        };
        const safeMessages = stripTransportDiagnosticMessages(
          dedupeUiMessages([...messages, assistantMessage]),
        );
        await writeAiRequestLog({
          event: "discuss:finish",
          model: modelName,
          mode: "one_call_tools",
          projectId: project.id,
          didWorkspaceToolUpdate: false,
          primaryToolFailed: true,
          repairsUsed: 0,
          workspaceCard: { type: "none" },
        });
        await persistProjectChatTurn({
          messages: safeMessages,
          projectId: project.id,
          userId,
          workspaceCard: { type: "none" },
        });
        await chargeEnergyForAiUsage({
          userId,
          modelId: discussModelId,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          reason: "discuss_turn",
        });
        await writeAiRequestLog({
          event: "discuss:degraded",
          model: modelName,
          mode: "one_call_tools",
          projectId: project.id,
          hadText: true,
        });
        publishProgress(turnId, { type: "finish" });
        await finalizeDiscussTurn({ turnId, status: "succeeded" });
        return;
      }

      // Stream threw immediately: no text, no tool. Charge once, surface
      // a clean error. Never persist a dummy assistant turn.
      await chargeEnergyForAiUsage({
        userId,
        modelId: discussModelId,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        reason: "discuss_turn",
      });
      publishProgress(turnId, {
        type: "error",
        errorText: "AI lagi gangguan. Coba lagi sebentar.",
      });
      await finalizeDiscussTurn({
        turnId,
        status: "failed",
        errorMessage: "stream_error_no_text",
      });
      return;
    }

    if (!chatText) {
      // ponytail: tool-only response (no prose). Retry the card via
      // repairDiscussCardWithTool, then persist a card-only assistant turn
      // (no fake text). Never surface a dummy string.
      const repaired = await repairDiscussCardWithTool({
        brief: effectiveBrief,
        cardSystemPrompt,
        chatText: "",
        hasBuiltSite: project.status === "ready",
        model,
        modelMessages,
        modelName,
        projectId: project.id,
        userId,
      });
      totalInputTokens += repaired?.usage.inputTokens ?? 0;
      totalOutputTokens += repaired?.usage.outputTokens ?? 0;

      if (repaired) {
        const repairedCard = repaired.workspaceCard;
        const repairedToolCallId = streamToolCallId || toolCallId;
        publishProgress(turnId, {
          type: "tool-input-available",
          toolCallId: repairedToolCallId,
          toolName: PRESENT_WORKSPACE_CARD_TOOL_NAME,
          input: {},
        });
        publishProgress(turnId, {
          type: "tool-output-available",
          toolCallId: repairedToolCallId,
          output: {
            workspaceCard: repairedCard,
            projectTitle: repaired.projectTitle || project.title,
            repairsUsed: repaired.repairsUsed,
          },
        });
        const repairedAssistantMessage: UIMessage = {
          id: messageId,
          role: "assistant",
          parts: [
            {
              type: `tool-${PRESENT_WORKSPACE_CARD_TOOL_NAME}`,
              toolCallId: repairedToolCallId,
              state: "output-available",
              input: {},
              output: {
                workspaceCard: repairedCard,
                projectTitle: repaired.projectTitle || project.title,
              },
            } as UIMessage["parts"][number],
          ],
        };
        const safeMessages = stripTransportDiagnosticMessages(
          dedupeUiMessages([...messages, repairedAssistantMessage]),
        );
        await writeAiRequestLog({
          event: "discuss:finish",
          model: modelName,
          mode: "one_call_tools",
          projectId: project.id,
          didWorkspaceToolUpdate: true,
          primaryToolFailed: true,
          repairsUsed: repaired.repairsUsed,
          workspaceCard: repairedCard,
        });
        await persistProjectChatTurn({
          brief: scrubBriefForStorage(
            repaired.brief,
            repaired.readyForBuild,
            project.id,
          ),
          messages: safeMessages,
          projectId: project.id,
          title: repaired.projectTitle || project.title,
          userId,
          workspaceCard: repairedCard,
        });
        await chargeEnergyForAiUsage({
          userId,
          modelId: discussModelId,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          reason: "discuss_turn",
        });
        publishProgress(turnId, { type: "finish" });
        await finalizeDiscussTurn({ turnId, status: "succeeded" });
        return;
      }

      // All repair attempts failed. Charge once, surface a clean error.
      await chargeEnergyForAiUsage({
        userId,
        modelId: discussModelId,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        reason: "discuss_turn",
      });
      publishProgress(turnId, {
        type: "error",
        errorText: "AI lagi gangguan. Coba lagi sebentar.",
      });
      await finalizeDiscussTurn({
        turnId,
        status: "failed",
        errorMessage: "repair_failed",
      });
      return;
    }

    let workspaceTurn = normalizeWorkspaceTurn(toolInput, effectiveBrief, {
      hasBuiltSite: project.status === "ready",
    });
    let primaryToolFailed = workspaceTurn.workspaceCard.type === "none";
    let repairsUsed = 0;

    if (primaryToolFailed) {
      const repaired = await repairDiscussCardWithTool({
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
      if (repaired) {
        workspaceTurn = {
          brief: repaired.brief,
          projectTitle: repaired.projectTitle,
          workspaceCard: repaired.workspaceCard,
          readyForBuild: repaired.readyForBuild,
        };
        primaryToolFailed = false;
        repairsUsed = repaired.repairsUsed;
        totalInputTokens += repaired.usage.inputTokens;
        totalOutputTokens += repaired.usage.outputTokens;
      }
    }

    const hasCard = workspaceTurn.workspaceCard.type !== "none";
    const resolvedToolCallId = streamToolCallId || toolCallId;

    publishProgress(turnId, {
      type: "tool-input-available",
      toolCallId: resolvedToolCallId,
      toolName: PRESENT_WORKSPACE_CARD_TOOL_NAME,
      input: toolInput ?? {},
    });
    publishProgress(turnId, {
      type: "tool-output-available",
      toolCallId: resolvedToolCallId,
      output: {
        workspaceCard: workspaceTurn.workspaceCard,
        projectTitle: workspaceTurn.projectTitle || project.title,
        repairsUsed,
      },
    });

    const assistantMessage: UIMessage = {
      id: messageId,
      role: "assistant",
      parts: [
        { type: "text", text: chatText, state: "done" },
        {
          type: `tool-${PRESENT_WORKSPACE_CARD_TOOL_NAME}`,
          toolCallId: resolvedToolCallId,
          state: "output-available",
          input: toolInput ?? {},
          output: {
            workspaceCard: workspaceTurn.workspaceCard,
            projectTitle: workspaceTurn.projectTitle || project.title,
          },
        } as UIMessage["parts"][number],
      ],
    };

    const safeMessages = stripTransportDiagnosticMessages(
      dedupeUiMessages([...messages, assistantMessage]),
    );

    if (hasCard) {
      const title = workspaceTurn.projectTitle || project.title;
      await writeAiRequestLog({
        event: "discuss:finish",
        model: modelName,
        mode: "one_call_tools",
        projectId: project.id,
        didWorkspaceToolUpdate: true,
        primaryToolFailed,
        repairsUsed,
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
        mode: "one_call_tools",
        projectId: project.id,
        didWorkspaceToolUpdate: false,
        primaryToolFailed: true,
        repairsUsed,
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

    publishProgress(turnId, { type: "finish" });
    await finalizeDiscussTurn({ turnId, status: "succeeded" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "discuss turn failed";
    await finalizeDiscussTurn({
      turnId,
      status: "failed",
      errorMessage: message,
    });
    publishProgress(turnId, { type: "error", message });
  }
}
