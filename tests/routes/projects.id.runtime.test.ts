import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  getDeploymentStatusMock,
  prismaProjectBuildFindManyMock,
  prismaProjectDeploymentFindManyMock,
  prismaProjectFindFirstMock,
  prismaRuntimeEventFindManyMock,
} = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<unknown>>(),
  getDeploymentStatusMock: vi.fn<() => Promise<string>>(),
  prismaProjectBuildFindManyMock: vi.fn(),
  prismaProjectDeploymentFindManyMock: vi.fn(),
  prismaProjectFindFirstMock: vi.fn(),
  prismaRuntimeEventFindManyMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: prismaProjectFindFirstMock },
    projectBuild: { findMany: prismaProjectBuildFindManyMock },
    projectDeployment: { findMany: prismaProjectDeploymentFindManyMock },
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

import { getHandler } from "./_handler";

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
    prismaProjectFindFirstMock.mockResolvedValue({ id: "project_1" });
    prismaRuntimeEventFindManyMock.mockResolvedValue([]);
    getDeploymentStatusMock.mockResolvedValue("running");
  });

  it("does not return another owner's stale runtime cache during a database outage", async () => {
    prismaProjectFindFirstMock.mockResolvedValue({
      id: "project_cross_tenant",
    });
    prismaProjectBuildFindManyMock.mockResolvedValue([]);
    prismaProjectDeploymentFindManyMock.mockResolvedValue([]);

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

  it("reports the latest failed attempt without replacing the active successful preview", async () => {
    const successfulBuild = {
      artifactRef: "project-artifact:local:dist:build_success",
      createdAt: older,
      finishedAt: older,
      id: "build_success",
      logText: "ok",
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
            publicPath: "/api/projects/project_1/preview",
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
            publicPath: "/api/projects/project_1/preview",
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
});
