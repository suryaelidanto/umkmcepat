import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  putStoredObjectMock,
  getStoredObjectMock,
  prismaMock,
  isAdminEmailMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  getStoredObjectMock: vi.fn(),
  isAdminEmailMock: vi.fn(),
  prismaMock: {
    supportMessage: {
      findFirst: vi.fn(),
    },
  },
  putStoredObjectMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/object-storage", () => ({
  getStoredObject: getStoredObjectMock,
  putStoredObject: putStoredObjectMock,
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/waitlist", () => ({ isAdminEmail: isAdminEmailMock }));

async function callPost(formData: FormData | null) {
  const { Route } = await import("@/routes/api.support.assets");
  const handler = (
    Route as unknown as {
      options: {
        server: {
          handlers: {
            POST: (ctx: { request: Request }) => Promise<Response>;
          };
        };
      };
    }
  ).options.server.handlers.POST;

  const req = {
    formData: async () => {
      if (formData === null) {
        throw new Error("Invalid request");
      }
      return formData;
    },
  } as unknown as Request;

  return handler({ request: req });
}

async function callGet(assetId: string) {
  const { Route } = await import("@/routes/api.support.assets.$assetId");
  const handler = (
    Route as unknown as {
      options: {
        server: {
          handlers: {
            GET: (ctx: { params: { assetId: string } }) => Promise<Response>;
          };
        };
      };
    }
  ).options.server.handlers.GET;

  return handler({ params: { assetId } });
}

describe("Support Assets Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminEmailMock.mockReturnValue(false);
  });

  describe("POST /api/support/assets", () => {
    it("returns 401 if unauthorized", async () => {
      authMock.mockResolvedValueOnce(null);
      const res = await callPost(new FormData());
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        message: "Masuk dulu untuk melanjutkan.",
      });
    });

    it("returns 400 if bad multipart form", async () => {
      authMock.mockResolvedValueOnce({ user: { id: "u1" } });
      const res = await callPost(null);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        message: "Permintaan upload tidak valid.",
      });
    });

    it("returns 400 if no file field", async () => {
      authMock.mockResolvedValueOnce({ user: { id: "u1" } });
      const form = new FormData();
      const res = await callPost(form);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        message: "File belum dipilih.",
      });
    });

    it("returns 413 if file is too large", async () => {
      authMock.mockResolvedValueOnce({ user: { id: "u1" } });
      const form = new FormData();
      const file = new File([new Uint8Array(6 * 1024 * 1024)], "test.png", {
        type: "image/png",
      });
      form.append("file", file);
      const res = await callPost(form);
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({
        message: "Ukuran file melebihi 5 MB.",
      });
    });

    it("returns 400 if file has invalid/unsupported format magic bytes", async () => {
      authMock.mockResolvedValueOnce({ user: { id: "u1" } });
      const form = new FormData();
      // plain text "hello world"
      const file = new File([Buffer.from("hello world")], "test.png", {
        type: "image/png",
      });
      form.append("file", file);
      const res = await callPost(form);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        message:
          "Format file tidak didukung. Gunakan PNG, JPEG, WEBP, atau GIF.",
      });
    });

    it("returns 201 with assets details and uses magic bytes classification", async () => {
      authMock.mockResolvedValueOnce({ user: { id: "u1" } });
      const form = new FormData();
      // PNG header magic bytes
      const pngBytes = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
      ]);
      const file = new File([pngBytes], "wrong-extension.txt", {
        type: "text/plain", // Client claims it's a txt file, but it's actually a PNG
      });
      form.append("file", file);

      putStoredObjectMock.mockResolvedValueOnce(
        "object:s3:support/assets/uuid.png",
      );

      const res = await callPost(form);
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.contentType).toBe("image/png");
      expect(json.assetId).toContain(".png");
      expect(json.url).toContain(`/api/support/assets/${json.assetId}`);

      expect(putStoredObjectMock).toHaveBeenCalledWith({
        body: expect.any(Buffer),
        contentType: "image/png",
        key: `support/assets/${json.assetId}`,
      });
    });

    it("returns 500 when object storage save fails", async () => {
      authMock.mockResolvedValueOnce({ user: { id: "u1" } });
      const form = new FormData();
      const pngBytes = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const file = new File([pngBytes], "test.png", { type: "image/png" });
      form.append("file", file);

      putStoredObjectMock.mockRejectedValueOnce(new Error("Storage full"));

      const res = await callPost(form);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        message: "Gagal menyimpan file ke storage.",
      });
    });
  });

  describe("GET /api/support/assets/$assetId", () => {
    it("returns 401 if unauthorized", async () => {
      authMock.mockResolvedValueOnce(null);
      const res = await callGet("uuid.png");
      expect(res.status).toBe(401);
    });

    it("returns 403 / Forbidden if not owner and not admin", async () => {
      authMock.mockResolvedValueOnce({
        user: { email: "user@example.com", id: "user_1" },
      });
      prismaMock.supportMessage.findFirst.mockResolvedValueOnce(null); // ticket not found/not owned

      const res = await callGet("uuid.png");
      expect(res.status).toBe(403);
    });

    it("returns 404 if ticket message exists but asset not found in storage", async () => {
      authMock.mockResolvedValueOnce({
        user: { email: "user@example.com", id: "user_1" },
      });
      // Mock message finding succeeds (user is owner)
      prismaMock.supportMessage.findFirst.mockResolvedValueOnce({
        ticket: { userId: "user_1" },
      });

      getStoredObjectMock.mockResolvedValueOnce(null);

      const res = await callGet("uuid.png");
      expect(res.status).toBe(404);
      expect(getStoredObjectMock).toHaveBeenCalledWith(
        "object:s3:support/assets/uuid.png",
      );
    });

    it("returns 200 with bytes if owner + asset exists in storage", async () => {
      authMock.mockResolvedValueOnce({
        user: { email: "user@example.com", id: "user_1" },
      });
      prismaMock.supportMessage.findFirst.mockResolvedValueOnce({
        ticket: { userId: "user_1" },
      });

      getStoredObjectMock.mockResolvedValueOnce({
        body: Buffer.from([1, 2, 3]),
        contentType: "image/png",
      });

      const res = await callGet("uuid.png");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/png");
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(
        new Uint8Array([1, 2, 3]),
      );
    });

    it("returns 200 for admins even if they are not the owner", async () => {
      authMock.mockResolvedValueOnce({
        user: { email: "admin@katalis.id", id: "admin_1" },
      });
      isAdminEmailMock.mockReturnValueOnce(true);

      getStoredObjectMock.mockResolvedValueOnce({
        body: Buffer.from([4, 5, 6]),
        contentType: "image/png",
      });

      const res = await callGet("uuid.png");
      expect(res.status).toBe(200);
      expect(prismaMock.supportMessage.findFirst).not.toHaveBeenCalled();
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(
        new Uint8Array([4, 5, 6]),
      );
    });
  });
});
