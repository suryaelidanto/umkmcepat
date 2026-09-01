// Detached discuss-turn worker. Runs the one-call AI generation + persists the

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
} from "@/lib/ai/ai";
import {
  classifyAiError,
  recordAiCall,
  startAiCallTimer,
} from "@/lib/ai/ai-call-record";
import { getDiscussModel, getVisionModel } from "@/lib/ai/ai-models";
import {
  chargeModerationEnergy,
  moderateProjectRequest,
} from "@/lib/ai/ai-moderation";
import { writeAiRequestLog } from "@/lib/ai/ai-request-log";
import { getAiTimeoutMs } from "@/lib/ai/ai-timeouts";
import { getSettingSync } from "@/lib/config/app-settings";
import { devLog } from "@/lib/dev-log";
import {
  chargeEnergyForAiUsage,
  checkEnergy,
  getEnergyConfig,
} from "@/lib/payment/user-credits";
import { getSafeAiErrorLog } from "@/lib/projects/ai-error-log";
import { enqueueAttemptJob } from "@/lib/projects/attempt-queue";
import { parseProjectBrief, type WorkspaceCard } from "@/lib/projects/brief";
import { normalizeWorkspaceTurn } from "@/lib/projects/brief-flow";
import {
  evaluateTieredBriefReadiness,
  getNextTieredEnrichmentCard,
  isExplicitBuildRequest,
} from "@/lib/projects/brief-tiered-readiness";
import { loadActiveHandoff } from "@/lib/projects/build-handoffs";
import { prepareBuildHandoff } from "@/lib/projects/build-planner";
import {
  createReadinessQuestion,
  evaluateBuildReadiness,
} from "@/lib/projects/build-readiness";
import { describeBuildRecommendation } from "@/lib/projects/build-recommendation-summary";
import {
  createDiscussionContextSnapshot,
  parseCanonicalBrief,
} from "@/lib/projects/canonical-brief";
import { hashCanonicalBriefContent } from "@/lib/projects/canonical-brief-hash";
import { ensureQuestionCardRichness } from "@/lib/projects/card-richness";
import {
  buildCompactDiscussionContext,
  buildProjectChatContext,
  dedupeUiMessages,
  dedupeUiMessagesForPersistence,
  getTextFromUIMessage,
  parseProjectChatSummary,
  parseProjectMemoryFacts,
} from "@/lib/projects/chat-memory";
import {
  attachPersistedProjectAssets,
  prepareDiscussTurnAssets,
  rewriteTempImageParts,
} from "@/lib/projects/discuss-asset-phase";
import {
  alignAssistantTextWithCard,
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
  persistProjectChatTurn as persistProjectChatTurnRaw,
  repairDiscussCardWithTool,
  repairToolCallInTurn,
  scrubBriefForStorage,
} from "@/lib/projects/discuss-turn-shared";
import { evaluateAdaptiveDiscussionReadiness } from "@/lib/projects/discussion-domains";
import { isImageUploadBoilerplateText } from "@/lib/projects/image-upload-copy";
import { inlineChatAssetFileParts } from "@/lib/projects/inline-chat-asset-file-parts";
import {
  filterOwnedBusinessAssetIds,
  listProjectBusinessImagesForDiscussion,
} from "@/lib/projects/project-assets";
import { stripTransportDiagnosticMessages } from "@/lib/projects/strip-transport-diagnostic-messages";
import { TextDeltaCoalescer } from "@/lib/projects/text-delta-coalescer";
import { unslopUserFacingText } from "@/lib/projects/unslop-policy";
import { deleteTempImage } from "@/lib/storage/uploads/temp-image-storage";

async function cleanupPromotedTempImages(
  userId: string,
  assetIds: string[],
): Promise<void> {
  await Promise.all(
    assetIds.map((assetId) =>
      deleteTempImage(userId, assetId).catch(() => undefined),
    ),
  );
}

