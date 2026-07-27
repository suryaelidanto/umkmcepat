import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureProjectThumbnail,
  createProjectThumbnailRef,
  deleteProjectThumbnail,
  parseProjectThumbnailRef,
  readProjectThumbnail,
  writeProjectThumbnail,
} from "./project-thumbnail";
import { writeProjectDistArtifact } from "./runtime-artifacts";

const { r2FetchMock } = vi.hoisted(() => ({
  r2FetchMock: vi.fn(async (_c: unknown, _k: string, i: { method: string }) =>
    i.method === "GET"
      ? new Response(
          Buffer.concat([
            Buffer.from([0xff, 0xd8, 0xff]),
            Buffer.from("jpeg-bytes"),
            Buffer.from([0xff, 0xd9]),
          ]),
          { status: 200 },
        )
      : new Response(null, { status: 200 }),
  ),
}));

vi.mock("@/lib/r2-client", () => ({
  getR2Config: vi.fn(({ bucket }: { bucket: string }) => ({
    accessKeyId: "a",
    accountId: "b",
    bucket: bucket === "public" ? "pub" : "priv",
    prefix: "project-thumbnails",
    secretAccessKey: "s",
  })),
  signedR2Fetch: r2FetchMock,
  R2Config: {} as never,
}));

let tempDir = "";
const originalEnv = { ...process.env };

describe("project thumbnails", () => {
  afterEach(async () => {
    process.env = { ...originalEnv };
    r2FetchMock.mockClear();
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true });
      tempDir = "";
    }
  });

  it("atomically replaces one JPEG per project", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkm-thumbnail-"));

    const firstRef = await writeProjectThumbnail({
      bytes: jpegBytes("first"),
      projectId: "project_1",
      rootDir: tempDir,
    });
    const secondRef = await writeProjectThumbnail({
      bytes: jpegBytes("second"),
      projectId: "project_1",
      rootDir: tempDir,
    });

    expect(firstRef).toBe("project-thumbnail:local:project_1");
    expect(secondRef).toBe(firstRef);
    await expect(
      readProjectThumbnail(firstRef, { rootDir: tempDir }),
    ).resolves.toEqual(jpegBytes("second"));
    await expect(readdir(tempDir)).resolves.toEqual(["project_1.jpg"]);
  });

  it("rejects unsafe ids and invalid JPEG output", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkm-thumbnail-"));

    await expect(
      writeProjectThumbnail({
        bytes: jpegBytes("ok"),
        projectId: "../secret",
        rootDir: tempDir,
      }),
    ).rejects.toThrow("Invalid project thumbnail id");
    await expect(
      writeProjectThumbnail({
        bytes: Buffer.from("not jpeg"),
        projectId: "project_1",
        rootDir: tempDir,
      }),
    ).rejects.toThrow("Invalid project thumbnail JPEG");
  });

  it.skipIf(process.env.RUN_BROWSER_INTEGRATION !== "true")(
    "captures a JPEG through the isolated Node renderer",
    async () => {
      tempDir = await mkdtemp(
        path.join(os.tmpdir(), "umkm-thumbnail-artifact-"),
      );
      process.env.PROJECT_ARTIFACT_DIR = tempDir;
      process.env.PROJECT_THUMBNAIL_TIMEOUT_MS = "30000";
      const artifactRef = await writeProjectDistArtifact({
        artifactId: "build_1",
        files: [
          {
            content: "<!doctype html><title>Preview</title><h1>Website</h1>",
            contentType: "text/html; charset=utf-8",
            path: "index.html",
          },
        ],
        rootDir: tempDir,
      });

      const bytes = await captureProjectThumbnail(artifactRef);

      expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      expect(bytes.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    },
    45_000,
  );

  it("deletes the current project thumbnail", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkm-thumbnail-"));
    const ref = await writeProjectThumbnail({
      bytes: jpegBytes("image"),
      projectId: "project_1",
      rootDir: tempDir,
    });

    await deleteProjectThumbnail(ref, { rootDir: tempDir });

    await expect(
      readProjectThumbnail(ref, { rootDir: tempDir }),
    ).rejects.toThrow();
  });

  it("round-trips a thumbnail ref through parseProjectThumbnailRef", () => {
    const id = "cm123abc-_OK";
    const ref = createProjectThumbnailRef(id);

    expect(parseProjectThumbnailRef(ref)).toBe(id);
    expect(parseProjectThumbnailRef("not-a-ref")).toBeNull();
    expect(
      parseProjectThumbnailRef("project-thumbnail:local:bad id"),
    ).toBeNull();
    expect(parseProjectThumbnailRef("project-thumbnail:r2:abc")).toBeNull();
  });

  describe("provider switch + R2 private bucket", () => {
    afterEach(() => {
      delete process.env.STORAGE_PROVIDER;
    });

    it("writes a thumbnail to the private bucket when r2", async () => {
      process.env.STORAGE_PROVIDER = "r2";
      const ref = await writeProjectThumbnail({
        bytes: jpegBytes("r2"),
        projectId: "proj-r2",
      });
      expect(ref).toBe("project-thumbnail:r2-private:proj-r2");
      const calledConfig = r2FetchMock.mock.calls[0][0] as {
        bucket: string;
      };
      expect(calledConfig.bucket).toBe("priv");
      const calledKey = r2FetchMock.mock.calls[0][1] as string;
      expect(calledKey).toBe("proj-r2.jpg");
    });

    it("reads a thumbnail from the private bucket by r2-private ref", async () => {
      const bytes = await readProjectThumbnail(
        "project-thumbnail:r2-private:proj-r2",
      );
      expect(bytes.length).toBeGreaterThan(0);
      expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      const calledConfig = r2FetchMock.mock.calls[0][0] as {
        bucket: string;
      };
      expect(calledConfig.bucket).toBe("priv");
    });

    it("deletes a thumbnail from the private bucket by r2-private ref", async () => {
      await deleteProjectThumbnail("project-thumbnail:r2-private:proj-r2");
      const lastCall = r2FetchMock.mock.calls.at(-1);
      expect(lastCall?.[2]).toMatchObject({ method: "DELETE" });
    });

    it("parseProjectThumbnailRef accepts r2-private", () => {
      expect(
        parseProjectThumbnailRef("project-thumbnail:r2-private:proj-1"),
      ).toBe("proj-1");
    });
  });
});

function jpegBytes(content: string) {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.from(content),
    Buffer.from([0xff, 0xd9]),
  ]);
}
