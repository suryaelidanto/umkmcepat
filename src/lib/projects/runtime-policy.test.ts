import { describe, expect, it } from "vitest";

import {
  chooseRuntimeNode,
  DEFAULT_RUNTIME_RESOURCE_LIMITS,
  nodeHasCapacity,
  shouldStopIdleDeployment,
} from "@/lib/projects/runtime-policy";

describe("runtime policy", () => {
  it("stops a running deployment when its last request is older than the timeout", () => {
    expect(
      shouldStopIdleDeployment(
        {
          lastRequestAt: new Date("2026-07-06T01:00:00.000Z"),
          status: "running",
        },
        new Date("2026-07-06T01:16:00.000Z"),
        15 * 60 * 1000,
      ),
    ).toBe(true);
  });

  it("keeps a running deployment when the last request is recent", () => {
    expect(
      shouldStopIdleDeployment(
        {
          lastRequestAt: new Date("2026-07-06T01:10:30.000Z"),
          status: "running",
        },
        new Date("2026-07-06T01:16:00.000Z"),
        15 * 60 * 1000,
      ),
    ).toBe(false);
  });

  it("does not idle-stop stopped or failed deployments", () => {
    const lastRequestAt = new Date("2026-07-06T01:00:00.000Z");
    const now = new Date("2026-07-06T02:00:00.000Z");

    expect(
      shouldStopIdleDeployment({ lastRequestAt, status: "stopped" }, now),
    ).toBe(false);
    expect(
      shouldStopIdleDeployment({ lastRequestAt, status: "failed" }, now),
    ).toBe(false);
  });

  it("selects the active runtime node with capacity", () => {
    expect(
      chooseRuntimeNode([
        {
          id: "node-full",
          maxContainers: 2,
          status: "active",
          usedContainers: 2,
        },
        {
          id: "node-ok",
          maxContainers: 2,
          status: "active",
          usedContainers: 1,
        },
      ])?.id,
    ).toBe("node-ok");
  });

  it("ignores full, draining, and offline runtime nodes", () => {
    const nodes = [
      {
        id: "node-full",
        maxContainers: 1,
        status: "active",
        usedContainers: 1,
      },
      {
        id: "node-draining",
        maxContainers: 10,
        status: "draining",
        usedContainers: 0,
      },
      {
        id: "node-offline",
        maxContainers: 10,
        status: "offline",
        usedContainers: 0,
      },
    ];

    expect(chooseRuntimeNode(nodes)).toBeNull();
    expect(nodeHasCapacity(nodes[0])).toBe(false);
    expect(nodeHasCapacity(nodes[1])).toBe(false);
    expect(nodeHasCapacity(nodes[2])).toBe(false);
  });

  it("keeps conservative default runtime resource limits", () => {
    expect(DEFAULT_RUNTIME_RESOURCE_LIMITS).toEqual({
      cpuCores: 0.5,
      memoryMb: 512,
    });
  });
});
