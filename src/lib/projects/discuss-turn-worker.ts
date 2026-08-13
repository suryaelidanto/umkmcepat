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
import {
  classifyAiError,
  recordAiCall,
  startAiCallTimer,
} from "@/lib/ai-call-record";
import { getDiscussModel } from "@/lib/ai-models";
import { writeAiRequestLog } from "@/lib/ai-request-log";
import { getAiTimeoutMs } from "@/lib/ai-timeouts";
import { primeSettingCache } from "@/lib/app-settings";
import { devLog } from "@/lib/dev-log";
import { getSafeAiErrorLog } from "@/lib/projects/ai-error-log";
import { enqueueAttemptJob } from "@/lib/projects/attempt-queue";
import { parseProjectBrief, type WorkspaceCard } from "@/lib/projects/brief";
import { normalizeWorkspaceTurn } from "@/lib/projects/brief-flow";
import { prepareBuildHandoff } from "@/lib/projects/build-planner";
import { evaluateBuildReadiness } from "@/lib/projects/build-readiness";
import { parseCanonicalBrief } from "@/lib/projects/canonical-brief";
import { ensureQuestionCardRichness } from "@/lib/projects/card-richness";
import {
  buildProjectChatContext,
  dedupeUiMessages,
  getTextFromUIMessage,
  parseProjectChatSummary,
  parseProjectMemoryFacts,
} from "@/lib/projects/chat-memory";
import { evaluateDiscussReadiness } from "@/lib/projects/discuss-readiness";
import {
  buildEarlyBuildWarning,
  demoteToReadinessQuestion,
  READINESS_QUESTION_INTRO,
  requestsImmediateBuild,
} from "@/lib/projects/discuss-readiness-ui";
import { publishPacedTextDeltas } from "@/lib/projects/discuss-text-pacing";
import {
  buildCardSystemPrompt,
  buildOneCallSystemPrompt,
  extractAssistantTextFromToolInput,
  nextAssistantTextDeltaFromPartialToolJson,
  nextPartialWorkspaceCardFromToolJson,
  PRESENT_WORKSPACE_CARD_TOOL_NAME,
  presentWorkspaceCardTool,
} from "@/lib/projects/discuss-tool";
import { finalizeDiscussTurn } from "@/lib/projects/discuss-turn";
import { publishProgress } from "@/lib/projects/discuss-turn-pubsub";
import {
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
  memoryFacts: _memoryFacts,
  messages,
  previousWorkspaceCard,
  summary: _summary,
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

    await primeSettingCache({ force: true });

    publishProgress(turnId, { type: "activity", phase: "responding" });

    const discussStartedAt = Date.now();
    const stopDiscussTimer = startAiCallTimer({ withTtft: true });
    let discussRecorded = false;
    const recordDiscussCall = (opts: {
      status: string;
      errorClass?: string;
      inputTokens?: number;
      outputTokens?: number;
      modelServed?: string | null;
    }) => {
      if (discussRecorded) {
        return;
      }
      discussRecorded = true;
      const discussTiming = stopDiscussTimer();
      recordAiCall({
        inputTokens: opts.inputTokens,
        modelRequested: modelName,
        modelServed: opts.modelServed,
        outputTokens: opts.outputTokens,
        projectId: project.id,
        requestMs: discussTiming.requestMs,
        status: opts.status,
        task: "discuss",
        ttftMs: discussTiming.ttftMs,
        turnId,
        ...(opts.errorClass ? { errorClass: opts.errorClass } : {}),
      });
    };
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
    let discussModelId = modelName;
    const primaryResponsePromise = Promise.resolve(primary.response).catch(
      () => null,
    );

    try {
      for await (const part of primary.stream) {
        // TTFT marked on the first *content* chunk (not stream-open parts)
        // so mocked/abort shapes that never emit content leave it undefined.
        if (part.type === "text-delta" || part.type === "tool-input-delta") {
          stopDiscussTimer.firstChunk();
        }
        if (abortSignal?.aborted) {
          hadError = true;
          recordDiscussCall({
            modelServed: modelName,
            status: "aborted",
          });
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
          const partialCard =
            await nextPartialWorkspaceCardFromToolJson(toolInputJson);
          if (partialCard) {
            publishProgress(turnId, {
              type: "workspace-card-delta",
              workspaceCard: partialCard,
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
      recordDiscussCall({
        errorClass: classifyAiError(error),
        modelServed: servedModel,
        status: "error",
      });
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
    // Primary's own usage: ledger row records its own leg; repair/compaction
    // tokens are added later to total* and primaryOwn*.
    let primaryOwnInputTokens = 0;
    let primaryOwnOutputTokens = 0;
    try {
      const primaryUsage = await primary.usage;
      totalInputTokens = primaryUsage?.inputTokens ?? 0;
      totalOutputTokens = primaryUsage?.outputTokens ?? 0;
      primaryOwnInputTokens = totalInputTokens;
      primaryOwnOutputTokens = totalOutputTokens;
      const primaryResponse = await Promise.resolve(primary.response).catch(
        () => null,
      );
      if (primaryResponse?.modelId) {
        discussModelId = primaryResponse.modelId;
      }
    } catch {
      // usage is best-effort
    }
    const chargeDiscussEnergy = async () => {
      await chargeEnergyForAiUsage({
        userId,
        projectId: project.id,
        modelId: discussModelId,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        reason: "discuss:step",
      });
    };

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
        await chargeDiscussEnergy();
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
      await chargeDiscussEnergy();
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
    if (!hadError) {
      recordDiscussCall({
        inputTokens: primaryOwnInputTokens,
        modelServed: discussModelId,
        outputTokens: primaryOwnOutputTokens,
        status: "ok",
      });
    }
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
        await chargeDiscussEnergy();
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
      primaryOwnInputTokens += repaired?.usage.inputTokens ?? 0;
      primaryOwnOutputTokens += repaired?.usage.outputTokens ?? 0;

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
        await chargeDiscussEnergy();
        publishProgress(turnId, { type: "finish" });
        await finalizeDiscussTurn({ turnId, status: "succeeded" });
        return;
      }

      // All repair attempts failed. Charge once, surface a clean error.
      await chargeDiscussEnergy();
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
    workspaceTurn = {
      ...workspaceTurn,
      workspaceCard: ensureQuestionCardRichness(workspaceTurn.workspaceCard),
    };

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
        primaryOwnInputTokens += repaired.usage.inputTokens;
        primaryOwnOutputTokens += repaired.usage.outputTokens;
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

    if (
      project.generationEngine === "contract-v1" &&
      workspaceTurn.workspaceCard.type === "build_recommendation"
    ) {
      const canonicalBrief = parseCanonicalBrief(
        workspaceTurn.brief,
        project.prompt,
      );
      const readiness = evaluateBuildReadiness(canonicalBrief);
      if (readiness.state === "blocked") {
        workspaceTurn = {
          ...workspaceTurn,
          readyForBuild: false,
          workspaceCard: {
            type: "question",
            question: readiness.nextQuestion,
          },
        };
        chatText = "Masih ada informasi penting yang perlu dilengkapi dulu.";
        devLog("discuss", "contract-readiness-blocked", {
          projectId: project.id,
          turnId,
          blockers: readiness.blockers.map((blocker) => blocker.field),
        });
      }
    }

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
        workspaceTurn = {
          ...workspaceTurn,
          workspaceCard: {
            ...workspaceTurn.workspaceCard,
            handoffId: prepared.handoffId,
            reviewHash: prepared.reviewHash,
            reviewItems: prepared.reviewItems.map((item) => ({
              id: item.id,
              kind: item.kind,
              label: item.label,
              value: item.value,
            })),
          },
        };
      } else {
        workspaceTurn = {
          ...workspaceTurn,
          readyForBuild: false,
          workspaceCard: { type: "none" },
        };
        chatText =
          "Brief belum bisa disiapkan untuk build. Coba kirim jawaban terakhir sekali lagi.";
        devLog("discuss", "handoff-preparation-failed", {
          projectId: project.id,
          turnId,
          reason: prepared.reason,
        });
      }
    }

    const hasCard = workspaceTurn.workspaceCard.type !== "none";

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

    await chargeDiscussEnergy();

    publishProgress(turnId, { type: "finish" });
    await finalizeDiscussTurn({ turnId, status: "succeeded" });
    enqueueAttemptJob({
      kind: "compaction",
      projectId: project.id,
      turnId,
      userId,
    }).catch((error) => {
      console.error("[discuss] compaction enqueue failed", {
        turnId,
        error: error instanceof Error ? error.message : "unknown",
      });
    });
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
