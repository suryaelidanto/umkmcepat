import { prisma } from "@/lib/prisma";
import { type GeneratedProjectFile } from "@/lib/projects/generated-types";
import { resolveProjectSourceFiles } from "@/lib/projects/resolve-project-source-files";
import { readProjectSourceArtifact } from "@/lib/projects/runtime-artifacts";

export async function loadPersistedProjectSourceFiles(args: {
  projectId: string;
  userId: string;
}): Promise<GeneratedProjectFile[]> {
  const { projectId, userId } = args;

  const [sourceRow] = await prisma.$queryRaw<[{ sourceFiles: unknown }]>`
    SELECT "sourceFiles" FROM "Project" WHERE id = ${projectId} AND "userId" = ${userId}
  `;

  const latestAttempt = await prisma.projectBuild.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      snapshot: {
        select: {
          files: true,
          id: true,
          sourceRef: true,
        },
      },
    },
  });

  const latestProjectSnapshot = await prisma.projectSnapshot.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      files: true,
      id: true,
      sourceRef: true,
    },
  });

  return resolveProjectSourceFiles({
    latestAttemptSnapshot: latestAttempt?.snapshot ?? null,
    latestProjectSnapshot,
    projectSourceFiles: sourceRow?.sourceFiles,
    readArtifact: (sourceRef) => readProjectSourceArtifact(sourceRef),
  });
}

export async function projectHasPersistedSource(args: {
  projectId: string;
  userId: string;
}): Promise<boolean> {
  const files = await loadPersistedProjectSourceFiles(args);
  return files.length > 0;
}
