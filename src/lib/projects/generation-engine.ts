// src/lib/projects/generation-engine.ts
// Sticky per-project generation engine assignment. Resolved once at project
// creation from a settings snapshot and one normalized owner identity; never
// recomputed later from the current setting, role, or presence of a handoff.

export type GenerationEngine = "contract-v1";

/** Every project is contract-v1; the legacy ToolLoopAgent engine is removed. */
export function resolveGenerationEngine(): GenerationEngine {
  return "contract-v1";
}
