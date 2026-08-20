export type GenerateMode = "first_generate" | "retry_build";

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
