import {
  detectImageFormat,
  EXT_CONTENT_TYPE,
} from "@/lib/storage/images/format";
import { getS3Object, putS3Object, S3_PREFIXES } from "@/lib/storage/s3-client";

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
const S3_REF_PREFIX = `${OBJECT_REF_PREFIX}s3:`;
// Pre-S3-unification local refs still live in some waitlist rows; same private
// bucket + key layout as object:s3:.
const LOCAL_REF_PREFIX = `${OBJECT_REF_PREFIX}local:`;

export async function getStoredObject(
  ref: string,
): Promise<StoredObject | null> {
  let rawKey: string | null = null;
  if (ref.startsWith(S3_REF_PREFIX)) {
    rawKey = ref.slice(S3_REF_PREFIX.length);
  } else if (ref.startsWith(LOCAL_REF_PREFIX)) {
    rawKey = ref.slice(LOCAL_REF_PREFIX.length);
  } else {
    return null;
  }
  try {
    const key = normalizeObjectKey(rawKey);
    const body = await getS3Object("private", prefixedKey(key));
    // Derive Content-Type from the actual bytes, not the key extension:
    // older uploads hardcode .png in the key regardless of real format, so
    // trusting the extension serves JPEG bytes as image/png. With nosniff
    // set on the response, the browser then refuses to render the <img>.
    const format = detectImageFormat(body);
    return {
      body,
      contentType: format ? EXT_CONTENT_TYPE[format] : contentTypeFromKey(key),
    };
  } catch {
    return null;
  }
}

export async function putStoredObject(input: UploadObjectInput) {
  const key = normalizeObjectKey(input.key);
  await putS3Object("private", prefixedKey(key), input.body, input.contentType);
  return `${S3_REF_PREFIX}${key}`;
}

function prefixedKey(key: string) {
  return `${S3_PREFIXES.object}/${key}`;
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

function normalizeObjectKey(key: string) {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");

  if (
    !normalized ||
    normalized.includes("..") ||
    isAbsolute(normalized) ||
    !/^[A-Za-z0-9/_-]+\.(png|jpg|jpeg|webp)$/.test(normalized)
  ) {
    throw new Error("Object storage key tidak valid.");
  }

  return normalized;
}

function isAbsolute(p: string) {
  return p.startsWith("/");
}
