import { randomUUID } from "node:crypto";

import { signTempImageToken, verifyTempImageToken } from "./temp-image-token";

import {
  contentTypeFromExt,
  detectImageFormat,
} from "@/lib/storage/images/format";
import {
  copyS3Object,
  deleteS3Object,
  getS3Object,
  listS3Keys,
  putS3Object,
} from "@/lib/storage/s3-client";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TEMP_IMAGE_TTL_MS = 60 * 60 * 1000;

export type TempImageUpload = {
  assetId: string;
  url: string;
};

export async function uploadTempImage(
  userId: string,
  file: File,
): Promise<TempImageUpload> {
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("Ukuran gambar maksimal 5 MB per file.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const format = detectImageFormat(bytes);
  if (!format || format === "gif") {
    throw new Error(
      "Format gambar tidak didukung. Gunakan PNG, JPEG, atau WEBP.",
    );
  }

  await cleanupExpiredTempImages(userId);

  const contentType = contentTypeFromExt(format);
  const expiresAt = Date.now() + TEMP_IMAGE_TTL_MS;
  const key = `temp-uploads/${userId}/${expiresAt}/${randomUUID()}.${format === "jpeg" ? "jpg" : format}`;

  await putS3Object("private", key, bytes, contentType);

  const assetId = signTempImageToken({
    contentType,
    expiresAt,
    key,
    sizeBytes: bytes.length,
    userId,
  });

  return {
    assetId,
    url: `/api/uploads/temp-images/${encodeURIComponent(assetId)}`,
  };
}

export async function readTempImage(userId: string, assetId: string) {
  const payload = verifyOwnedTempImage(userId, assetId);
  return {
    body: await getS3Object("private", payload.key),
    contentType: payload.contentType,
  };
}

export async function deleteTempImage(
  userId: string,
  assetId: string,
): Promise<void> {
  const payload = verifyTempImageToken(assetId);
  if (!payload || payload.userId !== userId) {
    return;
  }
  if (!payload.key.startsWith(`temp-uploads/${userId}/`)) {
    return;
  }
  await deleteS3Object("private", payload.key).catch(() => undefined);
}

export async function claimTempImage(userId: string, assetId: string) {
  const payload = verifyOwnedTempImage(userId, assetId);
  const body = await getS3Object("private", payload.key);
  await deleteS3Object("private", payload.key).catch(() => undefined);
  return {
    body,
    contentType: payload.contentType,
    sizeBytes: payload.sizeBytes,
  };
}

export async function copyClaimTempImage(
  userId: string,
  assetId: string,
  finalKey: string,
) {
  const payload = verifyOwnedTempImage(userId, assetId);
  await copyS3Object("private", payload.key, finalKey);
  await deleteS3Object("private", payload.key).catch(() => undefined);
  return {
    contentType: payload.contentType,
    ref: finalKey,
    sizeBytes: payload.sizeBytes,
  };
}

export async function cleanupExpiredTempImages(
  userId: string,
  nowMs = Date.now(),
): Promise<void> {
  const prefix = `temp-uploads/${userId}/`;
  const keys = await listS3Keys("private", prefix).catch(() => []);
  await Promise.all(
    keys.map(async (key) => {
      const expiresAt = Number(key.slice(prefix.length).split("/")[0]);
      if (Number.isFinite(expiresAt) && expiresAt <= nowMs) {
        await deleteS3Object("private", key).catch(() => undefined);
      }
    }),
  );
}

function verifyOwnedTempImage(userId: string, assetId: string) {
  const payload = verifyTempImageToken(assetId);
  if (!payload || payload.userId !== userId) {
    throw new Error("Gambar tidak valid.");
  }
  if (payload.expiresAt <= Date.now()) {
    throw new Error("Upload gambar sudah kedaluwarsa. Pilih gambar lagi.");
  }
  if (!payload.key.startsWith(`temp-uploads/${userId}/`)) {
    throw new Error("Gambar tidak valid.");
  }
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(payload.contentType)
  ) {
    throw new Error("Gambar tidak valid.");
  }
  if (payload.sizeBytes <= 0 || payload.sizeBytes > MAX_IMAGE_BYTES) {
    throw new Error("Gambar tidak valid.");
  }
  return payload;
}
