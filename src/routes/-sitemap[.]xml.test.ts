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

  it("excludes published deployments whose owner is banned", async () => {
    vi.stubEnv("GENERATED_PUBLIC_ORIGIN", "https://sites.example.net");
    prismaProjectDeploymentFindManyMock.mockResolvedValue([
      {
        slug: "warung",
        updatedAt: new Date("2026-08-01"),
        build: { snapshot: { project: { user: { bannedAt: new Date() } } } },
      },
      {
        slug: "kafe",
        updatedAt: new Date("2026-08-02"),
        build: { snapshot: { project: { user: { bannedAt: null } } } },
      },
    ]);

    const res = await GET();
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain("/p/kafe");
    expect(body).not.toContain("/p/warung");
  });
});
