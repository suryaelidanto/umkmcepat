import { afterEach, describe, expect, it, vi } from "vitest";

const { authMock, getSettingMock, uploadTempImageMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getSettingMock: vi.fn(async (_key: string, fallback: boolean) => fallback),
  uploadTempImageMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/app-settings", () => ({ getSetting: getSettingMock }));
vi.mock("@/lib/uploads/temp-image-storage", () => ({
  uploadTempImage: uploadTempImageMock,
}));

import { getHandler } from "./_handler";

import { Route } from "@/routes/api.uploads.temp-images";

const POST = getHandler(Route, "POST");

describe("POST /api/uploads/temp-images", () => {
  afterEach(() => {
    authMock.mockReset();
    getSettingMock.mockReset();
    uploadTempImageMock.mockReset();
    getSettingMock.mockImplementation(
      async (_key: string, fallback: boolean) => fallback,
    );
  });

  it("returns 404 when feature.composer_uploads_enabled is off", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    getSettingMock.mockResolvedValueOnce(false);

    const response = await POST();

    expect(response.status).toBe(404);
    expect(uploadTempImageMock).not.toHaveBeenCalled();
  });
});
