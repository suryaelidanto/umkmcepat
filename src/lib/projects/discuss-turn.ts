import { randomUUID } from "node:crypto";

import type { ProjectChatTurn, ProjectChatTurnStatus } from "@prisma/client";

import { devLog } from "@/lib/dev-log";
import { prisma as defaultPrisma } from "@/lib/prisma";

export const DISCUSS_TURN_TTL_MS = 7.5 * 60_000;

export type { ProjectChatTurn, ProjectChatTurnStatus } from "@prisma/client";

type ProjectChatTurnStore = {
  projectChatTurn: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
    create(args: unknown): Promise<{ id: string }>;
    update(args: unknown): Promise<unknown>;
  };
  $transaction<T>(cb: (tx: ProjectChatTurnStore) => Promise<T>): Promise<T>;
};

export async function claimDiscussTurn({
  projectId,
  userId,
  userMessageId,
  now = new Date(),
  ttlMs = DISCUSS_TURN_TTL_MS,
  store = defaultPrisma as unknown as ProjectChatTurnStore,
}: {
  projectId: string;
  userId: string;
  userMessageId: string;
  now?: Date;
  ttlMs?: number;
  store?: ProjectChatTurnStore;
}): Promise<{ claimed: boolean; turnId: string | null }> {
  // ponytail: userId reserved for Task 4 worker auth-scope check; the
  // ProjectChatTurn row has no userId column (project owns the relation).
  void userId;
  return store.$transaction(async (tx) => {
    // On-claim TTL safety: finalize any expired running turn first.
    const expired = await tx.projectChatTurn.findFirst({
      where: { projectId, status: "running", expiresAt: { lt: now } },
      select: { id: true },
    });
    if (expired) {
      await tx.projectChatTurn.update({
        where: { id: expired.id },
        data: { status: "failed", finishedAt: now, errorMessage: "expired" },
      });
    }

    // Reject if a live running turn still exists for this project.
    const existing = await tx.projectChatTurn.findFirst({
      where: { projectId, status: "running" },
      select: { id: true },
    });
    if (existing) {
      devLog("discuss-turn", "duplicate-rejected", {
        projectId,
        activeTurnId: existing.id,
      });
      return { claimed: false, turnId: null };
    }

    const turnId = `ct_${randomUUID().replace(/-/g, "")}`;
    devLog("discuss-turn", "claim", { projectId, turnId });
    await tx.projectChatTurn.create({
      data: {
        id: turnId,
        projectId,
        userMessageId,
        status: "running",
        expiresAt: new Date(now.getTime() + ttlMs),
      },
    });
    return { claimed: true, turnId };
  });
}

export async function finalizeDiscussTurn({
  turnId,
  status,
  errorMessage,
  now = new Date(),
  store = defaultPrisma as unknown as ProjectChatTurnStore,
}: {
  turnId: string;
  status: ProjectChatTurnStatus;
  errorMessage?: string;
  now?: Date;
  store?: ProjectChatTurnStore;
}): Promise<void> {
  await store.projectChatTurn.update({
    where: { id: turnId },
    data: { status, finishedAt: now, errorMessage: errorMessage ?? null },
  });
  devLog("discuss-turn", "finalize", {
    turnId,
    status,
    hasError: Boolean(errorMessage),
  });
}

export async function releaseDiscussTurn({
  turnId,
  now = new Date(),
  store = defaultPrisma as unknown as ProjectChatTurnStore,
}: {
  turnId: string;
  now?: Date;
  store?: ProjectChatTurnStore;
}): Promise<void> {
  await finalizeDiscussTurn({ turnId, status: "cancelled", now, store });
}

export async function getActiveDiscussTurn({
  projectId,
  now = new Date(),
  store = defaultPrisma as unknown as ProjectChatTurnStore,
}: {
  projectId: string;
  now?: Date;
  store?: ProjectChatTurnStore;
}): Promise<ProjectChatTurn | null> {
  const running = (await store.projectChatTurn.findFirst({
    where: { projectId, status: "running" },
    orderBy: { startedAt: "desc" },
  })) as ProjectChatTurn | null;
  if (running && running.expiresAt < now) {
    // Expired — finalize + return null (caller treats as no active turn).
    await store.projectChatTurn.update({
      where: { id: running.id },
      data: { status: "failed", finishedAt: now, errorMessage: "expired" },
    });
    return null;
  }
  return running;
}
