import { beforeEach, describe, expect, it, vi } from "vitest";

const { aggregateMock, createMock, findFirstMock, writeProjectAssetMock } =
  vi.hoisted(() => ({
    aggregateMock: vi.fn(),
    createMock: vi.fn(),
    findFirstMock: vi.fn(),
    writeProjectAssetMock: vi.fn(),
  }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectAsset: {
      aggregate: aggregateMock,
      create: createMock,
      findFirst: findFirstMock,
    },
  },
}));

vi.mock("@/lib/projects/project-assets", () => ({
  readProjectAsset: vi.fn(),
  writeProjectAsset: writeProjectAssetMock,
}));

vi.mock("@/lib/dev-log", () => ({
  devLog: vi.fn(),
}));

import { uploadProjectAsset } from "./project-asset-upload";

describe("uploadProjectAsset source idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records the source token on a newly saved asset", async () => {
    findFirstMock.mockResolvedValue(null);
    aggregateMock.mockResolvedValue({
      _count: { id: 0 },
      _sum: { sizeBytes: 0 },
    });
    writeProjectAssetMock.mockResolvedValue({
      publicUrl: "https://cdn.example.test/new.webp",
      ref: "project-asset:s3:p1/u1/business-image/new.webp",
    });
    createMock.mockResolvedValue({
      id: "asset_new",
      publicUrl: "https://cdn.example.test/new.webp",
      ref: "project-asset:s3:p1/u1/business-image/new.webp",
    });

    const result = await uploadProjectAsset({
      bytes: Buffer.from("image-bytes"),
      projectId: "p1",
      purpose: "business-image",
      sourceTempAssetId: "temp-token-1",
      userId: "u1",
    });

    expect(result.id).toBe("asset_new");
    expect(createMock).toHaveBeenCalledWith({
      data: {
        contentType: "image/webp",
        projectId: "p1",
        publicUrl: "https://cdn.example.test/new.webp",
        purpose: "business-image",
        ref: "project-asset:s3:p1/u1/business-image/new.webp",
        sizeBytes: 11,
        sourceTempAssetId: "temp-token-1",
        userId: "u1",
      },
      select: { id: true, publicUrl: true, ref: true },
    });
  });

  it("returns the existing source-linked asset without writing a duplicate", async () => {
    findFirstMock.mockResolvedValue({
      contentType: "image/webp",
      id: "asset_existing",
      publicUrl: "https://cdn.example.test/asset.webp",
      ref: "project-asset:s3:p1/u1/business-image/existing.webp",
      sizeBytes: 1234,
    });

    const result = await uploadProjectAsset({
      bytes: Buffer.from("not-read-when-idempotent"),
      projectId: "p1",
      purpose: "business-image",
      sourceTempAssetId: "temp-token-1",
      userId: "u1",
    });

    expect(result).toEqual({
      contentType: "image/webp",
      id: "asset_existing",
      publicUrl: "https://cdn.example.test/asset.webp",
      ref: "project-asset:s3:p1/u1/business-image/existing.webp",
      sizeBytes: 1234,
      url: "/api/projects/p1/asset/asset_existing",
    });
    expect(findFirstMock).toHaveBeenCalledWith({
      select: {
        contentType: true,
        id: true,
        publicUrl: true,
        ref: true,
        sizeBytes: true,
      },
      where: {
        projectId: "p1",
        purpose: "business-image",
        sourceTempAssetId: "temp-token-1",
        userId: "u1",
      },
    });
    expect(aggregateMock).not.toHaveBeenCalled();
    expect(writeProjectAssetMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});
