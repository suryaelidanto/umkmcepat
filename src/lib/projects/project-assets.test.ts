import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createProjectAssetRef,
  deleteProjectAsset,
  parseProjectAssetRef,
  readProjectAsset,
  writeProjectAsset,
  type ProjectAssetKind,
} from "@/lib/projects/project-assets";
import { getStorageProvider } from "@/lib/storage-provider";

const { r2FetchMock, pngBytes } = vi.hoisted(() => {
  const PNG_HEX =
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000005000101f9e0230000000049454e44ae426082";
  return {
    r2FetchMock: vi.fn(
      async (_c: unknown, _k: string, i: { method: string }) =>
        i.method === "GET"
          ? new Response(Buffer.from(PNG_HEX, "hex"), { status: 200 })
          : new Response(null, { status: 200 }),
    ),
    pngBytes: () => Buffer.from(PNG_HEX, "hex"),
  };
});

vi.mock("@/lib/r2-client", () => ({
  getR2Config: vi.fn(({ bucket }: { bucket: string }) => ({
    accessKeyId: "a",
    accountId: "b",
    bucket: bucket === "public" ? "pub" : "priv",
    prefix: "project-assets",
    secretAccessKey: "s",
  })),
  publicUrlFor: (_c: unknown, key: string) =>
    `https://pub-x.r2.dev/project-assets/${key}`,
  signedR2Fetch: r2FetchMock,
  R2Config: {} as never,
}));

const USER = "user_abc";

let tempDir = "";

