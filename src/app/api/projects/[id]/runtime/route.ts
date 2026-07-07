import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  selectActivePreviewDeployment,
  selectActivePublishedDeployment,
  selectLatestAttempt,
  selectLatestFailedAttempt,
  selectLatestSuccessfulBuild,
} from "@/lib/projects/deployment-resolution";
import { getRuntimeSupervisor } from "@/lib/projects/runtime-supervisor";

export const runtime = "nodejs";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });

  if (!project) {
    return Response.json(
      { message: "Proyek tidak ditemukan." },
      { status: 404 },
    );
  }

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

  return Response.json({
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
    canRetry: latestAttempt?.status === "failed",
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
  });
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
