import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaProjectDeploymentFindManyMock,
  prismaProjectBuildFindManyMock,
  prismaQueryRawMock,
  proxyDeploymentRequestMock,
  readProjectDistArtifactMock,
} = vi.hoisted(() => ({
  prismaProjectDeploymentFindManyMock: vi.fn(),
  prismaProjectBuildFindManyMock: vi.fn(),
  prismaQueryRawMock: vi.fn(),
  proxyDeploymentRequestMock: vi.fn(),
  readProjectDistArtifactMock: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: prismaQueryRawMock,
    project: { findFirst: vi.fn() },
    projectBuild: {
      findMany: prismaProjectBuildFindManyMock,
    },
    projectDeployment: {
      findMany: prismaProjectDeploymentFindManyMock,
      update: vi.fn(),
    },
  },
}));
vi.mock("@/lib/projects/runtime-artifacts", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/projects/runtime-artifacts")
  >("@/lib/projects/runtime-artifacts");

  return {
    ...actual,
    readProjectDistArtifact: readProjectDistArtifactMock,
  };
});
vi.mock("@/lib/projects/runtime-proxy", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/projects/runtime-proxy")
  >("@/lib/projects/runtime-proxy");

  return {
    ...actual,
    proxyDeploymentRequest: proxyDeploymentRequestMock,
  };
});

import { getHandler } from "../../tests/support/route-handler";

import { createPreviewAssetToken } from "@/lib/projects/preview-asset-token";
import { Route } from "@/routes/api.projects.$id.assets.$";

const GET = getHandler(Route, "GET");

