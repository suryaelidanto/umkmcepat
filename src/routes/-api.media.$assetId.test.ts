import { afterEach, describe, expect, it, vi } from "vitest";

const { findUniqueMock, getS3ObjectMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  getS3ObjectMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { projectAsset: { findUnique: findUniqueMock } },
}));

vi.mock("@/lib/storage/s3-client", () => ({
  getS3Object: getS3ObjectMock,
}));

import { resolveMediaRedirect, serveMediaAsset } from "./api.media.$assetId";

afterEach(() => {
  findUniqueMock.mockReset();
  getS3ObjectMock.mockReset();
});

describe("resolveMediaRedirect", () => {
  it("returns 404 when asset is null", () => {
    expect(resolveMediaRedirect(null)).toEqual({ status: 404 });
  });

  it("streams binary when publicUrl is on same app origin", () => {
    expect(
      resolveMediaRedirect({
        id: "a1",
        purpose: "business-image",
        publicUrl: "http://localhost:3000/project-assets/a1.png",
        ref: "project-asset:s3:p1/u1/business-image/a1.png",
      }),
    ).toEqual({
      stream: true,
      status: 200,
    });
  });

  it("returns 302 location when publicUrl is an external HTTPS CDN", () => {
    expect(
      resolveMediaRedirect({
        id: "a1",
        purpose: "business-image",
        publicUrl: "https://pub-r2.example.com/project-assets/a1.png",
        ref: "project-asset:s3:p1/u1/business-image/a1.png",
      }),
    ).toEqual({
      location: "https://pub-r2.example.com/project-assets/a1.png",
      status: 302,
    });
  });

  it("does not expose an asset that has no public URL", () => {
    expect(
      resolveMediaRedirect({
        id: "a1",
        purpose: "reference",
        publicUrl: null,
        ref: "project-asset:s3-private:p1/u1/reference/asset.webp",
      }),
    ).toEqual({ status: 404 });
  });

  it("rejects a public URL paired with a private storage ref", () => {
    expect(
      resolveMediaRedirect({
        id: "a1",
        purpose: "reference",
        publicUrl: "https://media.test/project-assets/a1.webp",
        ref: "project-asset:s3-private:p1/u1/reference/a1.webp",
      }),
    ).toEqual({ status: 404 });
  });

  it("rejects a reference asset even when its row has a public URL", () => {
    expect(
      resolveMediaRedirect({
        id: "a1",
        purpose: "reference",
        publicUrl: "https://media.test/project-assets/a1.webp",
        ref: "project-asset:s3:p1/u1/reference/a1.webp",
      }),
    ).toEqual({ status: 404 });
  });

  it("returns 404 without reading a private project asset", async () => {
    findUniqueMock.mockResolvedValue({
      id: "private",
      purpose: "reference",
      publicUrl: null,
      ref: "project-asset:s3-private:p1/u1/reference/image.webp",
      contentType: "image/webp",
    });

    const response = await serveMediaAsset("private");

    expect(response.status).toBe(404);
    expect(getS3ObjectMock).not.toHaveBeenCalled();
  });

  it("rejects unsigned temporary storage tokens", async () => {
    findUniqueMock.mockResolvedValue(null);
    getS3ObjectMock.mockResolvedValue(Buffer.from("private image"));
    const payload = {
      contentType: "image/png",
      key: "temp-uploads/u1/123/image.png",
    };
    const token = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.forged`;

    const response = await serveMediaAsset(token);

    expect(response.status).toBe(404);
    expect(getS3ObjectMock).not.toHaveBeenCalled();
  });
});
