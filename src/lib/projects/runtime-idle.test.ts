import { describe, expect, it, vi } from "vitest";

import { stopIdleProjectDeployments } from "@/lib/projects/runtime-idle";

describe("runtime idle worker", () => {
  it("stops only running preview deployments past the idle timeout", async () => {
    const stopDeployment = vi.fn(async () => "stopped" as const);
    const prisma = {
      projectDeployment: {
        findMany: vi.fn(async () => [
          {
            id: "deployment_idle",
            lastRequestAt: new Date("2026-07-06T01:00:00.000Z"),
            status: "running",
          },
          {
            id: "deployment_active",
            lastRequestAt: new Date("2026-07-06T01:10:00.000Z"),
            status: "running",
          },
        ]),
      },
    };

    const result = await stopIdleProjectDeployments({
      idleTimeoutMs: 15 * 60 * 1000,
      now: new Date("2026-07-06T01:20:00.000Z"),
      prisma,
      supervisor: {
        getDeploymentStatus: vi.fn(async () => "running" as const),
        resolveDeploymentTarget: vi.fn(async () => null),
        startDeployment: vi.fn(async () => "running" as const),
        stopDeployment,
      },
    });

    expect(result).toEqual({
      checked: 2,
      stopped: ["deployment_idle"],
    });
    expect(stopDeployment).toHaveBeenCalledTimes(1);
    expect(stopDeployment).toHaveBeenCalledWith("deployment_idle");
  });
});
