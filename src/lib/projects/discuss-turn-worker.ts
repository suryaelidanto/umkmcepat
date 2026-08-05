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
import { getDiscussHedgeModels, getDiscussModel } from "@/lib/ai-models";
import { writeAiRequestLog } from "@/lib/ai-request-log";
import { getAiTimeoutMs } from "@/lib/ai-timeouts";
import { getSettingSync } from "@/lib/app-settings";
import { devLog } from "@/lib/dev-log";
import { getSafeAiErrorLog } from "@/lib/projects/ai-error-log";
import { parseProjectBrief, type WorkspaceCard } from "@/lib/projects/brief";
import { normalizeWorkspaceTurn } from "@/lib/projects/brief-flow";
import { prepareBuildHandoff } from "@/lib/projects/build-planner";
import { ensureQuestionCardRichness } from "@/lib/projects/card-richness";
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
import {
  addEnergyUsageLegs,
  chargeEnergyForAiUsage,
  type EnergyUsageLeg,
} from "@/lib/user-credits";

type HedgeUsage = {
  inputTokens?: number;
  outputTokens?: number;
};
type HedgeOutcome = {
  errorClass?: string;
  hasCard: boolean;
  stopTimer?: import("@/lib/ai-call-record").AiCallTimer;
  usage: HedgeUsage;
};
type HedgeWinner = {
  fullText: string;
  modelIndex: number;
  modelName: string;
  streamToolCallId: string | null;
  toolInput: unknown;
};

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
    const stopDiscussTimer = startAiCallTimer({ withTtft: true });
    let discussRecorded = false;
    let discussRaceRole: "winner" | "aborted" | undefined;
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
        hedged: hedged ? true : discussRaceRole ? true : undefined,
        inputTokens: opts.inputTokens,
        modelRequested: modelName,
        modelServed: opts.modelServed,
        outputTokens: opts.outputTokens,
        projectId: project.id,
        raceRole: discussRaceRole,
        requestMs: discussTiming.requestMs,
        status: opts.status,
        task: "discuss",
        ttftMs: discussTiming.ttftMs,
        turnId,
        ...(opts.errorClass ? { errorClass: opts.errorClass } : {}),
      });
    };
    // Hedge race: primary + configured hedge legs (stable order) fire in
    // parallel, one AbortController each. Hedge legs consume silently and
    // probe for a parseable card; the first card-valid leg promotes to
    // winner (its full text is then published) and aborts the rest. If the
    // primary's own card lands first, hedges are aborted on the spot.
    const hedgeModelNames = getSettingSync("discuss.hedging", false)
      ? getDiscussHedgeModels().slice(0, 2)
      : [];
    const hedged = hedgeModelNames.length > 0 && !modelOverride;
    const hedgeOutcomes: HedgeOutcome[] = [];
    const hedgePromises: Promise<void>[] = [];
    // Boxed promotion: CFA narrows `let` bindings across async closures to
    // `never` at use sites; a property write stays outside CFA's reach.
    const hedgeWinner: { current: HedgeWinner | null } = { current: null };
    const hedgeControllers = hedgeModelNames.map(() => new AbortController());
    const primaryController = hedged ? new AbortController() : null;
    if (hedged) {
      hedgeModelNames.forEach((hedgeModelName, index) => {
        const outcome: HedgeOutcome = {
          hasCard: false,
          usage: {} as HedgeUsage,
        };
        hedgeOutcomes.push(outcome);
        const hedgeModel = modelOverride ?? getAiModel(hedgeModelName);
        const hedgeStream = streamText({
          model: hedgeModel,
          abortSignal: hedgeControllers[index].signal,
          system: systemPrompt,
          messages: modelMessages,
          tools: {
            [PRESENT_WORKSPACE_CARD_TOOL_NAME]: presentWorkspaceCardTool,
          },
          toolChoice: {
            type: "tool",
            toolName: PRESENT_WORKSPACE_CARD_TOOL_NAME,
          },
          temperature: 0.25,
          maxOutputTokens: 1024,
          timeout: getAiTimeoutMs("discussOneCall"),
          ...getNoReasoningCallOptions(),
          telemetry: getAiTelemetry("project-guided-discuss-one-call", {
            hedged: true,
            mode: "discuss-one-call",
            model: hedgeModelName,
            projectId: project.id,
            route: "api.projects.preview",
            userId,
          }),
          onError({ error }) {
            outcome.errorClass = classifyAiError(error);
          },
        });
        const stopHedgeTimer = startAiCallTimer({ withTtft: true });
        hedgePromises.push(
          (async () => {
            let fullText = "";
            let toolInput: unknown = null;
            let streamToolCallId: string | null = null;
            outcome.stopTimer = stopHedgeTimer;
            try {
              for await (const part of hedgeStream.stream) {
                if (
                  part.type === "text-delta" ||
                  part.type === "tool-input-delta"
                ) {
                  stopHedgeTimer.firstChunk();
                }
                if (
                  hedgeControllers[index].signal.aborted ||
                  hedgeWinner.current
                ) {
                  break;
                }
                if (part.type === "text-delta") {
                  const delta =
                    "text" in part && typeof part.text === "string"
                      ? part.text
                      : "delta" in part && typeof part.delta === "string"
                        ? part.delta
                        : "";
                  fullText += delta;
                  continue;
                }
                if (part.type === "tool-input-start") {
                  if ("id" in part && typeof part.id === "string") {
                    streamToolCallId = part.id;
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
                  const probe = normalizeWorkspaceTurn(
                    toolInput,
                    effectiveBrief,
                    handoffNormalizeOptions,
                  );
                  if (
                    probe.workspaceCard.type !== "none" &&
                    !hedgeWinner.current &&
                    !hedgeControllers[index].signal.aborted
                  ) {
                    outcome.hasCard = true;
                    if (!fullText.trim()) {
                      fullText = extractAssistantTextFromToolInput(toolInput);
                    }
                    hedgeWinner.current = {
                      fullText,
                      modelIndex: index,
                      modelName: hedgeModelName,
                      toolInput,
                      streamToolCallId,
                    };
                    hedgeControllers.forEach((controller, i) => {
                      if (i !== index) {
                        controller.abort();
                      }
                    });
                    break;
                  }
                }
              }
            } catch (error) {
              // Aborted legs land here; make sure they don't surface as
              // provider errors when the abort was deliberate.
              if (!hedgeControllers[index].signal.aborted) {
                outcome.errorClass = classifyAiError(error);
              }
            }
            const usage = await Promise.resolve(hedgeStream.usage).catch(
              () => undefined,
            );
            outcome.usage = {
              inputTokens: usage?.inputTokens ?? 0,
              outputTokens: usage?.outputTokens ?? 0,
            };
          })(),
        );
      });
    }
    const abortAllHedges = () => {
      for (const controller of hedgeControllers) {
        controller.abort();
      }
    };
    const settleHedgeRows = async (
      winnerMarker:
        | { kind: "primary" }
        | { kind: "hedge"; index: number }
        | { kind: "none" },
    ) => {
      // Primary's row rides the shared recordDiscussCall latch; mark it here.
      discussRaceRole =
        winnerMarker.kind === "primary"
          ? "winner"
          : winnerMarker.kind === "hedge"
            ? "aborted"
            : undefined;
      hedgeModelNames.forEach((hedgeModelName, index) => {
        const outcome = hedgeOutcomes[index];
        const winner =
          winnerMarker.kind === "hedge" && winnerMarker.index === index;
        const hedgeTiming = outcome.stopTimer?.();
        recordAiCall({
          hedged: true,
          inputTokens: outcome.usage.inputTokens ?? 0,
          modelRequested: hedgeModelName,
          modelServed: hedgeModelName,
          outputTokens: outcome.usage.outputTokens ?? 0,
          projectId: project.id,
          raceRole: winner ? "winner" : "aborted",
          requestMs: hedgeTiming?.requestMs ?? stopDiscussTimer().requestMs,
          status: outcome.errorClass ? "error" : winner ? "ok" : "aborted",
          task: "discuss",
          ttftMs: hedgeTiming?.ttftMs,
          turnId,
          ...(outcome.errorClass ? { errorClass: outcome.errorClass } : {}),
        });
      });
    };
    // Settle hedge-leg promises (abort + per-call timeout keep this bounded)
    // so per-racer outcomes stay read-only from here to the debit.
    const settleHedgeLegs = async () => {
      if (hedgePromises.length > 0) {
        await Promise.allSettled(hedgePromises);
      }
    };
    const primary = streamText({
      model,
      ...(primaryController ? { abortSignal: primaryController.signal } : {}),
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
    // Race gate: while hedged, deltas sit in racePendingText until a winner
    // is picked (buffer + publish whole) or all legs fail (text fallback
    // picks the last-completed leg's text).
    const racePendingText: string[] = [];
    const adoptHedgeWinner = () => {
      const winner = hedgeWinner.current;
      if (!winner) {
        return false;
      }
      fullText = winner.fullText;
      toolInput = winner.toolInput;
      streamToolCallId = winner.streamToolCallId;
      discussModelId = winner.modelName;
      toolInputJson = "";
      streamedToolAssistantText = "";
      return true;
    };
    const primaryResponsePromise = Promise.resolve(primary.response).catch(
      () => null,
    );

    let raceStreamingLegIndex: number | null = hedged ? null : 0;
    const bufferPiece = (piece: string) => {
      if (raceStreamingLegIndex !== null) {
        publishProgress(turnId, {
          type: "text-delta",
          id: textPartId,
          delta: piece,
        });
        return;
      }
      racePendingText.push(piece);
    };
    const flushRaceBuffer = () => {
      for (const piece of racePendingText) {
        publishProgress(turnId, {
          type: "text-delta",
          id: textPartId,
          delta: piece,
        });
      }
      racePendingText.length = 0;
      raceStreamingLegIndex = raceStreamingLegIndex ?? 0;
    };
    try {
      for await (const part of primary.stream) {
        // Hedge leg promoted while we were reading primary: adopt its state
        // and stop spending tokens on the losing streams. Losers never paint
        // even partial text: the winner's buffered text is published whole.
        if (hedged && hedgeWinner.current) {
          if (adoptHedgeWinner()) {
            primaryController?.abort();
            if (fullText) {
              await publishPacedTextDeltas({
                text: fullText,
                abortSignal,
                publish: (piece) => {
                  bufferPiece(piece);
                },
              });
            }
            break;
          }
        }
        // TTFT marked on the first *content* chunk (not stream-open parts)
        // so mocked/abort shapes that never emit content leave it undefined.
        if (part.type === "text-delta" || part.type === "tool-input-delta") {
          stopDiscussTimer.firstChunk();
        }
        if (abortSignal?.aborted) {
          hadError = true;
          abortAllHedges();
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
              bufferPiece(piece);
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
          // Best-effort partial tool-JSON streaming, winner stream only,
          // gated by the admin setting (default on).
          const partialToolStreamingOn = getSettingSync(
            "discuss.partial_tool_streaming",
            true,
          );
          if (!partialToolStreamingOn) {
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
                bufferPiece(piece);
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
          if (hedged) {
            // Primary reached a terminal outcome: winner selection is done
            // (winner = first finisher), so hedge legs are dead weight now —
            // abort them whether this card is valid (primary won) or not
            // (repair applies to the primary's state either way).
            abortAllHedges();
            const probe = normalizeWorkspaceTurn(
              toolInput,
              effectiveBrief,
              handoffNormalizeOptions,
            );
            if (probe.workspaceCard.type !== "none") {
              flushRaceBuffer();
            }
          }
        }
      }
    } catch (error) {
      // Primary stream threw: the race is over either way. Degrade silently
      // into a promoted hedge winner when one already landed, else surface.
      abortAllHedges();
      if (hedged && adoptHedgeWinner()) {
        toolInputJson = "";
      } else {
        hadError = true;
        const servedModel =
          (await primaryResponsePromise)?.modelId ?? modelName;
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
        await settleHedgeLegs();
        await writeAiRequestLog({
          event: "discuss:stream_error",
          model: servedModel,
          mode: "one_call_tools",
          projectId: project.id,
          error: safeError,
        });
      }
    }
    // Winner picked or crash handled: no more outcome churn from hedge legs.
    await settleHedgeLegs();

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
            bufferPiece(piece);
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
            bufferPiece(piece);
          },
        });
      }
    }
    // Hedge settles here: flush any buffer from a winner, drop loser's text.
    if (hedged) {
      if (hedgeWinner.current || !hadError) {
        flushRaceBuffer();
      } else {
        racePendingText.length = 0;
      }
    }
    let chatText = fullText.trim();
    publishProgress(turnId, { type: "text-end", id: textPartId });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    // Primary's own usage, captured pre-hijack: total* below gets hedge legs
    // summed in for the single UserCredit debit (1:1 transparency), while the
    // primary's own ledger row must record ONLY its leg — per-racer hedge
    // rows in settleHedgeRows already carry hedge usage, so reusing the sum
    // here would double-count (AiCallRecord sum != UserCredit debit).
    let primaryOwnInputTokens = 0;
    let primaryOwnOutputTokens = 0;
    // Immutable snapshot of the primary's OWN leg (pre-hijack, pre-repair).
    // Repair/compaction tokens are added later to primaryOwn* and total*, but
    // the per-leg fair debit must price the primary leg at the primary's own
    // model, not the winner's.
    let primaryLegInputTokens = 0;
    let primaryLegOutputTokens = 0;
    try {
      const primaryUsage = await primary.usage;
      totalInputTokens = primaryUsage?.inputTokens ?? 0;
      totalOutputTokens = primaryUsage?.outputTokens ?? 0;
      primaryOwnInputTokens = totalInputTokens;
      primaryOwnOutputTokens = totalOutputTokens;
      primaryLegInputTokens = totalInputTokens;
      primaryLegOutputTokens = totalOutputTokens;
      const primaryResponse = await Promise.resolve(primary.response).catch(
        () => null,
      );
      if (primaryResponse?.modelId) {
        discussModelId =
          hedgeWinner.current?.modelName ?? primaryResponse.modelId;
      }
    } catch {
      // usage is best-effort
    }
    // Sum hedge-leg usage into the turn debit (1:1 transparency).
    let hedgeLegInputTokens = 0;
    let hedgeLegOutputTokens = 0;
    for (const outcome of hedgeOutcomes) {
      hedgeLegInputTokens += outcome.usage.inputTokens ?? 0;
      hedgeLegOutputTokens += outcome.usage.outputTokens ?? 0;
      totalInputTokens += outcome.usage.inputTokens ?? 0;
      totalOutputTokens += outcome.usage.outputTokens ?? 0;
    }
    // Fair per-leg debit: each racer is priced at its OWN model. Repair and
    // compaction tokens (added later to total*/primaryOwn*) are extra on top
    // of the primary leg; those are priced at the served (winner) model since
    // they share its run. Falls back to single-model chargeEnergyForAiUsage
    // when not hedged.
    const chargeDiscussEnergy = async () => {
      if (!hedged) {
        await chargeEnergyForAiUsage({
          userId,
          modelId: discussModelId,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          reason: "discuss:step",
        });
        return;
      }
      const legs: EnergyUsageLeg[] = [
        {
          modelId: modelName,
          inputTokens: primaryLegInputTokens,
          outputTokens: primaryLegOutputTokens,
        },
      ];
      hedgeModelNames.forEach((hedgeModelName, index) => {
        const outcome = hedgeOutcomes[index];
        legs.push({
          modelId: hedgeModelName,
          inputTokens: outcome.usage.inputTokens ?? 0,
          outputTokens: outcome.usage.outputTokens ?? 0,
        });
      });
      // Extra (repair/compaction) tokens, priced at the served winner model.
      const extraInput =
        totalInputTokens - primaryLegInputTokens - hedgeLegInputTokens;
      const extraOutput =
        totalOutputTokens - primaryLegOutputTokens - hedgeLegOutputTokens;
      if (extraInput > 0 || extraOutput > 0) {
        legs.push({
          modelId: discussModelId,
          inputTokens: Math.max(0, extraInput),
          outputTokens: Math.max(0, extraOutput),
        });
      }
      await addEnergyUsageLegs(userId, legs, "discuss:step", {
        projectId: project.id,
      });
    };

    // Hedged all-fail (stream threw, no card anywhere): mark hedge legs and
    // settle the race rows now, since hadError branches return early.
    if (hedged && hadError && !hedgeWinner.current) {
      abortAllHedges();
      await settleHedgeLegs();
      for (const outcome of hedgeOutcomes) {
        if (!outcome.hasCard && !outcome.errorClass) {
          outcome.errorClass = "invalid-card";
        }
      }
      await settleHedgeRows({ kind: "none" });
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
    // Primary's winner row waits for raceRole set during hedge settlement
    // (hedged only): unhedged keeps its existing early latch.
    if (!hadError && !hedged) {
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

    // Hedged turn: all streams consumed by now. If nobody produced a valid
    // card, mark unblowned legs as invalid-card so the ledger explains why
    // the race settles text-only; repair then runs on the winner's model.
    const primaryCardValid = workspaceTurn.workspaceCard.type !== "none";
    if (hedged && !hedgeWinner.current) {
      abortAllHedges();
      // Bounded drain (abort + per-call timeout): per-racer tokens must land
      // before the user-facing debit or ledger rows would race each other.
      await settleHedgeLegs();
      if (!primaryCardValid) {
        for (const outcome of hedgeOutcomes) {
          if (!outcome.hasCard && !outcome.errorClass) {
            outcome.errorClass = "invalid-card";
          }
        }
      }
      // Primary's row hasn't been latched yet — mark it error/invalid-card
      // too when the shared ledger uses ok later.
      if (!primaryCardValid && !hadError) {
        recordDiscussCall({
          errorClass: "invalid-card",
          inputTokens: primaryOwnInputTokens,
          modelServed: discussModelId,
          outputTokens: primaryOwnOutputTokens,
          status: "error",
        });
      }
      await settleHedgeRows(
        primaryCardValid ? { kind: "primary" } : { kind: "none" },
      );
      if (!hadError && !discussRecorded) {
        recordDiscussCall({
          errorClass: primaryCardValid ? undefined : "invalid-card",
          inputTokens: primaryOwnInputTokens,
          modelServed: discussModelId,
          outputTokens: primaryOwnOutputTokens,
          status: primaryCardValid ? "ok" : "error",
        });
      }
    }
    if (hedged && hedgeWinner.current) {
      const winner = hedgeWinner.current;
      await settleHedgeRows({ index: winner.modelIndex, kind: "hedge" });
      if (!hadError && !discussRecorded) {
        recordDiscussCall({
          inputTokens: primaryOwnInputTokens,
          modelServed: discussModelId,
          outputTokens: primaryOwnOutputTokens,
          status: "ok",
        });
      }
    }

    // Post-build policy: none is an allowed card. Do not treat it as a
    // missing tool or spend energy on interview-card repair.
    let primaryToolFailed =
      workspaceTurn.workspaceCard.type === "none" && !hasBuiltSite;
    let repairsUsed = 0;

    let repairMs = 0;
    if (primaryToolFailed) {
      const repairStartedAt = Date.now();
      const repairWinner = hedgeWinner.current;
      const repaired = await repairDiscussCardWithTool({
        brief: effectiveBrief,
        cardSystemPrompt,
        chatText,
        hasBuiltSite,
        lastUserText: lastUserTextValue,
        previousWorkspaceCard,
        model: repairWinner ? getAiModel(repairWinner.modelName) : model,
        modelMessages,
        modelName: repairWinner?.modelName ?? modelName,
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
      correlation: { projectId: project.id, turnId },
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

    await chargeDiscussEnergy();

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
