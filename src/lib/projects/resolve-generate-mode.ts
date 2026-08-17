export type GenerateMode = "first_generate" | "retry_build";

/**
 * Decide generate mode from requested client mode + whether real source exists.
 * Empty source never allows retry_build (avoids stuck "Belum ada source" loop).
 *
 * For contract-v1 with an already-accepted handoff, a retry reuses that
 * accepted handoff; a fresh first_generate must never re-enter (would lose the
 * immutable contract/plan). Only the first-ever build on a contract-v1 project
 * with no accepted handoff runs first_generate.
 */
export function resolveGenerateMode(input: {
  requestedMode?: string | null;
  hasPersistedSource: boolean;
  generationEngine?: string;
  hasAcceptedHandoff?: boolean;
}): GenerateMode {
  if (input.requestedMode === "retry_build" && input.hasPersistedSource) {
    return "retry_build";
  }
  return "first_generate";
}
