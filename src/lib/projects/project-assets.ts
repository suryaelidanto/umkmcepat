import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const REF_PREFIX = "project-asset:local:";

export type ProjectAssetKind = "business-image" | "reference" | "logo";

const KINDS: readonly ProjectAssetKind[] = [
  "business-image",
  "reference",
  "logo",
];

const MAX_BYTES = 5 * 1024 * 1024;

type ImageFormat = "png" | "jpeg" | "webp";

const FORMAT_CONTENT_TYPES: Record<ImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export type ProjectAssetOptions = { rootDir?: string };

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
  return `${REF_PREFIX}${projectId}/${userId}/${kind}/${ulid}`;
}

export function parseProjectAssetRef(
  ref: string,
): ParsedProjectAssetRef | null {
  if (!ref.startsWith(REF_PREFIX)) {
    return null;
  }
  const rest = ref.slice(REF_PREFIX.length);
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
  // ulid from other ref producers. When an extension is present it must be a
  // known image ext; we carry it forward so read/delete resolve the exact
  // on-disk file instead of guessing by extension order.
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

function extToFormat(ext: string): ImageFormat {
  if (ext === "png") {
    return "png";
  }
  if (ext === "webp") {
    return "webp";
  }
  return "jpeg";
}

export async function writeProjectAsset({
  bytes,
  kind,
  projectId,
  rootDir,
  userId,
}: {
  bytes: Buffer;
  kind: ProjectAssetKind;
  projectId: string;
  rootDir?: string;
  userId: string;
}): Promise<string> {
  assertSafeProjectId(projectId);
  assertKind(kind);
  assertSafeUserId(userId);

  if (bytes.length > MAX_BYTES) {
    throw new Error(`Project asset exceeds size limit (${MAX_BYTES} bytes).`);
  }

  const format = detectImageFormat(bytes);
  if (!format) {
    throw new Error(
      "Invalid project asset: not a supported image (PNG/JPEG/WEBP).",
    );
  }

  const ulid = randomUUID().replace(/-/g, "");
  const root = resolveRoot(rootDir);
  const target = path.join(root, projectId, userId, kind, `${ulid}.${format}`);

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });

  return `${REF_PREFIX}${projectId}/${userId}/${kind}/${ulid}.${format}`;
}

export async function readProjectAsset(
  ref: string,
  { rootDir }: ProjectAssetOptions = {},
): Promise<{ body: Buffer; contentType: string }> {
  const parsed = parseProjectAssetRefOrThrow(ref);
  const filePath = await resolveExistingAssetPath(parsed, rootDir);
  if (!filePath) {
    throw new Error("Project asset not found.");
  }
  const body = await readFile(filePath);
  return { body, contentType: contentTypeForPath(filePath) };
}

export async function deleteProjectAsset(
  ref: string,
  { rootDir }: ProjectAssetOptions = {},
): Promise<void> {
  const parsed = parseProjectAssetRefOrThrow(ref);
  // If the ref carries the format (the normal writeProjectAsset case), delete
  // the exact file. Otherwise probe each format so legacy/bare refs still clean.
  const candidates = resolveCandidatePaths(parsed, rootDir);
  await Promise.all(
    candidates.map((candidate) => rm(candidate, { force: true })),
  );
}

function parseProjectAssetRefOrThrow(ref: string): ParsedProjectAssetRef {
  const parsed = parseProjectAssetRef(ref);
  if (!parsed) {
    throw new Error("Invalid project asset ref.");
  }
  return parsed;
}

function resolveCandidatePaths(
  parsed: ParsedProjectAssetRef,
  rootDir?: string,
): string[] {
  const root = resolveRoot(rootDir);
  const formats = parsed.ext
    ? [extToFormat(parsed.ext)]
    : (Object.keys(FORMAT_CONTENT_TYPES) as ImageFormat[]);
  const candidates: string[] = [];
  for (const format of formats) {
    const candidate = path.join(
      root,
      parsed.projectId,
      parsed.userId,
      parsed.kind,
      `${parsed.ulid}.${format}`,
    );
    if (isWithinRoot(candidate, root)) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

async function resolveExistingAssetPath(
  parsed: ParsedProjectAssetRef,
  rootDir?: string,
): Promise<string | null> {
  const { existsSync } = await import("node:fs");
  for (const candidate of resolveCandidatePaths(parsed, rootDir)) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function contentTypeForPath(filePath: string): string {
  if (filePath.endsWith(".png")) {
    return FORMAT_CONTENT_TYPES.png;
  }
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) {
    return FORMAT_CONTENT_TYPES.jpeg;
  }
  if (filePath.endsWith(".webp")) {
    return FORMAT_CONTENT_TYPES.webp;
  }
  return "application/octet-stream";
}

function isWithinRoot(filePath: string, root: string): boolean {
  const resolved = path.resolve(filePath);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

function resolveRoot(rootDir?: string): string {
  return path.resolve(
    rootDir || process.env.PROJECT_ASSET_DIR || ".data/project-assets",
  );
}

function detectImageFormat(bytes: Buffer): ImageFormat | null {
  if (bytes.length < 12) {
    return null;
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

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
