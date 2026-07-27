import { describe, expect, it, vi } from "vitest";

const { requireAdminMock, getStoredObjectMock, findUniqueMock } = vi.hoisted(
  () => ({
    findUniqueMock: vi.fn(),
    getStoredObjectMock: vi.fn(),
    requireAdminMock: vi.fn(),
  }),
);

vi.mock("@/lib/auth-admin", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/object-storage", () => ({
  getStoredObject: getStoredObjectMock,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { waitlistEntry: { findUnique: findUniqueMock } },
}));

async function callGet(entryId: string) {
  const { Route } = await import("@/routes/api.admin.waitlist.image.$entryId");
  const handler = (
    Route as unknown as {
      options: {
        server: {
          handlers: {
            GET: (ctx: { params: { entryId: string } }) => Promise<Response>;
          };
        };
      };
    }
  ).options.server.handlers.GET;
  return handler({ params: { entryId } });
}

describe("GET /api/admin/waitlist/image/$entryId", () => {
  it("401s when requireAdmin denies", async () => {
    requireAdminMock.mockResolvedValueOnce({
      message: "no",
      ok: false,
      status: 401,
    });
    const res = await callGet("has-img");
    expect(res.status).toBe(401);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("404s when the entry is missing", async () => {
    requireAdminMock.mockResolvedValueOnce({
      admin: { email: "a@x", userId: "u" },
      ok: true,
    });
    findUniqueMock.mockResolvedValueOnce(null);
    const res = await callGet("missing");
    expect(res.status).toBe(404);
    expect(getStoredObjectMock).not.toHaveBeenCalled();
  });

  it("404s when the entry has no imageRef", async () => {
    requireAdminMock.mockResolvedValueOnce({
      admin: { email: "a@x", userId: "u" },
      ok: true,
    });
    findUniqueMock.mockResolvedValueOnce({ imageRef: null });
    const res = await callGet("no-img");
    expect(res.status).toBe(404);
    expect(getStoredObjectMock).not.toHaveBeenCalled();
  });

  it("404s when getStoredObject returns null (stale ref)", async () => {
    requireAdminMock.mockResolvedValueOnce({
      admin: { email: "a@x", userId: "u" },
      ok: true,
    });
    findUniqueMock.mockResolvedValueOnce({
      imageRef: "object:local:waitlist/abc.png",
    });
    getStoredObjectMock.mockResolvedValueOnce(null);
    const res = await callGet("stale");
    expect(res.status).toBe(404);
  });

  it("200s with image bytes + Content-Type when admin + image present", async () => {
    requireAdminMock.mockResolvedValueOnce({
      admin: { email: "a@x", userId: "u" },
      ok: true,
    });
    findUniqueMock.mockResolvedValueOnce({
      imageRef: "object:local:waitlist/abc.png",
    });
    getStoredObjectMock.mockResolvedValueOnce({
      body: Buffer.from([1, 2, 3, 4]),
      contentType: "image/png",
    });
    const res = await callGet("has-img");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual([
      1, 2, 3, 4,
    ]);
  });
});
