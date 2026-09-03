import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  captureProjectThumbnailMock,
  projectBuildFindFirstMock,
  projectFindFirstMock,
  projectSnapshotFindFirstMock,
  readProjectThumbnailMock,
  writeProjectThumbnailMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  captureProjectThumbnailMock: vi.fn(),
  projectBuildFindFirstMock: vi.fn(),
  projectFindFirstMock: vi.fn(),
  projectSnapshotFindFirstMock: vi.fn(),
  readProjectThumbnailMock: vi.fn(),
  writeProjectThumbnailMock: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: projectFindFirstMock },
    projectBuild: { findFirst: projectBuildFindFirstMock },
    projectSnapshot: { findFirst: projectSnapshotFindFirstMock },
  },
}));
vi.mock("@/lib/projects/project-thumbnail", () => ({
  captureProjectThumbnail: captureProjectThumbnailMock,
  readProjectThumbnail: readProjectThumbnailMock,
  writeProjectThumbnail: writeProjectThumbnailMock,
}));

import { getHandler } from "../../tests/support/route-handler";

import { Route } from "@/routes/api.projects.$id.snapshots.$snapshotId.thumbnail";

const GET = getHandler(Route, "GET");

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xff, 0xd9]);

describe("snapshot thumbnail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectBuildFindFirstMock.mockReset();
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    projectFindFirstMock.mockResolvedValue({ id: "project_1" });
    projectSnapshotFindFirstMock.mockResolvedValue({
      id: "snapshot_1",
    });
    projectBuildFindFirstMock.mockResolvedValue({
      artifactRef: "project-artifact:s3:dist:build_1",
      id: "build_1",
      projectId: "project_1",
      snapshot: { id: "snapshot_1", projectId: "project_1" },
      snapshotId: "snapshot_1",
    });
    readProjectThumbnailMock.mockRejectedValue(new Error("cache miss"));
    captureProjectThumbnailMock.mockResolvedValue(jpeg);
    writeProjectThumbnailMock.mockResolvedValue(
      "project-thumbnail:s3-private:project_1-snapshot_1",
    );
  });

  it("captures a thumbnail only from the selected snapshot build", async () => {
    const response = await GET(new Request("http://localhost/thumbnail"), {
      id: "project_1",
      snapshotId: "snapshot_1",
    });

    expect(response.status).toBe(200);
    expect(captureProjectThumbnailMock).toHaveBeenCalledWith(
      "project-artifact:s3:dist:build_1",
    );
    expect(writeProjectThumbnailMock).toHaveBeenCalledWith({
      bytes: jpeg,
      projectId: "project_1-snapshot_1",
    });
  });

  it("does not reuse a parent build for a snapshot without its own build", async () => {
    projectSnapshotFindFirstMock.mockResolvedValue({
      id: "snapshot_1",
      parentSnapshotId: "snapshot_parent",
    });
    projectBuildFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        artifactRef: "project-artifact:s3:dist:parent_build",
        id: "parent_build",
        projectId: "project_1",
        snapshot: { id: "snapshot_parent", projectId: "project_1" },
        snapshotId: "snapshot_parent",
      });

    const response = await GET(new Request("http://localhost/thumbnail"), {
      id: "project_1",
      snapshotId: "snapshot_1",
    });

    expect(response.status).toBe(404);
    expect(projectBuildFindFirstMock).toHaveBeenCalledTimes(1);
    expect(captureProjectThumbnailMock).not.toHaveBeenCalled();
  });

  it("rejects a build whose snapshot lineage disagrees with the requested project", async () => {
    projectBuildFindFirstMock.mockResolvedValue({
      artifactRef: "project-artifact:s3:dist:build_1",
      id: "build_1",
      projectId: "project_1",
      snapshot: { id: "snapshot_other", projectId: "project_2" },
      snapshotId: "snapshot_other",
    });

    const response = await GET(new Request("http://localhost/thumbnail"), {
      id: "project_1",
      snapshotId: "snapshot_1",
    });

    expect(response.status).toBe(404);
    expect(captureProjectThumbnailMock).not.toHaveBeenCalled();
  });
});
