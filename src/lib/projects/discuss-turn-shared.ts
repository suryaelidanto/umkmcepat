// Shared helpers for the discuss-turn flow. Used by both the detached worker
// (`discuss-turn-worker.ts`) and the POST route (`api.projects.preview.ts`).
// ponytail: Task 4 duplicated these into the worker; Task 5 extracted them here
// to kill the drift risk. Do not re-inline without removing both call sites.

import {
  convertToModelMessages,
  generateText,
  type LanguageModel,
  type ModelMessage,
  type UIMessage,
} from "ai";

import { getAiTelemetry } from "@/lib/ai";
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
import {
  PRESENT_WORKSPACE_CARD_TOOL_NAME,
  presentWorkspaceCardTool,
} from "@/lib/projects/discuss-tool";

export type RepairedToolCall = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: string;
};

export function scrubBriefForStorage(
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
    return prisma.$executeRaw`
      UPDATE "Project" SET "chatMessages" = ${JSON.stringify(messages)}::jsonb, "brief" = ${JSON.stringify(brief)}::jsonb, "workspaceCard" = ${JSON.stringify(workspaceCard)}::jsonb, "title" = ${title} WHERE id = ${projectId} AND "userId" = ${userId}
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
// the forced card tool and return a `LanguageModelV4ToolCall`-shaped value
// (input as stringified JSON, since the SDK re-parses it via safeParseJSON).
// Returning null leaves the call unrepaired → the stream emits no tool-call
// part → toolInput stays null → existing Layer-3 `repairDiscussCardWithTool`
// fires as the backstop. No new branch needed.
export async function repairToolCallInTurn({
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
