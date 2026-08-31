import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  prismaProjectDeploymentFindManyMock,
  prismaProjectUpdateMock,
  stopDeploymentMock,
  verifyProjectOwnershipMock,
} = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<unknown>>(),
  prismaProjectDeploymentFindManyMock: vi.fn(),
  prismaProjectUpdateMock: vi.fn(),
  stopDeploymentMock: vi.fn(async () => "stopped" as const),
  verifyProjectOwnershipMock: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      update: prismaProjectUpdateMock,
    },
    projectDeployment: {
      findMany: prismaProjectDeploymentFindManyMock,
    },
  },
}));
vi.mock("@/lib/projects/runtime-supervisor", () => ({
  getRuntimeSupervisor: () => ({ stopDeployment: stopDeploymentMock }),
}));
vi.mock("@/middleware/ownership", () => ({
  verifyProjectOwnership: verifyProjectOwnershipMock,
}));

import { getHandler } from "../../tests/support/route-handler";

import { Route } from "@/routes/api.projects.$id.stop";

const POST = getHandler(Route, "POST");

describe("project stop route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    verifyProjectOwnershipMock.mockResolvedValue(true);
    prismaProjectUpdateMock.mockResolvedValue({ id: "project_1" });
  });

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(undefined, { id: "project_1" });

    expect(response.status).toBe(401);
    expect(stopDeploymentMock).not.toHaveBeenCalled();
  });

  it("does not stop a preview deployment with broken lineage", async () => {
    prismaProjectDeploymentFindManyMock.mockResolvedValue([
      {
        build: {
          artifactRef: "project-artifact:s3:dist:other_build",
          createdAt: new Date("2026-08-30T15:00:00.000Z"),
          id: "build_invalid",
          projectId: "project_1",
          snapshot: { id: "snapshot_1", projectId: "project_1" },
          snapshotId: "snapshot_1",
          status: "succeeded",
          updatedAt: new Date("2026-08-30T15:00:00.000Z"),
        },
        buildId: "build_invalid",
        createdAt: new Date("2026-08-30T15:00:00.000Z"),
        id: "deployment_invalid",
        kind: "preview",
        projectId: "project_1",
        snapshot: { id: "snapshot_1", projectId: "project_1" },
        snapshotId: "snapshot_1",
        status: "running",
        updatedAt: new Date("2026-08-30T15:00:00.000Z"),
      },
    ]);

    const response = await POST(undefined, { id: "project_1" });

    expect(response.status).toBe(200);
    expect(stopDeploymentMock).not.toHaveBeenCalled();
  });

  it("stops the valid running preview deployment", async () => {
    prismaProjectDeploymentFindManyMock.mockResolvedValue([
      {
        build: {
          artifactRef: "project-artifact:s3:dist:build_1",
          createdAt: new Date("2026-08-30T15:00:00.000Z"),
          id: "build_1",
          projectId: "project_1",
          snapshot: { id: "snapshot_1", projectId: "project_1" },
          snapshotId: "snapshot_1",
          status: "succeeded",
          updatedAt: new Date("2026-08-30T15:00:00.000Z"),
        },
        buildId: "build_1",
        createdAt: new Date("2026-08-30T15:00:00.000Z"),
        id: "deployment_1",
        kind: "preview",
        projectId: "project_1",
        snapshot: { id: "snapshot_1", projectId: "project_1" },
        snapshotId: "snapshot_1",
        status: "running",
        updatedAt: new Date("2026-08-30T15:00:00.000Z"),
      },
    ]);

    const response = await POST(undefined, { id: "project_1" });

    expect(response.status).toBe(200);
    expect(stopDeploymentMock).toHaveBeenCalledWith("deployment_1");
  });
});
