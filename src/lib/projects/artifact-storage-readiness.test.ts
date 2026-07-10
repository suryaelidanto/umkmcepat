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
    vi.stubEnv("PROJECT_ARTIFACT_STORAGE_PROVIDER", "local");
    vi.stubEnv("PROJECT_ARTIFACT_DIR", "");

    await expect(assertProjectArtifactStorageReady()).rejects.toThrow(
      "PROJECT_ARTIFACT_DIR must be an explicit absolute path in production.",
    );
  });

  it("proves a configured local artifact directory is writable and cleans its probe", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkm-artifact-ready-"));
    vi.stubEnv("PROJECT_ARTIFACT_STORAGE_PROVIDER", "local");
    vi.stubEnv("PROJECT_ARTIFACT_DIR", tempDir);

    await expect(assertProjectArtifactStorageReady()).resolves.toBeUndefined();
    await expect(readdir(tempDir)).resolves.toEqual([]);
  }, 30_000);

  it("rejects incomplete R2 configuration before serving", async () => {
    vi.stubEnv("PROJECT_ARTIFACT_STORAGE_PROVIDER", "r2");
    vi.stubEnv("R2_ACCOUNT_ID", "account");
    vi.stubEnv("R2_ACCESS_KEY_ID", "");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("R2_BUCKET", "bucket");

    await expect(assertProjectArtifactStorageReady()).rejects.toThrow(
      "R2_ACCESS_KEY_ID is required for R2 project artifact storage.",
    );
  });
});
