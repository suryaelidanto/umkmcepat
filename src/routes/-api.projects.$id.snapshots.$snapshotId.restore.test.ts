import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  prismaProjectBuildFindFirstMock,
  prismaProjectBuildHandoffFindFirstMock,
  prismaProjectDeploymentCreateMock,
  prismaProjectFindFirstMock,
  prismaProjectSnapshotFindFirstMock,
} = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<unknown>>(),
  prismaProjectBuildFindFirstMock: vi.fn(),
  prismaProjectBuildHandoffFindFirstMock: vi.fn(),
  prismaProjectDeploymentCreateMock: vi.fn(),
  prismaProjectFindFirstMock: vi.fn(),
  prismaProjectSnapshotFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        project: { update: vi.fn() },
        projectDeployment: { create: prismaProjectDeploymentCreateMock },
      }),
    ),
    project: { findFirst: prismaProjectFindFirstMock },
    projectBuild: { findFirst: prismaProjectBuildFindFirstMock },
    projectBuildHandoff: {
      findFirst: prismaProjectBuildHandoffFindFirstMock,
    },
    projectDeployment: { create: prismaProjectDeploymentCreateMock },
    projectSnapshot: { findFirst: prismaProjectSnapshotFindFirstMock },
  },
}));

import { getHandler } from "../../tests/support/route-handler";

import { Route } from "@/routes/api.projects.$id.snapshots.$snapshotId.restore";

const POST = getHandler(Route, "POST");

describe("snapshot restore route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaProjectBuildFindFirstMock.mockReset();
    authMock.mockResolvedValue({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    });
    prismaProjectFindFirstMock.mockResolvedValue({
      generationEngine: "contract",
      id: "project_1",
    });
    prismaProjectSnapshotFindFirstMock.mockResolvedValue({
      files: [{ content: "source", path: "src/main.tsx" }],
      id: "snapshot_old",
      metadata: { handoffId: "h_old" },
      sourceRef: null,
    });
    prismaProjectBuildFindFirstMock.mockResolvedValue({
      artifactRef: "project-artifact:s3:dist:build_old",
      id: "build_old",
      projectId: "project_1",
      snapshot: { id: "snapshot_old", projectId: "project_1" },
      snapshotId: "snapshot_old",
      status: "succeeded",
    });
    prismaProjectBuildHandoffFindFirstMock.mockResolvedValue({
      id: "h_old",
    });
    prismaProjectDeploymentCreateMock.mockResolvedValue({
      id: "preview_restore",
    });
  });

  it("checks out an earlier history snapshot into Preview without blocking on hash mismatch", async () => {
    const response = await POST(
      new Request("http://localhost/restore", { method: "POST" }),
      { id: "project_1", snapshotId: "snapshot_old" },
    );

    expect(response.status).toBe(200);
    expect(prismaProjectBuildHandoffFindFirstMock).toHaveBeenCalledWith({
      where: {
        id: "h_old",
        projectId: "project_1",
        status: { in: ["accepted", "superseded"] },
        userId: "user_1",
      },
      select: { id: true },
    });
    expect(prismaProjectDeploymentCreateMock).toHaveBeenCalledWith({
      data: {
        buildId: "build_old",
        kind: "preview",
        projectId: "project_1",
        publicPath: "/api/projects/project_1/preview",
        snapshotId: "snapshot_old",
        status: "created",
      },
      select: { id: true },
    });
  });

  it("prefers the selected snapshot build over its parent build", async () => {
    prismaProjectSnapshotFindFirstMock.mockResolvedValueOnce({
      files: [{ content: "source", path: "src/main.tsx" }],
      id: "snapshot_old",
      metadata: { handoffId: "h_old" },
      parentSnapshotId: "snapshot_parent",
      sourceRef: null,
    });
    prismaProjectBuildFindFirstMock.mockResolvedValueOnce({
      artifactRef: "project-artifact:s3:dist:build_selected",
      id: "build_selected",
      projectId: "project_1",
      snapshot: { id: "snapshot_old", projectId: "project_1" },
      snapshotId: "snapshot_old",
      status: "succeeded",
    });

    const response = await POST(
      new Request("http://localhost/restore", { method: "POST" }),
      { id: "project_1", snapshotId: "snapshot_old" },
    );

    expect(response.status).toBe(200);
    expect(prismaProjectBuildFindFirstMock).toHaveBeenCalledTimes(1);
    expect(prismaProjectDeploymentCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ buildId: "build_selected" }),
      }),
    );
  });

  it("does not restore a snapshot without its own successful build", async () => {
    prismaProjectSnapshotFindFirstMock.mockResolvedValueOnce({
      files: [{ content: "source", path: "src/main.tsx" }],
      id: "snapshot_old",
      metadata: { handoffId: "h_old" },
      parentSnapshotId: "snapshot_parent",
      sourceRef: null,
    });
    prismaProjectBuildFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        artifactRef: "project-artifact:s3:dist:build_parent",
        id: "build_parent",
        status: "succeeded",
      });

    const response = await POST(
      new Request("http://localhost/restore", { method: "POST" }),
      { id: "project_1", snapshotId: "snapshot_old" },
    );

    expect(response.status).toBe(409);
    expect(prismaProjectBuildFindFirstMock).toHaveBeenCalledTimes(1);
    expect(prismaProjectDeploymentCreateMock).not.toHaveBeenCalled();
  });

  it("does not restore a snapshot with only an unrelated project build", async () => {
    prismaProjectSnapshotFindFirstMock.mockResolvedValueOnce({
      files: [{ content: "source", path: "src/main.tsx" }],
      id: "snapshot_old",
      metadata: { handoffId: "h_old" },
      parentSnapshotId: null,
      sourceRef: null,
    });
    prismaProjectBuildFindFirstMock.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("http://localhost/restore", { method: "POST" }),
      { id: "project_1", snapshotId: "snapshot_old" },
    );

    expect(response.status).toBe(409);
    expect(prismaProjectDeploymentCreateMock).not.toHaveBeenCalled();
  });

  it("does not treat an unowned source artifact reference as restorable", async () => {
    prismaProjectSnapshotFindFirstMock.mockResolvedValueOnce({
      files: [],
      id: "snapshot_old",
      metadata: { handoffId: "h_old" },
      parentSnapshotId: null,
      sourceRef: "project-artifact:s3:source:other_snapshot",
    });

    const response = await POST(
      new Request("http://localhost/restore", { method: "POST" }),
      { id: "project_1", snapshotId: "snapshot_old" },
    );

    expect(response.status).toBe(409);
    expect(prismaProjectBuildFindFirstMock).not.toHaveBeenCalled();
    expect(prismaProjectDeploymentCreateMock).not.toHaveBeenCalled();
  });

  it("rejects a snapshot handoff that is not owned by the project", async () => {
    prismaProjectBuildHandoffFindFirstMock.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("http://localhost/restore", { method: "POST" }),
      { id: "project_1", snapshotId: "snapshot_old" },
    );

    expect(response.status).toBe(409);
    expect(prismaProjectDeploymentCreateMock).not.toHaveBeenCalled();
  });
});
