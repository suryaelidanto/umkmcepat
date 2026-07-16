import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPrismaDatabaseUnavailable } from "@/lib/prisma-errors";
import {
  selectActivePreviewDeployment,
  selectActivePublishedDeployment,
  selectLatestAttempt,
  selectLatestFailedAttempt,
  selectLatestSuccessfulBuild,
} from "@/lib/projects/deployment-resolution";
import { getRuntimeSupervisor } from "@/lib/projects/runtime-supervisor";
import { markStaleProjectBuilds } from "@/lib/projects/stale-builds";

const runtimeStateCache = new Map<
  string,
  {
    body: unknown;
    expiresAt: number;
    projectId: string;
    userId: string;
  }
>();
const RUNTIME_STATE_CACHE_TTL_MS = 15_000;
const RUNTIME_STATE_CACHE_MAX_ENTRIES = 200;

export const Route = createFileRoute("/api/projects/$id/runtime")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const session = await auth();

        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const { id } = params;

        try {
          return await getRuntimeState(id, session.user.id);
        } catch (error) {
          if (isPrismaDatabaseUnavailable(error)) {
            const cached = readRuntimeStateCache(session.user.id, id);

            if (cached) {
              return Response.json(cached.body, {
                headers: { "X-UMKM-Runtime-Cache": "stale" },
              });
            }

            return Response.json(
              {
                code: "database_unavailable",
                message:
                  "Status website lagi nyambung ulang. Tampilan terakhir tetap aman.",
              },
              { status: 503, headers: { "Retry-After": "3" } },
            );
          }

          throw error;
        }
      },
    },
  },
});

async function getRuntimeState(id: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!project) {
    return Response.json(
      { message: "Proyek tidak ditemukan." },
      { status: 404 },
    );
  }

  await markStaleProjectBuilds(project.id);

  const [builds, previewDeployments, publishedDeployments, events] =
    await Promise.all([
      prisma.projectBuild.findMany({
        where: { projectId: project.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          artifactRef: true,
          createdAt: true,
          finishedAt: true,
          id: true,
          logText: true,
          startedAt: true,
          status: true,
          updatedAt: true,
        },
      }),
      prisma.projectDeployment.findMany({
        where: { kind: "preview", projectId: project.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          build: {
            select: {
              artifactRef: true,
              createdAt: true,
              id: true,
              snapshotId: true,
              status: true,
              updatedAt: true,
            },
          },
          buildId: true,
          createdAt: true,
          id: true,
          kind: true,
          lastRequestAt: true,
          publicPath: true,
          startedAt: true,
          status: true,
          stoppedAt: true,
          updatedAt: true,
        },
      }),
      prisma.projectDeployment.findMany({
        where: { kind: "published", projectId: project.id },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          build: {
            select: {
              artifactRef: true,
              createdAt: true,
              id: true,
              snapshotId: true,
              status: true,
              updatedAt: true,
            },
          },
          buildId: true,
          createdAt: true,
          id: true,
          kind: true,
          publicPath: true,
          snapshotId: true,
          slug: true,
          status: true,
          updatedAt: true,
        },
      }),
      prisma.runtimeEvent.findMany({
        where: { projectId: project.id },
        orderBy: { createdAt: "desc" },
        select: {
          buildId: true,
          createdAt: true,
          deploymentId: true,
          id: true,
          message: true,
          type: true,
        },
        take: 20,
      }),
    ]);
  const latestAttempt = selectLatestAttempt(builds);
  const latestFailedAttempt = selectLatestFailedAttempt(builds);
  const latestSuccessfulBuild = selectLatestSuccessfulBuild(builds);
  const deployment = selectActivePreviewDeployment(previewDeployments);
  const publishedDeployment =
    selectActivePublishedDeployment(publishedDeployments);
  const liveDeploymentStatus =
    deployment?.status === "running" || deployment?.status === "starting"
      ? await getRuntimeSupervisor().getDeploymentStatus(deployment.id)
      : deployment?.status;
  const userFacingState = getUserFacingRuntimeState({
    deploymentStatus: liveDeploymentStatus,
    latestAttemptStatus: latestAttempt?.status,
    latestFailedAttemptId: latestFailedAttempt?.id,
    latestSuccessfulBuildId: latestSuccessfulBuild?.id,
  });

  const body = {
    activePreviewDeployment: deployment
      ? {
          ...deployment,
          status: liveDeploymentStatus,
        }
      : null,
    activePublishedDeployment: publishedDeployment,
    build: latestSuccessfulBuild,
    canPreview: Boolean(deployment),
    canPublish: Boolean(latestSuccessfulBuild),
    // Retry whenever the latest attempt failed/stale/canceled, or project has
    // no success artifact (covers agent-phase fails that used to leave zero builds).
    canRetry:
      latestAttempt?.status === "failed" ||
      latestAttempt?.status === "stale" ||
      latestAttempt?.status === "canceled" ||
      (!latestSuccessfulBuild &&
        (latestFailedAttempt?.status === "failed" ||
          latestFailedAttempt?.status === "stale")),
    deployment: deployment
      ? {
          ...deployment,
          status: liveDeploymentStatus,
        }
      : null,
    events,
    latestAttempt,
    latestFailedAttempt,
    latestSuccessfulBuild,
    message: getUserFacingRuntimeMessage(userFacingState),
    publishedDeployment,
    userFacingState,
  };

  writeRuntimeStateCache(userId, id, body);

  return Response.json(body);
}

