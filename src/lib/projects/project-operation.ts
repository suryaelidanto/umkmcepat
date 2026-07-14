import { randomUUID } from "node:crypto";

import { prisma as defaultPrisma } from "@/lib/prisma";

export type ProjectOperationKind = "build" | "edit";

type ProjectOperationStore = {
  project: {
    updateMany(input: unknown): Promise<{ count: number }>;
  };
};

export const DEFAULT_OPERATION_TTL_MS = 15 * 60_000;

export async function claimProjectOperation({
  kind,
  now = new Date(),
  projectId,
  store = defaultPrisma as unknown as ProjectOperationStore,
  ttlMs = DEFAULT_OPERATION_TTL_MS,
  userId,
}: {
  kind: ProjectOperationKind;
  now?: Date;
  projectId: string;
  store?: ProjectOperationStore;
  ttlMs?: number;
  userId: string;
}) {
  const token = `op_${randomUUID().replace(/-/g, "")}`;
  const expiresAt = new Date(now.getTime() + ttlMs);
  const claimed = await store.project.updateMany({
    where: {
      id: projectId,
      userId,
      buildStatus: { not: "running" },
      status: { not: "building" },
      OR: [
        { activeOperationToken: null },
        { activeOperationExpiresAt: { lt: now } },
      ],
    },
    data: {
      activeOperationExpiresAt: expiresAt,
      activeOperationKind: kind,
      activeOperationToken: token,
      buildStatus: "running",
      status: "building",
    },
  });

  return { claimed: claimed.count === 1, expiresAt, token };
}

export async function renewProjectOperation({
  now = new Date(),
  projectId,
  store = defaultPrisma as unknown as ProjectOperationStore,
  token,
  ttlMs = DEFAULT_OPERATION_TTL_MS,
  userId,
}: {
  now?: Date;
  projectId: string;
  store?: ProjectOperationStore;
  token: string;
  ttlMs?: number;
  userId: string;
}) {
  const renewed = await store.project.updateMany({
    where: {
      activeOperationExpiresAt: { gt: now },
      activeOperationToken: token,
      id: projectId,
      userId,
    },
    data: {
      activeOperationExpiresAt: new Date(now.getTime() + ttlMs),
    },
  });

  return renewed.count === 1;
}

export async function finalizeProjectOperation({
  data,
  projectId,
  store = defaultPrisma as unknown as ProjectOperationStore,
  token,
  userId,
}: {
  data: Record<string, unknown>;
  projectId: string;
  store?: ProjectOperationStore;
  token: string;
  userId: string;
}) {
  const finalized = await store.project.updateMany({
    where: { activeOperationToken: token, id: projectId, userId },
    data: {
      ...data,
      activeOperationExpiresAt: null,
      activeOperationKind: null,
      activeOperationToken: null,
    },
  });

  return finalized.count === 1;
}
