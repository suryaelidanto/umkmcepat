import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteProjectArtifact,
  materializeProjectDistArtifact,
  readProjectDistArtifact,
  readProjectSourceArtifact,
  resolveArtifactFilesDir,
  writeProjectDistArtifact,
  writeProjectSourceArtifact,
} from "@/lib/projects/runtime-artifacts";

const { putMock, getMock, deleteMock, store } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    putMock: vi.fn(
      async (_b: "public" | "private", key: string, body: Buffer) => {
        store.set(key, body.toString("utf8"));
      },
    ),
    getMock: vi.fn(async (_b: "public" | "private", key: string) => {
      const v = store.get(key);
      if (v === undefined) {
        throw new Error("NoSuchKey");
      }
      return Buffer.from(v);
    }),
    deleteMock: vi.fn(async (_b: "public" | "private", key: string) => {
      store.delete(key);
    }),
    store,
  };
});

vi.mock("@/lib/storage/s3-client", () => ({
  getS3Config: () => ({ client: {}, bucket: "pub" }),
  putS3Object: putMock,
  getS3Object: getMock,
  deleteS3Object: deleteMock,
  S3_PREFIXES: {
    artifact: "project-artifacts",
    asset: "project-assets",
    object: "objects",
    thumbnail: "project-thumbnails",
  },
}));

let tempDir = "";
const originalEnv = { ...process.env };

describe("project runtime artifacts", () => {
  beforeEach(() => {
    store.clear();
    putMock.mockClear();
    getMock.mockClear();
    deleteMock.mockClear();
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true });
      tempDir = "";
    }

    process.env = { ...originalEnv };
  });

  it("writes and reads generated source artifacts via s3", async () => {
    const ref = await writeProjectSourceArtifact({
      artifactId: "snapshot_1",
      files: [{ content: "export const ok = true;", path: "src/main.ts" }],
    });
    const files = await readProjectSourceArtifact(ref);

    expect(ref).toBe("project-artifact:s3:source:snapshot_1");
    expect(files).toEqual([
      { content: "export const ok = true;", path: "src/main.ts" },
    ]);

    // 1 file PUT + 1 manifest PUT, then 1 manifest GET + 1 file GET.
    expect(putMock.mock.calls.map((call) => call[1])).toEqual([
      "project-artifacts/source/snapshot_1/files/src/main.ts",
      "project-artifacts/source/snapshot_1/manifest.json",
    ]);
    expect(getMock.mock.calls.map((call) => call[1])).toEqual([
      "project-artifacts/source/snapshot_1/manifest.json",
      "project-artifacts/source/snapshot_1/files/src/main.ts",
    ]);
  });

  it("routes s3 artifact writes to the public bucket", async () => {
    const ref = await writeProjectSourceArtifact({
      artifactId: "snapshot_pub",
      files: [{ content: "export const ok = true;", path: "src/main.ts" }],
    });

    expect(ref.startsWith("project-artifact:s3:")).toBe(true);
    expect(putMock).toHaveBeenCalled();
    for (const call of putMock.mock.calls) {
      expect(call[0]).toBe("public");
    }
  });

  it("writes, reads, and materializes dist artifacts via s3", async () => {
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
    });
    const files = await readProjectDistArtifact(ref);
    const runtimeRoot = path.join(tempDir, "runtime");

    await materializeProjectDistArtifact(ref, runtimeRoot);

    expect(ref).toBe("project-artifact:s3:dist:build_1");
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

  it("deletes s3 project artifacts by manifest enumeration", async () => {
    const ref = await writeProjectSourceArtifact({
      artifactId: "snapshot_del",
      files: [
        { content: "a", path: "src/a.ts" },
        { content: "b", path: "src/b.ts" },
      ],
    });

    await deleteProjectArtifact(ref);

    // Manifest GET (delete enumeration) + 2 file DELETEs + 1 manifest DELETE.
    expect(getMock).toHaveBeenCalledWith(
      "public",
      "project-artifacts/source/snapshot_del/manifest.json",
    );
    expect(deleteMock.mock.calls.map((call) => call[1])).toEqual(
      expect.arrayContaining([
        "project-artifacts/source/snapshot_del/files/src/a.ts",
        "project-artifacts/source/snapshot_del/files/src/b.ts",
        "project-artifacts/source/snapshot_del/manifest.json",
      ]),
    );
  });

  it("deletes artifacts even when the manifest is missing", async () => {
    const ref = "project-artifact:s3:source:ghost";

    await expect(deleteProjectArtifact(ref)).resolves.toBeUndefined();
    expect(deleteMock).toHaveBeenCalledWith(
      "public",
      "project-artifacts/source/ghost/manifest.json",
    );
  });

  it("rejects unsafe generated artifact paths", async () => {
    await expect(
      writeProjectSourceArtifact({
        artifactId: "snapshot_1",
        files: [{ content: "secret", path: "../.env" }],
      }),
    ).rejects.toThrow("Unsafe generated file path");
  });

  it("resolveArtifactFilesDir returns null for s3 refs (no on-disk path)", () => {
    // ponytail: S3 artifacts have no on-disk files dir; the post-generation
    expect(
      resolveArtifactFilesDir("project-artifact:s3:source:abc"),
    ).toBeNull();
    expect(resolveArtifactFilesDir("not-a-ref")).toBeNull();
  });
});
