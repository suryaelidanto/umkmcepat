import { parseGeneratedProjectFiles } from "@/lib/projects/generated-source";
import { type GeneratedProjectFile } from "@/lib/projects/generated-types";

export type SourceSnapshotLike = {
  files?: unknown;
  id: string;
  sourceRef?: string | null;
};

type ReadSourceArtifact = (
  sourceRef: string,
  snapshot: SourceSnapshotLike,
) => Promise<GeneratedProjectFile[]>;

export function resolveProjectSourceFiles({
  latestAttemptSnapshot,
  latestProjectSnapshot,
  projectSourceFiles,
  readArtifact,
}: {
  latestAttemptSnapshot?: SourceSnapshotLike | null;
  latestProjectSnapshot?: SourceSnapshotLike | null;
  projectSourceFiles?: unknown;
  readArtifact?: ReadSourceArtifact;
}): Promise<GeneratedProjectFile[]> {
  return resolveAsync({
    latestAttemptSnapshot,
    latestProjectSnapshot,
    projectSourceFiles,
    readArtifact,
  });
}

async function resolveAsync({
  latestAttemptSnapshot,
  latestProjectSnapshot,
  projectSourceFiles,
  readArtifact,
}: {
  latestAttemptSnapshot?: SourceSnapshotLike | null;
  latestProjectSnapshot?: SourceSnapshotLike | null;
  projectSourceFiles?: unknown;
  readArtifact?: ReadSourceArtifact;
}): Promise<GeneratedProjectFile[]> {
  for (const snapshot of [latestAttemptSnapshot, latestProjectSnapshot]) {
    if (!snapshot) {
      continue;
    }

    const embeddedFiles = parseGeneratedProjectFiles(snapshot.files);
    if (!snapshot.sourceRef) {
      if (embeddedFiles.length) {
        return embeddedFiles;
      }
      continue;
    }

    if (readArtifact) {
      try {
        const artifactFiles = await readArtifact(snapshot.sourceRef, snapshot);
        if (artifactFiles.length) {
          return artifactFiles;
        }
      } catch {
        return embeddedFiles;
      }
    }

    return embeddedFiles;
  }

  return parseGeneratedProjectFiles(projectSourceFiles);
}
