import { validateUIMessages, type UIMessage } from "ai";

import type { CompactionAttemptJob } from "@/lib/projects/attempt-queue";

import { getModerationModel } from "@/lib/ai/ai-models";
import { devLog } from "@/lib/dev-log";
import { chargeEnergyForAiUsage } from "@/lib/payment/user-credits";
import { prisma } from "@/lib/prisma";
import { parseCanonicalBrief } from "@/lib/projects/canonical-brief";
import { maybeCompactProjectChat } from "@/lib/projects/chat-compaction";
import {
  dedupeUiMessagesForPersistence,
  resolveProjectChatState,
} from "@/lib/projects/chat-memory";
import { persistProjectChatCompaction } from "@/lib/projects/discuss-turn-shared";

export async function runQueuedProjectCompaction(
  job: CompactionAttemptJob,
): Promise<void> {
  const [row] = await prisma.$queryRaw<
    Array<{
      chatMessages: unknown;
      chatSummary: unknown;
      lastCompactedMessageCount: unknown;
      memoryFacts: unknown;
      brief: unknown;
    }>
  >`
    SELECT "chatMessages", "chatSummary", "lastCompactedMessageCount", "memoryFacts", "brief"
    FROM "Project"
    WHERE id = ${job.projectId} AND "userId" = ${job.userId}
  `;

  if (!row) {
    return;
  }

  const canonicalBrief = parseCanonicalBrief(row.brief);
  const chatState = resolveProjectChatState({
    chatMessages: row.chatMessages,
    chatSummary: row.chatSummary,
    memoryFacts: row.memoryFacts,
    fallback: canonicalBrief.discussionContext,
  });
  const messages = await validateUIMessages({
    messages: dedupeUiMessagesForPersistence(chatState.messages),
  });
  const summary = {
    ...chatState.summary,
    compactedMessageCount: Math.max(
      chatState.summary.compactedMessageCount,
      typeof row.lastCompactedMessageCount === "number"
        ? row.lastCompactedMessageCount
        : 0,
    ),
  };
  const memoryFacts = chatState.memoryFacts;
  const factLedger = canonicalBrief.factLedger;

  try {
    const compaction = await maybeCompactProjectChat({
      correlation: { projectId: job.projectId, turnId: job.turnId },
      memoryFacts,
      messages: messages as UIMessage[],
      summary,
      factLedger,
    });

    if (!compaction) {
      return;
    }

    await persistProjectChatCompaction({
      compactedMessageCount: compaction.compactedMessageCount,
      memoryFacts: compaction.memoryFacts,
      projectId: job.projectId,
      summary: compaction.summary,
      userId: job.userId,
    });

    await chargeEnergyForAiUsage({
      userId: job.userId,
      projectId: job.projectId,
      modelId: getModerationModel(),
      inputTokens: compaction.usage?.inputTokens ?? 0,
      outputTokens: compaction.usage?.outputTokens ?? 0,
      reason: "discuss:compaction",
    });
  } catch (error) {
    devLog("discuss", "compaction-failed", {
      projectId: job.projectId,
      turnId: job.turnId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
