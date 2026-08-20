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
  published: boolean;
  restorable: boolean;
};

export type SnapshotKind = "initial" | "edit" | "repair" | "restore";

type SnapshotBuildSummary = {
  id: string;
  status: string;
};

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

  const [builds, previewDeployments, publishedDeployments] = await Promise.all([
    prisma.projectBuild.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, snapshotId: true, status: true },
    }),
    prisma.projectDeployment.findMany({
      where: { kind: "preview", projectId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        build: { select: { id: true, status: true } },
        snapshotId: true,
      },
    }),
    prisma.projectDeployment.findMany({
      where: { kind: "published", projectId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 20,
      select: { snapshotId: true },
    }),
  ]);
  const buildBySnapshot = new Map<string, SnapshotBuildSummary>();
  for (const build of builds) {
    buildBySnapshot.set(build.snapshotId, {
      id: build.id,
      status: build.status,
    });
  }
  for (const deployment of previewDeployments) {
    if (deployment.snapshotId && deployment.build) {
      buildBySnapshot.set(deployment.snapshotId, deployment.build);
    }
  }
  const publishedSnapshotIds = new Set(
    publishedDeployments
      .map((deployment) => deployment.snapshotId)
      .filter((snapshotId): snapshotId is string => Boolean(snapshotId)),
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
      published: publishedSnapshotIds.has(snapshot.id),
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
    if (kind === "edit" || kind === "repair" || kind === "restore") {
      return kind;
    }
  }
  // SourceType "generated" with no parent is the initial generate; with a
  if (sourceType === "edit") {
    return "edit";
  }
  if (sourceType === "restore") {
    return "restore";
  }
  return "initial";
}

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
