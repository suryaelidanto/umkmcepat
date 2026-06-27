import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { getEnv } from "@/lib/config";

export type StoredObject = {
  body: Buffer;
  contentType: string;
};

export type UploadObjectInput = {
  body: Buffer;
  contentType: string;
  key: string;
};

const OBJECT_REF_PREFIX = "object:";
const LOCAL_REF_PREFIX = `${OBJECT_REF_PREFIX}local:`;
type ObjectStorageProvider = "local" | "r2";

export function getObjectStorageProvider(): ObjectStorageProvider {
  const provider = getEnv("OBJECT_STORAGE_PROVIDER", "local").toLowerCase();

  if (provider === "local" || provider === "r2") {
    return provider;
  }

  throw new Error(
    `Invalid OBJECT_STORAGE_PROVIDER '${provider}'. Supported values: local, r2.`,
  );
}

export function isObjectStorageRef(value: unknown) {
  return typeof value === "string" && value.startsWith(OBJECT_REF_PREFIX);
}

export async function getStoredObject(
  ref: string,
): Promise<StoredObject | null> {
  if (ref.startsWith(LOCAL_REF_PREFIX)) {
    const key = ref.slice(LOCAL_REF_PREFIX.length);
    const filePath = resolveLocalObjectPath(key);
    const body = await readFile(filePath).catch(() => null);

    if (!body) {
      return null;
    }

    return { body, contentType: contentTypeFromKey(key) };
  }

  if (ref.startsWith(`${OBJECT_REF_PREFIX}r2:`)) {
    throw new Error("R2 object storage belum aktif di runtime ini.");
  }

  return null;
}

export async function putStoredObject(input: UploadObjectInput) {
  const provider = getObjectStorageProvider();

  if (provider === "r2") {
    throw new Error(
      "OBJECT_STORAGE_PROVIDER=r2 sudah disiapkan, tapi adapter R2 belum diaktifkan. Pakai local dulu atau tambahkan SDK R2.",
    );
  }

  const key = normalizeObjectKey(input.key);
  const filePath = resolveLocalObjectPath(key);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, input.body);

  return `${LOCAL_REF_PREFIX}${key}`;
}

export async function replaceStoredObject(input: UploadObjectInput) {
  const key = normalizeObjectKey(input.key);
  const dir = path.dirname(resolveLocalObjectPath(key));

  await rm(dir, { force: true, recursive: true }).catch(() => undefined);
  return putStoredObject({ ...input, key });
}

function contentTypeFromKey(key: string) {
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (key.endsWith(".webp")) {
    return "image/webp";
  }

  return "image/png";
}

function getLocalUploadRoot() {
  return path.resolve(getEnv("LOCAL_UPLOAD_DIR", ".data/uploads"));
}

function normalizeObjectKey(key: string) {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");

  if (
    !normalized ||
    normalized.includes("..") ||
    path.isAbsolute(normalized) ||
    !/^[A-Za-z0-9/_-]+\.(png|jpg|jpeg|webp)$/.test(normalized)
  ) {
    throw new Error("Object storage key tidak valid.");
  }

  return normalized;
}

function resolveLocalObjectPath(key: string) {
  const root = getLocalUploadRoot();
  const normalized = normalizeObjectKey(key);
  const filePath = path.resolve(root, normalized);

  if (!filePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Object storage path keluar dari folder upload.");
  }

  return filePath;
}
