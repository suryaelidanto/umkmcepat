import { afterEach, describe, expect, it, vi } from "vitest";

const { authMock, uploadTempImageMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  uploadTempImageMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/uploads/temp-image-storage", () => ({
  uploadTempImage: uploadTempImageMock,
}));

import { getHandler } from "./_handler";

import { Route } from "@/routes/api.uploads.temp-images";

const POST = getHandler(Route, "POST");

describe("POST /api/uploads/temp-images", () => {
  afterEach(() => {
    authMock.mockReset();
    uploadTempImageMock.mockReset();
  });

  it("requires a session", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(401);
    expect(uploadTempImageMock).not.toHaveBeenCalled();
  });

  it("uploads a temp image for any authenticated user (shared endpoint: waitlist, support, composer)", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    uploadTempImageMock.mockResolvedValue({
      assetId: "token-1",
      url: "/api/uploads/temp-images/token-1",
    });

    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array([1, 2, 3])], "a.png", {
        type: "image/png",
      }),
    );
    const response = await POST(
      new Request("http://localhost/api/uploads/temp-images", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(201);
    expect(uploadTempImageMock).toHaveBeenCalledWith("u1", expect.any(File));
  });
});
