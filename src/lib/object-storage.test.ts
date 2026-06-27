import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getStoredObject, putStoredObject } from "@/lib/object-storage";

let tempDir = "";

describe("object storage", () => {
  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true });
      tempDir = "";
    }

    delete process.env.LOCAL_UPLOAD_DIR;
    delete process.env.OBJECT_STORAGE_PROVIDER;
  });

  it("writes and reads local objects under the configured upload dir", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-storage-"));
    process.env.LOCAL_UPLOAD_DIR = tempDir;
    process.env.OBJECT_STORAGE_PROVIDER = "local";

    const ref = await putStoredObject({
      body: Buffer.from("avatar"),
      contentType: "image/png",
      key: "profile-avatars/user_1/avatar.png",
    });
    const object = await getStoredObject(ref);

    expect(ref).toBe("object:local:profile-avatars/user_1/avatar.png");
    expect(object?.contentType).toBe("image/png");
    expect(object?.body.toString()).toBe("avatar");
  });

  it("rejects unsafe object keys", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-storage-"));
    process.env.LOCAL_UPLOAD_DIR = tempDir;

    await expect(
      putStoredObject({
        body: Buffer.from("avatar"),
        contentType: "image/png",
        key: "../avatar.png",
      }),
    ).rejects.toThrow("Object storage key tidak valid");
  });
});
