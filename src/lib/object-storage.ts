import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getEnv } from "@/lib/config";
import { getR2Config, signedR2Fetch } from "@/lib/r2-client";

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
const R2_REF_PREFIX = `${OBJECT_REF_PREFIX}r2:`;
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

  if (ref.startsWith(R2_REF_PREFIX)) {
    const key = ref.slice(R2_REF_PREFIX.length);
    return getR2StoredObject(normalizeObjectKey(key));
  }

  return null;
}

export async function putStoredObject(input: UploadObjectInput) {
  const provider = getObjectStorageProvider();
  const key = normalizeObjectKey(input.key);

  if (provider === "r2") {
    await putR2StoredObject(key, input.body, input.contentType);
    return `${R2_REF_PREFIX}${key}`;
  }

  const filePath = resolveLocalObjectPath(key);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, input.body);

  return `${LOCAL_REF_PREFIX}${key}`;
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

async function getR2StoredObject(key: string): Promise<StoredObject | null> {
  const config = r2Config();
  const response = await signedR2Fetch(config, key, { method: "GET" });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`R2 object read failed: ${response.status}`);
  }

  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: contentTypeFromKey(key),
  };
}

async function putR2StoredObject(
  key: string,
  body: Buffer,
  contentType: string,
) {
  const config = r2Config();
  const response = await signedR2Fetch(config, key, {
    body,
    contentType,
    method: "PUT",
  });

  if (!response.ok) {
    throw new Error(`R2 object write failed: ${response.status}`);
  }
}

function r2Config() {
  return getR2Config({
    prefixEnv: "OBJECT_STORAGE_R2_PREFIX",
    prefixFallback: "objects",
  });
}
