// src/lib/projects/batched-rollout.ts
// Rollout resolver for the batched-generation engine. Mirrors the
// contract_compiled_rollout pattern (generation-engine.ts) so behaviour is
// symmetric across the two engine toggles: sticky decision per call, never
// silently recomputed mid-attempt.
//
// - off:      always legacy agent loop.
// - internal: projects whose owner is an admin.
// - pilot:    deterministic bucket from projectId (see computeProjectBucket).
// - all:      always batched.

export type BatchedRolloutValue = "off" | "internal" | "pilot" | "all";

/** Pilot bucket width (0-99). 10 = ~10% of project ids get the batched writer. */
export const PILOT_PERCENT = 10;

export function isBatchedRolloutValue(
  value: string,
): value is BatchedRolloutValue {
  return (
    value === "off" ||
    value === "internal" ||
    value === "pilot" ||
    value === "all"
  );
}

/**
 * Stable FNV-1a hash mod 100. Deterministic and cross-run consistent (same
 * input, same output) because the rollout flag must behave identically for a
 * given projectId across retries.
 */
export function computeProjectBucket(projectId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < projectId.length; index++) {
    hash ^= projectId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

export function resolveBatchedRollout(input: {
  isAdmin: boolean;
  projectId: string;
  rollout: BatchedRolloutValue;
}): boolean {
  switch (input.rollout) {
    case "off":
      return false;
    case "internal":
      return input.isAdmin;
    case "pilot":
      return computeProjectBucket(input.projectId) < PILOT_PERCENT;
    case "all":
      return true;
    default:
      return false;
  }
}

export function isBatchedWriterRolledOut(input: {
  isAdmin: boolean;
  projectId: string;
  rollout: BatchedRolloutValue;
}): boolean {
  return resolveBatchedRollout(input);
}
