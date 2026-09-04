import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  getDeploymentStatusMock,
  prismaProjectBuildFindManyMock,
  prismaProjectDeploymentFindManyMock,
  prismaProjectEditAttemptFindManyMock,
  prismaProjectFindFirstMock,
  prismaRuntimeEventFindManyMock,
} = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<unknown>>(),
  getDeploymentStatusMock: vi.fn<() => Promise<string>>(),
  prismaProjectBuildFindManyMock: vi.fn(),
  prismaProjectDeploymentFindManyMock: vi.fn(),
  prismaProjectEditAttemptFindManyMock: vi.fn(),
  prismaProjectFindFirstMock: vi.fn(),
  prismaRuntimeEventFindManyMock: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: prismaProjectFindFirstMock },
    projectBuild: { findMany: prismaProjectBuildFindManyMock },
    projectDeployment: { findMany: prismaProjectDeploymentFindManyMock },
    projectEditAttempt: { findMany: prismaProjectEditAttemptFindManyMock },
    runtimeEvent: { findMany: prismaRuntimeEventFindManyMock },
  },
}));
vi.mock("@/lib/projects/runtime-supervisor", () => ({
  getRuntimeSupervisor: () => ({
    getDeploymentStatus: getDeploymentStatusMock,
  }),
}));
vi.mock("@/lib/projects/stale-builds", () => ({
  markStaleProjectBuilds: vi.fn(async () => 0),
}));
vi.mock("@/lib/projects/load-persisted-project-source", () => ({
  loadPersistedProjectSourceFiles: vi.fn(async () => []),
  projectHasPersistedSource: vi.fn(async () => false),
}));

import { getHandler } from "../../tests/support/route-handler";

import { Route } from "@/routes/api.projects.$id.runtime";

const GET = getHandler(Route, "GET");

const older = new Date("2026-07-07T01:00:00.000Z");
const newer = new Date("2026-07-07T02:00:00.000Z");