describe("project assets", () => {
  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true });
      tempDir = "";
    }
    delete process.env.PROJECT_ASSET_DIR;
  });

  function jpegBytes() {
    // Minimal JPEG: FFD8 FF E0 ... FFD9.
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
        "project-asset:local:project-1/user_abc/business-image/abc123",
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
        "project-asset:local:project-1/user_abc/logo/abc123def456.webp",
      );
      expect(parsed).toEqual({
        ext: "webp",
        kind: "logo",
        projectId: "project-1",
        ulid: "abc123def456",
        userId: USER,
      });
    });

    it("rejects refs with bad project ids", () => {
      expect(() =>
        createProjectAssetRef("../escape", "logo", USER, "x"),
      ).toThrow();
    });

    it("returns null for non-asset refs", () => {
      expect(parseProjectAssetRef("object:local:foo.png")).toBeNull();
      expect(parseProjectAssetRef("project-thumbnail:local:123")).toBeNull();
    });

    it("rejects malformed asset refs", () => {
      expect(parseProjectAssetRef("project-asset:local:")).toBeNull();
      // Too few segments.
      expect(parseProjectAssetRef("project-asset:local:proj/logo")).toBeNull();
      // Too few segments even with userId.
      expect(
        parseProjectAssetRef("project-asset:local:proj/user/logo"),
      ).toBeNull();
      // Unknown kind.
      expect(
        parseProjectAssetRef("project-asset:local:proj/user/evil-kind/abc.png"),
      ).toBeNull();
      // Unknown extension.
      expect(
        parseProjectAssetRef("project-asset:local:proj/user/logo/abc.exe"),
      ).toBeNull();
      // Extension but no ulid.
      expect(
        parseProjectAssetRef("project-asset:local:proj/user/logo/.png"),
      ).toBeNull();
      // Path traversal in project id.
      expect(
        parseProjectAssetRef("project-asset:local:..%2f/user/logo/abc.png"),
      ).toBeNull();
      // Path traversal in user id.
      expect(
        parseProjectAssetRef("project-asset:local:proj/..%2f/logo/abc.png"),
      ).toBeNull();
    });
  });

  describe("write / read / delete round-trip", () => {
    it("writes, reads, and deletes a PNG asset locally", async () => {
      tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-assets-"));
      process.env.PROJECT_ASSET_DIR = tempDir;
      const opts = { rootDir: tempDir };

      const { ref } = await writeProjectAsset({
        bytes: pngBytes(),
        kind: "business-image",
        projectId: "proj-png",
        rootDir: tempDir,
        userId: USER,
      });

      const read = await readProjectAsset(ref, opts);
      expect(read?.contentType).toBe("image/png");
      expect(read?.body.equals(pngBytes())).toBe(true);

      await deleteProjectAsset(ref, opts);
      await expect(readProjectAsset(ref, opts)).rejects.toThrow();
    });

    it("accepts jpeg and webp", async () => {
      tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-assets-"));
      const opts = { rootDir: tempDir };

      const { ref: jpegRef } = await writeProjectAsset({
        bytes: jpegBytes(),
        kind: "logo",
        projectId: "proj-jpg",
        rootDir: tempDir,
        userId: USER,
      });
      expect((await readProjectAsset(jpegRef, opts))?.contentType).toBe(
        "image/jpeg",
      );

      const { ref: webpRef } = await writeProjectAsset({
        bytes: webpBytes(),
        kind: "reference",
        projectId: "proj-webp",
        rootDir: tempDir,
        userId: USER,
      });
      expect((await readProjectAsset(webpRef, opts))?.contentType).toBe(
        "image/webp",
      );
    });
  });

  describe("validation guardrails", () => {
    it("rejects files exceeding the size cap", async () => {
      tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-assets-"));
      const oversize = Buffer.concat([
        pngBytes(),
        Buffer.alloc(6 * 1024 * 1024),
      ]);
      await expect(
        writeProjectAsset({
          bytes: oversize,
          kind: "business-image",
          projectId: "proj-big",
          rootDir: tempDir,
          userId: USER,
        }),
      ).rejects.toThrow(/exceeds|too large|size/i);
    });

    it("rejects bytes that don't match a known image magic signature", async () => {
      tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-assets-"));
      await expect(
        writeProjectAsset({
          bytes: Buffer.from("<html><script>alert(1)</script>"),
          kind: "business-image",
          projectId: "proj-evil",
          rootDir: tempDir,
          userId: USER,
        }),
      ).rejects.toThrow(/invalid|not a valid|magic|signature/i);
    });

    it("strips/ignores attacker-supplied extension by deriving type from bytes", async () => {
      tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-assets-"));
      // A real PNG never becomes executable just because the caller lies about
      // content; the ref is server-generated and content-type derived from
      // magic bytes, not from any client-supplied filename.
      const { ref } = await writeProjectAsset({
        bytes: pngBytes(),
        kind: "logo",
        projectId: "proj-lie",
        rootDir: tempDir,
        userId: USER,
      });
      const read = await readProjectAsset(ref, { rootDir: tempDir });
      expect(read?.contentType).toBe("image/png");
      // The ref path is fully server-controlled (no user extension leak).
      expect(ref).not.toContain(".exe");
      expect(ref).not.toContain(".svg");
    });
  });

  describe("kind allowlist", () => {
    it("rejects unknown asset kinds", async () => {
      tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-assets-"));
      await expect(
        writeProjectAsset({
          bytes: pngBytes(),
          kind: "evil-payload" as ProjectAssetKind,
          projectId: "proj-kind",
          rootDir: tempDir,
          userId: USER,
        }),
      ).rejects.toThrow(/kind|invalid/i);
    });
  });

  describe("provider switch + R2 boundary", () => {
    afterEach(() => {
      delete process.env.STORAGE_PROVIDER;
      delete process.env.R2_PUBLIC_BASE_URL;
      r2FetchMock.mockClear();
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

    it("writes a logo to the public bucket with a publicUrl when r2", async () => {
      process.env.STORAGE_PROVIDER = "r2";
      const { publicUrl, ref } = await writeProjectAsset({
        bytes: pngBytes(),
        kind: "logo",
        projectId: "p1",
        userId: USER,
      });
      expect(ref).toMatch(/^project-asset:r2:/);
      expect(publicUrl).toMatch(/^https:\/\/pub-x/);
      const calledConfig = r2FetchMock.mock.calls[0][0] as { bucket: string };
      expect(calledConfig.bucket).toBe("pub");
    });

    it("writes a reference to the private bucket with no publicUrl when r2", async () => {
      process.env.STORAGE_PROVIDER = "r2";
      const { publicUrl, ref } = await writeProjectAsset({
        bytes: pngBytes(),
        kind: "reference",
        projectId: "p1",
        userId: USER,
      });
      expect(ref).toMatch(/^project-asset:r2-private:/);
      expect(publicUrl).toBeNull();
      const calledConfig = r2FetchMock.mock.calls.at(-1)?.[0] as {
        bucket: string;
      };
      expect(calledConfig.bucket).toBe("priv");
    });

    it("parseProjectAssetRef accepts the r2 prefix", () => {
      const parsed = parseProjectAssetRef(
        "project-asset:r2:p1/u1/business-image/abc.png",
      );
      expect(parsed).toMatchObject({
        ext: "png",
        kind: "business-image",
        projectId: "p1",
        ulid: "abc",
        userId: "u1",
      });
    });

    it("parseProjectAssetRef accepts the r2-private prefix", () => {
      const parsed = parseProjectAssetRef(
        "project-asset:r2-private:p1/u1/reference/abc.png",
      );
      expect(parsed).toMatchObject({
        kind: "reference",
        projectId: "p1",
        userId: "u1",
        ext: "png",
      });
    });
  });
});
