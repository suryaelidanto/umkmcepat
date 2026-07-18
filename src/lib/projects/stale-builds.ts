import { prisma } from "@/lib/prisma";

export const STALE_BUILD_TIMEOUT_MS = 3 * 60 * 1000;

export function getStaleBuildCutoff(now = new Date()) {
  return new Date(now.getTime() - STALE_BUILD_TIMEOUT_MS);
}

export async function markStaleProjectBuilds(
  projectId: string,
  now = new Date(),
) {
  const cutoff = getStaleBuildCutoff(now);

  const result = await prisma.projectBuild.updateMany({
    where: {
      projectId,
      status: { in: ["queued", "running"] },
      updatedAt: { lt: cutoff },
    },
    data: {
      finishedAt: now,
      logText: "Build marked stale after exceeding the recovery timeout.",
      status: "stale",
    },
  });

  const expiredOperation = await prisma.project.updateMany({
    where: {
      activeOperationExpiresAt: { lte: now },
      activeOperationToken: { not: null },
      id: projectId,
      status: "building",
    },
    data: {
      activeOperationExpiresAt: null,
      activeOperationKind: null,
      activeOperationToken: null,
      buildLog: "Operation lease expired before completion.",
      buildStatus: "failed",
      status: "failed",
    },
  });

  if (expiredOperation.count > 0) {
    await prisma.projectEditAttempt.updateMany({
      where: {
        finishedAt: null,
        projectId,
        status: { in: ["generating", "editing", "repairing", "building"] },
      },
      data: {
        errorMessage: "Operation lease expired before completion.",
        finishedAt: now,
        status: "failed",
      },
    });
  }

  if (result.count > 0) {
    await prisma.project.updateMany({
      where: {
        activeOperationToken: null,
        buildStatus: { in: ["queued", "running"] },
        id: projectId,
        status: "building",
      },
      data: {
        buildLog: "Build marked stale after exceeding the recovery timeout.",
        buildStatus: "failed",
        status: "failed",
      },
    });
  }

  return result.count + expiredOperation.count;
}
