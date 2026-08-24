import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  isSnapshotRestorableAgainstActiveHandoffMock,
  prismaProjectBuildFindFirstMock,
  prismaProjectDeploymentCreateMock,
  prismaProjectFindFirstMock,
  prismaProjectSnapshotFindFirstMock,
} = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<unknown>>(),
  isSnapshotRestorableAgainstActiveHandoffMock: vi.fn(),
  prismaProjectBuildFindFirstMock: vi.fn(),
  prismaProjectDeploymentCreateMock: vi.fn(),
  prismaProjectFindFirstMock: vi.fn(),
  prismaProjectSnapshotFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: prismaProjectFindFirstMock },
    projectBuild: { findFirst: prismaProjectBuildFindFirstMock },
    projectDeployment: { create: prismaProjectDeploymentCreateMock },
    projectSnapshot: { findFirst: prismaProjectSnapshotFindFirstMock },
  },
}));
vi.mock("@/lib/projects/build-handoffs", () => ({
  isSnapshotRestorableAgainstActiveHandoff:
    isSnapshotRestorableAgainstActiveHandoffMock,
}));

import { getHandler } from "../../tests/support/route-handler";

import { Route } from "@/routes/api.projects.$id.snapshots.$snapshotId.restore";

const POST = getHandler(Route, "POST");

describe("snapshot restore route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    });
    isSnapshotRestorableAgainstActiveHandoffMock.mockResolvedValue(true);
    prismaProjectFindFirstMock.mockResolvedValue({
      generationEngine: "contract",
      id: "project_1",
    });
    prismaProjectSnapshotFindFirstMock.mockResolvedValue({
      files: [{ content: "source", path: "src/main.tsx" }],
      id: "snapshot_old",
      metadata: {},
      sourceRef: null,
    });
    prismaProjectBuildFindFirstMock.mockResolvedValue({
      artifactRef: "project-artifact:s3:dist:build_old",
      id: "build_old",
      status: "succeeded",
    });
    prismaProjectDeploymentCreateMock.mockResolvedValue({
      id: "preview_restore",
    });
  });

  it("checks out a successful history version into Preview without changing Production", async () => {
    const response = await POST(
      new Request("http://localhost/restore", { method: "POST" }),
      { id: "project_1", snapshotId: "snapshot_old" },
    );

    expect(response.status).toBe(200);
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
});