function readRuntimeStateCache(userId: string, projectId: string) {
  evictExpiredRuntimeStateCache();
  const cached = runtimeStateCache.get(runtimeStateCacheKey(userId, projectId));

  if (
    !cached ||
    cached.userId !== userId ||
    cached.projectId !== projectId ||
    cached.expiresAt <= Date.now()
  ) {
    return null;
  }

  return cached;
}

function writeRuntimeStateCache(
  userId: string,
  projectId: string,
  body: unknown,
) {
  evictExpiredRuntimeStateCache();
  const key = runtimeStateCacheKey(userId, projectId);

  runtimeStateCache.delete(key);

  while (runtimeStateCache.size >= RUNTIME_STATE_CACHE_MAX_ENTRIES) {
    const oldestKey = runtimeStateCache.keys().next().value;

    if (typeof oldestKey !== "string") {
      break;
    }

    runtimeStateCache.delete(oldestKey);
  }

  runtimeStateCache.set(key, {
    body: createCacheSafeRuntimeBody(body),
    expiresAt: Date.now() + RUNTIME_STATE_CACHE_TTL_MS,
    projectId,
    userId,
  });
}

function evictExpiredRuntimeStateCache() {
  const now = Date.now();

  for (const [key, entry] of runtimeStateCache) {
    if (entry.expiresAt <= now) {
      runtimeStateCache.delete(key);
    }
  }
}

function runtimeStateCacheKey(userId: string, projectId: string) {
  return `${userId.length}:${userId}${projectId}`;
}

function createCacheSafeRuntimeBody(body: unknown) {
  return JSON.parse(
    JSON.stringify(body, (key, value) =>
      key === "logText" ? undefined : value,
    ),
  ) as unknown;
}

function getUserFacingRuntimeState({
  deploymentStatus,
  latestAttemptStatus,
  latestFailedAttemptId,
  latestSuccessfulBuildId,
}: {
  deploymentStatus?: string | null;
  latestAttemptStatus?: string | null;
  latestFailedAttemptId?: string | null;
  latestSuccessfulBuildId?: string | null;
}) {
  if (latestAttemptStatus === "queued" || latestAttemptStatus === "running") {
    return "building";
  }

  if (!latestSuccessfulBuildId) {
    return latestFailedAttemptId
      ? "build_failed_without_last_good"
      : "not_built";
  }

  if (deploymentStatus === "starting") {
    return "preview_starting";
  }

  if (deploymentStatus === "failed") {
    return "preview_failed";
  }

  return latestFailedAttemptId ? "ready_with_failed_latest_attempt" : "ready";
}

function getUserFacingRuntimeMessage(state: string) {
  switch (state) {
    case "building":
      return "Build website sedang berjalan.";
    case "build_failed_without_last_good":
      return "Build website belum berhasil dan belum ada tampilan sebelumnya.";
    case "preview_failed":
      return "Tampilan website gagal dimuat. Coba muat ulang tampilan.";
    case "preview_starting":
      return "Tampilan website sedang disiapkan.";
    case "ready":
    case "ready_with_failed_latest_attempt":
      return "Tampilan website siap dicek.";
    default:
      return "Website belum dibuild.";
  }
}
