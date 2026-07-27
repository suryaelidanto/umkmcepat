import { GetBucketLocationCommand } from "@aws-sdk/client-s3";

import { getS3Config } from "@/lib/s3-client";

export async function assertProjectArtifactStorageReady() {
  const config = getS3Config("public");
  try {
    await config.client.send(
      new GetBucketLocationCommand({ Bucket: config.bucket }),
    );
  } catch (error) {
    throw new Error(
      `S3 storage is not reachable: ${
        error instanceof Error ? error.message : "probe failed"
      }`,
    );
  }
}
