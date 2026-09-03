import { randomUUID } from "node:crypto";

import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  detectImageFormat,
  EXT_CONTENT_TYPE as FORMAT_CONTENT_TYPES,
} from "@/lib/storage/images/format";
import { optimizeImageToWebp } from "@/lib/storage/images/optimize";
import {
  deleteS3Object,
  getS3Object,
  publicUrlFor,
  putS3Object,
  S3_PREFIXES,
} from "@/lib/storage/s3-client";
import { getStorageProvider } from "@/lib/storage/storage-provider";

const S3_REF_PREFIX = "project-asset:s3:";
const S3_PRIVATE_REF_PREFIX = "project-asset:s3-private:";

export type ProjectAssetKind = "business-image" | "reference" | "logo";

const KINDS: readonly ProjectAssetKind[] = [
  "business-image",
  "reference",
  "logo",
];

// Display kinds go to the public S3 bucket; references go to the private
export const DISPLAY_KINDS: readonly ProjectAssetKind[] = [
  "business-image",
  "logo",
];

function isDisplayKind(kind: ProjectAssetKind): boolean {
  return (DISPLAY_KINDS as readonly string[]).includes(kind);
}

// S3 object key for a parsed asset ref —
function assetS3Key(parsed: ParsedProjectAssetRef): string {
  return `${S3_PREFIXES.asset}/${parsed.projectId}/${parsed.userId}/${parsed.kind}/${parsed.ulid}${parsed.ext ? `.${parsed.ext}` : ""}`;
}

const MAX_BYTES = 2 * 1024 * 1024;

export type ParsedProjectAssetRef = {
  ext: string | null;
  kind: ProjectAssetKind;
  projectId: string;
  ulid: string;
  userId: string;
};

export function createProjectAssetRef(
  projectId: string,
  kind: ProjectAssetKind,
  userId: string,
  ulid: string,
): string {
  assertSafeProjectId(projectId);
  assertKind(kind);
  assertSafeUserId(userId);
  assertUlid(ulid);
  return `${S3_REF_PREFIX}${projectId}/${userId}/${kind}/${ulid}`;
}

export function parseProjectAssetRef(
  ref: string,
): ParsedProjectAssetRef | null {
  // s3-private: starts with s3: — check the longer prefix first.
  const isS3Private = ref.startsWith(S3_PRIVATE_REF_PREFIX);
  const isS3 = !isS3Private && ref.startsWith(S3_REF_PREFIX);
  if (!isS3 && !isS3Private) {
    return null;
  }
  const prefix = isS3Private ? S3_PRIVATE_REF_PREFIX : S3_REF_PREFIX;
  const rest = ref.slice(prefix.length);
  const parts = rest.split("/");
  if (parts.length !== 4) {
    return null;
  }
  const [projectId, userId, kind, fileSegment] = parts as [
    string,
    string,
    string,
    string,
  ];
  if (
    !isValidProjectId(projectId) ||
    !isValidUserId(userId) ||
    !isKnownKind(kind)
  ) {
    return null;
  }
  // The file segment is <ulid>.<ext> written by writeProjectAsset, or a bare
  const parsed = parseFileSegment(fileSegment);
  if (!parsed || !isValidUlid(parsed.ulid)) {
    return null;
  }
  return {
    ext: parsed.ext,
    kind: kind as ProjectAssetKind,
    projectId,
    ulid: parsed.ulid,
    userId,
  };
}

function parseFileSegment(
  fileSegment: string,
): { ext: string | null; ulid: string } | null {
  const dot = fileSegment.lastIndexOf(".");
  if (dot === -1) {
    return { ext: null, ulid: fileSegment };
  }
  if (dot === 0) {
    return null;
  }
  const ulid = fileSegment.slice(0, dot);
  const ext = fileSegment.slice(dot + 1).toLowerCase();
  if (!isKnownImageExt(ext)) {
    return null;
  }
  return { ext, ulid };
}

function isKnownImageExt(ext: string): boolean {
  return ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp";
}