function addBusinessImages(
  brief: ReturnType<typeof parseProjectBrief>,
  assetIds: string[],
): ReturnType<typeof parseProjectBrief> {
  const existingIds = new Set(
    (brief.businessImages ?? []).map((image) => image.id),
  );
  const newImages = assetIds
    .filter((assetId) => !existingIds.has(assetId))
    .map((id) => ({ id, purpose: "business-image" as const }));
  return newImages.length > 0
    ? {
        ...brief,
        businessImages: [...(brief.businessImages ?? []), ...newImages],
      }
    : brief;
}

export async function runDiscussTurn({
  turnId,
  project,
  chatContext,
  effectiveBrief,
  memoryFacts: _memoryFacts,
  messages: incomingMessages,
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
  modelOverride?: LanguageModel;
  abortSignal?: AbortSignal;
}): Promise<void> {
  // Downstream steps read the asset phase's rewritten message list.
  let messages = incomingMessages;
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

    const energy = await checkEnergy(userId, getEnergyConfig().minDiscuss);
    if (!energy.allowed) {
      const errorMessage =
        "Energi akun kamu sudah habis. Yuk isi ulang energi dulu untuk melanjutkan obrolan!";
      await finalizeDiscussTurn({
        turnId,
        status: "failed",
        errorMessage,
      });
      publishProgress(turnId, {
        type: "error",
        errorText: errorMessage,
      });
      return;
    }
    // Moderation + asset persistence run here so the sent message persists first.
    publishProgress(turnId, { type: "activity", phase: "moderating" });

    const persistedAssets = await listProjectBusinessImagesForDiscussion(
      project.id,
      userId,
    );
    messages = attachPersistedProjectAssets(messages, persistedAssets);

    const assetPhase = await prepareDiscussTurnAssets({
      messages,
      projectId: project.id,
      turnId,
      userId,
    });
    if (assetPhase.status !== "ok") {
      let rewritesPersisted = false;
      if (assetPhase.messages && assetPhase.urlRewrites?.size) {
        const partialBrief = addBusinessImages(
          effectiveBrief,
          assetPhase.assetIds ?? [],
        );
        try {
          await persistProjectChatTurnRaw({
            brief: scrubBriefForStorage(
              partialBrief,
              partialBrief.readyForBuild,
              project.id,
            ),
            discussionContext: {
              memoryFacts: _memoryFacts,
              summary: _summary,
            },
            messages: assetPhase.messages,
            projectId: project.id,
            title: project.title,
            userId,
            workspaceCard: previousWorkspaceCard ?? null,
          });
          rewritesPersisted = true;
        } catch {
          // Keep the source upload while the failed turn remains retryable.
        }
      }
      if (rewritesPersisted && assetPhase.tempAssetIds) {
        await cleanupPromotedTempImages(userId, assetPhase.tempAssetIds);
      }
      await finalizeDiscussTurn({
        turnId,
        status: "failed",
        errorMessage: assetPhase.message,
      });
      publishProgress(turnId, {
        type: "error",
        errorText: assetPhase.message,
      });
      return;
    }
    messages = assetPhase.messages;
    effectiveBrief = addBusinessImages(effectiveBrief, assetPhase.assetIds);
    if (assetPhase.urlRewrites.size > 0) {
      let rewritesPersisted = false;
      try {
        await persistProjectChatTurnRaw({
          brief: scrubBriefForStorage(
            effectiveBrief,
            effectiveBrief.readyForBuild,
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
          workspaceCard: previousWorkspaceCard ?? null,
        });
        rewritesPersisted = true;
      } catch {
        // Keep the source upload while the rewritten message is not durable.
      }
      if (rewritesPersisted) {
        await cleanupPromotedTempImages(userId, assetPhase.tempAssetIds);
      }
    }
    const effectiveChatContext: ReturnType<typeof buildProjectChatContext> = {
      ...chatContext,
      messages: rewriteTempImageParts(messages, assetPhase.urlRewrites),
    };

    // Extract any user-attached media assets from messages and sync into brief
    const submittedAssetIds: string[] = [];
    for (const msg of messages) {
      if (msg.role === "user" && Array.isArray(msg.parts)) {
        for (const part of msg.parts) {
          if (
            part.type === "file" &&
            typeof part.url === "string" &&
            (part.url.startsWith("/media/") ||
              part.url.startsWith("/api/media/"))
          ) {
            const assetId = part.url.startsWith("/api/media/")
              ? part.url.slice("/api/media/".length)
              : part.url.slice("/media/".length);
            if (assetId && !submittedAssetIds.includes(assetId)) {
              submittedAssetIds.push(assetId);
            }
          }
        }
      }
    }

    const uploadedAssetIds = await filterOwnedBusinessAssetIds(
      submittedAssetIds,
      project.id,
      userId,
    );

    if (uploadedAssetIds.length > 0) {
      const existing = (effectiveBrief.businessImages ?? []).map(
        (img) => img.id,
      );
      const newImages = uploadedAssetIds
        .filter((id) => !existing.includes(id))
        .map((id) => ({ id, purpose: "business-image" as const }));
      if (newImages.length > 0) {
        effectiveBrief = {
          ...effectiveBrief,
          businessImages: [
            ...(effectiveBrief.businessImages ?? []),
            ...newImages,
          ],
        };
      }
    }

    const hasAttachedImages = uploadedAssetIds.length > 0;
    const modelName = hasAttachedImages ? getVisionModel() : getDiscussModel();
    const model = modelOverride ?? getAiModel(modelName);
    const lastUserText = [...messages]
      .reverse()
      .find((message) => message.role === "user");
    const lastUserTextValue = lastUserText
      ? getTextFromUIMessage(lastUserText)
      : undefined;
    const hasBuiltSite = project.status === "ready";
    const activeHandoff = hasBuiltSite
      ? await loadActiveHandoff(project.id).catch(() => null)
      : null;
    const currentBriefHash = hashCanonicalBriefContent(
      parseCanonicalBrief(effectiveBrief, project.prompt),
    );
    const hasPendingChanges =
      hasBuiltSite &&
      Boolean(activeHandoff?.briefHash) &&
      activeHandoff?.briefHash !== currentBriefHash;

    const handoffNormalizeOptions = {
      hasBuiltSite,
      lastUserText: lastUserTextValue,
      ownerTexts: messages
        .filter((message) => message.role === "user")
        .map(getTextFromUIMessage),
      previousWorkspaceCard,
      sourceTurnId: turnId,
    };
    const chatContextWithInlineAssets = {
      ...chatContext,
      messages: await inlineChatAssetFileParts(effectiveChatContext.messages, {
        projectId: project.id,
        userId,
      }),
    };
    const discussionContext = createDiscussionContextSnapshot({
      messages,
      summary: _summary,
      memoryFacts: _memoryFacts,
    });
    const persistProjectChatTurn = (
      input: Parameters<typeof persistProjectChatTurnRaw>[0],
    ) => {
      const brief = parseProjectBrief(
        input.brief === undefined ? effectiveBrief : input.brief,
        project.prompt,
      );
      return persistProjectChatTurnRaw({
        ...input,
        brief: scrubBriefForStorage(brief, brief.readyForBuild, project.id),
        discussionContext: {
          summary: _summary,
          memoryFacts: _memoryFacts,
        },
        title: input.title ?? project.title,
      });
    };
    const systemPrompt = buildOneCallSystemPrompt({
      brief: effectiveBrief,
      context: `${effectiveChatContext.systemContext}\n\nFact ledger:\n${JSON.stringify(effectiveBrief.factLedger)}\n\nProject discussion context:\n${buildCompactDiscussionContext(
        {
          factLedger: effectiveBrief.factLedger,
          memoryFacts: _memoryFacts,
          messages,
          summary: _summary,
        },
      )}`,
      hasBuiltSite,
      hasPendingChanges,
    });
    const cardSystemPrompt = buildCardSystemPrompt();
    const modelMessages = await convertToModelMessages(
      dedupeUiMessages(chatContextWithInlineAssets.messages),
    );

    // Fail closed: blocked or unverifiable text never reaches the model.
    if (lastUserTextValue && !isImageUploadBoilerplateText(lastUserTextValue)) {
      let moderation: Awaited<
        ReturnType<typeof moderateProjectRequest>
      > | null = null;
      try {
        moderation = await moderateProjectRequest(
          lastUserTextValue,
          [],
          undefined,
          { projectId: project.id, turnId },
        );
      } catch (error) {
        console.error("[discuss] text moderation unavailable", {
          projectId: project.id,
          turnId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if (!moderation) {
        const errorMessage =
          "Pemeriksaan keamanan belum berhasil. Coba lagi sebentar.";
        await finalizeDiscussTurn({
          turnId,
          status: "failed",
          errorMessage,
        });
        publishProgress(turnId, { type: "error", errorText: errorMessage });
        return;
      }
      await chargeModerationEnergy(userId, moderation, {
        projectId: project.id,
      });
      if (!moderation.allowed) {
        await finalizeDiscussTurn({
          turnId,
          status: "failed",
          errorMessage: moderation.message,
        });
        publishProgress(turnId, {
          type: "error",
          errorText: moderation.message,
        });
        return;
      }
    }

    await writeAiRequestLog({
      event: "discuss:start",
      model: modelName,
      mode: "one_call_tools",
      projectId: project.id,
      messageCount: messages.length,
      briefConfidence: effectiveBrief.confidence,
    });

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
          turnId,
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

    publishProgress(turnId, {
      type: "start",
      messageId,
      messageMetadata: { id: messageId },
    });
    publishProgress(turnId, { type: "text-start", id: textPartId });

    const textCoalescer = new TextDeltaCoalescer((coalescedDelta) => {
      publishProgress(turnId, {
        type: "text-delta",
        id: textPartId,
        delta: coalescedDelta,
      });
    });

    let fullText = "";
    let hadError = false;
    let toolInput: unknown = null;
    let streamToolCallId: string | null = null;
    let toolInputJson = "";
    let streamedToolAssistantText = "";
    let lastCardParseTime = 0;
    let discussModelId = modelName;
    const primaryResponsePromise = Promise.resolve(primary.response).catch(
      () => null,
    );

    try {
      for await (const part of primary.stream) {
        // TTFT marked on the first *content* chunk (not stream-open parts)
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
          textCoalescer.push(delta);
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
            textCoalescer.push(next.delta);
          }

          if (Date.now() - lastCardParseTime >= 60) {
            lastCardParseTime = Date.now();
            const partialCard =
              await nextPartialWorkspaceCardFromToolJson(toolInputJson);
            if (partialCard) {
              publishProgress(turnId, {
                type: "workspace-card-delta",
                workspaceCard: partialCard,
              });
            }
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
    if (!fullText.trim()) {
      const fromTool = extractAssistantTextFromToolInput(toolInput);
      if (fromTool) {
        fullText = fromTool;
        publishProgress(turnId, {
          type: "text-delta",
          id: textPartId,
          delta: fromTool,
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
        textCoalescer.push(tail);
      }
    }
    textCoalescer.flush();
    let chatText = unslopUserFacingText(fullText.trim());
    publishProgress(turnId, { type: "text-end", id: textPartId });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    // Primary's own usage: ledger row records its own leg; repair/compaction
    let primaryOwnInputTokens = 0;
    let primaryOwnOutputTokens = 0;
    let repairedWorkspaceTurn: Awaited<
      ReturnType<typeof repairDiscussCardWithTool>
    > = null;
    let repairMs = 0;
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
          dedupeUiMessagesForPersistence([...messages, assistantMessage]),
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
    if (!chatText && hasBuiltSite) {
      chatText = unslopUserFacingText("Siap, perubahannya sudah aku catat.");
    } else if (!chatText) {
      const repairStartedAt = Date.now();
      const repaired = await repairDiscussCardWithTool({
        brief: effectiveBrief,
        cardSystemPrompt,
        chatText: "",
        hasBuiltSite,
        lastUserText: lastUserTextValue,
        ownerTexts: handoffNormalizeOptions.ownerTexts,
        previousWorkspaceCard,
        sourceTurnId: turnId,
        model,
        modelMessages,
        modelName,
        projectId: project.id,
        userId,
      });
      repairMs = Date.now() - repairStartedAt;
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
        repairedWorkspaceTurn = repaired;
        chatText = repaired.assistantText;
      } else {
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
    }

    let workspaceTurn =
      repairedWorkspaceTurn ??
      normalizeWorkspaceTurn(
        toolInput,
        effectiveBrief,
        handoffNormalizeOptions,
      );
    workspaceTurn = {
      ...workspaceTurn,
      workspaceCard: ensureQuestionCardRichness(workspaceTurn.workspaceCard),
    };

    // Post-build policy: none is an allowed card. Do not treat it as a
    let primaryToolFailed = repairedWorkspaceTurn
      ? true
      : workspaceTurn.workspaceCard.type === "none" && !hasBuiltSite;
    let repairsUsed = repairedWorkspaceTurn?.repairsUsed ?? 0;

    if (primaryToolFailed) {
      const repairStartedAt = Date.now();
      const repaired = await repairDiscussCardWithTool({
        brief: effectiveBrief,
        cardSystemPrompt,
        chatText,
        hasBuiltSite,
        lastUserText: lastUserTextValue,
        ownerTexts: handoffNormalizeOptions.ownerTexts,
        previousWorkspaceCard,
        sourceTurnId: turnId,
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

    const wasBuildRecommendationAttempt =
      (toolInput as { workspaceCard?: { type?: string } } | null)?.workspaceCard
        ?.type === "build_recommendation" ||
      (toolInput as { workspaceCard?: { type?: string } } | null)?.workspaceCard
        ?.type === "brief_review";

    if (
      project.generationEngine === "contract" ||
      project.generationEngine === "contract-v1"
    ) {
      const canonicalBrief = parseCanonicalBrief(
        workspaceTurn.brief,
        project.prompt,
      );
      const readiness = evaluateBuildReadiness(canonicalBrief);
      const adaptiveReadiness =
        evaluateAdaptiveDiscussionReadiness(canonicalBrief);
      const tieredReadiness = evaluateTieredBriefReadiness(canonicalBrief);
      const isExplicitBuild = isExplicitBuildRequest(lastUserTextValue ?? "");
      const minimumBlocker = readiness.blockers.find((blocker) =>
        ["business.name", "offers", "primaryOffer", "primaryAction"].includes(
          blocker.field,
        ),
      );
      const minimumQuestion = minimumBlocker
        ? createReadinessQuestion(minimumBlocker)
        : readiness.state === "blocked"
          ? readiness.nextQuestion
          : createReadinessQuestion({
              field: "business.name",
              reason: "business name missing",
            });
      const photoUploadsActive = (() => {
        try {
          return getSettingSync(
            "feature.composer_uploads_enabled",
            true,
          ) as boolean;
        } catch {
          return true;
        }
      })();

      if (!adaptiveReadiness.minimumSatisfied && !isExplicitBuild) {
        if (workspaceTurn.workspaceCard.type === "build_recommendation") {
          workspaceTurn = {
            ...workspaceTurn,
            readyForBuild: false,
            workspaceCard: {
              type: "question",
              question: minimumQuestion,
            },
          };
          chatText = "Masih ada informasi penting yang perlu dilengkapi dulu.";
          devLog("discuss", "contract-readiness-blocked", {
            projectId: project.id,
            turnId,
            blockers: adaptiveReadiness.missingMinimum,
          });
        } else if (
          wasBuildRecommendationAttempt &&
          workspaceTurn.workspaceCard.type === "question"
        ) {
          const isAlreadyReadinessQuestion =
            workspaceTurn.workspaceCard.question.id === minimumQuestion.id;
          if (isAlreadyReadinessQuestion) {
            chatText =
              "Masih ada informasi penting yang perlu dilengkapi dulu.";
            devLog("discuss", "contract-readiness-blocked", {
              projectId: project.id,
              turnId,
              blockers: adaptiveReadiness.missingMinimum,
            });
          }
        }
      } else if (
        workspaceTurn.workspaceCard.type === "build_recommendation" &&
        !isExplicitBuild &&
        (!adaptiveReadiness.commercialSatisfied ||
          !tieredReadiness.tier2.satisfied)
      ) {
        const nextEnrichment = getNextTieredEnrichmentCard(canonicalBrief, {
          uploadsEnabled: photoUploadsActive,
        });
        if (nextEnrichment) {
          workspaceTurn = {
            ...workspaceTurn,
            readyForBuild: false,
            workspaceCard: nextEnrichment,
          };
          if (nextEnrichment.type === "question") {
            chatText = nextEnrichment.question.question;
          } else if (nextEnrichment.type === "image_upload") {
            chatText = nextEnrichment.imageUpload.question;
          }
          devLog("discuss", "contract-tiered-enrichment-intercepted", {
            projectId: project.id,
            turnId,
            missingTier2: tieredReadiness.tier2.missing,
          });
        }
      }
    }

    if (
      workspaceTurn.workspaceCard.type === "build_recommendation" &&
      workspaceTurn.readyForBuild
    ) {
      const prepared = await prepareBuildHandoff({
        projectId: project.id,
        userId,
        engine: "contract",
        brief: workspaceTurn.brief,
        discussionContext,
        turnId,
      });
      if (prepared.state === "ready") {
        const base = workspaceTurn.workspaceCard as {
          type: "build_recommendation";
          title: string;
          summary: string[];
          postBuildUpdate?: boolean;
        };
        workspaceTurn = {
          ...workspaceTurn,
          workspaceCard: {
            type: "build_recommendation",
            engine: "contract" as const,
            ...(base.postBuildUpdate ? { postBuildUpdate: true } : {}),
            title: base.title,
            // Read from the frozen contract, never the model's prose, so the
            summary: describeBuildRecommendation(
              prepared.contract,
              prepared.plan,
            ),
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
          "Brief belum bisa disiapkan untuk membuat website. Coba kirim jawaban terakhir sekali lagi.";
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

    const normalizedToolInput = hasCard
      ? {
          briefPatch: (toolInput as { briefPatch?: unknown } | null)
            ?.briefPatch,
          projectTitle: workspaceTurn.projectTitle || project.title,
          workspaceCard: workspaceTurn.workspaceCard,
        }
      : {};

    if (!chatText.trim()) {
      chatText = unslopUserFacingText(
        hasBuiltSite
          ? "Siap, perubahannya sudah aku catat. Klik Perbarui website untuk menerapkan ke websitemu."
          : "Ada yang bisa aku bantu lagi?",
      );
    } else {
      chatText = unslopUserFacingText(chatText);
    }

    // Last word on coherence: the owner answers the card, so a message that
    chatText = alignAssistantTextWithCard(
      chatText,
      workspaceTurn.workspaceCard,
    );

    if (repairedWorkspaceTurn) {
      const repairTextPartId = `${textPartId}-repair`;
      publishProgress(turnId, {
        type: "text-start",
        id: repairTextPartId,
      });
      publishProgress(turnId, {
        type: "text-delta",
        id: repairTextPartId,
        delta: chatText,
      });
      publishProgress(turnId, {
        type: "text-end",
        id: repairTextPartId,
      });
    }

    // Always emit tool protocol events (including type:"none") so useChat
    publishProgress(turnId, {
      type: "tool-input-available",
      toolCallId: resolvedToolCallId,
      toolName: PRESENT_WORKSPACE_CARD_TOOL_NAME,
      input: normalizedToolInput,
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
          input: normalizedToolInput,
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
      dedupeUiMessagesForPersistence([...messages, assistantMessage]),
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
