import { prisma } from "@/lib/prisma";
import {
  type EditBuildAttemptJob,
  type EditBuildJobResult,
} from "@/lib/projects/attempt-queue";
import { createLocalBuildWorker } from "@/lib/projects/build-worker";
import { readProjectSourceArtifact } from "@/lib/projects/runtime-artifacts";
import { type ProjectBuildStatus } from "@/lib/projects/runtime-types";

export async function runQueuedEditBuild(
  job: EditBuildAttemptJob,
): Promise<EditBuildJobResult> {
  await prisma.projectBuild.update({
    where: { id: job.buildId },
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
