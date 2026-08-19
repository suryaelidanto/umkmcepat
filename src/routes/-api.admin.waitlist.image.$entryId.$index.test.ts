import { describe, expect, it, vi } from "vitest";

const { requireAdminMock, getStoredObjectMock, findUniqueMock } = vi.hoisted(
  () => ({
    findUniqueMock: vi.fn(),
    getStoredObjectMock: vi.fn(),
    requireAdminMock: vi.fn(),
  }),
);

vi.mock("@/lib/auth/auth-admin", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/storage/object-storage", () => ({
  getStoredObject: getStoredObjectMock,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { waitlistEntry: { findUnique: findUniqueMock } },
}));

async function callGet(entryId: string, index: string) {
  const { Route } =
    await import("@/routes/api.admin.waitlist.image.$entryId.$index");
  const handler = (
    Route as unknown as {
      options: {
        server: {
          handlers: {
            GET: (ctx: {
              params: { entryId: string; index: string };
            }) => Promise<Response>;
          };
        };
      };
    }
  ).options.server.handlers.GET;
  return handler({ params: { entryId, index } });
}

function adminOk() {
  return requireAdminMock.mockResolvedValueOnce({
    admin: { email: "a@x", userId: "u" },
    ok: true,
  });
}

describe("GET /api/admin/waitlist/image/$entryId/$index", () => {
  it("401s when requireAdmin denies", async () => {
    requireAdminMock.mockResolvedValueOnce({
      message: "no",
      ok: false,
      status: 401,
    });
    const res = await callGet("has-img", "0");
    expect(res.status).toBe(401);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("404s when the entry is missing", async () => {
    adminOk();
    findUniqueMock.mockResolvedValueOnce(null);
    const res = await callGet("missing", "0");
    expect(res.status).toBe(404);
  });

  it("404s when the entry has no imageRef", async () => {
    adminOk();
    findUniqueMock.mockResolvedValueOnce({ imageRef: null });
    const res = await callGet("no-img", "0");
    expect(res.status).toBe(404);
    expect(getStoredObjectMock).not.toHaveBeenCalled();
  });

  it("404s when imageRef is not a valid JSON array", async () => {
    adminOk();
    findUniqueMock.mockResolvedValueOnce({ imageRef: "not-json" });
    const res = await callGet("bad", "0");
    expect(res.status).toBe(404);
  });

  it("404s when index is out of range", async () => {
    adminOk();
    findUniqueMock.mockResolvedValueOnce({
      imageRef: JSON.stringify(["object:local:waitlist/abc.png"]),
    });
    const res = await callGet("has-img", "5");
    expect(res.status).toBe(404);
    expect(getStoredObjectMock).not.toHaveBeenCalled();
  });

  it("200s with first image when index=0 and JSON array holds one ref", async () => {
    adminOk();
    findUniqueMock.mockResolvedValueOnce({
      imageRef: JSON.stringify(["object:local:waitlist/abc.png"]),
    });
    getStoredObjectMock.mockResolvedValueOnce({
      body: Buffer.from([1, 2, 3, 4]),
      contentType: "image/png",
    });
    const res = await callGet("has-img", "0");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual([
      1, 2, 3, 4,
    ]);
    expect(getStoredObjectMock).toHaveBeenCalledWith(
      "object:local:waitlist/abc.png",
    );
  });

  it("200s with the nth ref when index > 0", async () => {
    adminOk();
    findUniqueMock.mockResolvedValueOnce({
      imageRef: JSON.stringify([
        "object:local:waitlist/first.png",
        "object:local:waitlist/second.png",
      ]),
    });
    getStoredObjectMock.mockResolvedValueOnce({
      body: Buffer.from([9, 9]),
      contentType: "image/jpeg",
    });
    const res = await callGet("has-img", "1");
    expect(res.status).toBe(200);
    expect(getStoredObjectMock).toHaveBeenCalledWith(
      "object:local:waitlist/second.png",
    );
  });

  it("404s when getStoredObject returns null (stale ref)", async () => {
    adminOk();
    findUniqueMock.mockResolvedValueOnce({
      imageRef: JSON.stringify(["object:local:waitlist/abc.png"]),
    });
    getStoredObjectMock.mockResolvedValueOnce(null);
    const res = await callGet("stale", "0");
    expect(res.status).toBe(404);
  });
});
