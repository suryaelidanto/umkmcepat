import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  prismaProjectBuildFindManyMock,
  prismaProjectDeploymentCreateMock,
  prismaProjectDeploymentFindFirstMock,
  prismaProjectDeploymentFindManyMock,
  prismaProjectFindFirstMock,
  prismaRuntimeEventCreateMock,
} = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<unknown>>(),
  prismaProjectBuildFindManyMock: vi.fn(),
  prismaProjectDeploymentCreateMock: vi.fn(),
  prismaProjectDeploymentFindFirstMock: vi.fn(),
  prismaProjectDeploymentFindManyMock: vi.fn(),
  prismaProjectFindFirstMock: vi.fn(),
  prismaRuntimeEventCreateMock: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: prismaProjectFindFirstMock },
    projectBuild: { findMany: prismaProjectBuildFindManyMock },
    projectDeployment: {
      create: prismaProjectDeploymentCreateMock,
      findFirst: prismaProjectDeploymentFindFirstMock,
      findMany: prismaProjectDeploymentFindManyMock,
      update: vi.fn(),
    },
    runtimeEvent: { create: prismaRuntimeEventCreateMock },
  },
}));

import { getHandler } from "../../tests/support/route-handler";

import { Route } from "@/routes/api.projects.$id.publish";

const POST = getHandler(Route, "POST");

const older = new Date("2026-07-07T01:00:00.000Z");
const newer = new Date("2026-07-07T02:00:00.000Z");

describe("project publish route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    });
    prismaProjectFindFirstMock.mockResolvedValue({
      id: "project_1",
      title: "Website Angkringan",
    });
    prismaProjectBuildFindManyMock.mockResolvedValue([]);
    prismaProjectDeploymentFindFirstMock.mockResolvedValue(null);
    prismaProjectDeploymentCreateMock.mockResolvedValue({
      id: "published_deployment",
    });
    prismaRuntimeEventCreateMock.mockResolvedValue({});
  });

  it("does not mutate deployments while generated public execution is disabled", async () => {
    vi.stubEnv("GENERATED_PUBLIC_EXECUTION_ENABLED", "false");

    const response = await POST(new Request("http://localhost/publish"), {
      id: "project_1",
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe("generated_public_execution_unavailable");
    expect(prismaProjectFindFirstMock).not.toHaveBeenCalled();
    expect(prismaProjectDeploymentCreateMock).not.toHaveBeenCalled();
    expect(prismaRuntimeEventCreateMock).not.toHaveBeenCalled();
  });

  it("publishes the checked-out preview instead of a newer successful build", async () => {
    prismaProjectDeploymentFindManyMock.mockResolvedValue([
      {
        build: {
          artifactRef: "project-artifact:s3:dist:build_checked_out",
          createdAt: older,
          id: "build_checked_out",
          projectId: "project_1",
          snapshot: { id: "snapshot_restore", projectId: "project_1" },
          snapshotId: "snapshot_restore",
          status: "succeeded",
          updatedAt: older,
        },
        buildId: "build_checked_out",
        createdAt: newer,
        id: "preview_deployment",
        kind: "preview",
        projectId: "project_1",
        snapshot: { id: "snapshot_restore", projectId: "project_1" },
        snapshotId: "snapshot_restore",
        status: "created",
        updatedAt: newer,
      },
    ]);

    const response = await POST(new Request("http://localhost/publish"), {
      id: "project_1",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.path).toMatch(/^\/p\/website-angkringan-/);
    expect(prismaProjectDeploymentCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          buildId: "build_checked_out",
          snapshotId: "snapshot_restore",
        }),
      }),
    );
  });

  it("does not publish a preview deployment whose build belongs to another project", async () => {
    prismaProjectDeploymentFindManyMock.mockResolvedValue([
      {
        build: {
          artifactRef: "project-artifact:s3:dist:build_other",
          createdAt: newer,
          id: "build_other",
          projectId: "project_2",
          snapshot: { id: "snapshot_other", projectId: "project_2" },
          snapshotId: "snapshot_other",
          status: "succeeded",
          updatedAt: newer,
        },
        buildId: "build_other",
        createdAt: newer,
        id: "preview_cross_tenant",
        kind: "preview",
        projectId: "project_1",
        snapshot: { id: "snapshot_other", projectId: "project_2" },
        snapshotId: "snapshot_other",
        status: "created",
        updatedAt: newer,
      },
    ]);

    const response = await POST(new Request("http://localhost/publish"), {
      id: "project_1",
    });

    expect(response.status).toBe(409);
    expect(prismaProjectDeploymentCreateMock).not.toHaveBeenCalled();
    expect(prismaRuntimeEventCreateMock).not.toHaveBeenCalled();
  });
});
