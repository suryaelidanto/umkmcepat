import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { getEnv, requireEnv } from "@/lib/config";

import type {
  StorageProvider,
  UploadInput,
  UploadResult,
} from "@/lib/storage/types";

export function createS3StorageProvider(): StorageProvider {
  const bucket = requireEnv("S3_BUCKET", { feature: "S3-compatible storage" });
  const publicBaseUrl = requireEnv("S3_PUBLIC_BASE_URL", {
    feature: "S3-compatible storage",
  }).replace(/\/$/, "");

  const client = new S3Client({
    endpoint: getEnv("S3_ENDPOINT") || undefined,
    region: getEnv("S3_REGION", "auto"),
    credentials: {
      accessKeyId: requireEnv("S3_ACCESS_KEY_ID", {
        feature: "S3-compatible storage",
      }),
      secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY", {
        feature: "S3-compatible storage",
      }),
    },
    forcePathStyle: getEnv("S3_FORCE_PATH_STYLE", "false") === "true",
  });

  return {
    async upload(input: UploadInput): Promise<UploadResult> {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: input.key,
          Body: input.buffer,
          ContentType: input.contentType || "application/octet-stream",
        }),
      );

      return {
        key: input.key,
        url: `${publicBaseUrl}/${input.key}`,
      };
    },

    async delete(keys: string[]): Promise<void> {
      await Promise.allSettled(
        keys
          .filter(Boolean)
          .map((key) =>
            client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
          ),
      );
    },
  };
}
