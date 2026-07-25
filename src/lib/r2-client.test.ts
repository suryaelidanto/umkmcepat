import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getR2Config, publicUrlFor } from "@/lib/r2-client";

const BASE_ENV = {
  R2_ACCESS_KEY_ID: "AKIA-test",
  R2_ACCOUNT_ID: "acct",
  R2_BUCKET: "umkmcepat-dev",
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

  it("getR2Config reads required vars + default prefix", () => {
    delete process.env.R2_PREFIX;
    const config = getR2Config();
    expect(config).toMatchObject({
      accessKeyId: "AKIA-test",
      accountId: "acct",
      bucket: "umkmcepat-dev",
      secretAccessKey: "shh",
    });
    expect(config.prefix).toBe("objects");
  });

  it("getR2Config accepts a custom prefix env + fallback", () => {
    delete process.env.PROJECT_ARTIFACT_R2_PREFIX;
    const config = getR2Config({
      prefixEnv: "PROJECT_ARTIFACT_R2_PREFIX",
      prefixFallback: "project-artifacts",
    });
    expect(config.prefix).toBe("project-artifacts");

    process.env.PROJECT_ARTIFACT_R2_PREFIX = "  /custom/path/  ";
    const custom = getR2Config({
      prefixEnv: "PROJECT_ARTIFACT_R2_PREFIX",
      prefixFallback: "project-artifacts",
    });
    expect(custom.prefix).toBe("custom/path");
  });

  it("getR2Config throws when a required var is missing", () => {
    delete process.env.R2_SECRET_ACCESS_KEY;
    expect(() => getR2Config()).toThrow(/R2_SECRET_ACCESS_KEY/);
  });

  it("publicUrlFor builds an absolute public URL with prefix", () => {
    const config = getR2Config();
    expect(publicUrlFor(config, "proj1/owner1/business-image/abc.png")).toBe(
      "https://pub-test.r2.dev/objects/proj1/owner1/business-image/abc.png",
    );
  });

  it("publicUrlFor throws when R2_PUBLIC_BASE_URL is empty", () => {
    delete process.env.R2_PUBLIC_BASE_URL;
    const config = getR2Config();
    expect(() => publicUrlFor(config, "x")).toThrow(/R2_PUBLIC_BASE_URL/);
  });

  it("getR2Config with empty prefix fallback keeps the key bare", () => {
    delete process.env.R2_PREFIX;
    const config = getR2Config({ prefixFallback: "" });
    expect(config.prefix).toBe("");
  });
});