describe("project runtime route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    });
    prismaProjectFindFirstMock.mockResolvedValue({
      buildStatus: "not_started",
      id: "project_1",
      status: "discussing",
      userId: "user_1",
    });
    prismaRuntimeEventFindManyMock.mockResolvedValue([]);
    prismaProjectEditAttemptFindManyMock.mockResolvedValue([]);
    getDeploymentStatusMock.mockResolvedValue("running");
  });

  it("does not return another owner's stale runtime cache during a database outage", async () => {
    prismaProjectFindFirstMock.mockResolvedValue({
      buildStatus: "not_started",
      id: "project_cross_tenant",
      status: "discussing",
      userId: "user_1",
    });
    prismaProjectBuildFindManyMock.mockResolvedValue([]);
    prismaProjectDeploymentFindManyMock.mockResolvedValue([]);
    prismaProjectEditAttemptFindManyMock.mockResolvedValue([]);

    const ownerResponse = await GET(new Request("http://localhost/runtime"), {
      id: "project_cross_tenant",
    });

    expect(ownerResponse.status).toBe(200);

    authMock.mockResolvedValue({
      user: { id: "user_2" },
      expires: new Date().toISOString(),
    });
    prismaProjectFindFirstMock.mockRejectedValue({ code: "P1001" });

    const otherUserResponse = await GET(
      new Request("http://localhost/runtime"),
      { id: "project_cross_tenant" },
    );
    const body = await otherUserResponse.json();

    expect(otherUserResponse.status).toBe(503);
    expect(otherUserResponse.headers.get("X-UMKM-Runtime-Cache")).toBeNull();
    expect(body.code).toBe("database_unavailable");

    authMock.mockResolvedValue({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    });

    const ownerStaleResponse = await GET(
      new Request("http://localhost/runtime"),
      { id: "project_cross_tenant" },
    );

    expect(ownerStaleResponse.status).toBe(200);
    expect(ownerStaleResponse.headers.get("X-UMKM-Runtime-Cache")).toBe(
      "stale",
    );
  });

  it("does not report a successful build with an artifact owned by another build", async () => {
    prismaProjectBuildFindManyMock.mockResolvedValue([
      {
        artifactRef: "project-artifact:s3:dist:build_other",
        createdAt: newer,
        finishedAt: newer,
        id: "build_1",
        snapshot: { id: "snapshot_1", projectId: "project_1" },
        snapshotId: "snapshot_1",
        startedAt: newer,
        status: "succeeded",
        updatedAt: newer,
        projectId: "project_1",
      },
    ]);
    prismaProjectDeploymentFindManyMock.mockResolvedValue([]);
    prismaProjectEditAttemptFindManyMock.mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/runtime"), {
      id: "project_1",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.latestSuccessfulBuild).toBeNull();
    expect(body.build).toBeNull();
    expect(body.canPreview).toBe(false);
    expect(body.canPublish).toBe(false);
  });

  it("reports a failed edit as the latest operation even when no build row was created", async () => {
    const successfulBuild = {
      artifactRef: "project-artifact:s3:dist:build_success",
      createdAt: older,
      finishedAt: older,
      id: "build_success",
      logText: "ok",
      projectId: "project_1",
      snapshot: { id: "snapshot_success", projectId: "project_1" },
      snapshotId: "snapshot_success",
      startedAt: older,
      status: "succeeded",
      updatedAt: older,
    };
    prismaProjectFindFirstMock.mockResolvedValue({
      buildStatus: "passed",
      id: "project_1",
      status: "ready",
      userId: "user_1",
    });
    prismaProjectBuildFindManyMock.mockResolvedValue([successfulBuild]);
    prismaProjectEditAttemptFindManyMock.mockResolvedValue([
      {
        buildId: null,
        createdAt: newer,
        finishedAt: newer,
        id: "edit_failed",
        kind: "edit",
        startedAt: newer,
        status: "failed",
        updatedAt: newer,
      },
    ]);
    prismaProjectDeploymentFindManyMock.mockImplementation(
      async (input: { where: { kind: string } }) =>
        input.where.kind === "published"
          ? []
          : [
              {
                build: successfulBuild,
                buildId: successfulBuild.id,
                createdAt: older,
                id: "deployment_success",
                kind: "preview",
                lastRequestAt: older,
                projectId: "project_1",
                publicPath: "/api/projects/project_1/preview",
                snapshot: {
                  id: successfulBuild.snapshotId,
                  projectId: "project_1",
                },
                snapshotId: successfulBuild.snapshotId,
                startedAt: older,
                status: "running",
                stoppedAt: null,
                updatedAt: older,
              },
            ],
    );

    const response = await GET(new Request("http://localhost/runtime"), {
      id: "project_1",
    });
    const body = await response.json();

    expect(body.latestAttempt.id).toBe("edit_failed");
    expect(body.latestFailedAttempt.id).toBe("edit_failed");
    expect(body.latestSuccessfulBuild.id).toBe("build_success");
    expect(body.userFacingState).toBe("ready_with_failed_latest_attempt");
    expect(body.canRetry).toBe(true);
  });

  it("reports the latest failed attempt without replacing the active successful preview", async () => {
    const successfulBuild = {
      artifactRef: "project-artifact:s3:dist:build_success",
      createdAt: older,
      finishedAt: older,
      id: "build_success",
      logText: "ok",
      projectId: "project_1",
      snapshot: { id: "snapshot_success", projectId: "project_1" },
      snapshotId: "snapshot_success",
      startedAt: older,
      status: "succeeded",
      updatedAt: older,
    };
    const failedBuild = {
      artifactRef: null,
      createdAt: newer,
      finishedAt: newer,
      id: "build_failed",
      logText: "failed",
      projectId: "project_1",
      snapshot: { id: "snapshot_failed", projectId: "project_1" },
      snapshotId: "snapshot_failed",
      startedAt: newer,
      status: "failed",
      updatedAt: newer,
    };

    prismaProjectBuildFindManyMock.mockResolvedValue([
      failedBuild,
      successfulBuild,
    ]);
    prismaProjectDeploymentFindManyMock.mockImplementation(
      async (input: { where: { kind: string } }) => {
        if (input.where.kind === "published") {
          return [];
        }

        return [
          {
            build: failedBuild,
            buildId: failedBuild.id,
            createdAt: newer,
            id: "deployment_failed",
            kind: "preview",
            lastRequestAt: null,
            projectId: "project_1",
            publicPath: "/api/projects/project_1/preview",
            snapshot: {
              id: failedBuild.snapshotId,
              projectId: "project_1",
            },
            snapshotId: failedBuild.snapshotId,
            startedAt: null,
            status: "failed",
            stoppedAt: null,
            updatedAt: newer,
          },
          {
            build: successfulBuild,
            buildId: successfulBuild.id,
            createdAt: older,
            id: "deployment_success",
            kind: "preview",
            lastRequestAt: older,
            projectId: "project_1",
            publicPath: "/api/projects/project_1/preview",
            snapshot: {
              id: successfulBuild.snapshotId,
              projectId: "project_1",
            },
            snapshotId: successfulBuild.snapshotId,
            startedAt: older,
            status: "running",
            stoppedAt: null,
            updatedAt: older,
          },
        ];
      },
    );

    const response = await GET(new Request("http://localhost/runtime"), {
      id: "project_1",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.latestAttempt.id).toBe("build_failed");
    expect(body.latestSuccessfulBuild.id).toBe("build_success");
    expect(body.build.id).toBe("build_success");
    expect(body.deployment.id).toBe("deployment_success");
    expect(body.userFacingState).toBe("ready_with_failed_latest_attempt");
    expect(body.canPreview).toBe(true);
    expect(body.canPublish).toBe(true);
  });

  it("allows cache invalidation for a specific project", async () => {
    const { invalidateProjectRuntimeStateCache } =
      await import("@/lib/projects/runtime-state-cache");
    expect(typeof invalidateProjectRuntimeStateCache).toBe("function");
    invalidateProjectRuntimeStateCache("project_1");
  });
});
