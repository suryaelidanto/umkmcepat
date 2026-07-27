import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { assertProjectArtifactStorageReady } from "@/lib/projects/artifact-storage-readiness";

let tempDir = "";

describe("project artifact storage readiness", () => {
  afterEach(async () => {
    vi.unstubAllEnvs();

    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true });
      tempDir = "";
    }
  });

  it("requires an explicit absolute local artifact directory in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STORAGE_PROVIDER", "local");
    vi.stubEnv("PROJECT_ARTIFACT_DIR", "");

    await expect(assertProjectArtifactStorageReady()).rejects.toThrow(
      "PROJECT_ARTIFACT_DIR must be an explicit absolute path in production.",
    );
  });

  it("proves a configured local artifact directory is writable and cleans its probe", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkm-artifact-ready-"));
    vi.stubEnv("STORAGE_PROVIDER", "local");
    vi.stubEnv("PROJECT_ARTIFACT_DIR", tempDir);

    await expect(assertProjectArtifactStorageReady()).resolves.toBeUndefined();
    await expect(readdir(tempDir)).resolves.toEqual([]);
  }, 30_000);

  it("rejects incomplete R2 configuration before serving", async () => {
    vi.stubEnv("STORAGE_PROVIDER", "r2");
    vi.stubEnv("R2_ACCOUNT_ID", "account");
    vi.stubEnv("R2_ACCESS_KEY_ID", "");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("R2_PUBLIC_BUCKET", "bucket");
    vi.stubEnv("R2_PRIVATE_BUCKET", "priv");

    await expect(assertProjectArtifactStorageReady()).rejects.toThrow(
      "R2_ACCESS_KEY_ID is required for R2 project artifact storage.",
    );
  });

  it("validates both R2 buckets when r2", () => {
    vi.stubEnv("STORAGE_PROVIDER", "r2");
    vi.stubEnv("R2_PUBLIC_BUCKET", "pub");
    vi.stubEnv("R2_PRIVATE_BUCKET", "priv");
    vi.stubEnv("R2_ACCESS_KEY_ID", "a");
    vi.stubEnv("R2_ACCOUNT_ID", "acct");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "s");
    expect(assertProjectArtifactStorageReady()).resolves.toBeUndefined();
  });

  it("throws when the private bucket var is missing under r2", async () => {
    vi.stubEnv("STORAGE_PROVIDER", "r2");
    vi.stubEnv("R2_ACCOUNT_ID", "acct");
    vi.stubEnv("R2_ACCESS_KEY_ID", "a");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "s");
    vi.stubEnv("R2_PUBLIC_BUCKET", "pub");
    delete process.env.R2_PRIVATE_BUCKET;
    await expect(assertProjectArtifactStorageReady()).rejects.toThrow(
      /R2_PRIVATE_BUCKET/,
    );
  });
});
