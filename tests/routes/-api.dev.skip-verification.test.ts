import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const userUpsertMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      upsert: userUpsertMock,
    },
  },
}));

const { getHandler } = await import("./_handler");
const { Route } = await import("@/routes/api.dev.skip-verification");

const POST = getHandler(Route, "POST");

describe("POST /api/dev/skip-verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "development";
  });

  it("creates the user row when it does not exist (regression: P2025 on missing row)", async () => {
    authMock.mockResolvedValue({
      user: { id: "ghost-user", email: "ghost@example.com", name: "Ghost" },
    });
    userUpsertMock.mockResolvedValue({ id: "ghost-user" });

    const res = await POST();

    expect(res.status).toBe(200);
    expect(userUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ghost-user" },
        update: expect.objectContaining({ verifiedAt: expect.any(Date) }),
        create: expect.objectContaining({
          id: "ghost-user",
          email: "ghost@example.com",
        }),
      }),
    );
  });
});
