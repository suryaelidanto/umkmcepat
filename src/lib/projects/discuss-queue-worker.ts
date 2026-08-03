import { validateUIMessages, type UIMessage } from "ai";

import { prisma } from "@/lib/prisma";
import { type DiscussAttemptJob } from "@/lib/projects/attempt-queue";
import { parseProjectBrief, type WorkspaceCard } from "@/lib/projects/brief";
import { parseWorkspaceCard } from "@/lib/projects/brief-flow";
import {
  buildProjectChatContext,
  dedupeUiMessages,
  parseProjectChatMessages,
  parseProjectChatSummary,
  parseProjectMemoryFacts,
} from "@/lib/projects/chat-memory";
import { finalizeDiscussTurn } from "@/lib/projects/discuss-turn";
import { publishProgress } from "@/lib/projects/discuss-turn-pubsub";
import { runDiscussTurn } from "@/lib/projects/discuss-turn-worker";
/**
 * BullMQ entry for discuss: reload chat state from DB (user message already
 * persisted by POST) and run the existing turn worker.
 */
export async function runQueuedDiscussTurn(
  job: DiscussAttemptJob,
  abortSignal?: AbortSignal,
): Promise<void> {
  if (abortSignal?.aborted) {
    await finalizeDiscussTurn({
      turnId: job.turnId,
      status: "cancelled",
      errorMessage: "Dihentikan oleh pengguna.",
    }).catch(() => undefined);
    publishProgress(job.turnId, {
      type: "error",
      errorText: "Proses dihentikan.",
    });
    return;
  }

  const [row] = await prisma.$queryRaw<
    Array<{
      chatMessages: unknown;
      chatSummary: unknown;
      memoryFacts: unknown;
      brief: unknown;
      workspaceCard: unknown;
    }>
  >`
    SELECT "chatMessages", "chatSummary", "memoryFacts", "brief", "workspaceCard"
    FROM "Project"
    WHERE id = ${job.projectId} AND "userId" = ${job.userId}
  `;

  if (!row) {
    await finalizeDiscussTurn({
      turnId: job.turnId,
      status: "failed",
      errorMessage: "Proyek tidak ditemukan.",
    }).catch(() => undefined);
    publishProgress(job.turnId, {
      type: "error",
      errorText: "Proyek tidak ditemukan.",
    });
    return;
  }

  const messages = await validateUIMessages({
    messages: dedupeUiMessages(parseProjectChatMessages(row.chatMessages)),
  });
  const summary = parseProjectChatSummary(row.chatSummary);
  const memoryFacts = parseProjectMemoryFacts(row.memoryFacts);
  const effectiveBrief = parseProjectBrief(row.brief, job.projectPrompt);
  const previousWorkspaceCard: WorkspaceCard | undefined = row.workspaceCard
    ? parseWorkspaceCard(row.workspaceCard, effectiveBrief)
    : undefined;

  const chatContext = buildProjectChatContext({
    fieldState: {},
    memoryFacts,
    messages: messages as UIMessage[],
    summary,
  });

  const onAbort = () => {
    publishProgress(job.turnId, {
      type: "error",
      errorText: "Proses dihentikan.",
    });
  };
  abortSignal?.addEventListener("abort", onAbort, { once: true });

  try {
    await runDiscussTurn({
      turnId: job.turnId,
      project: {
        id: job.projectId,
        prompt: job.projectPrompt,
        status: job.projectStatus,
        title: job.projectTitle,
        generationEngine: job.generationEngine,
      },
      chatContext,
      effectiveBrief,
      memoryFacts,
      messages: messages as UIMessage[],
      previousWorkspaceCard,
      summary,
      userId: job.userId,
      abortSignal,
    });
  } finally {
    abortSignal?.removeEventListener("abort", onAbort);
  }
}
