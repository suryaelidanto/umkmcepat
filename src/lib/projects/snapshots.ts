import { prisma } from "@/lib/prisma";
import { readProjectSourceArtifact } from "@/lib/projects/runtime-artifacts";

export type SnapshotSummary = {
  buildStatus: string | null;
  buildId: string | null;
  changes: string[];
  createdAt: Date;
  fileCount: number | null;
  id: string;
  kind: SnapshotKind;
  parentSnapshotId: string | null;
  published: boolean;
  restorable: boolean;
  summary: string | null;
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
      where: { projectId, artifactRef: { not: null }, status: "succeeded" },
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

  // Also map parent snapshot builds if a snapshot was branched
  for (const snapshot of snapshots) {
    if (snapshot.parentSnapshotId && !buildBySnapshot.has(snapshot.id)) {
      const parentBuild = buildBySnapshot.get(snapshot.parentSnapshotId);
      if (parentBuild) {
        buildBySnapshot.set(snapshot.id, parentBuild);
      }
    }
  }

  return snapshots
    .filter((snapshot) => {
      const meta = snapshot.metadata as {
        origin?: { generator?: string };
      } | null;
      if (meta?.origin?.generator === "generate-placeholder") {
        return false;
      }
      const fileCount = countFiles(snapshot.files);
      const hasFiles =
        (fileCount != null && fileCount > 0) || Boolean(snapshot.sourceRef);
      if (!hasFiles) {
        return false;
      }

      // Only show working, successful versions in history
      const build = buildBySnapshot.get(snapshot.id);
      return build?.status === "succeeded";
    })
    .map((snapshot) => {
      const fileCount = countFiles(snapshot.files);
      const restorable =
        (fileCount != null && fileCount > 0) || Boolean(snapshot.sourceRef);
      const build = buildBySnapshot.get(snapshot.id);
      const { summary, changes } = extractSnapshotChangelog(snapshot.metadata);
      return {
        buildId: build?.id ?? null,
        buildStatus: build?.status ?? null,
        changes,
        createdAt: snapshot.createdAt,
        fileCount,
        id: snapshot.id,
        kind: kindOf(snapshot.sourceType, snapshot.metadata),
        parentSnapshotId: snapshot.parentSnapshotId,
        published: publishedSnapshotIds.has(snapshot.id),
        restorable,
        summary,
      };
    });
}

export function extractSnapshotChangelog(metadata: unknown): {
  summary: string | null;
  changes: string[];
} {
  if (!metadata || typeof metadata !== "object") {
    return { summary: null, changes: [] };
  }
  const meta = metadata as {
    generation?: {
      summary?: string;
      operationTrace?: Array<{ title?: string; detail?: string }>;
    };
    description?: string;
  };

  const changes: string[] = [];

  if (
    Array.isArray(meta.generation?.operationTrace) &&
    meta.generation.operationTrace.length > 0
  ) {
    for (const op of meta.generation.operationTrace) {
      if (
        op.title &&
        !op.title.startsWith("Membaca") &&
        !op.title.startsWith("Mengecek") &&
        !op.title.startsWith("Memeriksa") &&
        !op.title.startsWith("Melihat") &&
        !op.title.startsWith("Memverifikasi")
      ) {
        const item =
          op.detail && op.detail !== op.title
            ? `${op.title} — ${op.detail}`
            : op.title;
        if (!changes.includes(item)) {
          changes.push(item);
        }
      }
    }
  }

  if (
    typeof meta.description === "string" &&
    meta.description.trim() &&
    !changes.includes(meta.description.trim())
  ) {
    changes.unshift(meta.description.trim());
  }

  let summary: string | null = null;
  if (
    typeof meta.generation?.summary === "string" &&
    meta.generation.summary.trim()
  ) {
    const raw = meta.generation.summary.trim();
    if (
      !raw.startsWith("Website successfully generated") &&
      !raw.startsWith("Menyiapkan panduan") &&
      !raw.startsWith("Mempelajari panduan")
    ) {
      summary = raw;
    }
  }

  if (
    !summary &&
    typeof meta.description === "string" &&
    meta.description.trim()
  ) {
    summary = meta.description.trim();
  }

  if (!summary) {
    // Filter down to substantive content/component write operations
    const substantive = changes.filter(
      (c) =>
        !c.startsWith("Menyiapkan panduan") &&
        !c.startsWith("Mempelajari panduan") &&
        !c.startsWith("Memasang komponen") &&
        !c.startsWith("Menyiapkan komponen") &&
        !c.startsWith("Audit desain"),
    );
    if (substantive.length > 0) {
      summary = substantive.slice(0, 2).join(". ");
    } else {
      summary =
        "Halaman website siap tayang dengan navigasi lengkap, katalog, dan kontak WhatsApp.";
    }
  }

  return { summary, changes };
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
