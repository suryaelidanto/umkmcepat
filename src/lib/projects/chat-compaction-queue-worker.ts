import { validateUIMessages, type UIMessage } from "ai";

import type { CompactionAttemptJob } from "@/lib/projects/attempt-queue";

import { getModerationModel } from "@/lib/ai/ai-models";
import { devLog } from "@/lib/dev-log";
import { chargeEnergyForAiUsage } from "@/lib/payment/user-credits";
import { prisma } from "@/lib/prisma";
import { maybeCompactProjectChat } from "@/lib/projects/chat-compaction";
import {
  dedupeUiMessages,
  parseProjectChatMessages,
  parseProjectChatSummary,
  parseProjectMemoryFacts,
} from "@/lib/projects/chat-memory";
import { persistProjectChatCompaction } from "@/lib/projects/discuss-turn-shared";

export async function runQueuedProjectCompaction(
  job: CompactionAttemptJob,
): Promise<void> {
  const [row] = await prisma.$queryRaw<
    Array<{
      chatMessages: unknown;
      chatSummary: unknown;
      memoryFacts: unknown;
    }>
  >`
    SELECT "chatMessages", "chatSummary", "memoryFacts"
    FROM "Project"
    WHERE id = ${job.projectId} AND "userId" = ${job.userId}
  `;

  if (!row) {
    return;
  }

  const messages = await validateUIMessages({
    messages: dedupeUiMessages(parseProjectChatMessages(row.chatMessages)),
  });
  const summary = parseProjectChatSummary(row.chatSummary);
  const memoryFacts = parseProjectMemoryFacts(row.memoryFacts);

  try {
    const compaction = await maybeCompactProjectChat({
      correlation: { projectId: job.projectId, turnId: job.turnId },
      memoryFacts,
      messages: messages as UIMessage[],
      summary,
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
