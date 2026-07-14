import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, findFirstMock, readProjectThumbnailMock } = vi.hoisted(
  () => ({
    authMock: vi.fn(),
    findFirstMock: vi.fn(),
    readProjectThumbnailMock: vi.fn(),
  }),
);

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: { project: { findFirst: findFirstMock } },
}));
vi.mock("@/lib/projects/project-thumbnail", () => ({
  readProjectThumbnail: readProjectThumbnailMock,
}));

import { getHandler } from "./_handler";

import { Route } from "@/routes/api.projects.$id.thumbnail";

const GET = getHandler(Route, "GET");

describe("project thumbnail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findFirstMock.mockResolvedValue({
      thumbnailRef: "project-thumbnail:local:project_1",
    });
    readProjectThumbnailMock.mockResolvedValue(
      Buffer.from([0xff, 0xd8, 0xff, 0xff, 0xd9]),
    );
  });

  it("serves an owner's JPEG with version-safe private caching", async () => {
    const response = await GET(new Request("http://localhost/thumbnail"), {
      id: "project_1",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { id: "project_1", userId: "user_1" },
      select: { thumbnailRef: true },
    });
  });

  it("does not disclose another user's or missing thumbnail", async () => {
    findFirstMock.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/thumbnail"), {
      id: "project_1",
    });

    expect(response.status).toBe(404);
    expect(readProjectThumbnailMock).not.toHaveBeenCalled();
  });

  it("returns not found when stored bytes are missing", async () => {
    readProjectThumbnailMock.mockRejectedValue(new Error("ENOENT"));

    const response = await GET(new Request("http://localhost/thumbnail"), {
      id: "project_1",
    });

    expect(response.status).toBe(404);
  });
});
