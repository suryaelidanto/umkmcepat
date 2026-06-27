import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, replaceStoredObjectMock, userUpdateMock } = vi.hoisted(
  () => ({
    authMock: vi.fn<() => Promise<unknown>>(async () => null),
    replaceStoredObjectMock: vi.fn(
      async () => "object:local:profile-avatars/user_1/avatar.png",
    ),
    userUpdateMock: vi.fn(
      async ({ data }: { data: { image?: string; name: string } }) => ({
        image: data.image || null,
        name: data.name,
      }),
    ),
  }),
);

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/object-storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/object-storage")>(
    "@/lib/object-storage",
  );

  return {
    ...actual,
    replaceStoredObject: replaceStoredObjectMock,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: userUpdateMock,
    },
  },
}));

import { PATCH } from "./route";

const pngDataUrl = `data:image/png;base64,${Buffer.from("avatar").toString("base64")}`;

describe("profile API route", () => {
  beforeEach(() => {
    authMock.mockReset();
    replaceStoredObjectMock.mockClear();
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
      select: { image: true, name: true },
    });
    await expect(response.json()).resolves.toEqual({
      user: { image: "", name: "Surya Elidanto" },
    });
  });

  it("preserves the provider image when saving a profile without upload", async () => {
    authMock.mockResolvedValueOnce({
      user: { id: "user_1", image: "https://lh3.googleusercontent.com/avatar" },
      expires: new Date().toISOString(),
    });

    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ name: "Surya" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: {
        image: "https://lh3.googleusercontent.com/avatar",
        name: "Surya",
      },
      select: { image: true, name: true },
    });
  });

  it("validates and saves profile images", async () => {
    authMock.mockResolvedValueOnce({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    });

    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ imageDataUrl: pngDataUrl, name: "Surya" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(replaceStoredObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "image/png",
        key: "profile-avatars/user_1/avatar.png",
      }),
    );
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: {
        image: "object:local:profile-avatars/user_1/avatar.png",
        name: "Surya",
      },
      select: { image: true, name: true },
    });
    await expect(response.json()).resolves.toEqual({
      user: { image: "/api/profile/avatar", name: "Surya" },
    });
  });

  it("rejects unsupported profile images", async () => {
    authMock.mockResolvedValueOnce({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    });

    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          imageDataUrl: "data:image/gif;base64,AAAA",
          name: "Surya",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(userUpdateMock).not.toHaveBeenCalled();
  });
});
