import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaProjectBuildUpdateManyMock, prismaProjectUpdateManyMock } =
  vi.hoisted(() => ({
    prismaProjectBuildUpdateManyMock: vi.fn(),
    prismaProjectUpdateManyMock: vi.fn(),
  }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { updateMany: prismaProjectUpdateManyMock },
    projectBuild: { updateMany: prismaProjectBuildUpdateManyMock },
  },
}));

import { getStaleBuildCutoff, markStaleProjectBuilds } from "./stale-builds";

describe("stale build recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes a fifteen minute stale cutoff", () => {
    expect(getStaleBuildCutoff(new Date("2026-07-07T12:15:00.000Z"))).toEqual(
      new Date("2026-07-07T12:00:00.000Z"),
    );
  });

  it("marks stale queued/running builds and clears the project building state", async () => {
    const now = new Date("2026-07-07T12:15:00.000Z");
    prismaProjectBuildUpdateManyMock.mockResolvedValue({ count: 2 });

    await expect(markStaleProjectBuilds("project_1", now)).resolves.toBe(2);

    expect(prismaProjectBuildUpdateManyMock).toHaveBeenCalledWith({
      data: {
        finishedAt: now,
        logText: "Build marked stale after exceeding the recovery timeout.",
        status: "stale",
      },
      where: {
        projectId: "project_1",
        status: { in: ["queued", "running"] },
        updatedAt: { lt: new Date("2026-07-07T12:00:00.000Z") },
      },
    });
    expect(prismaProjectUpdateManyMock).toHaveBeenCalledWith({
      data: {
        buildLog: "Build marked stale after exceeding the recovery timeout.",
        buildStatus: "failed",
        status: "failed",
      },
      where: {
        buildStatus: { in: ["queued", "running"] },
        id: "project_1",
        status: "building",
      },
    });
  });

  it("does not update the project when no builds were stale", async () => {
    prismaProjectBuildUpdateManyMock.mockResolvedValue({ count: 0 });

    await expect(markStaleProjectBuilds("project_1")).resolves.toBe(0);

    expect(prismaProjectUpdateManyMock).not.toHaveBeenCalled();
  });
});
