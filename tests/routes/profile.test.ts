import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, userUpdateMock } = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<unknown>>(async () => null),
  userUpdateMock: vi.fn(async ({ data }: { data: { name: string } }) => ({
    name: data.name,
  })),
}));

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: userUpdateMock,
    },
  },
}));

import { getHandler } from "./_handler";

import { Route } from "@/routes/api.profile";

const PATCH = getHandler(Route, "PATCH");

describe("profile API route", () => {
  beforeEach(() => {
    authMock.mockReset();
    userUpdateMock.mockClear();
  });

  it("requires login", async () => {
    authMock.mockResolvedValueOnce(null);

    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ name: "Surya" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects empty names", async () => {
    authMock.mockResolvedValueOnce({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    });

    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ name: "   " }),
      }),
    );

    expect(response.status).toBe(400);
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("normalizes and saves the current user's name", async () => {
    authMock.mockResolvedValueOnce({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    });

    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ name: "  Surya   Elidanto  " }),
      }),
    );

    expect(response.status).toBe(200);
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { name: "Surya Elidanto" },
      select: { name: true },
    });
    await expect(response.json()).resolves.toEqual({
      user: { name: "Surya Elidanto" },
    });
  });
});
