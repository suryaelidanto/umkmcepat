import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureProjectThumbnail,
  createProjectThumbnailRef,
  deleteProjectThumbnail,
  parseProjectThumbnailRef,
  readProjectThumbnail,
  refreshProjectThumbnail,
  writeProjectThumbnail,
} from "./project-thumbnail";
import { writeProjectDistArtifact } from "./runtime-artifacts";

const { putMock, getMock, deleteMock, store } = vi.hoisted(() => {
  const store = new Map<string, Buffer>();
  return {
    putMock: vi.fn(
      async (_b: "public" | "private", key: string, body: Buffer) => {
        store.set(key, body);
      },
    ),
    getMock: vi.fn(async (_b: "public" | "private", key: string) => {
      const v = store.get(key);
      if (v === undefined) {
        throw new Error("NoSuchKey");
      }
      return v;
    }),
    deleteMock: vi.fn(async (_b: "public" | "private", key: string) => {
      store.delete(key);
    }),
    store,
  };
});

vi.mock("@/lib/storage/s3-client", () => ({
  getS3Config: () => ({ client: {}, bucket: "priv" }),
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

const { projectBuildFindFirstMock, projectFindUniqueMock } = vi.hoisted(() => ({
  projectBuildFindFirstMock: vi.fn(),
  projectFindUniqueMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: projectFindUniqueMock },
    projectBuild: { findFirst: projectBuildFindFirstMock },
  },
}));

const originalEnv = { ...process.env };

describe("project thumbnails", () => {
  afterEach(() => {
    store.clear();
    putMock.mockClear();
    getMock.mockClear();
    deleteMock.mockClear();
    projectBuildFindFirstMock.mockReset();
    projectFindUniqueMock.mockReset();
    process.env = { ...originalEnv };
  });

  it("writes a thumbnail to the private bucket and round-trips the ref", async () => {
    const ref = await writeProjectThumbnail({
      bytes: jpegBytes("first"),
      projectId: "project_1",
    });

    expect(ref).toBe("project-thumbnail:s3-private:project_1");
    expect(putMock).toHaveBeenCalledWith(
      "private",
      "project-thumbnails/project_1.jpg",
      jpegBytes("first"),
      "image/jpeg",
    );

    const bytes = await readProjectThumbnail(ref);
    expect(Buffer.from(bytes)).toEqual(jpegBytes("first"));
    expect(getMock).toHaveBeenCalledWith(
      "private",
      "project-thumbnails/project_1.jpg",
    );
  });

  it("replaces the thumbnail in place for the same project", async () => {
    await writeProjectThumbnail({
      bytes: jpegBytes("first"),
      projectId: "project_1",
    });
    const ref = await writeProjectThumbnail({
      bytes: jpegBytes("second"),
      projectId: "project_1",
    });

    expect(ref).toBe("project-thumbnail:s3-private:project_1");
    const bytes = await readProjectThumbnail(ref);
    expect(Buffer.from(bytes)).toEqual(jpegBytes("second"));
    expect(store.get("project-thumbnails/project_1.jpg")).toEqual(
      jpegBytes("second"),
    );
  });

  it("rejects unsafe ids and invalid JPEG output", async () => {
    await expect(
      writeProjectThumbnail({
        bytes: jpegBytes("ok"),
        projectId: "../secret",
      }),
    ).rejects.toThrow("Invalid project thumbnail id");
    await expect(
      writeProjectThumbnail({
        bytes: Buffer.from("not jpeg"),
        projectId: "project_1",
      }),
    ).rejects.toThrow("Invalid project thumbnail JPEG");
  });

  it.skipIf(process.env.RUN_BROWSER_INTEGRATION !== "true")(
    "captures a JPEG through the isolated Node renderer",
    async () => {
      process.env.PROJECT_ARTIFACT_DIR = "";
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
      });

      const bytes = await captureProjectThumbnail(artifactRef);

      expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      expect(bytes.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    },
    45_000,
  );

  it("rejects a thumbnail refresh when the build artifact belongs elsewhere", async () => {
    projectFindUniqueMock.mockResolvedValue({
      thumbnailBuildId: null,
      thumbnailRef: null,
    });
    projectBuildFindFirstMock.mockResolvedValue({
      artifactRef: "project-artifact:s3:dist:build_2",
      id: "build_1",
      projectId: "project_1",
      snapshot: { id: "snapshot_1", projectId: "project_1" },
      snapshotId: "snapshot_1",
    });

    await refreshProjectThumbnail({
      artifactRef: "project-artifact:s3:dist:build_2",
      buildId: "build_1",
      projectId: "project_1",
    });

    expect(projectBuildFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "build_1",
          projectId: "project_1",
          snapshot: { projectId: "project_1" },
        }),
      }),
    );
    expect(putMock).not.toHaveBeenCalled();
  });

  it("deletes the current project thumbnail by s3-private ref", async () => {
    await writeProjectThumbnail({
      bytes: jpegBytes("image"),
      projectId: "project_1",
    });
    const ref = "project-thumbnail:s3-private:project_1";

    await deleteProjectThumbnail(ref);

    expect(deleteMock).toHaveBeenCalledWith(
      "private",
      "project-thumbnails/project_1.jpg",
    );
    await expect(readProjectThumbnail(ref)).rejects.toThrow();
  });

  it("deleteProjectThumbnail treats already-missing objects as success", async () => {
    await expect(
      deleteProjectThumbnail("project-thumbnail:s3-private:ghost"),
    ).resolves.toBeUndefined();
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
    expect(
      parseProjectThumbnailRef("project-thumbnail:r2-private:abc"),
    ).toBeNull();
  });

  it("readProjectThumbnail rejects legacy non-s3 refs", async () => {
    await expect(
      readProjectThumbnail("project-thumbnail:local:project_1"),
    ).rejects.toThrow("Invalid project thumbnail ref.");
    await expect(
      readProjectThumbnail("project-thumbnail:r2-private:project_1"),
    ).rejects.toThrow("Invalid project thumbnail ref.");
  });

  it("parseProjectThumbnailRef accepts s3-private", () => {
    expect(
      parseProjectThumbnailRef("project-thumbnail:s3-private:proj-1"),
    ).toBe("proj-1");
  });
});

function jpegBytes(content: string) {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.from(content),
    Buffer.from([0xff, 0xd9]),
  ]);
}
