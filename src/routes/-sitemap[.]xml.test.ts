import { afterEach, describe, expect, it, vi } from "vitest";

const { prismaProjectDeploymentFindManyMock } = vi.hoisted(() => ({
  prismaProjectDeploymentFindManyMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectDeployment: { findMany: prismaProjectDeploymentFindManyMock },
  },
}));

import { getHandler } from "../../tests/support/route-handler";

import { Route } from "@/routes/sitemap[.]xml";

const GET = getHandler(Route, "GET");

describe("sitemap", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("excludes published deployments with invalid artifact lineage", async () => {
    vi.stubEnv("GENERATED_PUBLIC_ORIGIN", "https://sites.example.net");
    prismaProjectDeploymentFindManyMock.mockResolvedValue([
      {
        build: {
          artifactRef: "project-artifact:s3:dist:build_other",
          id: "build_1",
          projectId: "project_1",
          snapshot: { id: "snapshot_1", projectId: "project_1" },
          snapshotId: "snapshot_1",
          status: "succeeded",
        },
        buildId: "build_1",
        id: "deployment_1",
        kind: "published",
        projectId: "project_1",
        snapshot: { id: "snapshot_1", projectId: "project_1" },
        snapshotId: "snapshot_1",
        slug: "should-not-list",
        updatedAt: new Date("2026-08-01"),
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("should-not-list");
  });

  it("excludes published deployments whose owner is banned", async () => {
    vi.stubEnv("GENERATED_PUBLIC_ORIGIN", "https://sites.example.net");
    prismaProjectDeploymentFindManyMock.mockResolvedValue([
      {
        build: {
          artifactRef: "project-artifact:s3:dist:build_warung",
          id: "build_warung",
          projectId: "project_warung",
          snapshot: {
            id: "snapshot_warung",
            projectId: "project_warung",
            project: { user: { bannedAt: new Date() } },
          },
          snapshotId: "snapshot_warung",
          status: "succeeded",
        },
        buildId: "build_warung",
        id: "deployment_warung",
        kind: "published",
        projectId: "project_warung",
        snapshot: { id: "snapshot_warung", projectId: "project_warung" },
        snapshotId: "snapshot_warung",
        slug: "warung",
        updatedAt: new Date("2026-08-01"),
      },
      {
        build: {
          artifactRef: "project-artifact:s3:dist:build_kafe",
          id: "build_kafe",
          projectId: "project_kafe",
          snapshot: {
            id: "snapshot_kafe",
            projectId: "project_kafe",
            project: { user: { bannedAt: null } },
          },
          snapshotId: "snapshot_kafe",
          status: "succeeded",
        },
        buildId: "build_kafe",
        id: "deployment_kafe",
        kind: "published",
        projectId: "project_kafe",
        snapshot: { id: "snapshot_kafe", projectId: "project_kafe" },
        snapshotId: "snapshot_kafe",
        slug: "kafe",
        updatedAt: new Date("2026-08-02"),
      },
    ]);

    const res = await GET();
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain("/waitlist");
    expect(body).toContain("/terms");
    expect(body).toContain("/privacy");
    expect(body).toContain("/p/kafe");
    expect(body).not.toContain("/p/warung");
  });
});
