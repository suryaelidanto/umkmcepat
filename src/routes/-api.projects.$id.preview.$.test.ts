import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  afterMock,
  authMock,
  prismaQueryRawMock,
  prismaProjectDeploymentFindManyMock,
  prismaProjectDeploymentUpdateMock,
  prismaProjectFindFirstMock,
  proxyDeploymentRequestMock,
  readProjectDistArtifactMock,
  refreshProjectThumbnailMock,
} = vi.hoisted(() => ({
  afterMock: vi.fn(),
  authMock: vi.fn<() => Promise<unknown>>(),
  prismaQueryRawMock: vi.fn(),
  prismaProjectDeploymentFindManyMock: vi.fn(),
  prismaProjectDeploymentUpdateMock: vi.fn(),
  prismaProjectFindFirstMock: vi.fn(),
  proxyDeploymentRequestMock: vi.fn(),
  readProjectDistArtifactMock: vi.fn(),
  refreshProjectThumbnailMock: vi.fn(),
}));

vi.mock("next/server", () => ({ after: afterMock }));
vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
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
vi.mock("@/lib/projects/project-thumbnail", () => ({
  refreshProjectThumbnail: refreshProjectThumbnailMock,
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

import { Route } from "@/routes/api.projects.$id.preview.$";

const GET = getHandler(Route, "GET");

const older = new Date("2026-07-07T01:00:00.000Z");
const newer = new Date("2026-07-07T02:00:00.000Z");

describe("project preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: { id: "user_1" },
      expires: new Date().toISOString(),
    });
    prismaProjectFindFirstMock.mockResolvedValue({
      id: "project_1",
      thumbnailBuildId: null,
      thumbnailRef: null,
    });
    prismaProjectDeploymentUpdateMock.mockResolvedValue({});
    proxyDeploymentRequestMock.mockResolvedValue(
      new Response("preview-success", { status: 200 }),
    );
    readProjectDistArtifactMock.mockResolvedValue([]);
    prismaQueryRawMock.mockResolvedValue([{ distFiles: null }]);
    refreshProjectThumbnailMock.mockResolvedValue(undefined);
    afterMock.mockImplementation((callback: () => void) => callback());
  });

  it("proxies the active successful deployment when the newest deployment failed", async () => {
    const successfulBuild = {
      artifactRef: "project-artifact:s3:dist:build_success",
      createdAt: older,
      id: "build_success",
      projectId: "project_1",
      snapshot: { id: "snapshot_success", projectId: "project_1" },
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
        projectId: "project_1",
        snapshot: {
          id: successfulBuild.snapshotId,
          projectId: "project_1",
        },
        snapshotId: successfulBuild.snapshotId,
        status: "stopped",
        updatedAt: older,
      },
    ]);

    const response = await GET(new Request("http://localhost/preview"), {
      id: "project_1",
      _splat: "",
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

  it("serves the stored static artifact when no runtime deployment exists", async () => {
    prismaProjectDeploymentFindManyMock.mockResolvedValue([]);
    prismaQueryRawMock.mockResolvedValue([
      {
        distFiles: [
          {
            content:
              '<html><body><script src="./assets/app.js"></script>Website siap</body></html>',
            contentType: "text/html; charset=utf-8",
            path: "index.html",
          },
        ],
      },
    ]);

    const response = await GET(new Request("http://localhost/preview"), {
      id: "project_1",
      _splat: "",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const body = await response.text();
    expect(body).toContain("Website siap");
    expect(body).not.toContain('src="./assets/');
  });

  it("does not fall back to the current project artifact for a missing snapshot deployment", async () => {
    prismaProjectDeploymentFindManyMock.mockResolvedValue([]);
    prismaQueryRawMock.mockResolvedValue([
      {
        distFiles: [
          {
            content: "must not be served",
            contentType: "text/html; charset=utf-8",
            path: "index.html",
          },
        ],
      },
    ]);

    const response = await GET(
      new Request("http://localhost/preview?snapshotId=selected_snapshot"),
      { id: "project_1", _splat: "" },
    );

    expect(response.status).toBe(404);
    expect(prismaQueryRawMock).not.toHaveBeenCalled();
  });

  it("serves the active deployment artifact when the runtime is unavailable", async () => {
    const successfulBuild = {
      artifactRef: "project-artifact:s3:dist:build_success",
      createdAt: newer,
      id: "build_success",
      projectId: "project_1",
      snapshot: { id: "snapshot_success", projectId: "project_1" },
      snapshotId: "snapshot_success",
      status: "succeeded",
      updatedAt: newer,
    };
    prismaProjectDeploymentFindManyMock.mockResolvedValue([
      {
        build: successfulBuild,
        buildId: successfulBuild.id,
        createdAt: newer,
        id: "deployment_success",
        kind: "preview",
        projectId: "project_1",
        snapshot: {
          id: successfulBuild.snapshotId,
          projectId: "project_1",
        },
        snapshotId: successfulBuild.snapshotId,
        status: "created",
        updatedAt: newer,
      },
    ]);
    proxyDeploymentRequestMock.mockResolvedValue(null);
    prismaQueryRawMock.mockResolvedValue([{ distFiles: null }]);
    readProjectDistArtifactMock.mockResolvedValue([
      {
        content: "<html><body>Artifact preview</body></html>",
        contentType: "text/html; charset=utf-8",
        path: "index.html",
      },
    ]);

    const response = await GET(new Request("http://localhost/preview"), {
      id: "project_1",
      _splat: "",
    });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("Artifact preview");
    expect(readProjectDistArtifactMock).toHaveBeenCalledWith(
      successfulBuild.artifactRef,
    );
  });

  it("returns 404 for a missing preview asset instead of the SPA fallback", async () => {
    const successfulBuild = {
      artifactRef: "project-artifact:s3:dist:build_missing_asset",
      createdAt: newer,
      id: "build_missing_asset",
      projectId: "project_1",
      snapshot: {
        id: "snapshot_missing_asset",
        projectId: "project_1",
      },
      snapshotId: "snapshot_missing_asset",
      status: "succeeded",
      updatedAt: newer,
    };
    prismaProjectDeploymentFindManyMock.mockResolvedValue([
      {
        build: successfulBuild,
        buildId: successfulBuild.id,
        createdAt: newer,
        id: "deployment_missing_asset",
        kind: "preview",
        projectId: "project_1",
        snapshot: {
          id: successfulBuild.snapshotId,
          projectId: "project_1",
        },
        snapshotId: successfulBuild.snapshotId,
        status: "created",
        updatedAt: newer,
      },
    ]);
    proxyDeploymentRequestMock.mockResolvedValue(null);
    readProjectDistArtifactMock.mockResolvedValue([
      {
        content: "home",
        contentType: "text/html; charset=utf-8",
        path: "index.html",
      },
    ]);

    const response = await GET(
      new Request("http://localhost/preview/assets/missing.js"),
      { id: "project_1", _splat: "assets/missing.js" },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "sandbox allow-scripts",
    );
  });

  it("backfills a missing thumbnail once after a successful preview response", async () => {
    const successfulBuild = {
      artifactRef: "project-artifact:s3:dist:build_success",
      createdAt: newer,
      id: "build_success",
      projectId: "project_1",
      snapshot: { id: "snapshot_success", projectId: "project_1" },
      snapshotId: "snapshot_success",
      status: "succeeded",
      updatedAt: newer,
    };
    prismaProjectDeploymentFindManyMock.mockResolvedValue([
      {
        build: successfulBuild,
        buildId: successfulBuild.id,
        createdAt: newer,
        id: "deployment_success",
        kind: "preview",
        projectId: "project_1",
        snapshot: {
          id: successfulBuild.snapshotId,
          projectId: "project_1",
        },
        snapshotId: successfulBuild.snapshotId,
        status: "running",
        updatedAt: newer,
      },
    ]);

    await GET(new Request("http://localhost/preview"), {
      id: "project_1",
      _splat: "",
    });

    expect(refreshProjectThumbnailMock).toHaveBeenCalledWith({
      artifactRef: successfulBuild.artifactRef,
      buildId: successfulBuild.id,
      projectId: "project_1",
    });
  });

  it("does not recapture a thumbnail already matching the successful build", async () => {
    const successfulBuild = {
      artifactRef: "project-artifact:s3:dist:build_success",
      createdAt: newer,
      id: "build_success",
      projectId: "project_1",
      snapshot: { id: "snapshot_success", projectId: "project_1" },
      snapshotId: "snapshot_success",
      status: "succeeded",
      updatedAt: newer,
    };
    prismaProjectFindFirstMock.mockResolvedValue({
      id: "project_1",
      thumbnailBuildId: successfulBuild.id,
      thumbnailRef: "project-thumbnail:local:project_1",
    });
    prismaProjectDeploymentFindManyMock.mockResolvedValue([
      {
        build: successfulBuild,
        buildId: successfulBuild.id,
        createdAt: newer,
        id: "deployment_success",
        kind: "preview",
        projectId: "project_1",
        snapshot: {
          id: successfulBuild.snapshotId,
          projectId: "project_1",
        },
        snapshotId: successfulBuild.snapshotId,
        status: "running",
        updatedAt: newer,
      },
    ]);

    await GET(new Request("http://localhost/preview"), {
      id: "project_1",
      _splat: "",
    });

    expect(refreshProjectThumbnailMock).not.toHaveBeenCalled();
  });

  it("does not serve a deployment artifact reference that does not belong to its build", async () => {
    const deployment = {
      build: {
        artifactRef: "project-artifact:s3:dist:other_build",
        createdAt: newer,
        id: "build_1",
        projectId: "project_1",
        snapshot: { id: "snapshot_1", projectId: "project_1" },
        snapshotId: "snapshot_1",
        status: "succeeded",
        updatedAt: newer,
      },
      buildId: "build_1",
      createdAt: newer,
      id: "deployment_1",
      kind: "preview",
      projectId: "project_1",
      snapshotId: "snapshot_1",
      status: "created",
      updatedAt: newer,
    };
    prismaProjectDeploymentFindManyMock.mockResolvedValue([deployment]);
    proxyDeploymentRequestMock.mockResolvedValue(null);
    prismaQueryRawMock.mockResolvedValue([{ distFiles: null }]);
    readProjectDistArtifactMock.mockResolvedValue([
      {
        content: "must not be served",
        contentType: "text/html; charset=utf-8",
        path: "index.html",
      },
    ]);

    const response = await GET(new Request("http://localhost/preview"), {
      id: "project_1",
      _splat: "",
    });

    expect(response.status).toBe(404);
    expect(readProjectDistArtifactMock).not.toHaveBeenCalled();
  });

  it("does not use a preview deployment whose build belongs to another project", async () => {
    const deployment = {
      build: {
        artifactRef: "project-artifact:s3:dist:build_1",
        createdAt: newer,
        id: "build_1",
        projectId: "project_2",
        snapshot: { projectId: "project_2" },
        snapshotId: "snapshot_1",
        status: "succeeded",
        updatedAt: newer,
      },
      buildId: "build_1",
      createdAt: newer,
      id: "deployment_1",
      kind: "preview",
      projectId: "project_1",
      snapshotId: "snapshot_1",
      status: "created",
      updatedAt: newer,
    };
    prismaProjectDeploymentFindManyMock.mockResolvedValue([deployment]);
    prismaQueryRawMock.mockResolvedValue([{ distFiles: null }]);

    const response = await GET(new Request("http://localhost/preview"), {
      id: "project_1",
      _splat: "",
    });

    expect(response.status).toBe(404);
    expect(proxyDeploymentRequestMock).not.toHaveBeenCalled();
    expect(readProjectDistArtifactMock).not.toHaveBeenCalled();
  });

  it("returns an actionable HTML panel when no preview artifact exists", async () => {
    prismaProjectDeploymentFindManyMock.mockResolvedValue([]);
    prismaQueryRawMock.mockResolvedValue([{ distFiles: null }]);

    const response = await GET(new Request("http://localhost/preview"), {
      id: "project_1",
      _splat: "",
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
