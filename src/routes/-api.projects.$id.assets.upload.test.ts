import { afterEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  getSettingMock,
  verifyProjectOwnershipMock,
  claimTempImageMock,
  uploadProjectAssetMock,
  moderateProjectRequestMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  getSettingMock: vi.fn(async (_key: string, fallback: boolean) => fallback),
  verifyProjectOwnershipMock: vi.fn(),
  claimTempImageMock: vi.fn(),
  uploadProjectAssetMock: vi.fn(),
  moderateProjectRequestMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/app-settings", () => ({ getSetting: getSettingMock }));
vi.mock("@/middleware/ownership", () => ({
  verifyProjectOwnership: verifyProjectOwnershipMock,
}));
vi.mock("@/lib/uploads/temp-image-storage", () => ({
  claimTempImage: claimTempImageMock,
}));
vi.mock("@/lib/projects/project-asset-upload", () => ({
  isAllowedAssetPurpose: () => true,
  uploadProjectAsset: uploadProjectAssetMock,
}));
vi.mock("@/lib/ai-moderation", () => ({
  moderateProjectRequest: moderateProjectRequestMock,
}));

import { getHandler } from "../../tests/support/route-handler";

import { Route } from "@/routes/api.projects.$id.assets.upload";

const POST = getHandler(Route, "POST");

describe("POST /api/projects/$id/assets/upload", () => {
  afterEach(() => {
    authMock.mockReset();
    getSettingMock.mockReset();
    verifyProjectOwnershipMock.mockReset();
    claimTempImageMock.mockReset();
    uploadProjectAssetMock.mockReset();
    moderateProjectRequestMock.mockReset();
    getSettingMock.mockImplementation(
      async (_key: string, fallback: boolean) => fallback,
    );
  });

  it("returns 404 when feature.composer_uploads_enabled is off", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    verifyProjectOwnershipMock.mockResolvedValue(true);
    getSettingMock.mockResolvedValueOnce(false);

    const response = await POST(
      new Request("http://localhost/api/projects/project_1/assets/upload", {
        method: "POST",
      }),
      { id: "project_1" },
    );

    expect(response.status).toBe(404);
    expect(claimTempImageMock).not.toHaveBeenCalled();
    expect(uploadProjectAssetMock).not.toHaveBeenCalled();
  });
});
