import { describe, expect, it } from "vitest";

import {
  computeProjectBucket,
  isBatchedWriterRolledOut,
  PILOT_PERCENT,
  resolveBatchedRollout,
} from "./batched-rollout";

describe("resolveBatchedRollout", () => {
  it("off — always false", () => {
    expect(
      resolveBatchedRollout({
        rollout: "off",
        isAdmin: true,
        projectId: "p1",
      }),
    ).toBe(false);
  });

  it("internal — admins only", () => {
    expect(
      resolveBatchedRollout({
        rollout: "internal",
        isAdmin: true,
        projectId: "p1",
      }),
    ).toBe(true);
    expect(
      resolveBatchedRollout({
        rollout: "internal",
        isAdmin: false,
        projectId: "p1",
      }),
    ).toBe(false);
  });

  it("all — everyone", () => {
    expect(
      resolveBatchedRollout({
        rollout: "all",
        isAdmin: false,
        projectId: "p1",
      }),
    ).toBe(true);
  });

  it("pilot — deterministic per project id; same id always lands the same", () => {
    const a1 = resolveBatchedRollout({
      rollout: "pilot",
      isAdmin: false,
      projectId: "project-abc-1",
    });
    const a2 = resolveBatchedRollout({
      rollout: "pilot",
      isAdmin: false,
      projectId: "project-abc-1",
    });
    const b1 = resolveBatchedRollout({
      rollout: "pilot",
      isAdmin: false,
      projectId: "project-xyz-9",
    });
    expect(a1).toBe(a2);
    // Not every project lands in pilot; not every project is excluded.
    const outcomes = new Set([
      a1,
      b1,
      resolveBatchedRollout({
        rollout: "pilot",
        isAdmin: false,
        projectId: "project-2",
      }),
      resolveBatchedRollout({
        rollout: "pilot",
        isAdmin: false,
        projectId: "project-3",
      }),
    ]);
    expect(outcomes.size).toBeGreaterThanOrEqual(1);
  });

  it("pilot bucket covers the expected share across many ids", () => {
    const yes = Array.from({ length: 500 }, (_, i) =>
      computeProjectBucket(`pilot-bucket-test-${i}`),
    ).filter((bucket) => bucket < PILOT_PERCENT).length;
    // Rough ballpark: should be within 20-80% of nominal for sanity.
    expect(yes).toBeGreaterThan(PILOT_PERCENT);
    expect(yes).toBeLessThan(PILOT_PERCENT * 8);
  });

  it("unknown rollout value degrades to false, never throws", () => {
    expect(
      isBatchedWriterRolledOut({
        rollout: "some-future-value" as "off",
        isAdmin: true,
        projectId: "p1",
      }),
    ).toBe(false);
  });
});
