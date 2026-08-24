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
vi.mock("@/lib/projects/runtime-artifacts", () => ({
  readProjectDistArtifact: readProjectDistArtifactMock,
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
});
