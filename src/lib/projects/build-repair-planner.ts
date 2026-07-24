// Self-debug planner: pure decision logic for the autonomous iteration loop.
//
// Given a build failure (the typed BuildFailureReason from classifyBuildFailure
// + the sanitized build log), this returns the NEXT action the driver should
// take — repair, re-spec, give up, or re-run. It makes NO AI calls and touches
// NO live app; it is a deterministic, unit-testable core. The caller (the
// iteration driver / a CLI) executes the chosen action via the existing
// repairGeneratedProjectFiles path or the generate route.
//
// This composes with — never replaces — the existing 2-attempt repair loop in
// api.projects.$id.generate.ts. That loop is in-request; this planner governs
// the OUTER loop across multiple generate attempts when a build stays red.

import type { BuildFailureReason } from "@/lib/projects/build-logs";

export type RepairAction =
  | {
      kind: "repair";
      /** Reasoning shown to the operator / devLog. */
      rationale: string;
      /** 1-indexed attempt this will be within the outer repair budget. */
      attempt: number;
    }
  | {
      kind: "re-spec";
      rationale: string;
    }
  | {
      kind: "retry-build";
      rationale: string;
    }
  | {
      kind: "give-up";
      rationale: string;
    };

export const DEFAULT_OUTER_REPAIR_BUDGET = 3;

// Reasons where re-prompting the edit/repair agent is likely to help: the
// failure is in the generated code itself, so a focused patch can fix it.
const REPAIRABLE_REASONS: ReadonlySet<BuildFailureReason> = new Set([
  "compile_error",
  "manifest_failure",
  "unknown",
]);

// Reasons where the package/build policy rejected the output: repair might
// remove the offending package, but a fresh spec is often cleaner.
const SPEC_REASONS: ReadonlySet<BuildFailureReason> = new Set([
  "blocked_package",
]);

// Reasons where the worker/environment is the problem, not the code: just retry.
const RETRY_REASONS: ReadonlySet<BuildFailureReason> = new Set([
  "concurrency_limit",
  "stale_worker",
  "timeout",
]);

// Reasons where retrying repair won't help (artifact/IO). Give up + surface.
const TERMINAL_REASONS: ReadonlySet<BuildFailureReason> = new Set([
  "artifact_write_failure",
]);

export function planRepair({
  reason,
  attemptsUsed,
  budget = DEFAULT_OUTER_REPAIR_BUDGET,
}: {
  reason: BuildFailureReason;
  attemptsUsed: number;
  budget?: number;
}): RepairAction {
  const remaining = budget - attemptsUsed;

  if (TERMINAL_REASONS.has(reason)) {
    return {
      kind: "give-up",
      rationale: `Failure reason '${reason}' is not code-fixable; surfacing for operator.`,
    };
  }

  if (RETRY_REASONS.has(reason)) {
    // These are transient — retry the build without burning a repair attempt.
    return {
      kind: "retry-build",
      rationale: `Failure reason '${reason}' is transient; re-run the build before attempting code repair.`,
    };
  }

  if (remaining <= 0) {
    return {
      kind: "give-up",
      rationale: `Outer repair budget (${budget}) exhausted across ${attemptsUsed} attempts with reason '${reason}'.`,
    };
  }

  if (SPEC_REASONS.has(reason)) {
    return {
      kind: "re-spec",
      rationale: `Failure reason '${reason}' indicates the spec/policy rejected the output; re-generate the implementation spec before another repair pass (attempt ${attemptsUsed + 1}).`,
    };
  }

  if (REPAIRABLE_REASONS.has(reason)) {
    return {
      kind: "repair",
      rationale: `Failure reason '${reason}' is code-fixable; feeding the build log to the repair agent (attempt ${attemptsUsed + 1} of ${budget}).`,
      attempt: attemptsUsed + 1,
    };
  }

  // Unknown-but-not-terminal: try one repair, then give up (don't loop blindly).
  return {
    kind: "repair",
    rationale: `Unclassified failure; attempting a single conservative repair (attempt ${attemptsUsed + 1} of ${budget}).`,
    attempt: attemptsUsed + 1,
  };
}