export async function writeProjectAsset({
  bytes,
  kind,
  projectId,
  userId,
}: {
  bytes: Buffer;
  kind: ProjectAssetKind;
  projectId: string;
  userId: string;
}): Promise<{ publicUrl: string | null; ref: string }> {
  assertSafeProjectId(projectId);
  assertKind(kind);
  assertSafeUserId(userId);

  if (bytes.length > MAX_BYTES) {
    throw new Error(`Project asset exceeds size limit (${MAX_BYTES} bytes).`);
  }

  const rawFormat = detectImageFormat(bytes);
  if (!rawFormat) {
    throw new Error(
      "Invalid project asset: not a supported image (PNG/JPEG/WEBP).",
    );
  }

  let finalBytes = bytes;
  let finalFormat: string = rawFormat;
  try {
    const optimized = await optimizeImageToWebp(bytes);
    finalBytes = optimized.bytes;
    finalFormat = optimized.format;
  } catch {
    // fallback to original bytes on error
  }

  const ulid = randomUUID().replace(/-/g, "");
  const relativeKey = `${S3_PREFIXES.asset}/${projectId}/${userId}/${kind}/${ulid}.${finalFormat}`;

  const provider = getStorageProvider();
  void provider; // single path now; kept for future local/cloud gating if needed

  // Display media (business-image/logo) go to the public S3 bucket and get a
  if (isDisplayKind(kind)) {
    await putS3Object(
      "public",
      relativeKey,
      finalBytes,
      FORMAT_CONTENT_TYPES[finalFormat as keyof typeof FORMAT_CONTENT_TYPES] ||
        "image/webp",
    );
    return {
      publicUrl: publicUrlFor("public", relativeKey),
      ref: `${S3_REF_PREFIX}${projectId}/${userId}/${kind}/${ulid}.${finalFormat}`,
    };
  }
  await putS3Object(
    "private",
    relativeKey,
    finalBytes,
    FORMAT_CONTENT_TYPES[finalFormat as keyof typeof FORMAT_CONTENT_TYPES] ||
      "image/webp",
  );
  return {
    publicUrl: null,
    ref: `${S3_PRIVATE_REF_PREFIX}${projectId}/${userId}/${kind}/${ulid}.${finalFormat}`,
  };
}

export async function readProjectAsset(
  ref: string,
): Promise<{ body: Buffer; contentType: string }> {
  const parsed = parseProjectAssetRefOrThrow(ref);
  const key = assetS3Key(parsed);
  if (ref.startsWith(S3_PRIVATE_REF_PREFIX)) {
    const body = await getS3Object("private", key);
    return {
      body,
      contentType: parsed.ext
        ? contentTypeForExt(parsed.ext)
        : "application/octet-stream",
    };
  }
  const body = await getS3Object("public", key);
  return {
    body,
    contentType: parsed.ext
      ? contentTypeForExt(parsed.ext)
      : "application/octet-stream",
  };
}

export async function deleteProjectAsset(ref: string): Promise<void> {
  const parsed = parseProjectAssetRefOrThrow(ref);
  const key = assetS3Key(parsed);
  if (ref.startsWith(S3_PRIVATE_REF_PREFIX)) {
    await deleteS3Object("private", key);
    return;
  }
  await deleteS3Object("public", key);
}

function parseProjectAssetRefOrThrow(ref: string): ParsedProjectAssetRef {
  const parsed = parseProjectAssetRef(ref);
  if (!parsed) {
    throw new Error("Invalid project asset ref.");
  }
  return parsed;
}

function contentTypeForExt(ext: string): string {
  if (ext === "png") {
    return FORMAT_CONTENT_TYPES.png;
  }
  if (ext === "jpg" || ext === "jpeg") {
    return FORMAT_CONTENT_TYPES.jpeg;
  }
  if (ext === "webp") {
    return FORMAT_CONTENT_TYPES.webp;
  }
  return "application/octet-stream";
}

export { detectImageFormat } from "@/lib/storage/images/format";

function assertSafeProjectId(projectId: string): void {
  if (!isValidProjectId(projectId)) {
    throw new Error("Invalid project id for asset.");
  }
}

function isValidProjectId(projectId: string): boolean {
  return /^[A-Za-z0-9_-]{1,160}$/.test(projectId);
}

function assertSafeUserId(userId: string): void {
  if (!isValidUserId(userId)) {
    throw new Error("Invalid user id for asset.");
  }
}

