import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createProjectAssetRef,
  deleteProjectAsset,
  deleteProjectAssetById,
  detectImageFormat,
  filterOwnedBusinessAssetIds,
  listProjectBusinessImagesForDiscussion,
  listProjectAssetsWithUsage,
  parseProjectAssetRef,
  readProjectAsset,
  writeProjectAsset,
  type ProjectAssetKind,
} from "@/lib/projects/project-assets";
import { getStorageProvider } from "@/lib/storage/storage-provider";

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

vi.mock("@/lib/storage/s3-client", () => ({
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

  describe("listProjectAssetsWithUsage", () => {
    it("lists assets and detects usage in snapshot files", async () => {
      const fakeClient = {
        projectAsset: {
          findMany: vi.fn(async () => [
            {
              id: "asset-1",
              purpose: "business-image",
              contentType: "image/jpeg",
              sizeBytes: 2000,
              publicUrl: "https://media.test/asset-1.jpg",
              createdAt: new Date("2026-08-25T10:00:00Z"),
              ref: "project-asset:s3:p1/u1/business-image/asset-1.jpeg",
            },
            {
              id: "asset-2",
              purpose: "logo",
              contentType: "image/png",
              sizeBytes: 1000,
              publicUrl: null,
              createdAt: new Date("2026-08-25T11:00:00Z"),
              ref: "project-asset:s3:p1/u1/logo/asset-2.png",
            },
          ]),
        },
        projectSnapshot: {
          findFirst: vi.fn(async () => ({
            files: [
              {
                path: "src/content/site.ts",
                content: `export const site = { hero: { image: "/api/media/asset-1" } };`,
              },
            ],
          })),
        },
      };

      const result = await listProjectAssetsWithUsage(
        "p1",
        fakeClient as unknown as Parameters<
          typeof listProjectAssetsWithUsage
        >[1],
      );

      expect(result.count).toBe(2);
      expect(result.totalBytes).toBe(3000);
      expect(result.assets[0]).toEqual({
        id: "asset-1",
        purpose: "business-image",
        contentType: "image/jpeg",
        sizeBytes: 2000,
        publicUrl: "https://media.test/asset-1.jpg",
        mediaUrl: "/api/projects/p1/asset/asset-1",
        createdAt: "2026-08-25T10:00:00.000Z",
        isUsed: true,
      });
      expect(result.assets[1].isUsed).toBe(false);
    });
  });

  describe("listProjectBusinessImagesForDiscussion", () => {
    it("returns owner-scoped image metadata in creation order", async () => {
      const findMany = vi.fn(async () => [
        { id: "asset-1", contentType: "image/webp" },
      ]);
      const result = await listProjectBusinessImagesForDiscussion("p1", "u1", {
        projectAsset: { findMany },
      } as never);

      expect(result).toEqual([{ id: "asset-1", contentType: "image/webp" }]);
      expect(findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: "asc" },
        select: { contentType: true, id: true },
        where: { projectId: "p1", purpose: "business-image", userId: "u1" },
      });
    });
  });

  describe("filterOwnedBusinessAssetIds", () => {
    it("keeps only business images owned by the project user in input order", async () => {
      const findMany = vi.fn(async () => [
        { id: "asset-2" },
        { id: "asset-1" },
      ]);
      const client = {
        projectAsset: { findMany },
      };

      const result = await filterOwnedBusinessAssetIds(
        ["asset-1", "foreign", "asset-1", "asset-2"],
        "p1",
        "u1",
        client as unknown as Parameters<typeof filterOwnedBusinessAssetIds>[3],
      );

      expect(result).toEqual(["asset-1", "asset-2"]);
      expect(findMany).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          id: { in: ["asset-1", "foreign", "asset-2"] },
          projectId: "p1",
          purpose: "business-image",
          userId: "u1",
        },
      });
    });
  });

  describe("deleteProjectAssetById", () => {
    it("deletes S3 object and db record when asset exists", async () => {
      const deleteRecordMock = vi.fn(async () => {});
      const fakeClient = {
        projectAsset: {
          findFirst: vi.fn(async () => ({
            id: "asset-1",
            ref: "project-asset:s3:p1/u1/business-image/asset-1.jpeg",
          })),
          delete: deleteRecordMock,
        },
      };

      const deleted = await deleteProjectAssetById(
        { assetId: "asset-1", projectId: "p1", userId: "u1" },
        fakeClient as unknown as Parameters<typeof deleteProjectAssetById>[1],
      );

      expect(deleted).toBe(true);
      expect(deleteRecordMock).toHaveBeenCalledWith({
        where: { id: "asset-1" },
      });
    });

    it("returns false when asset does not exist", async () => {
      const fakeClient = {
        projectAsset: {
          findFirst: vi.fn(async () => null),
        },
      };

      const deleted = await deleteProjectAssetById(
        { assetId: "missing", projectId: "p1", userId: "u1" },
        fakeClient as unknown as Parameters<typeof deleteProjectAssetById>[1],
      );

      expect(deleted).toBe(false);
    });
  });
});
