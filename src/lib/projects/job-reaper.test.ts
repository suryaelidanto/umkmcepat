import { beforeEach, describe, expect, it, vi } from "vitest";

const updateBuild = vi.fn();
const updateProject = vi.fn();
const updateAttempt = vi.fn();
const updateTurn = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectBuild: {
      updateMany: (...args: unknown[]) => updateBuild(...args),
    },
    project: {
      updateMany: (...args: unknown[]) => updateProject(...args),
    },
    projectEditAttempt: {
      updateMany: (...args: unknown[]) => updateAttempt(...args),
    },
    projectChatTurn: {
      updateMany: (...args: unknown[]) => updateTurn(...args),
    },
  },
}));

vi.mock("@/lib/dev-log", () => ({
  devLog: vi.fn(),
}));

import { runJobReaperOnce, stopJobReaperForTests } from "./job-reaper";

describe("runJobReaperOnce", () => {
  beforeEach(() => {
    stopJobReaperForTests();
    updateBuild.mockReset();
    updateProject.mockReset();
    updateAttempt.mockReset();
    updateTurn.mockReset();
    updateBuild.mockResolvedValue({ count: 0 });
    updateProject.mockResolvedValue({ count: 0 });
    updateAttempt.mockResolvedValue({ count: 0 });
    updateTurn.mockResolvedValue({ count: 0 });
  });

  it("marks stale builds, expired leases, and expired discuss turns", async () => {
    updateBuild.mockResolvedValue({ count: 2 });
    updateProject
      .mockResolvedValueOnce({ count: 1 }) // expired leases
      .mockResolvedValueOnce({ count: 1 }); // stale project state
    updateTurn.mockResolvedValue({ count: 3 });

    const result = await runJobReaperOnce(new Date("2026-08-02T12:00:00.000Z"));

    expect(result).toEqual({
      staleBuilds: 2,
      expiredLeases: 1,
      expiredDiscussTurns: 3,
    });
    expect(updateBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "stale" }),
      }),
    );
    expect(updateAttempt).toHaveBeenCalled();
    expect(updateTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "running" }),
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
  });

  it("returns zeros when nothing is stale", async () => {
    const result = await runJobReaperOnce();
    expect(result).toEqual({
      staleBuilds: 0,
      expiredLeases: 0,
      expiredDiscussTurns: 0,
    });
    expect(updateAttempt).not.toHaveBeenCalled();
  });
});
