import { prisma } from "@/lib/prisma";
import {
  type EditBuildAttemptJob,
  type EditBuildJobResult,
} from "@/lib/projects/attempt-queue";
import { createLocalBuildWorker } from "@/lib/projects/build-worker";
import { isProjectBuildForProject } from "@/lib/projects/deployment-resolution";
import {
  isProjectArtifactRefFor,
  readProjectSourceArtifact,
} from "@/lib/projects/runtime-artifacts";
import { type ProjectBuildStatus } from "@/lib/projects/runtime-types";

export async function runQueuedEditBuild(
  job: EditBuildAttemptJob,
): Promise<EditBuildJobResult> {
  const build = await prisma.projectBuild.findFirst({
    where: {
      id: job.buildId,
      project: { userId: job.userId },
      projectId: job.projectId,
      snapshot: { projectId: job.projectId },
      snapshotId: job.snapshotId,
    },
    select: {
      id: true,
      projectId: true,
      snapshot: { select: { id: true, projectId: true, sourceRef: true } },
      snapshotId: true,
    },
  });

  const logText = "Stored source artifact does not match the edit snapshot.";
  if (!build) {
    return { artifactRef: null, buildStatus: "failed", logText };
  }

  if (
    !isProjectBuildForProject(build, job.projectId) ||
    build.snapshot?.sourceRef !== job.sourceRef ||
    !isProjectArtifactRefFor(job.sourceRef, "source", job.snapshotId)
  ) {
    await prisma.projectBuild.update({
      where: { id: build.id },
      data: {
        finishedAt: new Date(),
        logText,
        status: "failed" satisfies ProjectBuildStatus,
      },
    });
    return { artifactRef: null, buildStatus: "failed", logText };
  }

  await prisma.projectBuild.update({
    where: { id: build.id },
    data: {
      startedAt: new Date(),
      status: "running" satisfies ProjectBuildStatus,
    },
  });

  const files = await readProjectSourceArtifact(job.sourceRef);
  const buildResult = await createLocalBuildWorker().runBuild({
    buildId: job.buildId,
    files,
    workspaceKey: job.projectId,
  });

  return {
    artifactRef: buildResult.artifactRef,
    buildStatus: buildResult.status,
    logText: buildResult.logText,
  };
}
