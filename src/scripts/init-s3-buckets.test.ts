import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn(async () => undefined);
const clientConfigs: unknown[] = [];

vi.mock("@aws-sdk/client-s3", () => ({
  CreateBucketCommand: vi.fn(function CreateBucketCommand(input: unknown) {
    return { input };
  }),
  PutBucketPolicyCommand: vi.fn(function PutBucketPolicyCommand(
    input: unknown,
  ) {
    return { input };
  }),
  S3Client: vi.fn(function S3Client(config: unknown) {
    clientConfigs.push(config);
    return { send };
  }),
}));

describe("ensureS3Buckets", () => {
  const stash: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.resetModules();
    send.mockClear();
    clientConfigs.length = 0;
    for (const [key, value] of Object.entries({
      MINIO_ROOT_PASSWORD: "minio-secret",
      MINIO_ROOT_USER: "minio-user",
      S3_ENDPOINT: "http://localhost:9000",
      S3_PRIVATE_BUCKET: "private-bucket",
      S3_PUBLIC_BUCKET: "public-bucket",
      STORAGE_PROVIDER: "local",
    })) {
      stash[key] = process.env[key];
      process.env[key] = value;
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(stash)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("uses MinIO root credentials for local bucket setup", async () => {
    const { ensureS3Buckets } = await import("@/scripts/init-s3-buckets");

    await ensureS3Buckets();

    expect(clientConfigs[0]).toMatchObject({
      credentials: {
        accessKeyId: "minio-user",
        secretAccessKey: "minio-secret",
      },
    });
  });
});
