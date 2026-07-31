export type GenerateMode = "first_generate" | "retry_build";

/**
 * Decide generate mode from requested client mode + whether real source exists.
 * Empty source never allows retry_build (avoids stuck "Belum ada source" loop).
 */
export function resolveGenerateMode(input: {
  requestedMode?: string | null;
  hasPersistedSource: boolean;
}): GenerateMode {
  if (input.requestedMode === "retry_build" && input.hasPersistedSource) {
    return "retry_build";
  }
  return "first_generate";
}