describe("project assets route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaProjectBuildFindManyMock.mockResolvedValue([]);
  });

  it("serves static assets via valid token when runtime is unavailable", async () => {
    const deployment = {
      build: {
        artifactRef: "project-artifact:s3:dist:build_1",
        createdAt: new Date(),
        id: "build_1",
        projectId: "project_1",
        snapshot: { id: "snapshot_1", projectId: "project_1" },
        snapshotId: "snapshot_1",
        status: "succeeded",
        updatedAt: new Date(),
      },
      buildId: "build_1",
      createdAt: new Date(),
      id: "deployment_1",
      kind: "preview",
      projectId: "project_1",
      snapshot: { id: "snapshot_1", projectId: "project_1" },
      snapshotId: "snapshot_1",
      status: "created",
      updatedAt: new Date(),
    };

    prismaProjectDeploymentFindManyMock.mockResolvedValue([deployment]);
    proxyDeploymentRequestMock.mockResolvedValue(null);
    readProjectDistArtifactMock.mockResolvedValue([
      {
        content: "body { background: red; }",
        contentType: "text/css; charset=utf-8",
        path: "assets/index.css",
      },
    ]);

    const token = createPreviewAssetToken({
      deploymentId: "deployment_1",
      projectId: "project_1",
    });

    const response = await GET(
      new Request(
        `http://localhost/assets/index.css?assetToken=${encodeURIComponent(token)}`,
      ),
      {
        id: "project_1",
        _splat: "index.css",
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/css");
    await expect(response.text()).resolves.toContain("background: red");
  });

  it("selects the deployment named by a valid historical preview token", async () => {
    const historicalDeployment = {
      build: {
        artifactRef: "project-artifact:s3:dist:historical_build",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        id: "historical_build",
        projectId: "project_1",
        snapshot: { id: "historical_snapshot", projectId: "project_1" },
        snapshotId: "historical_snapshot",
        status: "succeeded",
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      buildId: "historical_build",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      id: "historical_deployment",
      kind: "preview",
      projectId: "project_1",
      snapshot: { id: "historical_snapshot", projectId: "project_1" },
      snapshotId: "historical_snapshot",
      status: "stopped",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const latestDeployment = {
      ...historicalDeployment,
      build: {
        ...historicalDeployment.build,
        artifactRef: "project-artifact:s3:dist:latest_build",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
        id: "latest_build",
        snapshot: { id: "latest_snapshot", projectId: "project_1" },
        snapshotId: "latest_snapshot",
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      buildId: "latest_build",
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      id: "latest_deployment",
      snapshot: { id: "latest_snapshot", projectId: "project_1" },
      snapshotId: "latest_snapshot",
      status: "running",
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    };

    prismaProjectDeploymentFindManyMock.mockResolvedValue([
      latestDeployment,
      historicalDeployment,
    ]);
    proxyDeploymentRequestMock.mockResolvedValue(null);
    readProjectDistArtifactMock.mockResolvedValue([
      {
        content: "historical",
        contentType: "text/css",
        path: "assets/index.css",
      },
    ]);

    const token = createPreviewAssetToken({
      deploymentId: "historical_deployment",
      projectId: "project_1",
    });
    const response = await GET(
      new Request(
        `http://localhost/assets/index.css?assetToken=${encodeURIComponent(token)}`,
      ),
      { id: "project_1", _splat: "index.css" },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("historical");
    expect(proxyDeploymentRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ deploymentId: "historical_deployment" }),
    );
    expect(readProjectDistArtifactMock).toHaveBeenCalledWith(
      "project-artifact:s3:dist:historical_build",
    );
  });

  it("does not fall back to an unrelated successful build for a selected deployment", async () => {
    const deployment = {
      build: {
        artifactRef: "project-artifact:s3:dist:build_1",
        createdAt: new Date(),
        id: "build_1",
        projectId: "project_1",
        snapshot: { id: "snapshot_1", projectId: "project_1" },
        snapshotId: "snapshot_1",
        status: "succeeded",
        updatedAt: new Date(),
      },
      buildId: "build_1",
      createdAt: new Date(),
      id: "deployment_1",
      kind: "preview",
      projectId: "project_1",
      snapshot: { id: "snapshot_1", projectId: "project_1" },
      snapshotId: "snapshot_1",
      status: "created",
      updatedAt: new Date(),
    };
    prismaProjectDeploymentFindManyMock.mockResolvedValue([deployment]);
    prismaProjectBuildFindManyMock.mockResolvedValue([
      { artifactRef: "project-artifact:s3:dist:build_2", id: "build_2" },
    ]);
    proxyDeploymentRequestMock.mockResolvedValue(null);
    readProjectDistArtifactMock.mockImplementation(async (ref: string) =>
      ref.endsWith("build_1")
        ? []
        : [
            {
              content: "wrong version",
              contentType: "text/css",
              path: "assets/index.css",
            },
          ],
    );
    prismaQueryRawMock.mockResolvedValue([{ distFiles: null }]);

    const token = createPreviewAssetToken({
      deploymentId: "deployment_1",
      projectId: "project_1",
    });
    const response = await GET(
      new Request(
        `http://localhost/assets/index.css?assetToken=${encodeURIComponent(token)}`,
      ),
      { id: "project_1", _splat: "index.css" },
    );

    expect(response.status).toBe(503);
    expect(readProjectDistArtifactMock).toHaveBeenCalledTimes(1);
    expect(readProjectDistArtifactMock).toHaveBeenCalledWith(
      "project-artifact:s3:dist:build_1",
    );
  });

  it("does not read an artifact reference that does not belong to its build", async () => {
    const deployment = {
      build: {
        artifactRef: "project-artifact:s3:dist:other_build",
        createdAt: new Date(),
        id: "build_1",
        projectId: "project_1",
        snapshot: { projectId: "project_1" },
        snapshotId: "snapshot_1",
        status: "succeeded",
        updatedAt: new Date(),
      },
      buildId: "build_1",
      createdAt: new Date(),
      id: "deployment_1",
      kind: "preview",
      projectId: "project_1",
      snapshotId: "snapshot_1",
      status: "created",
      updatedAt: new Date(),
    };

    prismaProjectDeploymentFindManyMock.mockResolvedValue([deployment]);
    prismaQueryRawMock.mockResolvedValue([{ distFiles: null }]);
    proxyDeploymentRequestMock.mockResolvedValue(null);
    readProjectDistArtifactMock.mockResolvedValue([
      {
        content: "private",
        contentType: "text/plain",
        path: "assets/index.css",
      },
    ]);

    const token = createPreviewAssetToken({
      deploymentId: "deployment_1",
      projectId: "project_1",
    });

    const response = await GET(
      new Request(
        `http://localhost/assets/index.css?assetToken=${encodeURIComponent(token)}`,
      ),
      {
        id: "project_1",
        _splat: "index.css",
      },
    );

    expect(response.status).toBe(401);
    expect(readProjectDistArtifactMock).not.toHaveBeenCalled();
  });

  it("does not fall back to project files when the selected artifact is unavailable", async () => {
    const deployment = {
      build: {
        artifactRef: "project-artifact:s3:dist:build_1",
        createdAt: new Date(),
        id: "build_1",
        projectId: "project_1",
        snapshot: { id: "snapshot_1", projectId: "project_1" },
        snapshotId: "snapshot_1",
        status: "succeeded",
        updatedAt: new Date(),
      },
      buildId: "build_1",
      createdAt: new Date(),
      id: "deployment_1",
      kind: "preview",
      projectId: "project_1",
      snapshot: { id: "snapshot_1", projectId: "project_1" },
      snapshotId: "snapshot_1",
      status: "created",
      updatedAt: new Date(),
    };

    prismaProjectDeploymentFindManyMock.mockResolvedValue([deployment]);
    readProjectDistArtifactMock.mockResolvedValue([]);
    prismaQueryRawMock.mockResolvedValue([
      {
        distFiles: [
          {
            content: "wrong version",
            contentType: "text/css",
            path: "assets/index.css",
          },
        ],
      },
    ]);
    proxyDeploymentRequestMock.mockResolvedValue(null);

    const token = createPreviewAssetToken({
      deploymentId: "deployment_1",
      projectId: "project_1",
    });
    const response = await GET(
      new Request(
        `http://localhost/assets/index.css?assetToken=${encodeURIComponent(token)}`,
      ),
      { id: "project_1", _splat: "index.css" },
    );

    expect(response.status).toBe(503);
    expect(readProjectDistArtifactMock).toHaveBeenCalledTimes(1);
    expect(readProjectDistArtifactMock).toHaveBeenCalledWith(
      "project-artifact:s3:dist:build_1",
    );
  });

  it("does not use a preview deployment whose snapshot pointer disagrees with its build", async () => {
    const deployment = {
      build: {
        artifactRef: "project-artifact:s3:dist:build_1",
        createdAt: new Date(),
        id: "build_1",
        projectId: "project_1",
        snapshot: { projectId: "project_1" },
        snapshotId: "snapshot_2",
        status: "succeeded",
        updatedAt: new Date(),
      },
      buildId: "build_1",
      createdAt: new Date(),
      id: "deployment_1",
      kind: "preview",
      projectId: "project_1",
      snapshotId: "snapshot_1",
      status: "created",
      updatedAt: new Date(),
    };

    prismaProjectDeploymentFindManyMock.mockResolvedValue([deployment]);

    const token = createPreviewAssetToken({
      deploymentId: "deployment_1",
      projectId: "project_1",
    });

    const response = await GET(
      new Request(
        `http://localhost/assets/index.css?assetToken=${encodeURIComponent(token)}`,
      ),
      {
        id: "project_1",
        _splat: "index.css",
      },
    );

    expect(response.status).toBe(401);
    expect(proxyDeploymentRequestMock).not.toHaveBeenCalled();
    expect(readProjectDistArtifactMock).not.toHaveBeenCalled();
  });

  it("does not use a preview deployment whose build belongs to another project", async () => {
    const deployment = {
      build: {
        artifactRef: "project-artifact:s3:dist:build_1",
        createdAt: new Date(),
        id: "build_1",
        projectId: "project_2",
        snapshot: { projectId: "project_2" },
        snapshotId: "snapshot_1",
        status: "succeeded",
        updatedAt: new Date(),
      },
      buildId: "build_1",
      createdAt: new Date(),
      id: "deployment_1",
      kind: "preview",
      projectId: "project_1",
      snapshotId: "snapshot_1",
      status: "created",
      updatedAt: new Date(),
    };

    prismaProjectDeploymentFindManyMock.mockResolvedValue([deployment]);

    const token = createPreviewAssetToken({
      deploymentId: "deployment_1",
      projectId: "project_1",
    });

    const response = await GET(
      new Request(
        `http://localhost/assets/index.css?assetToken=${encodeURIComponent(token)}`,
      ),
      {
        id: "project_1",
        _splat: "index.css",
      },
    );

    expect(response.status).toBe(401);
    expect(proxyDeploymentRequestMock).not.toHaveBeenCalled();
    expect(readProjectDistArtifactMock).not.toHaveBeenCalled();
  });
});
