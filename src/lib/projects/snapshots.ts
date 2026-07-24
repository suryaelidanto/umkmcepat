import { prisma } from "@/lib/prisma";
import { readProjectSourceArtifact } from "@/lib/projects/runtime-artifacts";

export type SnapshotSummary = {
  buildStatus: string | null;
  buildId: string | null;
  createdAt: Date;
  fileCount: number | null;
  id: string;
  kind: SnapshotKind;
  parentSnapshotId: string | null;
  restorable: boolean;
};

export type SnapshotKind = "initial" | "edit" | "repair";

/**
 * List a project's snapshots newest-first with build status + a restorability
 * flag. A snapshot is restorable when its `files` JSON or `sourceRef` artifact
 * is present. Owner-scoped: callers must have verified ownership of the project.
 */
export async function listSnapshots(
  projectId: string,
): Promise<SnapshotSummary[]> {
  const snapshots = await prisma.projectSnapshot.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      createdAt: true,
      files: true,
      id: true,
      metadata: true,
      parentSnapshotId: true,
      sourceRef: true,
      sourceType: true,
    },
    take: 100,
  });

  const builds = await prisma.projectBuild.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, snapshotId: true, status: true },
  });
  const buildBySnapshot = new Map(
    builds.map((build) => [build.snapshotId, build]),
  );

  return snapshots.map((snapshot) => {
    const fileCount = countFiles(snapshot.files);
    const restorable =
      (fileCount != null && fileCount > 0) || Boolean(snapshot.sourceRef);
    const build = buildBySnapshot.get(snapshot.id);
    return {
      buildId: build?.id ?? null,
      buildStatus: build?.status ?? null,
      createdAt: snapshot.createdAt,
      fileCount,
      id: snapshot.id,
      kind: kindOf(snapshot.sourceType, snapshot.metadata),
      parentSnapshotId: snapshot.parentSnapshotId,
      restorable,
    };
  });
}

export function countFiles(files: unknown): number | null {
  if (!Array.isArray(files)) {
    return null;
  }
  return files.length;
}

export function kindOf(sourceType: string, metadata: unknown): SnapshotKind {
  if (metadata && typeof metadata === "object" && "kind" in metadata) {
    const kind = (metadata as { kind?: string }).kind;
    if (kind === "edit" || kind === "repair") {
      return kind;
    }
  }
  // SourceType "generated" with no parent is the initial generate; with a
  // parent it's a follow-up. Fall back to "initial" when undecidable.
  return sourceType === "edit" ? "edit" : "initial";
}

/**
 * Read a single file's content from a specific snapshot. Resolves via the
 * snapshot's `files` JSON first, then the `sourceRef` artifact. Returns null
 * if the file or snapshot isn't found.
 */
export async function readSnapshotFile(
  snapshotId: string,
  filePath: string,
): Promise<{ content: string } | null> {
  const snapshot = await prisma.projectSnapshot.findUnique({
    where: { id: snapshotId },
    select: { files: true, sourceRef: true },
  });
  if (!snapshot) {
    return null;
  }

  const file = findFileInSnapshot(snapshot.files, filePath);
  if (file) {
    return { content: file };
  }

  if (snapshot.sourceRef) {
    const artifactFiles = await readProjectSourceArtifact(
      snapshot.sourceRef,
    ).catch(() => []);
    const artifactFile = artifactFiles.find((entry) => entry.path === filePath);
    if (artifactFile) {
      return { content: artifactFile.content };
    }
  }

  return null;
}

export function findFileInSnapshot(
  files: unknown,
  filePath: string,
): string | null {
  if (!Array.isArray(files)) {
    return null;
  }
  type SnapshotFileEntry = { content?: unknown; path: unknown };
  const entry = files.find(
    (item): item is SnapshotFileEntry =>
      typeof item === "object" &&
      item !== null &&
      "path" in item &&
      (item as { path: unknown }).path === filePath,
  );
  return entry ? String(entry.content ?? "") : null;
}

/**
 * Restore a snapshot by branching from it: create a NEW ProjectSnapshot whose
 * `parentSnapshotId` points at the target, copying its `files` + `sourceRef`.
 * Append-only — the target and all newer snapshots remain. Returns the new
 * snapshot id. The caller may then kick a build off the new snapshot.
 */
export async function restoreSnapshot(snapshotId: string): Promise<{
  newSnapshotId: string;
  projectId: string;
}> {
  const target = await prisma.projectSnapshot.findUnique({
    where: { id: snapshotId },
    select: { files: true, metadata: true, projectId: true, sourceRef: true },
  });
  if (!target) {
    throw new Error("Snapshot not found.");
  }

  const restoredMetadata = {
    ...(asObject(target.metadata) ?? {}),
    kind: "restore" as const,
  };
  const created = await prisma.projectSnapshot.create({
    data: {
      files: Array.isArray(target.files) ? target.files : [],
      metadata: restoredMetadata,
      parentSnapshotId: snapshotId,
      projectId: target.projectId,
      sourceRef: target.sourceRef,
      sourceType: "restore",
    },
    select: { id: true, projectId: true },
  });

  return { newSnapshotId: created.id, projectId: created.projectId };
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
