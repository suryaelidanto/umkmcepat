// src/lib/projects/generation-engine.ts
// Sticky per-project generation engine assignment. Resolved once at project
// creation from a settings snapshot and one normalized owner identity; never
// recomputed later from the current setting, role, or presence of a handoff.

export type GenerationEngine = "legacy-v1" | "contract-v1";

export type ContractCompiledRollout = "off" | "internal" | "pilot" | "all";

export function isContractCompiledRollout(
  value: string,
): value is ContractCompiledRollout {
  return (
    value === "off" ||
    value === "internal" ||
    value === "pilot" ||
    value === "all"
  );
}

/** Deterministic assignment evaluated once at project creation. */
export function resolveGenerationEngine(input: {
  rollout: ContractCompiledRollout;
  admin: boolean;
  waitlistApproved: boolean;
}): GenerationEngine {
  switch (input.rollout) {
    case "off":
      return "legacy-v1";
    case "internal":
      return input.admin ? "contract-v1" : "legacy-v1";
    case "pilot":
      // Only a confirmed approved waitlist entry qualifies. A disabled waitlist
      // gate, dev bypass, admin identity, or missing row must not qualify.
      return input.waitlistApproved ? "contract-v1" : "legacy-v1";
    case "all":
      return "contract-v1";
    default:
      return "legacy-v1";
  }
}
