import { createHash, createHmac } from "node:crypto";
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

export async function replaceStoredObject(input: UploadObjectInput) {
  const key = normalizeObjectKey(input.key);

  if (getObjectStorageProvider() === "r2") {
    return putStoredObject({ ...input, key });
  }

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

type R2Config = {
  accessKeyId: string;
  accountId: string;
  bucket: string;
  prefix: string;
  secretAccessKey: string;
};

function getR2Config(): R2Config {
  return {
    accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
    accountId: requiredEnv("R2_ACCOUNT_ID"),
    bucket: requiredEnv("R2_BUCKET"),
    prefix: getEnv("OBJECT_STORAGE_R2_PREFIX", "objects").replace(
      /^\/+|\/+$/g,
      "",
    ),
    secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
  };
}

function requiredEnv(name: string) {
  const value = getEnv(name);

  if (!value) {
    throw new Error(`${name} is required for R2 object storage.`);
  }

  return value;
}

async function getR2StoredObject(key: string): Promise<StoredObject | null> {
  const config = getR2Config();
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
  const config = getR2Config();
  const response = await signedR2Fetch(config, key, {
    body,
    contentType,
    method: "PUT",
  });

  if (!response.ok) {
    throw new Error(`R2 object write failed: ${response.status}`);
  }
}

async function signedR2Fetch(
  config: R2Config,
  key: string,
  input: { body?: Buffer; contentType?: string; method: "GET" | "PUT" },
) {
  const objectKey = `${config.prefix}/${key}`;
  const encodedKey = objectKey
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const url = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${encodedKey}`;
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(input.body ?? Buffer.alloc(0));
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  if (input.contentType) {
    headers["content-type"] = input.contentType;
  }

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const canonicalRequest = [
    input.method,
    `/${config.bucket}/${encodedKey}`,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const signature = hmacHex(
    getSignatureKey(config.secretAccessKey, dateStamp),
    stringToSign,
  );

  return fetch(url, {
    body: input.body ? new Uint8Array(input.body) : undefined,
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    method: input.method,
  });
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function getSignatureKey(secret: string, dateStamp: string) {
  const dateKey = hmac(`AWS4${secret}`, dateStamp);
  const dateRegionKey = hmac(dateKey, "auto");
  const dateRegionServiceKey = hmac(dateRegionKey, "s3");
  return hmac(dateRegionServiceKey, "aws4_request");
}
