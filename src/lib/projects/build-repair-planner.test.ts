import { describe, expect, it } from "vitest";

import type { BuildFailureReason } from "@/lib/projects/build-logs";

import {
  DEFAULT_OUTER_REPAIR_BUDGET,
  planRepair,
} from "@/lib/projects/build-repair-planner";

const ALL_REASONS: BuildFailureReason[] = [
  "artifact_write_failure",
  "blocked_package",
  "compile_error",
  "concurrency_limit",
  "manifest_failure",
  "stale_worker",
  "timeout",
  "unknown",
];

describe("planRepair", () => {
  it("plans a repair for code-fixable reasons within budget", () => {
    const action = planRepair({
      reason: "compile_error",
      attemptsUsed: 0,
    });
    expect(action).toMatchObject({
      kind: "repair",
      attempt: 1,
    });
  });

  it("plans re-spec for blocked_package (policy rejection)", () => {
    const action = planRepair({
      reason: "blocked_package",
      attemptsUsed: 0,
    });
    expect(action.kind).toBe("re-spec");
  });

  it("plans a retry-build (not a repair attempt) for transient reasons", () => {
    for (const reason of [
      "concurrency_limit",
      "stale_worker",
      "timeout",
    ] as BuildFailureReason[]) {
      const action = planRepair({ reason, attemptsUsed: 0 });
      expect(action.kind).toBe("retry-build");
    }
  });

  it("gives up immediately on artifact_write_failure (not code-fixable)", () => {
    const action = planRepair({
      reason: "artifact_write_failure",
      attemptsUsed: 0,
    });
    expect(action.kind).toBe("give-up");
  });

  it("exhausts: gives up when budget is reached even for repairable reasons", () => {
    const action = planRepair({
      reason: "compile_error",
      attemptsUsed: DEFAULT_OUTER_REPAIR_BUDGET,
    });
    expect(action.kind).toBe("give-up");
  });

  it("does one more repair when exactly one attempt remains", () => {
    const action = planRepair({
      reason: "compile_error",
      attemptsUsed: DEFAULT_OUTER_REPAIR_BUDGET - 1,
    });
    expect(action).toMatchObject({
      kind: "repair",
      attempt: DEFAULT_OUTER_REPAIR_BUDGET,
    });
  });

  it("respects a custom budget", () => {
    const action = planRepair({
      reason: "manifest_failure",
      attemptsUsed: 1,
      budget: 2,
    });
    expect(action).toMatchObject({ kind: "repair", attempt: 2 });

    const exhausted = planRepair({
      reason: "manifest_failure",
      attemptsUsed: 2,
      budget: 2,
    });
    expect(exhausted.kind).toBe("give-up");
  });

  it("every BuildFailureReason maps to a known action kind", () => {
    for (const reason of ALL_REASONS) {
      const action = planRepair({ reason, attemptsUsed: 0 });
      expect(["repair", "re-spec", "retry-build", "give-up"]).toContain(
        action.kind,
      );
    }
  });

  it("every action carries a non-empty rationale", () => {
    for (const reason of ALL_REASONS) {
      const action = planRepair({ reason, attemptsUsed: 0 });
      expect(
        (action as { rationale: string }).rationale.length,
      ).toBeGreaterThan(0);
    }
  });
});
