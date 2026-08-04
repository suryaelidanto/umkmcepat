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

import {
  getAiModel,
  getAiTelemetry,
  getNoReasoningCallOptions,
} from "@/lib/ai";
import { getDiscussModel } from "@/lib/ai-models";
import { writeAiRequestLog } from "@/lib/ai-request-log";
import { getAiTimeoutMs } from "@/lib/ai-timeouts";
import { devLog } from "@/lib/dev-log";
import { getSafeAiErrorLog } from "@/lib/projects/ai-error-log";
import { parseProjectBrief, type WorkspaceCard } from "@/lib/projects/brief";
import { normalizeWorkspaceTurn } from "@/lib/projects/brief-flow";
import { prepareBuildHandoff } from "@/lib/projects/build-planner";
import { maybeCompactProjectChat } from "@/lib/projects/chat-compaction";
import {
  buildProjectChatContext,
  dedupeUiMessages,
  getTextFromUIMessage,
  parseProjectChatSummary,
  parseProjectMemoryFacts,
} from "@/lib/projects/chat-memory";
import {
  evaluateDiscussReadiness,
  type DiscussReadiness,
  type DiscussReadinessBlocker,
} from "@/lib/projects/discuss-readiness";
import { publishPacedTextDeltas } from "@/lib/projects/discuss-text-pacing";
import {
  buildCardSystemPrompt,
  buildOneCallSystemPrompt,
  extractAssistantTextFromToolInput,
  nextAssistantTextDeltaFromPartialToolJson,
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
import { inlineChatAssetFileParts } from "@/lib/projects/inline-chat-asset-file-parts";
import { stripTransportDiagnosticMessages } from "@/lib/projects/strip-transport-diagnostic-messages";
import { chargeEnergyForAiUsage } from "@/lib/user-credits";

export async function runDiscussTurn({
  turnId,
  project,
  chatContext,
  effectiveBrief,
  memoryFacts,
  messages,
  previousWorkspaceCard,
  summary,
  userId,
  modelOverride,
  abortSignal,
}: {
  turnId: string;
  project: {
    id: string;
    prompt: string;
    status: string;
    title: string;
    generationEngine: string;
  };
  chatContext: ReturnType<typeof buildProjectChatContext>;
  effectiveBrief: ReturnType<typeof parseProjectBrief>;
  memoryFacts: ReturnType<typeof parseProjectMemoryFacts>;
  messages: UIMessage[];
  previousWorkspaceCard?: WorkspaceCard;
  summary: ReturnType<typeof parseProjectChatSummary>;
  userId: string;
  // ponytail: production omits → uses the real model via getAiModel(modelName).
  // Tests pass a mock so streamText's stream/usage/response can be controlled.
  modelOverride?: LanguageModel;
  abortSignal?: AbortSignal;
}): Promise<void> {
  try {
    if (abortSignal?.aborted) {
      await finalizeDiscussTurn({
        turnId,
        status: "cancelled",
        errorMessage: "Dihentikan oleh pengguna.",
      });
      publishProgress(turnId, {
        type: "error",
        errorText: "Proses dihentikan.",
      });
      return;
    }
    const modelName = getDiscussModel();
    const model = modelOverride ?? getAiModel(modelName);
    const lastUserText = [...messages]
      .reverse()
      .find((message) => message.role === "user");
    const lastUserTextValue = lastUserText
      ? getTextFromUIMessage(lastUserText)
      : undefined;
    const hasBuiltSite = project.status === "ready";
    const handoffNormalizeOptions = {
      hasBuiltSite,
      lastUserText: lastUserTextValue,
      previousWorkspaceCard,
    };
    const chatContextWithInlineAssets = {
      ...chatContext,
      messages: await inlineChatAssetFileParts(chatContext.messages),
    };
    const systemPrompt = buildOneCallSystemPrompt({
      brief: effectiveBrief,
      context: chatContext.systemContext,
      hasBuiltSite,
    });
    const cardSystemPrompt = buildCardSystemPrompt();
    const modelMessages = await convertToModelMessages(
      chatContextWithInlineAssets.messages,
    );

    await writeAiRequestLog({
      event: "discuss:start",
      model: modelName,
      mode: "one_call_tools",
      projectId: project.id,
      messageCount: messages.length,
      briefConfidence: effectiveBrief.confidence,
    });

    const discussStartedAt = Date.now();
    const primary = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools: { [PRESENT_WORKSPACE_CARD_TOOL_NAME]: presentWorkspaceCardTool },
      // Always require the card tool. "auto" let post-build turns skip the
      // call entirely (text-only), so the UI never got a question card.
      toolChoice: {
        type: "tool",
        toolName: PRESENT_WORKSPACE_CARD_TOOL_NAME,
      },
      repairToolCall: async ({ toolCall, error, messages }) =>
        repairToolCallInTurn({
          error,
          messages,
          model,
          modelName,
          userId,
          projectId: project.id,
          toolCall,
        }),
      temperature: 0.25,
      maxOutputTokens: 1024,
      timeout: getAiTimeoutMs("discussOneCall"),
      ...getNoReasoningCallOptions(),
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
    let toolInputJson = "";
    let streamedToolAssistantText = "";
    const primaryResponsePromise = Promise.resolve(primary.response).catch(
      () => null,
    );

    try {
      for await (const part of primary.stream) {
        if (abortSignal?.aborted) {
          hadError = true;
          break;
        }
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
          await publishPacedTextDeltas({
            text: delta,
            abortSignal,
            publish: (piece) => {
              publishProgress(turnId, {
                type: "text-delta",
                id: textPartId,
                delta: piece,
              });
            },
          });
          continue;
        }

        if (part.type === "tool-input-start") {
          if ("id" in part && typeof part.id === "string") {
            streamToolCallId = part.id;
          }
          toolInputJson = "";
          continue;
        }

        if (part.type === "tool-input-delta") {
          const delta =
            "delta" in part && typeof part.delta === "string" ? part.delta : "";
          if (!delta) {
            continue;
          }
          if ("id" in part && typeof part.id === "string") {
            streamToolCallId = part.id;
          }
          toolInputJson += delta;
          if (fullText && !streamedToolAssistantText) {
            // Free chat text already streaming; don't dual-stream tool prose.
            continue;
          }
          const next = await nextAssistantTextDeltaFromPartialToolJson(
            toolInputJson,
            streamedToolAssistantText,
          );
          if (next.delta) {
            streamedToolAssistantText = next.seenText;
            fullText = next.seenText;
            await publishPacedTextDeltas({
              text: next.delta,
              abortSignal,
              publish: (piece) => {
                publishProgress(turnId, {
                  type: "text-delta",
                  id: textPartId,
                  delta: piece,
                });
              },
            });
          }
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

    // Final tool-call may complete chars partial JSON never closed; or fill
    // gap when provider only emits tool-call (no tool-input-delta).
    if (!fullText.trim()) {
      const fromTool = extractAssistantTextFromToolInput(toolInput);
      if (fromTool) {
        fullText = fromTool;
        await publishPacedTextDeltas({
          text: fromTool,
          abortSignal,
          publish: (piece) => {
            publishProgress(turnId, {
              type: "text-delta",
              id: textPartId,
              delta: piece,
            });
          },
        });
      }
    } else if (streamedToolAssistantText) {
      const finalToolText = extractAssistantTextFromToolInput(toolInput);
      if (
        finalToolText.startsWith(streamedToolAssistantText) &&
        finalToolText.length > streamedToolAssistantText.length
      ) {
        const tail = finalToolText.slice(streamedToolAssistantText.length);
        fullText = finalToolText;
        await publishPacedTextDeltas({
          text: tail,
          abortSignal,
          publish: (piece) => {
            publishProgress(turnId, {
              type: "text-delta",
              id: textPartId,
              delta: piece,
            });
          },
        });
      }
    }
    let chatText = fullText.trim();
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
          reason: "discuss:step",
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
        reason: "discuss:step",
      });
      const streamFailMessage = "AI lagi gangguan. Coba lagi sebentar.";
      publishProgress(turnId, {
        type: "error",
        errorText: streamFailMessage,
      });
      await finalizeDiscussTurn({
        turnId,
        status: "failed",
        errorMessage: streamFailMessage,
      });
      return;
    }

    const primaryMs = Date.now() - discussStartedAt;
    if (!chatText) {
      // Post-build: none is a legal card. Do not repair for interview cards
      // or invent assistant prose.
      if (hasBuiltSite) {
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
          didWorkspaceToolUpdate: true,
          primaryToolFailed: false,
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
          reason: "discuss:step",
        });
        publishProgress(turnId, { type: "finish" });
        await finalizeDiscussTurn({ turnId, status: "succeeded" });
        return;
      }

      // ponytail: tool-only response (no prose). Retry the card via
      // repairDiscussCardWithTool, then persist a card-only assistant turn
      // (no fake text). Never surface a dummy string.
      const repairStartedAt = Date.now();
      const repaired = await repairDiscussCardWithTool({
        brief: effectiveBrief,
        cardSystemPrompt,
        chatText: "",
        hasBuiltSite,
        lastUserText: lastUserTextValue,
        previousWorkspaceCard,
        model,
        modelMessages,
        modelName,
        projectId: project.id,
        userId,
      });
      const repairMs = Date.now() - repairStartedAt;
      devLog("discuss", "timings", {
        primaryMs,
        repairMs,
        textOnly: false,
        repaired: Boolean(repaired),
        projectId: project.id,
      });
      totalInputTokens += repaired?.usage.inputTokens ?? 0;
      totalOutputTokens += repaired?.usage.outputTokens ?? 0;

      if (repaired) {
        const repairedCard = repaired.workspaceCard;
        const repairedToolCallId = streamToolCallId || toolCallId;
        const repairedText = repaired.assistantText;
        if (repairedText) {
          const repairTextPartId = `${textPartId}-repair`;
          publishProgress(turnId, {
            type: "text-start",
            id: repairTextPartId,
          });
          await publishPacedTextDeltas({
            text: repairedText,
            abortSignal,
            publish: (piece) => {
              publishProgress(turnId, {
                type: "text-delta",
                id: repairTextPartId,
                delta: piece,
              });
            },
          });
          publishProgress(turnId, {
            type: "text-end",
            id: repairTextPartId,
          });
        }
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
            ...(repairedText
              ? [
                  {
                    type: "text" as const,
                    text: repairedText,
                    state: "done" as const,
                  },
                ]
              : []),
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
          reason: "discuss:step",
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
        reason: "discuss:step",
      });
      const repairFailMessage = "AI lagi gangguan. Coba lagi sebentar.";
      publishProgress(turnId, {
        type: "error",
        errorText: repairFailMessage,
      });
      await finalizeDiscussTurn({
        turnId,
        status: "failed",
        errorMessage: repairFailMessage,
      });
      return;
    }

    let workspaceTurn = normalizeWorkspaceTurn(
      toolInput,
      effectiveBrief,
      handoffNormalizeOptions,
    );
    // Post-build policy: none is an allowed card. Do not treat it as a
    // missing tool or spend energy on interview-card repair.
    let primaryToolFailed =
      workspaceTurn.workspaceCard.type === "none" && !hasBuiltSite;
    let repairsUsed = 0;

    let repairMs = 0;
    if (primaryToolFailed) {
      const repairStartedAt = Date.now();
      const repaired = await repairDiscussCardWithTool({
        brief: effectiveBrief,
        cardSystemPrompt,
        chatText,
        hasBuiltSite,
        lastUserText: lastUserTextValue,
        previousWorkspaceCard,
        model,
        modelMessages,
        modelName,
        projectId: project.id,
        userId,
      });
      repairMs = Date.now() - repairStartedAt;
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

    // Affirm after prior build_confirm can promote even when model returned none.
    if (workspaceTurn.workspaceCard.type === "none" && !hasBuiltSite) {
      const promoted = normalizeWorkspaceTurn(
        { workspaceCard: { type: "none" } },
        effectiveBrief,
        handoffNormalizeOptions,
      );
      if (promoted.readyForBuild) {
        workspaceTurn = promoted;
        primaryToolFailed = false;
      }
    }

    const hasCard = workspaceTurn.workspaceCard.type !== "none";

    // Legacy readiness gate: the server, not model confidence, authorizes a
    // build recommendation. If structural decisions are still unresolved, the
    // build card is demoted to the next question unless the user explicitly
    // asked to build now (then it passes after an honest warning).
    if (
      project.generationEngine === "legacy-v1" &&
      workspaceTurn.workspaceCard.type === "build_recommendation"
    ) {
      const readiness = evaluateDiscussReadiness({
        brief: workspaceTurn.brief,
        umkmType: workspaceTurn.brief.umkmType ?? undefined,
      });
      if (readiness.state === "needs_question") {
        if (requestsImmediateBuild(lastUserTextValue)) {
          chatText = buildEarlyBuildWarning(readiness.blockers);
        } else {
          workspaceTurn = demoteToReadinessQuestion(workspaceTurn, readiness);
          chatText = READINESS_QUESTION_INTRO;
        }
        devLog("discuss", "gate", {
          projectId: project.id,
          turnId,
          blockers: readiness.blockers,
          buildAllowed: requestsImmediateBuild(lastUserTextValue),
        });
      }
    }

    devLog("discuss", "timings", {
      primaryMs,
      repairMs,
      textOnly: !hasCard,
      repairsUsed,
      projectId: project.id,
    });
    const resolvedToolCallId = streamToolCallId || toolCallId;

    // Always emit tool protocol events (including type:"none") so useChat
    // stream shape settles; product still forbids inventing question content.
    publishProgress(turnId, {
      type: "tool-input-available",
      toolCallId: resolvedToolCallId,
      toolName: PRESENT_WORKSPACE_CARD_TOOL_NAME,
      input: hasCard ? (toolInput ?? {}) : {},
    });
    publishProgress(turnId, {
      type: "tool-output-available",
      toolCallId: resolvedToolCallId,
      output: {
        workspaceCard: hasCard ? workspaceTurn.workspaceCard : { type: "none" },
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
          input: hasCard ? (toolInput ?? {}) : {},
          output: {
            workspaceCard: hasCard
              ? workspaceTurn.workspaceCard
              : { type: "none" },
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
      // contract-v1: prepare an immutable handoff before showing the build
      // card. legacy-v1 never runs this; it keeps post-click spec generation.
      let handoffId: string | undefined;
      let reviewHash: string | undefined;
      let reviewItems: Array<{
        id: string;
        kind: string;
        label: string;
        value: string;
      }> = [];
      if (
        workspaceTurn.workspaceCard.type === "build_recommendation" &&
        project.generationEngine === "contract-v1" &&
        workspaceTurn.readyForBuild
      ) {
        const prepared = await prepareBuildHandoff({
          projectId: project.id,
          userId,
          engine: "contract-v1",
          brief: workspaceTurn.brief,
          turnId,
        });
        if (prepared.state === "ready") {
          handoffId = prepared.handoffId;
          reviewHash = prepared.reviewHash;
          reviewItems = prepared.reviewItems.map((i) => ({
            id: i.id,
            kind: i.kind,
            label: i.label,
            value: i.value,
          }));
          workspaceTurn = {
            ...workspaceTurn,
            workspaceCard: {
              ...workspaceTurn.workspaceCard,
              handoffId,
              reviewHash,
              reviewItems,
            },
          };
        }
      }
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
    } else if (hasBuiltSite) {
      await writeAiRequestLog({
        event: "discuss:finish",
        model: modelName,
        mode: "one_call_tools",
        projectId: project.id,
        didWorkspaceToolUpdate: true,
        primaryToolFailed: false,
        repairsUsed,
        workspaceCard: { type: "none" },
      });
      await persistProjectChatTurn({
        messages: safeMessages,
        projectId: project.id,
        userId,
        workspaceCard: { type: "none" },
      });
    } else {
      devLog("discuss", "text-only-fallback", {
        projectId: project.id,
        repairsUsed,
        primaryMs,
        repairMs,
      });
      await writeAiRequestLog({
        event: "discuss:text-only-fallback",
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
      reason: "discuss:step",
    });

    publishProgress(turnId, { type: "finish" });
    await finalizeDiscussTurn({ turnId, status: "succeeded" });
  } catch (error) {
    // Developer log (English). User-facing copy always Indonesian.
    console.error("[discuss-turn-worker] turn failed", {
      turnId,
      error: error instanceof Error ? error.message : "discuss turn failed",
    });
    const userMessage = "Obrolan belum berhasil diproses. Coba kirim ulang ya.";
    // Emit the error BEFORE finalizing: if finalize throws, the connected
    // client's tail stream still receives the terminal `error` event instead
    // of hanging until disconnect.
    publishProgress(turnId, { type: "error", errorText: userMessage });
    try {
      await finalizeDiscussTurn({
        turnId,
        status: "failed",
        errorMessage: userMessage,
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

const BUILD_NOW_PATTERNS: readonly RegExp[] = [
  /langsung\s+(?:bangun|build|gabung)/i,
  /build\s+(?:aja|sekarang|dulu)/i,
  /udah\s+cukup/i,
  /cukup\s+dulu/i,
  /lanjut\s+build/i,
];

function requestsImmediateBuild(text: string | undefined): boolean {
  if (!text) {
    return false;
  }
  return BUILD_NOW_PATTERNS.some((pattern) => pattern.test(text));
}

const READINESS_QUESTION_INTRO =
  "Satu hal lagi yang nentuin struktur situsnya, biar hasilnya pas.";

const READINESS_QUESTIONS: Partial<Record<DiscussReadinessBlocker, string>> = {
  businessName: "Nama usaha kamu apa?",
  productOrService: "Usaha ini jual/layani apa?",
  primaryOffer: "Dari beberapa produk tadi, mana yang paling jadi andalan?",
  targetCustomer: "Siapa pelanggan utama yang paling mau kamu tarik?",
  visualPreference: "Gaya situs yang kamu mau seperti apa?",
  visuals: "Udah punya foto produk, atau aku bikin desain yang fokus teks?",
  contact: "Nomor WhatsApp atau telepon yang bisa dihubungi?",
  address: "Alamat lengkap usaha kamu di mana?",
  hours: "Jam buka dan hari operasionalnya bagaimana?",
  deliveryArea: "Area pengiriman atau layanan kamu sampai mana?",
};

function demoteToReadinessQuestion(
  workspaceTurn: NonNullable<ReturnType<typeof normalizeWorkspaceTurn>>,
  readiness: Extract<DiscussReadiness, { state: "needs_question" }>,
): NonNullable<ReturnType<typeof normalizeWorkspaceTurn>> {
  const question = READINESS_QUESTIONS[readiness.nextFieldId];
  return {
    ...workspaceTurn,
    readyForBuild: false,
    workspaceCard: {
      type: "question",
      question: {
        id: readiness.nextFieldId,
        question: question ?? READINESS_QUESTION_INTRO,
        answerMode: "text",
        selectionMode: "single",
        options: [],
      },
    },
  };
}

const READINESS_LABELS: Partial<Record<DiscussReadinessBlocker, string>> = {
  businessName: "nama usaha",
  primaryOffer: "produk andalan",
  targetCustomer: "target pelanggan",
  visualPreference: "gaya situs",
  visuals: "foto produk",
  contact: "nomor kontak",
  address: "alamat",
  hours: "jam buka",
  deliveryArea: "area pengiriman",
};

function buildEarlyBuildWarning(
  blockers: readonly DiscussReadinessBlocker[],
): string {
  const labels = blockers
    .map((blocker) => READINESS_LABELS[blocker])
    .filter((label): label is string => Boolean(label))
    .slice(0, 4);
  const suffix = blockers.length > 4 ? " dan beberapa detail lain" : "";
  const joined = labels.length > 1 ? labels.join(", ") : labels[0];
  return `Oke, aku bangun sekarang. Tanpa ${joined}${suffix}, bagian terkait akan dibuat umum atau dikosongkan dulu — nanti gampang ditambah.`;
}
