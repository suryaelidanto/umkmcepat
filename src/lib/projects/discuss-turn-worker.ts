// Detached discuss-turn worker. Runs the one-call AI generation + persists the
// reply + finalizes the turn, independent of the SSE stream that tails
// `subscribeProgress`. Task 5 rewires the POST route to call this detached
// (`void runDiscussTurn(...).catch(...)`) instead of the old in-stream path.

import {
  convertToModelMessages,
  streamText,
  type LanguageModel,
  type UIMessage,
} from "ai";

import { getAiModel, getAiTelemetry } from "@/lib/ai";
import { getDefaultAiModel } from "@/lib/ai-models";
import { writeAiRequestLog } from "@/lib/ai-request-log";
import { getAiTimeoutMs } from "@/lib/ai-timeouts";
import { getSafeAiErrorLog } from "@/lib/projects/ai-error-log";
import { parseProjectBrief } from "@/lib/projects/brief";
import { normalizeWorkspaceTurn } from "@/lib/projects/brief-flow";
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
import {
  persistProjectChatCompaction,
  persistProjectChatTurn,
  repairDiscussCardWithTool,
  repairToolCallInTurn,
  scrubBriefForStorage,
} from "@/lib/projects/discuss-turn-shared";
import { stripTransportDiagnosticMessages } from "@/lib/projects/strip-transport-diagnostic-messages";
import { chargeEnergyForAiUsage } from "@/lib/user-credits";

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
    // Emit the error BEFORE finalizing: if finalize throws, the connected
    // client's tail stream still receives the terminal `error` event instead
    // of hanging until disconnect.
    publishProgress(turnId, { type: "error", errorText: message });
    try {
      await finalizeDiscussTurn({
        turnId,
        status: "failed",
        errorMessage: message,
      });
    } catch (finalizeError) {
      console.error("[discuss-turn-worker] finalize failed", {
        turnId,
        finalizeError:
          finalizeError instanceof Error
            ? finalizeError.message
            : String(finalizeError),
      });
    }
  }
}
