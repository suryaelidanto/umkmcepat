import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getR2Config, publicUrlFor, signedR2Fetch } from "@/lib/r2-client";

const BASE_ENV = {
  R2_ACCESS_KEY_ID: "AKIA-test",
  R2_ACCOUNT_ID: "acct",
  R2_PUBLIC_BUCKET: "umkmcepat-public",
  R2_PRIVATE_BUCKET: "umkmcepat-private",
  R2_PUBLIC_BASE_URL: "https://pub-test.r2.dev",
  R2_SECRET_ACCESS_KEY: "shh",
};

function setEnv(map: Record<string, string>) {
  for (const [k, v] of Object.entries(map)) {
    process.env[k] = v;
  }
}

describe("r2-client", () => {
  const stash: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of Object.keys(BASE_ENV)) {
      stash[k] = process.env[k];
    }
    setEnv(BASE_ENV);
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

  it("getR2Config reads required vars + public bucket", () => {
    const config = getR2Config({ bucket: "public", prefix: "objects" });
    expect(config).toMatchObject({
      accessKeyId: "AKIA-test",
      accountId: "acct",
      bucket: "umkmcepat-public",
      prefix: "objects",
      secretAccessKey: "shh",
    });
  });

  it("getR2Config selects the private bucket", () => {
    const config = getR2Config({ bucket: "private", prefix: "objects" });
    expect(config.bucket).toBe("umkmcepat-private");
  });

  it("getR2Config throws when the public bucket var is missing", () => {
    delete process.env.R2_PUBLIC_BUCKET;
    expect(() => getR2Config({ bucket: "public", prefix: "x" })).toThrow(
      /R2_PUBLIC_BUCKET/,
    );
  });

  it("getR2Config throws when the private bucket var is missing", () => {
    delete process.env.R2_PRIVATE_BUCKET;
    expect(() => getR2Config({ bucket: "private", prefix: "x" })).toThrow(
      /R2_PRIVATE_BUCKET/,
    );
  });

  it("publicUrlFor builds an absolute public URL with prefix", () => {
    const config = getR2Config({ bucket: "public", prefix: "project-assets" });
    expect(publicUrlFor(config, "proj1/owner1/business-image/abc.png")).toBe(
      "https://pub-test.r2.dev/project-assets/proj1/owner1/business-image/abc.png",
    );
  });

  it("publicUrlFor throws when R2_PUBLIC_BASE_URL is empty", () => {
    delete process.env.R2_PUBLIC_BASE_URL;
    const config = getR2Config({ bucket: "public", prefix: "x" });
    expect(() => publicUrlFor(config, "x")).toThrow(/R2_PUBLIC_BASE_URL/);
  });
});

// Env-gated live round-trip against the real public bucket. Off by
// default + in CI (no creds); run with R2_LIVE_TEST=1 to verify the real
// Sig V4 + public-URL path. Self-cleans in finally.
const LIVE = process.env.R2_LIVE_TEST === "1";

describe.skipIf(!LIVE)("r2-client live round-trip", () => {
  it("PUTs, GETs, and DELETEs a test object against the real bucket", async () => {
    const config = getR2Config({ bucket: "public", prefix: "objects" });
    const key = `__test__/round-trip-live.txt`;
    const body = Buffer.from("r2-client live round-trip self-check");

    try {
      const put = await signedR2Fetch(config, key, {
        body,
        contentType: "text/plain",
        method: "PUT",
      });
      expect(put.ok).toBe(true);

      const got = await signedR2Fetch(config, key, { method: "GET" });
      expect(got.ok).toBe(true);
      const fetched = Buffer.from(await got.arrayBuffer()).toString("utf8");
      expect(fetched).toBe(body.toString("utf8"));
    } finally {
      const del = await signedR2Fetch(config, key, { method: "DELETE" });
      // 204 success; 404 if the PUT failed earlier — either is acceptable cleanup.
      expect([204, 404]).toContain(del.status);
    }
  });
});
