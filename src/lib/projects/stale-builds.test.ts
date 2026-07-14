import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaProjectBuildUpdateManyMock,
  prismaProjectEditAttemptUpdateManyMock,
  prismaProjectUpdateManyMock,
} = vi.hoisted(() => ({
  prismaProjectBuildUpdateManyMock: vi.fn(),
  prismaProjectEditAttemptUpdateManyMock: vi.fn(),
  prismaProjectUpdateManyMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { updateMany: prismaProjectUpdateManyMock },
    projectBuild: { updateMany: prismaProjectBuildUpdateManyMock },
    projectEditAttempt: { updateMany: prismaProjectEditAttemptUpdateManyMock },
  },
}));

import { getStaleBuildCutoff, markStaleProjectBuilds } from "./stale-builds";

describe("stale build recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaProjectUpdateManyMock.mockResolvedValue({ count: 0 });
    prismaProjectEditAttemptUpdateManyMock.mockResolvedValue({ count: 0 });
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
        activeOperationToken: null,
        buildStatus: { in: ["queued", "running"] },
        id: "project_1",
        status: "building",
      },
    });
  });

  it("recovers an expired operation even when no build row exists", async () => {
    const now = new Date("2026-07-07T12:15:00.000Z");
    prismaProjectBuildUpdateManyMock.mockResolvedValue({ count: 0 });
    prismaProjectUpdateManyMock.mockResolvedValueOnce({ count: 1 });

    await expect(markStaleProjectBuilds("project_1", now)).resolves.toBe(1);

    expect(prismaProjectUpdateManyMock).toHaveBeenCalledWith({
      data: {
        activeOperationExpiresAt: null,
        activeOperationKind: null,
        activeOperationToken: null,
        buildLog: "Operation lease expired before completion.",
        buildStatus: "failed",
        status: "failed",
      },
      where: {
        activeOperationExpiresAt: { lte: now },
        activeOperationToken: { not: null },
        id: "project_1",
        status: "building",
      },
    });
    expect(prismaProjectEditAttemptUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed" }),
        where: expect.objectContaining({
          projectId: "project_1",
          status: {
            in: ["generating", "editing", "repairing", "building"],
          },
        }),
      }),
    );
  });
});
