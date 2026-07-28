import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createProjectAssetRef,
  deleteProjectAsset,
  detectImageFormat,
  parseProjectAssetRef,
  readProjectAsset,
  writeProjectAsset,
  type ProjectAssetKind,
} from "@/lib/projects/project-assets";
import { getStorageProvider } from "@/lib/storage-provider";

const { putMock, getMock, deleteMock, pngBytes } = vi.hoisted(() => {
  const PNG_HEX =
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000005000101f9e0230000000049454e44ae426082";
  return {
    putMock: vi.fn(async () => {}),
    getMock: vi.fn(async () => Buffer.from(PNG_HEX, "hex")),
    deleteMock: vi.fn(async () => {}),
    pngBytes: () => Buffer.from(PNG_HEX, "hex"),
  };
});

vi.mock("@/lib/s3-client", () => ({
  getS3Config: () => ({ client: {}, bucket: "pub" }),
  publicUrlFor: (_b: "public", key: string) =>
    `https://media.test/project-assets/${key}`,
  putS3Object: putMock,
  getS3Object: getMock,
  deleteS3Object: deleteMock,
  S3_PREFIXES: {
    object: "objects",
    artifact: "project-artifacts",
    asset: "project-assets",
    thumbnail: "project-thumbnails",
  },
}));

const USER = "user_abc";

