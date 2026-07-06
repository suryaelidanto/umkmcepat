import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  materializeProjectDistArtifact,
  readProjectDistArtifact,
  readProjectSourceArtifact,
  writeProjectDistArtifact,
  writeProjectSourceArtifact,
} from "@/lib/projects/runtime-artifacts";

let tempDir = "";

describe("project runtime artifacts", () => {
  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true });
      tempDir = "";
    }
  });

  it("writes and reads generated source artifacts", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-artifacts-"));

    const ref = await writeProjectSourceArtifact({
      artifactId: "snapshot_1",
      files: [{ content: "export const ok = true;", path: "src/main.ts" }],
      rootDir: tempDir,
    });
    const files = await readProjectSourceArtifact(ref, { rootDir: tempDir });

    expect(ref).toBe("project-artifact:local:source:snapshot_1");
    expect(files).toEqual([
      { content: "export const ok = true;", path: "src/main.ts" },
    ]);
  });

  it("writes, reads, and materializes dist artifacts", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-artifacts-"));

    const ref = await writeProjectDistArtifact({
      artifactId: "build_1",
      files: [
        {
          content: "<h1>Preview</h1>",
          contentType: "text/html; charset=utf-8",
          path: "index.html",
        },
      ],
      rootDir: tempDir,
    });
    const files = await readProjectDistArtifact(ref, { rootDir: tempDir });
    const runtimeRoot = path.join(tempDir, "runtime");

    await materializeProjectDistArtifact(ref, runtimeRoot, {
      rootDir: tempDir,
    });

    expect(files).toEqual([
      {
        content: "<h1>Preview</h1>",
        contentType: "text/html; charset=utf-8",
        path: "index.html",
      },
    ]);
    await expect(
      readFile(path.join(runtimeRoot, "index.html"), "utf8"),
    ).resolves.toBe("<h1>Preview</h1>");
  });

  it("rejects unsafe generated artifact paths", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-artifacts-"));

    await expect(
      writeProjectSourceArtifact({
        artifactId: "snapshot_1",
        files: [{ content: "secret", path: "../.env" }],
        rootDir: tempDir,
      }),
    ).rejects.toThrow("Unsafe generated file path");
  });
});
