import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  prismaProjectBuildFindManyMock,
  prismaProjectDeploymentCreateMock,
  prismaProjectDeploymentFindFirstMock,
  prismaProjectFindFirstMock,
  prismaRuntimeEventCreateMock,
} = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<unknown>>(),
  prismaProjectBuildFindManyMock: vi.fn(),
  prismaProjectDeploymentCreateMock: vi.fn(),
  prismaProjectDeploymentFindFirstMock: vi.fn(),
  prismaProjectFindFirstMock: vi.fn(),
  prismaRuntimeEventCreateMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: prismaProjectFindFirstMock },
    projectBuild: { findMany: prismaProjectBuildFindManyMock },
    projectDeployment: {
      create: prismaProjectDeploymentCreateMock,
      findFirst: prismaProjectDeploymentFindFirstMock,
      update: vi.fn(),
    },
    runtimeEvent: { create: prismaRuntimeEventCreateMock },
  },
}));

import { getHandler } from "./_handler";

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

  it("publishes the latest successful artifact instead of a newer failed attempt", async () => {
    prismaProjectBuildFindManyMock.mockResolvedValue([
      {
        artifactRef: null,
        createdAt: newer,
        id: "build_failed",
        snapshotId: "snapshot_failed",
        status: "failed",
        updatedAt: newer,
      },
      {
        artifactRef: "project-artifact:local:dist:build_success",
        createdAt: older,
        id: "build_success",
        snapshotId: "snapshot_success",
        status: "succeeded",
        updatedAt: older,
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
          buildId: "build_success",
          snapshotId: "snapshot_success",
        }),
      }),
    );
  });
});
