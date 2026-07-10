import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  deleteProjectThumbnail,
  readProjectThumbnail,
  writeProjectThumbnail,
} from "./project-thumbnail";

let tempDir = "";

describe("project thumbnails", () => {
  afterEach(async () => {
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
});

function jpegBytes(content: string) {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.from(content),
    Buffer.from([0xff, 0xd9]),
  ]);
}
