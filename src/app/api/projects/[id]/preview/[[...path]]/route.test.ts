import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  prismaQueryRawMock,
  prismaProjectDeploymentFindManyMock,
  prismaProjectDeploymentUpdateMock,
  prismaProjectFindFirstMock,
  proxyDeploymentRequestMock,
} = vi.hoisted(() => ({
  authMock: vi.fn<() => Promise<unknown>>(),
  prismaQueryRawMock: vi.fn(),
  prismaProjectDeploymentFindManyMock: vi.fn(),
  prismaProjectDeploymentUpdateMock: vi.fn(),
  prismaProjectFindFirstMock: vi.fn(),
  proxyDeploymentRequestMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: prismaQueryRawMock,
    project: { findFirst: prismaProjectFindFirstMock },
    projectDeployment: {
      findMany: prismaProjectDeploymentFindManyMock,
      update: prismaProjectDeploymentUpdateMock,
    },
  },
}));
vi.mock("@/lib/projects/runtime-proxy", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/projects/runtime-proxy")
  >("@/lib/projects/runtime-proxy");

  return {
    ...actual,
    proxyDeploymentRequest: proxyDeploymentRequestMock,
  };
});

import { GET } from "./route";

const older = new Date("2026-07-07T01:00:00.000Z");
const newer = new Date("2026-07-07T02:00:00.000Z");

describe("project preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    });
    prismaProjectFindFirstMock.mockResolvedValue({ id: "project_1" });
    prismaProjectDeploymentUpdateMock.mockResolvedValue({});
    proxyDeploymentRequestMock.mockResolvedValue(
      new Response("preview-success", { status: 200 }),
    );
  });

  it("proxies the active successful deployment when the newest deployment failed", async () => {
    const successfulBuild = {
      artifactRef: "project-artifact:local:dist:build_success",
      createdAt: older,
      id: "build_success",
      snapshotId: "snapshot_success",
      status: "succeeded",
      updatedAt: older,
    };
    const failedBuild = {
      artifactRef: null,
      createdAt: newer,
      id: "build_failed",
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
        snapshotId: successfulBuild.snapshotId,
        status: "stopped",
        updatedAt: older,
      },
    ]);

    const response = await GET(new Request("http://localhost/preview"), {
      params: Promise.resolve({ id: "project_1", path: [] }),
    });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("preview-success");
    expect(proxyDeploymentRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId: "deployment_success",
        deploymentStatus: "stopped",
      }),
    );
  });

  it("returns an actionable HTML panel when no preview artifact exists", async () => {
    prismaProjectDeploymentFindManyMock.mockResolvedValue([]);
    prismaQueryRawMock.mockResolvedValue([{ distFiles: null }]);

    const response = await GET(new Request("http://localhost/preview"), {
      params: Promise.resolve({ id: "project_1", path: [] }),
    });

    const body = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(body).toContain("Tampilan website belum tersedia");
    expect(body).toContain("Jalankan build setelah brief siap");
    expect(body).not.toContain("Error:");
    expect(body).not.toContain("stack");
  });
});
