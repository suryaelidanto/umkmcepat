import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, userFindUniqueMock } = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<unknown>>(async () => null),
  userFindUniqueMock: vi.fn(
    async (): Promise<{ image: string | null }> => ({
      image: null,
    }),
  ),
}));

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: userFindUniqueMock,
    },
  },
}));

import { GET } from "./route";

const pngDataUrl = `data:image/png;base64,${Buffer.from("avatar").toString("base64")}`;

describe("profile avatar route", () => {
  beforeEach(() => {
    authMock.mockReset();
    userFindUniqueMock.mockReset();
  });

  it("requires login", async () => {
    authMock.mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("returns stored avatar bytes", async () => {
    authMock.mockResolvedValueOnce({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    });
    userFindUniqueMock.mockResolvedValueOnce({ image: pngDataUrl });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    await expect(response.text()).resolves.toBe("avatar");
  });
});
