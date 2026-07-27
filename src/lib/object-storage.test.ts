import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getStoredObject, putStoredObject } from "@/lib/object-storage";

vi.mock("@/lib/r2-client", () => ({
  getR2Config: () => ({
    accessKeyId: "a",
    accountId: "b",
    bucket: "priv",
    prefix: "objects",
    secretAccessKey: "s",
  }),
  signedR2Fetch: vi.fn(async () => new Response(null, { status: 200 })),
}));

let tempDir = "";

describe("object storage", () => {
  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true });
      tempDir = "";
    }

    delete process.env.LOCAL_UPLOAD_DIR;
    delete process.env.STORAGE_PROVIDER;
  });

  it("writes and reads local objects under the configured upload dir", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-storage-"));
    process.env.LOCAL_UPLOAD_DIR = tempDir;
    process.env.STORAGE_PROVIDER = "local";

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

describe("object-storage provider switch", () => {
  afterEach(() => {
    delete process.env.STORAGE_PROVIDER;
  });

  it("writes an r2 ref when STORAGE_PROVIDER=r2", async () => {
    process.env.STORAGE_PROVIDER = "r2";
    const ref = await putStoredObject({
      body: Buffer.from("x"),
      contentType: "image/png",
      key: "waitlist/abc.png",
    });
    expect(ref).toBe("object:r2:waitlist/abc.png");
  });
});