function isValidUserId(userId: string): boolean {
  return /^[A-Za-z0-9_-]{1,160}$/.test(userId);
}

function assertKind(kind: ProjectAssetKind): void {
  if (!isKnownKind(kind)) {
    throw new Error(`Invalid project asset kind: ${kind}`);
  }
}

function isKnownKind(kind: string): boolean {
  return (KINDS as readonly string[]).includes(kind);
}

function assertUlid(ulid: string): void {
  if (!isValidUlid(ulid)) {
    throw new Error("Invalid project asset id.");
  }
}

function isValidUlid(ulid: string): boolean {
  return /^[A-Za-z0-9]{1,64}$/.test(ulid);
}

export type ProjectAssetItem = {
  id: string;
  purpose: string;
  contentType: string;
  sizeBytes: number;
  publicUrl: string | null;
  mediaUrl: string;
  createdAt: string;
  isUsed: boolean;
};

export async function listProjectBusinessImagesForDiscussion(
  projectId: string,
  userId: string,
  client = defaultPrisma,
) {
  return client.projectAsset.findMany({
    orderBy: { createdAt: "asc" },
    select: { contentType: true, id: true },
    where: { projectId, purpose: "business-image", userId },
  });
}

export async function filterOwnedBusinessAssetIds(
  assetIds: string[],
  projectId: string,
  userId: string,
  client = defaultPrisma,
): Promise<string[]> {
  const uniqueAssetIds = [
    ...new Set(assetIds.filter((assetId) => assetId.length > 0)),
  ];
  if (uniqueAssetIds.length === 0) {
    return [];
  }

  const assets = await client.projectAsset.findMany({
    select: { id: true },
    where: {
      id: { in: uniqueAssetIds },
      projectId,
      purpose: "business-image",
      userId,
    },
  });
  const ownedIds = new Set(assets.map((asset) => asset.id));
  return uniqueAssetIds.filter((assetId) => ownedIds.has(assetId));
}

export async function listProjectAssetsWithUsage(
  projectId: string,
  client = defaultPrisma,
): Promise<{
  assets: ProjectAssetItem[];
  count: number;
  maxBytes: number;
  maxCount: number;
  totalBytes: number;
}> {
  const assets = await client.projectAsset.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      purpose: true,
      contentType: true,
      sizeBytes: true,
      publicUrl: true,
      createdAt: true,
      ref: true,
    },
  });

  const latestSnapshot = await client.projectSnapshot.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: { files: true },
  });

  let siteContent = "";
  if (latestSnapshot?.files && Array.isArray(latestSnapshot.files)) {
    const rawFiles = latestSnapshot.files as Array<{
      path?: string;
      content?: string;
    }>;
    siteContent = rawFiles
      .filter((f) => f.path?.endsWith(".ts") || f.path?.endsWith(".tsx"))
      .map((f) => f.content || "")
      .join("\n");
  }

  const items: ProjectAssetItem[] = assets.map((asset) => {
    const isUsed =
      siteContent.includes(asset.id) ||
      (asset.publicUrl ? siteContent.includes(asset.publicUrl) : false);

    return {
      id: asset.id,
      purpose: asset.purpose,
      contentType: asset.contentType,
      sizeBytes: asset.sizeBytes,
      publicUrl: asset.publicUrl,
      mediaUrl: `/api/projects/${projectId}/asset/${asset.id}`,
      createdAt: asset.createdAt.toISOString(),
      isUsed,
    };
  });

  const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);

  return {
    assets: items,
    count: items.length,
    maxBytes: 8 * 1024 * 1024,
    maxCount: 10,
    totalBytes,
  };
}

export async function deleteProjectAssetById(
  {
    assetId,
    projectId,
    userId,
  }: {
    assetId: string;
    projectId: string;
    userId: string;
  },
  client = defaultPrisma,
): Promise<boolean> {
  const asset = await client.projectAsset.findFirst({
    where: { id: assetId, projectId, userId },
    select: { id: true, ref: true },
  });
  if (!asset) {
    return false;
  }

  try {
    await deleteProjectAsset(asset.ref);
  } catch {
    // S3 object may already be deleted or missing
  }

  await client.projectAsset.delete({
    where: { id: asset.id },
  });
  return true;
}
