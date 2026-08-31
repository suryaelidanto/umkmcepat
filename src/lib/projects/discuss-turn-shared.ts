// Shared helpers for the discuss-turn flow. Used by both the detached worker

import {
  convertToModelMessages,
  generateText,
  type LanguageModel,
  type ModelMessage,
  type UIMessage,
} from "ai";

import { getAiTelemetry, getNoReasoningCallOptions } from "@/lib/ai/ai";
import {
  DISCUSS_CARD_SEMANTIC_ATTEMPTS,
  DISCUSS_CARD_SERVER_DEADLINE_MS,
  getAiTimeoutMs,
} from "@/lib/ai/ai-timeouts";
import { chargeEnergyForAiUsage } from "@/lib/payment/user-credits";
import { prisma } from "@/lib/prisma";
import { getSafeAiErrorLog } from "@/lib/projects/ai-error-log";
import { parseProjectBrief, type WorkspaceCard } from "@/lib/projects/brief";
import { normalizeWorkspaceTurn } from "@/lib/projects/brief-flow";
import {
  parseCanonicalBrief,
  type ProjectBriefV2,
} from "@/lib/projects/canonical-brief";
import {
  extractAssistantTextFromToolInput,
  PRESENT_WORKSPACE_CARD_TOOL_NAME,
  presentWorkspaceCardTool,
} from "@/lib/projects/discuss-tool";
import {
  UNSLOP_SYSTEM_INSTRUCTION,
  unslopUserFacingText,
} from "@/lib/projects/unslop-policy";

type RepairOutcome = ReturnType<typeof normalizeWorkspaceTurn> & {
  assistantText: string;
  repairsUsed: number;
  usage: { inputTokens: number; outputTokens: number };
};

export type RepairedToolCall = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: string;
};

export function scrubBriefForStorage(
  brief: ReturnType<typeof parseProjectBrief> | ProjectBriefV2,
  _readyForBuild: boolean,
  _projectId: string,
): ProjectBriefV2 {
  return parseCanonicalBrief(brief, brief.prompt);
}

export function persistProjectChatTurn({
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
    const canonicalBrief = parseCanonicalBrief(brief);
    return prisma.$executeRaw`
      UPDATE "Project" SET "chatMessages" = ${JSON.stringify(messages)}::jsonb, "brief" = ${JSON.stringify(canonicalBrief)}::jsonb, "workspaceCard" = ${JSON.stringify(workspaceCard)}::jsonb, "title" = ${title} WHERE id = ${projectId} AND "userId" = ${userId}
    `;
  }
  return prisma.$executeRaw`
    UPDATE "Project" SET "chatMessages" = ${JSON.stringify(messages)}::jsonb, "workspaceCard" = ${JSON.stringify(workspaceCard)}::jsonb WHERE id = ${projectId} AND "userId" = ${userId}
  `;
}

export function persistProjectChatCompaction({
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

export async function repairDiscussCardWithTool({
  brief,
  cardSystemPrompt,
  chatText,
  hasBuiltSite,
  lastUserText,
  previousWorkspaceCard,
  ownerTexts,
  sourceTurnId,
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
  lastUserText?: string;
  previousWorkspaceCard?: WorkspaceCard;
  ownerTexts?: string[];
  sourceTurnId?: string;
  model: LanguageModel;
  modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
  modelName: string;
  projectId: string;
  userId: string;
}) {
  // Post-build discuss only allows workspaceCard none / clarification;
  if (hasBuiltSite) {
    return null;
  }

  const abortController = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let settled: RepairOutcome | null = null;

  const attempts = (async (): Promise<RepairOutcome | null> => {
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

${UNSLOP_SYSTEM_INSTRUCTION}

REPAIR attempt ${semanticAttempt + 1}: previous card was invalid or missing.
Call ${PRESENT_WORKSPACE_CARD_TOOL_NAME} exactly once with a valid workspace card.
Include assistantText: one short Indonesian chat sentence (max 20 words, aku/kamu).
Emit type="question" with a single question (never type="questions"), or type="build_recommendation" only at 95%+ confidence.
Prefer 2-5 options per choice question and set recommendedOptionLabel.`,
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
          timeout: getAiTimeoutMs("discussCard"),
          ...getNoReasoningCallOptions(),
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
        const turn = normalizeWorkspaceTurn(input, brief, {
          hasBuiltSite,
          lastUserText,
          ownerTexts,
          previousWorkspaceCard,
          sourceTurnId,
        });
        if (turn.workspaceCard.type !== "none") {
          settled = {
            ...turn,
            assistantText: unslopUserFacingText(
              extractAssistantTextFromToolInput(input),
            ),
            repairsUsed: semanticAttempt + 1,
            usage: {
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
            },
          } as RepairOutcome;
          break;
        }
      } catch (error) {
        console.error(
          "[preview-chat] one-call repair error",
          getSafeAiErrorLog(error),
        );
      }
    }
    // Every attempt's tokens are billed once, including failed legs.
    void chargeEnergyForAiUsage({
      userId,
      projectId,
      modelId: modelName,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      reason: "discuss:repair",
    });
    return settled;
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
export async function repairToolCallInTurn({
  error,
  messages,
  model,
  modelName,
  projectId,
  toolCall,
  userId,
}: {
  error: unknown;
  messages: ModelMessage[];
  model: LanguageModel;
  modelName: string;
  projectId: string;
  toolCall: { toolCallId: string; toolName: string; input?: unknown };
  userId: string;
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
      system: UNSLOP_SYSTEM_INSTRUCTION,
      messages,
      tools: { [PRESENT_WORKSPACE_CARD_TOOL_NAME]: presentWorkspaceCardTool },
      toolChoice: { type: "tool", toolName: PRESENT_WORKSPACE_CARD_TOOL_NAME },
      temperature: 0.25,
      maxOutputTokens: 1024,
      timeout: getAiTimeoutMs("discussCard"),
    });
    void chargeEnergyForAiUsage({
      userId,
      projectId,
      modelId: modelName,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      reason: "discuss:repair",
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
