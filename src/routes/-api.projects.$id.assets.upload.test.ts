import { afterEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  getSettingMock,
  verifyProjectOwnershipMock,
  readTempImageMock,
  claimTempImageMock,
  uploadProjectAssetMock,
  moderateProjectRequestMock,
  chargeModerationEnergyMock,
  checkEnergyMock,
  getEnergyConfigMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  getSettingMock: vi.fn(async (_key: string, fallback: boolean) => fallback),
  verifyProjectOwnershipMock: vi.fn(),
  readTempImageMock: vi.fn(),
  claimTempImageMock: vi.fn(),
  uploadProjectAssetMock: vi.fn(),
  moderateProjectRequestMock: vi.fn(),
  chargeModerationEnergyMock: vi.fn(async () => undefined),
  checkEnergyMock: vi.fn(async () => ({ allowed: true, remaining: 10_000 })),
  getEnergyConfigMock: vi.fn(() => ({ minModeration: 500 })),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/config/app-settings", () => ({ getSetting: getSettingMock }));
vi.mock("@/middleware/ownership", () => ({
  verifyProjectOwnership: verifyProjectOwnershipMock,
}));
vi.mock("@/lib/storage/uploads/temp-image-storage", () => ({
  readTempImage: readTempImageMock,
  claimTempImage: claimTempImageMock,
}));
vi.mock("@/lib/projects/project-asset-upload", () => ({
  isAllowedAssetPurpose: () => true,
  uploadProjectAsset: uploadProjectAssetMock,
}));
vi.mock("@/lib/ai/ai-moderation", () => ({
  chargeModerationEnergy: chargeModerationEnergyMock,
  moderateProjectRequest: moderateProjectRequestMock,
}));
vi.mock("@/lib/payment/user-credits", () => ({
  checkEnergy: checkEnergyMock,
  getEnergyConfig: getEnergyConfigMock,
}));

import { getHandler } from "../../tests/support/route-handler";

import { Route } from "@/routes/api.projects.$id.assets.upload";

const POST = getHandler(Route, "POST");

describe("POST /api/projects/$id/assets/upload", () => {
  afterEach(() => {
    authMock.mockReset();
    getSettingMock.mockReset();
    verifyProjectOwnershipMock.mockReset();
    readTempImageMock.mockReset();
    claimTempImageMock.mockReset();
    uploadProjectAssetMock.mockReset();
    moderateProjectRequestMock.mockReset();
    chargeModerationEnergyMock.mockReset();
    chargeModerationEnergyMock.mockImplementation(async () => undefined);
    checkEnergyMock.mockReset();
    checkEnergyMock.mockImplementation(async () => ({
      allowed: true,
      remaining: 10_000,
    }));
    getEnergyConfigMock.mockReset();
    getEnergyConfigMock.mockImplementation(() => ({ minModeration: 500 }));
    getSettingMock.mockImplementation(
      async (_key: string, fallback: boolean) => fallback,
    );
  });

  it("fails closed when direct image moderation is unavailable", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    verifyProjectOwnershipMock.mockResolvedValue(true);
    moderateProjectRequestMock.mockRejectedValue(new Error("provider down"));

    const form = new FormData();
    form.append("purpose", "business-image");
    form.append(
      "file",
      new File(
        [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
        "business.png",
        { type: "image/png" },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/projects/project_1/assets/upload", {
        body: form,
        method: "POST",
      }),
      { id: "project_1" },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    expect(uploadProjectAssetMock).not.toHaveBeenCalled();
  });

  it("rejects an image moderation request without spending energy", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    verifyProjectOwnershipMock.mockResolvedValue(true);
    checkEnergyMock.mockResolvedValue({ allowed: false, remaining: 100 });

    const form = new FormData();
    form.append("purpose", "business-image");
    form.append(
      "file",
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "business.png", {
        type: "image/png",
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/projects/project_1/assets/upload", {
        body: form,
        method: "POST",
      }),
      { id: "project_1" },
    );

    expect(response.status).toBe(429);
    expect(moderateProjectRequestMock).not.toHaveBeenCalled();
    expect(uploadProjectAssetMock).not.toHaveBeenCalled();
  });

  it("fails closed when temporary image moderation is unavailable — temp image kept for retry", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    verifyProjectOwnershipMock.mockResolvedValue(true);
    readTempImageMock.mockResolvedValue({
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      contentType: "image/png",
    });
    moderateProjectRequestMock.mockRejectedValue(new Error("provider down"));

    const form = new FormData();
    form.append("purpose", "business-image");
    form.append("assetId", "temp-token");

    const response = await POST(
      new Request("http://localhost/api/projects/project_1/assets/upload", {
        body: form,
        method: "POST",
      }),
      { id: "project_1" },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    // A failed check must not claim (delete) the temp object.
    expect(moderateProjectRequestMock.mock.invocationCallOrder[0]).toBeLessThan(
      claimTempImageMock.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(claimTempImageMock).not.toHaveBeenCalled();
    expect(uploadProjectAssetMock).not.toHaveBeenCalled();
  });

  it("claims only after moderation allows a temp image", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    verifyProjectOwnershipMock.mockResolvedValue(true);
    readTempImageMock.mockResolvedValue({
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      contentType: "image/png",
    });
    moderateProjectRequestMock.mockResolvedValue({
      allowed: true,
      modelId: "vision",
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    claimTempImageMock.mockResolvedValue({
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      contentType: "image/png",
      sizeBytes: 4,
    });
    uploadProjectAssetMock.mockResolvedValue({ id: "asset_1" });

    const form = new FormData();
    form.append("purpose", "business-image");
    form.append("assetId", "temp-token");

    const response = await POST(
      new Request("http://localhost/api/projects/project_1/assets/upload", {
        body: form,
        method: "POST",
      }),
      { id: "project_1" },
    );

    expect(response.status).toBe(201);
    expect(moderateProjectRequestMock.mock.invocationCallOrder[0]).toBeLessThan(
      claimTempImageMock.mock.invocationCallOrder[0]!,
    );
    expect(checkEnergyMock).toHaveBeenCalledWith("u1", 500);
    expect(chargeModerationEnergyMock).toHaveBeenCalledWith(
      "u1",
      {
        allowed: true,
        modelId: "vision",
        usage: { inputTokens: 1, outputTokens: 1 },
      },
      { projectId: "project_1" },
    );
    expect(uploadProjectAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project_1", userId: "u1" }),
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
