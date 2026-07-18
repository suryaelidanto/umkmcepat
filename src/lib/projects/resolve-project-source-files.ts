import { parseGeneratedProjectFiles } from "@/lib/projects/generated-source";
import { type GeneratedProjectFile } from "@/lib/projects/generated-types";

export type SourceSnapshotLike = {
  files?: unknown;
  id: string;
  sourceRef?: string | null;
};

/**
 * Prefer latest attempt (success or fail), then any snapshot with files,
 * then project-level sourceFiles. Preview-active deployment is NOT required.
 */
export function resolveProjectSourceFiles({
  latestAttemptSnapshot,
  latestProjectSnapshot,
  projectSourceFiles,
  readArtifact,
}: {
  latestAttemptSnapshot?: SourceSnapshotLike | null;
  latestProjectSnapshot?: SourceSnapshotLike | null;
  projectSourceFiles?: unknown;
  readArtifact?: (sourceRef: string) => Promise<GeneratedProjectFile[]>;
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
  readArtifact?: (sourceRef: string) => Promise<GeneratedProjectFile[]>;
}): Promise<GeneratedProjectFile[]> {
  for (const snapshot of [latestAttemptSnapshot, latestProjectSnapshot]) {
    if (!snapshot) {
      continue;
    }
    const fromArtifact = await filesFromSnapshot(snapshot, readArtifact);
    if (fromArtifact.length) {
      return fromArtifact;
    }
  }

  return parseGeneratedProjectFiles(projectSourceFiles);
}

async function filesFromSnapshot(
  snapshot: SourceSnapshotLike,
  readArtifact?: (sourceRef: string) => Promise<GeneratedProjectFile[]>,
): Promise<GeneratedProjectFile[]> {
  if (snapshot.sourceRef && readArtifact) {
    try {
      const artifactFiles = await readArtifact(snapshot.sourceRef);
      if (artifactFiles.length) {
        return artifactFiles;
      }
    } catch {
      // fall through to embedded files
    }
  }

  return parseGeneratedProjectFiles(snapshot.files);
}
