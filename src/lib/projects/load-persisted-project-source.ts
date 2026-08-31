import { prisma } from "@/lib/prisma";
import { type GeneratedProjectFile } from "@/lib/projects/generated-types";
import { resolveProjectSourceFiles } from "@/lib/projects/resolve-project-source-files";
import {
  isProjectArtifactRefFor,
  readProjectSourceArtifact,
} from "@/lib/projects/runtime-artifacts";

export async function loadPersistedProjectSourceFiles(args: {
  projectId: string;
  userId: string;
}): Promise<GeneratedProjectFile[]> {
  const { projectId, userId } = args;

  const [sourceRow] = await prisma.$queryRaw<[{ sourceFiles: unknown }]>`
    SELECT "sourceFiles" FROM "Project" WHERE id = ${projectId} AND "userId" = ${userId}
  `;

  const latestAttempt = await prisma.projectBuild.findFirst({
    where: { project: { userId }, projectId },
    orderBy: { createdAt: "desc" },
    select: {
      snapshot: {
        select: {
          files: true,
          id: true,
          projectId: true,
          sourceRef: true,
        },
      },
    },
  });

  const latestProjectSnapshot = await prisma.projectSnapshot.findFirst({
    where: { project: { userId }, projectId },
    orderBy: { createdAt: "desc" },
    select: {
      files: true,
      id: true,
      sourceRef: true,
    },
  });

  const latestAttemptSnapshot =
    latestAttempt?.snapshot?.projectId === projectId
      ? latestAttempt.snapshot
      : null;

  return resolveProjectSourceFiles({
    latestAttemptSnapshot,
    latestProjectSnapshot,
    projectSourceFiles: sourceRow?.sourceFiles,
    readArtifact: (sourceRef, snapshot) =>
      isProjectArtifactRefFor(sourceRef, "source", snapshot.id)
        ? readProjectSourceArtifact(sourceRef)
        : Promise.resolve([]),
  });
}

export async function projectHasPersistedSource(args: {
  projectId: string;
  userId: string;
}): Promise<boolean> {
  const files = await loadPersistedProjectSourceFiles(args);
  return files.length > 0;
}
