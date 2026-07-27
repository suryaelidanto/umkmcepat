import { afterEach, describe, expect, it, vi } from "vitest";

const { putMock, getMock, deleteMock } = vi.hoisted(() => ({
  putMock: vi.fn(async () => {}),
  getMock: vi.fn(async () => Buffer.from("bytes")),
  deleteMock: vi.fn(async () => {}),
}));

vi.mock("@/lib/s3-client", () => ({
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

import { getStoredObject, putStoredObject } from "@/lib/object-storage";

describe("object-storage (s3)", () => {
  afterEach(() => {
    putMock.mockClear();
    getMock.mockClear();
    deleteMock.mockClear();
    delete process.env.STORAGE_PROVIDER;
  });

  it("writes an object:s3: ref", async () => {
    process.env.STORAGE_PROVIDER = "r2";
    const ref = await putStoredObject({
      body: Buffer.from("x"),
      contentType: "image/png",
      key: "waitlist/abc.png",
    });
    expect(ref).toBe("object:s3:waitlist/abc.png");
    expect(putMock).toHaveBeenCalledWith(
      "private",
      "objects/waitlist/abc.png",
      expect.any(Buffer),
      "image/png",
    );
  });

  it("reads an object:s3: ref via the SDK", async () => {
    process.env.STORAGE_PROVIDER = "r2";
    const stored = await getStoredObject("object:s3:waitlist/abc.png");
    expect(stored?.body.toString()).toBe("bytes");
    expect(getMock).toHaveBeenCalledWith("private", "objects/waitlist/abc.png");
  });

  it("returns null for unknown ref prefixes", async () => {
    expect(await getStoredObject("foo:bar:baz")).toBeNull();
  });

  it("rejects unsafe object keys", async () => {
    await expect(
      putStoredObject({
        body: Buffer.from("x"),
        contentType: "image/png",
        key: "../avatar.png",
      }),
    ).rejects.toThrow("Object storage key tidak valid");
  });
});
