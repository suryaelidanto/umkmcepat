import { afterEach, describe, expect, it, vi } from "vitest";

const { authMock, findUniqueMock, readProjectAssetByIdMock } = vi.hoisted(
  () => ({
    authMock: vi.fn(),
    findUniqueMock: vi.fn(),
    readProjectAssetByIdMock: vi.fn(),
  }),
);

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: { projectAsset: { findUnique: findUniqueMock } },
}));
vi.mock("@/lib/projects/project-asset-upload", () => ({
  readProjectAssetById: readProjectAssetByIdMock,
}));

import { Route } from "./api.projects.$id.asset.$assetId";
import { getHandler } from "../../tests/support/route-handler";

const GET = getHandler(Route, "GET");

afterEach(() => {
  authMock.mockReset();
  findUniqueMock.mockReset();
  readProjectAssetByIdMock.mockReset();
});

describe("GET /api/projects/$id/asset/$assetId", () => {
  it("redirects only an owned public display asset", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findUniqueMock.mockResolvedValue({
      projectId: "project_1",
      publicUrl: "https://cdn.example.test/project-assets/asset_1.webp",
      purpose: "business-image",
      ref: "project-asset:s3:project_1/user_1/business-image/asset1.webp",
      userId: "user_1",
      project: { userId: "user_1" },
    });

    const response = await GET(
      new Request("http://localhost/api/projects/project_1/asset/asset_1"),
      { assetId: "asset_1", id: "project_1" },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://cdn.example.test/project-assets/asset_1.webp",
    );
    expect(readProjectAssetByIdMock).not.toHaveBeenCalled();
  });

  it("does not redirect a reference asset with an inconsistent public URL", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findUniqueMock.mockResolvedValue({
      projectId: "project_1",
      publicUrl: "https://cdn.example.test/private-reference.webp",
      purpose: "reference",
      ref: "project-asset:s3-private:project_1/user_1/reference/asset_1.webp",
      userId: "user_1",
      project: { userId: "user_1" },
    });
    readProjectAssetByIdMock.mockResolvedValue({
      body: Buffer.from("reference"),
      contentType: "image/webp",
    });

    const response = await GET(
      new Request("http://localhost/api/projects/project_1/asset/asset_1"),
      { assetId: "asset_1", id: "project_1" },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("reference");
    expect(readProjectAssetByIdMock).toHaveBeenCalledWith("asset_1", {
      projectId: "project_1",
      userId: "user_1",
    });
  });

  it("rejects an asset whose project belongs to another user", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findUniqueMock.mockResolvedValue({
      projectId: "project_1",
      publicUrl: "https://cdn.example.test/project-assets/asset_1.webp",
      purpose: "business-image",
      ref: "project-asset:s3:project_1/user_1/business-image/asset_1.webp",
      userId: "user_1",
      project: { userId: "user_2" },
    });

    const response = await GET(
      new Request("http://localhost/api/projects/project_1/asset/asset_1"),
      { assetId: "asset_1", id: "project_1" },
    );

    expect(response.status).toBe(404);
    expect(readProjectAssetByIdMock).not.toHaveBeenCalled();
  });

  it("does not redirect an invalid public URL", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findUniqueMock.mockResolvedValue({
      projectId: "project_1",
      publicUrl: "not a URL",
      purpose: "business-image",
      ref: "project-asset:s3:project_1/user_1/business-image/asset_1.webp",
      userId: "user_1",
      project: { userId: "user_1" },
    });
    readProjectAssetByIdMock.mockResolvedValue({
      body: Buffer.from("image"),
      contentType: "image/webp",
    });

    const response = await GET(
      new Request("http://localhost/api/projects/project_1/asset/asset_1"),
      { assetId: "asset_1", id: "project_1" },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("image");
    expect(readProjectAssetByIdMock).toHaveBeenCalled();
  });
});
