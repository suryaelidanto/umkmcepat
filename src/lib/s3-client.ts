import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { getEnv } from "@/lib/config";
import { getStorageProvider } from "@/lib/storage-provider";

export type S3ClientConfig = {
  bucket: string;
  client: S3Client;
};

export function getS3Config(bucket: "public" | "private"): S3ClientConfig {
  const provider = getStorageProvider();
  const bucketEnv =
    bucket === "public" ? "S3_PUBLIC_BUCKET" : "S3_PRIVATE_BUCKET";
  const accessKeyId = requiredEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("S3_SECRET_ACCESS_KEY");
  // R2 only accepts region "auto"; ignore any S3_REGION override to avoid
  // signature/path-style mismatches against the virtual-host endpoint.
  const region = provider === "r2" ? "auto" : getEnv("S3_REGION", "us-east-1");

  let endpoint = getEnv("S3_ENDPOINT").trim();
  if (!endpoint && provider === "r2") {
    const accountId = requiredEnv("S3_ACCOUNT_ID");
    endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  }

  const client = new S3Client({
    credentials: { accessKeyId, secretAccessKey },
    endpoint: endpoint || undefined,
    forcePathStyle: provider === "local",
    region,
  });

  return { bucket: requiredEnv(bucketEnv), client };
}

export function publicUrlFor(_bucket: "public", key: string): string {
  const base = getEnv("S3_PUBLIC_BASE_URL");
  if (!base) {
    throw new Error(
      "S3_PUBLIC_BASE_URL is required for public display-media URLs.",
    );
  }
  return `${base.replace(/\/+$/, "")}/${key}`;
}

export async function putS3Object(
  bucket: "public" | "private",
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const { client, bucket: name } = getS3Config(bucket);
  await client.send(
    new PutObjectCommand({
      Body: new Uint8Array(body),
      Bucket: name,
      ContentType: contentType,
      Key: key,
    }),
  );
}

export async function getS3Object(
  bucket: "public" | "private",
  key: string,
): Promise<Buffer> {
  const { client, bucket: name } = getS3Config(bucket);
  const res = await client.send(
    new GetObjectCommand({ Bucket: name, Key: key }),
  );
  if (!res.Body) {
    throw new Error(`S3 object read failed: empty body for ${key}`);
  }
  return Buffer.from(await res.Body.transformToByteArray());
}

export async function deleteS3Object(
  bucket: "public" | "private",
  key: string,
): Promise<void> {
  const { client, bucket: name } = getS3Config(bucket);
  try {
    await client.send(new DeleteObjectCommand({ Bucket: name, Key: key }));
  } catch (error) {
    // NoSuchKey = already gone; treat as success. Anything else rethrows.
    const errName =
      error instanceof Error && "name" in error
        ? String((error as { name: string }).name)
        : "";
    if (errName !== "NoSuchKey" && !/NoSuchKey|404/i.test(String(error))) {
      throw error;
    }
  }
}

/**
 * Prefixes prepended to keys by callers. Single source of truth so ref/key
 * construction stays consistent across subsystems.
 *
 * @public — imported by object-storage.ts / runtime-artifacts.ts /
 * project-assets.ts / project-thumbnail.ts once Tasks 3-6 land.
 */
export const S3_PREFIXES = {
  artifact: "project-artifacts",
  asset: "project-assets",
  object: "objects",
  thumbnail: "project-thumbnails",
} as const;

function requiredEnv(name: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`${name} is required for S3 object storage.`);
  }
  return value;
}
