import { afterEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  verifyProjectOwnershipMock,
  listProjectAssetsWithUsageMock,
  deleteProjectAssetByIdMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  verifyProjectOwnershipMock: vi.fn(),
  listProjectAssetsWithUsageMock: vi.fn(),
  deleteProjectAssetByIdMock: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/middleware/ownership", () => ({
  verifyProjectOwnership: verifyProjectOwnershipMock,
}));
vi.mock("@/lib/projects/project-assets", () => ({
  listProjectAssetsWithUsage: listProjectAssetsWithUsageMock,
  deleteProjectAssetById: deleteProjectAssetByIdMock,
}));

import { getHandler } from "../../tests/support/route-handler";

import { Route } from "@/routes/api.projects.$id.assets";

const GET = getHandler(Route, "GET");
const DELETE = getHandler(Route, "DELETE");

describe("/api/projects/$id/assets", () => {
  afterEach(() => {
    authMock.mockReset();
    verifyProjectOwnershipMock.mockReset();
    listProjectAssetsWithUsageMock.mockReset();
    deleteProjectAssetByIdMock.mockReset();
  });

  describe("GET", () => {
    it("returns 401 when user is not authenticated", async () => {
      authMock.mockResolvedValue(null);

      const response = await GET(
        new Request("http://localhost/api/projects/p1/assets"),
        { id: "p1" },
      );

      expect(response.status).toBe(401);
    });

    it("returns 404 when project ownership check fails", async () => {
      authMock.mockResolvedValue({ user: { id: "u1" } });
      verifyProjectOwnershipMock.mockResolvedValue(false);

      const response = await GET(
        new Request("http://localhost/api/projects/p1/assets"),
        { id: "p1" },
      );

      expect(response.status).toBe(404);
    });

    it("returns assets list when authorized", async () => {
      authMock.mockResolvedValue({ user: { id: "u1" } });
      verifyProjectOwnershipMock.mockResolvedValue(true);
      listProjectAssetsWithUsageMock.mockResolvedValue({
        assets: [
          {
            id: "a1",
            purpose: "business-image",
            contentType: "image/jpeg",
            sizeBytes: 1024,
            publicUrl: null,
            mediaUrl: "/api/media/a1",
            createdAt: "2026-08-25T10:00:00.000Z",
            isUsed: true,
          },
        ],
        count: 1,
        maxBytes: 52428800,
        maxCount: 20,
        totalBytes: 1024,
      });

      const response = await GET(
        new Request("http://localhost/api/projects/p1/assets"),
        { id: "p1" },
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.count).toBe(1);
      expect(json.assets[0].id).toBe("a1");
      expect(json.assets[0].isUsed).toBe(true);
    });
  });

  describe("DELETE", () => {
    it("returns 400 when assetId is missing", async () => {
      authMock.mockResolvedValue({ user: { id: "u1" } });
      verifyProjectOwnershipMock.mockResolvedValue(true);

      const response = await DELETE(
        new Request("http://localhost/api/projects/p1/assets", {
          method: "DELETE",
          body: JSON.stringify({}),
          headers: { "Content-Type": "application/json" },
        }),
        { id: "p1" },
      );

      expect(response.status).toBe(400);
    });

    it("deletes asset successfully", async () => {
      authMock.mockResolvedValue({ user: { id: "u1" } });
      verifyProjectOwnershipMock.mockResolvedValue(true);
      deleteProjectAssetByIdMock.mockResolvedValue(true);

      const response = await DELETE(
        new Request("http://localhost/api/projects/p1/assets?assetId=a1", {
          method: "DELETE",
        }),
        { id: "p1" },
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.ok).toBe(true);
      expect(deleteProjectAssetByIdMock).toHaveBeenCalledWith({
        assetId: "a1",
        projectId: "p1",
        userId: "u1",
      });
    });
  });
});