describe("project assets", () => {
  afterEach(() => {
    putMock.mockClear();
    getMock.mockClear();
    deleteMock.mockClear();
  });

  function jpegBytes() {
    const head = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const body = Buffer.from("minimal-jpeg-body");
    const tail = Buffer.from([0xff, 0xd9]);
    return Buffer.concat([head, body, tail]);
  }
  function webpBytes() {
    return Buffer.from("524946460e00000057454250565038580a000000", "hex");
  }

  describe("ref parsing", () => {
    it("creates and parses a valid project-asset ref", () => {
      const ref = createProjectAssetRef(
        "project-1",
        "business-image",
        USER,
        "abc123",
      );
      expect(ref).toBe(
        "project-asset:s3:project-1/user_abc/business-image/abc123",
      );
      expect(parseProjectAssetRef(ref)).toEqual({
        ext: null,
        kind: "business-image" as ProjectAssetKind,
        projectId: "project-1",
        ulid: "abc123",
        userId: USER,
      });
    });

    it("parses a ref with an extension and carries the format", () => {
      const parsed = parseProjectAssetRef(
        "project-asset:s3:project-1/user_abc/logo/abc123def456.webp",
      );
      expect(parsed).toEqual({
        ext: "webp",
        kind: "logo",
        projectId: "project-1",
        ulid: "abc123def456",
        userId: USER,
      });
    });

    it("returns null for non-asset refs", () => {
      expect(parseProjectAssetRef("object:s3:foo.png")).toBeNull();
      expect(parseProjectAssetRef("project-thumbnail:s3:123")).toBeNull();
    });

    it("rejects malformed asset refs", () => {
      expect(parseProjectAssetRef("project-asset:s3:")).toBeNull();
      expect(parseProjectAssetRef("project-asset:s3:proj/logo")).toBeNull();
      expect(
        parseProjectAssetRef("project-asset:s3:proj/user/logo"),
      ).toBeNull();
      expect(
        parseProjectAssetRef("project-asset:s3:proj/user/evil-kind/abc.png"),
      ).toBeNull();
      expect(
        parseProjectAssetRef("project-asset:s3:proj/user/logo/abc.exe"),
      ).toBeNull();
      expect(
        parseProjectAssetRef("project-asset:s3:proj/user/logo/.png"),
      ).toBeNull();
      expect(
        parseProjectAssetRef("project-asset:s3:..%2f/user/logo/abc.png"),
      ).toBeNull();
      expect(
        parseProjectAssetRef("project-asset:s3:proj/..%2f/logo/abc.png"),
      ).toBeNull();
    });

    it("rejects refs with bad project ids", () => {
      expect(() =>
        createProjectAssetRef("../escape", "logo", USER, "x"),
      ).toThrow();
    });
  });

  describe("write / read / delete round-trip", () => {
    afterEach(() => {
      delete process.env.STORAGE_PROVIDER;
    });

    it("writes, reads, and deletes a PNG asset", async () => {
      const { ref } = await writeProjectAsset({
        bytes: pngBytes(),
        kind: "business-image",
        projectId: "proj-png",
        userId: USER,
      });

      const read = await readProjectAsset(ref);
      expect(read?.contentType).toBe("image/png");
      expect(read?.body.equals(pngBytes())).toBe(true);

      await deleteProjectAsset(ref);
      expect(deleteMock).toHaveBeenCalled();
    });

    it("accepts jpeg and webp", async () => {
      const { ref: jpegRef } = await writeProjectAsset({
        bytes: jpegBytes(),
        kind: "logo",
        projectId: "proj-jpg",
        userId: USER,
      });
      expect((await readProjectAsset(jpegRef))?.contentType).toBe("image/jpeg");

      const { ref: webpRef } = await writeProjectAsset({
        bytes: webpBytes(),
        kind: "reference",
        projectId: "proj-webp",
        userId: USER,
      });
      expect((await readProjectAsset(webpRef))?.contentType).toBe("image/webp");
    });
  });

  describe("validation guardrails", () => {
    it("rejects files exceeding the size cap", async () => {
      const oversize = Buffer.concat([
        pngBytes(),
        Buffer.alloc(6 * 1024 * 1024),
      ]);
      await expect(
        writeProjectAsset({
          bytes: oversize,
          kind: "business-image",
          projectId: "proj-big",
          userId: USER,
        }),
      ).rejects.toThrow(/exceeds|too large|size/i);
    });

    it("rejects bytes that don't match a known image magic signature", async () => {
      await expect(
        writeProjectAsset({
          bytes: Buffer.from("<html><script>alert(1)</script>"),
          kind: "business-image",
          projectId: "proj-evil",
          userId: USER,
        }),
      ).rejects.toThrow(/invalid|not a valid|magic|signature/i);
    });

    it("strips/ignores attacker-supplied extension by deriving type from bytes", async () => {
      const { ref } = await writeProjectAsset({
        bytes: pngBytes(),
        kind: "logo",
        projectId: "proj-lie",
        userId: USER,
      });
      const read = await readProjectAsset(ref);
      expect(read?.contentType).toBe("image/png");
      expect(ref).not.toContain(".exe");
      expect(ref).not.toContain(".svg");
    });
  });

  describe("kind allowlist", () => {
    it("rejects unknown asset kinds", async () => {
      await expect(
        writeProjectAsset({
          bytes: pngBytes(),
          kind: "evil-payload" as ProjectAssetKind,
          projectId: "proj-kind",
          userId: USER,
        }),
      ).rejects.toThrow(/kind|invalid/i);
    });
  });

  describe("provider + S3 boundary", () => {
    afterEach(() => {
      delete process.env.STORAGE_PROVIDER;
    });

    it("getStorageProvider defaults to local", () => {
      delete process.env.STORAGE_PROVIDER;
      expect(getStorageProvider()).toBe("local");
    });

    it("getStorageProvider returns r2 when set", () => {
      process.env.STORAGE_PROVIDER = "r2";
      expect(getStorageProvider()).toBe("r2");
    });

    it("getStorageProvider rejects unknown values", () => {
      process.env.STORAGE_PROVIDER = "s3";
      expect(() => getStorageProvider()).toThrow(/STORAGE_PROVIDER/);
    });

    it("writes a logo to the public bucket with a publicUrl", async () => {
      const { publicUrl, ref } = await writeProjectAsset({
        bytes: pngBytes(),
        kind: "logo",
        projectId: "p1",
        userId: USER,
      });
      expect(ref).toMatch(/^project-asset:s3:/);
      expect(publicUrl).toMatch(/^https:\/\/media\.test\//);
      expect(putMock).toHaveBeenCalledWith(
        "public",
        expect.stringContaining("project-assets/p1/user_abc/logo/"),
        expect.any(Buffer),
        "image/png",
      );
    });

    it("writes a reference to the private bucket with no publicUrl", async () => {
      const { publicUrl, ref } = await writeProjectAsset({
        bytes: pngBytes(),
        kind: "reference",
        projectId: "p1",
        userId: USER,
      });
      expect(ref).toMatch(/^project-asset:s3-private:/);
      expect(publicUrl).toBeNull();
      expect(putMock).toHaveBeenCalledWith(
        "private",
        expect.stringContaining("project-assets/p1/user_abc/reference/"),
        expect.any(Buffer),
        "image/png",
      );
    });

    it("parseProjectAssetRef accepts the s3 prefix", () => {
      const parsed = parseProjectAssetRef(
        "project-asset:s3:p1/u1/business-image/abc.png",
      );
      expect(parsed).toMatchObject({
        ext: "png",
        kind: "business-image",
        projectId: "p1",
        ulid: "abc",
        userId: "u1",
      });
    });

    it("parseProjectAssetRef accepts the s3-private prefix", () => {
      const parsed = parseProjectAssetRef(
        "project-asset:s3-private:p1/u1/reference/abc.png",
      );
      expect(parsed).toMatchObject({
        kind: "reference",
        projectId: "p1",
        userId: "u1",
        ext: "png",
      });
    });

    it("re-exports detectImageFormat correctly", () => {
      expect(detectImageFormat(pngBytes())).toBe("png");
    });
  });
});
