import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  prismaProjectBuildFindFirstMock,
  prismaProjectDeploymentFindManyMock,
  prismaProjectFindFirstMock,
  prismaProjectSnapshotFindFirstMock,
  prismaQueryRawMock,
} = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<unknown>>(),
  prismaProjectBuildFindFirstMock: vi.fn(),
  prismaProjectDeploymentFindManyMock: vi.fn(),
  prismaProjectFindFirstMock: vi.fn(),
  prismaProjectSnapshotFindFirstMock: vi.fn(),
  prismaQueryRawMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: prismaQueryRawMock,
    project: { findFirst: prismaProjectFindFirstMock },
    projectBuild: { findFirst: prismaProjectBuildFindFirstMock },
    projectDeployment: { findMany: prismaProjectDeploymentFindManyMock },
    projectSnapshot: { findFirst: prismaProjectSnapshotFindFirstMock },
  },
}));

import { GET } from "./route";

const older = new Date("2026-07-07T01:00:00.000Z");
const newer = new Date("2026-07-07T02:00:00.000Z");

describe("project source route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    });
    prismaProjectFindFirstMock.mockResolvedValue({
      id: "project_1",
      prompt: "Buat website angkringan",
      siteSchema: null,
    });
    prismaQueryRawMock.mockResolvedValue([
      { buildLog: "legacy failed", buildStatus: "failed", sourceFiles: [] },
    ]);
    prismaProjectBuildFindFirstMock.mockResolvedValue(null);
    prismaProjectSnapshotFindFirstMock.mockResolvedValue(null);
  });

  it("does not invent source files before the first real build/source exists", async () => {
    prismaProjectDeploymentFindManyMock.mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/source"), {
      params: Promise.resolve({ id: "project_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.buildStatus).toBe("failed");
    expect(body.files).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("angkringan");
    expect(body.currentPreviewSource).toBeNull();
  });

  it("returns the active preview source instead of the newest failed attempt source", async () => {
    const successfulBuild = {
      artifactRef: "project-artifact:local:dist:build_success",
      createdAt: older,
      id: "build_success",
      logText: "success log",
      snapshotId: "snapshot_success",
      status: "succeeded",
      updatedAt: older,
    };
    const failedBuild = {
      artifactRef: null,
      createdAt: newer,
      id: "build_failed",
      logText: "failed log",
      snapshotId: "snapshot_failed",
      status: "failed",
      updatedAt: newer,
    };

    prismaProjectDeploymentFindManyMock.mockResolvedValue([
      {
        build: failedBuild,
        buildId: failedBuild.id,
        createdAt: newer,
        id: "deployment_failed",
        kind: "preview",
        snapshot: {
          createdAt: older,
          files: [{ content: "failed", path: "src/main.tsx" }],
          id: "snapshot_failed",
          metadata: { summary: { runtimeProfile: "static-react-v1" } },
          sourceRef: null,
          sourceType: "generated",
        },
        snapshotId: failedBuild.snapshotId,
        status: "failed",
        updatedAt: newer,
      },
      {
        build: successfulBuild,
        buildId: successfulBuild.id,
        createdAt: older,
        id: "deployment_success",
        kind: "preview",
        snapshot: {
          createdAt: older,
          files: [{ content: "success", path: "src/main.tsx" }],
          id: "snapshot_success",
          metadata: { summary: { runtimeProfile: "static-react-v1" } },
          sourceRef: null,
          sourceType: "generated",
        },
        snapshotId: successfulBuild.snapshotId,
        status: "stopped",
        updatedAt: older,
      },
    ]);
    prismaProjectBuildFindFirstMock.mockResolvedValue({
      id: failedBuild.id,
      logText: failedBuild.logText,
      snapshot: {
        createdAt: newer,
        files: [{ content: "failed", path: "src/main.tsx" }],
        id: "snapshot_failed",
        metadata: { summary: { runtimeProfile: "static-react-v1" } },
        sourceRef: null,
        sourceType: "generated",
      },
      snapshotId: failedBuild.snapshotId,
      status: failedBuild.status,
    });

    const response = await GET(new Request("http://localhost/source"), {
      params: Promise.resolve({ id: "project_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.buildLog).toBe("success log");
    expect(body.buildStatus).toBe("passed");
    expect(body.files).toEqual([{ content: "success", path: "src/main.tsx" }]);
    expect(body.currentPreviewSource).toMatchObject({
      buildId: "build_success",
      snapshotId: "snapshot_success",
      sourceType: "generated",
    });
    expect(body.latestAttempt).toMatchObject({
      buildId: "build_failed",
      status: "failed",
    });
    expect(body.latestAttemptSource).toMatchObject({
      buildId: "build_failed",
      snapshotId: "snapshot_failed",
      sourceType: "generated",
    });
    expect(prismaProjectSnapshotFindFirstMock).not.toHaveBeenCalled();
  });
});
