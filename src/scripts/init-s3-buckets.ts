/* eslint-disable no-console */
import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { getEnv } from "@/lib/config";
import { getStorageProvider } from "@/lib/storage-provider";

// Anonymous-read policy for the PUBLIC bucket only (display media is public by
// design). Private bucket gets no policy → only signed requests read it.
const PUBLIC_READ_POLICY = JSON.stringify({
  Statement: [
    {
      Effect: "Allow",
      Principal: "*",
      Action: "s3:GetObject",
      Resource: "arn:aws:s3:::${PUBLIC_BUCKET}/*",
    },
  ],
  Version: "2012-10-17",
});

export async function ensureS3Buckets(): Promise<void> {
  // Only auto-create under the local (MinIO) provider — R2 buckets are
  // created manually in the Cloudflare dashboard (managed infra).
  if (getStorageProvider() !== "local") {
    return;
  }
  const accessKeyId = getEnv("MINIO_ROOT_USER", "umkmcepat");
  const secretAccessKey = getEnv("MINIO_ROOT_PASSWORD", "umkmcepat");
  const endpoint = getEnv("S3_ENDPOINT", "http://localhost:9000");
  const publicBucket = getEnv("S3_PUBLIC_BUCKET");
  const privateBucket = getEnv("S3_PRIVATE_BUCKET");

  const client = new S3Client({
    credentials: { accessKeyId, secretAccessKey },
    endpoint,
    forcePathStyle: true,
    region: getEnv("S3_REGION", "us-east-1"),
  });

  for (const bucket of [publicBucket, privateBucket]) {
    if (!bucket) {
      throw new Error(
        `Missing bucket name while initializing S3: ${bucket || "(empty)"}`,
      );
    }
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      // BucketAlreadyOwnedByYou = already exists; idempotent. Anything else rethrows.
      const name =
        error instanceof Error && "name" in error
          ? String((error as { name: string }).name)
          : "";
      if (name !== "BucketAlreadyOwnedByYou") {
        throw error;
      }
    }
  }

  // Grant anonymous-read on the public bucket only.
  const policy = PUBLIC_READ_POLICY.replace("${PUBLIC_BUCKET}", publicBucket);
  await client.send(
    new PutBucketPolicyCommand({ Bucket: publicBucket, Policy: policy }),
  );
}

// Run directly: `bun src/scripts/init-s3-buckets.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  ensureS3Buckets()
    .then(() => {
      console.log("s3 buckets ready");
      process.exit(0);
    })
    .catch((error) => {
      console.error("s3 bucket init failed:", error);
      process.exit(1);
    });
}
