import { parseProjectChatMessages } from "./chat-memory";

import type { Prisma } from "@prisma/client";

export type BuildCheckpointKind = "build" | "edit";

export function isSuccessfulBuildStatus(status: string): status is "succeeded" {
  return status === "succeeded";
}

export function hasSuccessfulBuildEvidence({
  checkpointCount,
  projectBuildStatus,
  projectStatus,
  successfulBuildCount,
}: {
  checkpointCount: number;
  projectBuildStatus?: string | null;
  projectStatus?: string | null;
  successfulBuildCount: number;
}): boolean {
  return Boolean(
    checkpointCount > 0 ||
    successfulBuildCount > 0 ||
    projectStatus === "ready" ||
    ["passed", "ready", "succeeded"].includes(projectBuildStatus ?? ""),
  );
}

export async function persistSuccessfulBuildCheckpoint({
  buildId,
  kind,
  projectId,
  snapshotId,
  store,
}: {
  buildId: string;
  kind: BuildCheckpointKind;
  projectId: string;
  snapshotId: string;
  store: Prisma.TransactionClient;
}) {
  const [row] = await store.$queryRaw<Array<{ chatMessages: unknown }>>`
    SELECT "chatMessages" FROM "Project"
    WHERE id = ${projectId}
    FOR UPDATE
  `;
  const messages = parseProjectChatMessages(row?.chatMessages);
  const lastMessage = messages.at(-1);

  return store.projectBuildCheckpoint.create({
    data: {
      buildId,
      chatMessageId: lastMessage?.id ?? null,
      chatMessageIndex: lastMessage ? messages.length - 1 : null,
      kind,
      projectId,
      snapshotId,
    },
  });
}
