import { getSettingSync } from "@/lib/app-settings";

export const DEFAULT_AI_MODEL = "umkmcepat-combo";

export function getDefaultAiModel(
  rawModels = (
    getSettingSync as unknown as (
      k: string,
      fallback: undefined,
    ) => string | undefined
  )("ai.models_default", undefined) || process.env.AI_MODELS,
) {
  const models = rawModels
    ?.split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  return models?.length ? models[0] : DEFAULT_AI_MODEL;
}

// Model for the build pipeline (spec + source generation). An empty value
// falls through to the default model, so admins can clear the override.
export function getGenerationModel() {
  const readSync = getSettingSync as unknown as (
    k: string,
    fallback: undefined,
  ) => string | undefined;
  return (
    readSync("ai.generation_model", undefined) ||
    process.env.AI_GENERATION_MODEL ||
    getDefaultAiModel()
  );
}
