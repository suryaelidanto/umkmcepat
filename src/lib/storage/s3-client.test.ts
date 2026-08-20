import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getS3Config, publicUrlFor } from "@/lib/storage/s3-client";

const BASE_ENV = {
  STORAGE_PROVIDER: "r2",
  S3_ACCOUNT_ID: "acct",
  S3_ACCESS_KEY_ID: "AKIA-test",
  S3_SECRET_ACCESS_KEY: "shh",
  S3_PUBLIC_BUCKET: "pub",
  S3_PRIVATE_BUCKET: "priv",
  S3_PUBLIC_BASE_URL: "https://media.test",
};

describe("s3-client config", () => {
  const stash: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const [k, v] of Object.entries(BASE_ENV)) {
      stash[k] = process.env[k];
      process.env[k] = v;
    }
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(stash)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  });

  it("r2: derives the R2 virtual-host endpoint, no path style", async () => {
    delete process.env.S3_ENDPOINT;
    const { client, bucket } = getS3Config("public");
    expect(bucket).toBe("pub");
    // AWS SDK stores region as an async resolver; assert via the client's config.
    const region = await (
      client as unknown as { config: { region: () => Promise<string> } }
    ).config.region();
    expect(region).toBe("auto");
    // Endpoint is also an async resolver; the R2 host must be auto-derived
    const endpoint = await (
      client as unknown as {
        config: { endpoint: () => Promise<{ hostname: string }> };
      }
    ).config.endpoint();
    expect(endpoint.hostname).toBe("acct.r2.cloudflarestorage.com");
  });

  it("r2: prefers an explicit S3_ENDPOINT over accountId derivation", async () => {
    process.env.S3_ENDPOINT = "https://custom.example.com";
    const { client } = getS3Config("public");
    const endpoint = await (
      client as unknown as {
        config: { endpoint: () => Promise<{ hostname: string }> };
      }
    ).config.endpoint();
    expect(endpoint.hostname).toBe("custom.example.com");
  });

  it("r2: throws when S3_ENDPOINT is empty and S3_ACCOUNT_ID is missing", () => {
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_ACCOUNT_ID;
    expect(() => getS3Config("public")).toThrow(/S3_ACCOUNT_ID/);
  });

  it("local: uses S3_ENDPOINT + forcePathStyle", async () => {
    process.env.STORAGE_PROVIDER = "local";
    process.env.S3_ENDPOINT = "http://localhost:9000";
    process.env.S3_REGION = "us-east-1";
    const { client, bucket } = getS3Config("private");
    expect(bucket).toBe("priv");
    expect(
      (client as unknown as { config: { forcePathStyle: boolean } }).config
        .forcePathStyle,
    ).toBe(true);
    const region = await (
      client as unknown as { config: { region: () => Promise<string> } }
    ).config.region();
    expect(region).toBe("us-east-1");
  });

  it("throws when a required var is missing", () => {
    delete process.env.S3_SECRET_ACCESS_KEY;
    expect(() => getS3Config("public")).toThrow(/S3_SECRET_ACCESS_KEY/);
  });

  it("publicUrlFor builds the browser-direct URL for the public bucket", () => {
    const url = publicUrlFor("public", "project-assets/p/u/logo/abc.png");
    expect(url).toBe("https://media.test/project-assets/p/u/logo/abc.png");
  });

  it("publicUrlFor throws when S3_PUBLIC_BASE_URL is empty", () => {
    delete process.env.S3_PUBLIC_BASE_URL;
    expect(() => publicUrlFor("public", "x")).toThrow(/S3_PUBLIC_BASE_URL/);
  });
});

// Live round-trip against real R2 (env-gated). Off by default + CI.
const LIVE = process.env.S3_LIVE_TEST === "1";
describe.skipIf(!LIVE)("s3-client live round-trip", () => {
  it("PUTs, GETs, DELETEs a test object against the configured provider", async () => {
    const { putS3Object, getS3Object, deleteS3Object } =
      await import("@/lib/storage/s3-client");
    const key = "__selftest/round-trip-live.txt";
    const body = Buffer.from("s3-client live self-check");
    try {
      await putS3Object("public", key, body, "text/plain");
      const got = await getS3Object("public", key);
      expect(got.toString("utf8")).toBe(body.toString("utf8"));
    } finally {
      await deleteS3Object("public", key);
    }
  });
});
