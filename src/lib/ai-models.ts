export const DEFAULT_AI_MODEL = "umkmcepat-combo";

export function getDefaultAiModel(rawModels = process.env.AI_MODELS) {
  const models = rawModels
    ?.split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  return models?.length ? models[0] : DEFAULT_AI_MODEL;
}

// Get model for build pipeline (spec + source generation). Reads
// AI_GENERATION_MODEL env, falling back to the default model. This allows
// using a different (potentially higher rate-limit) model for the agent loop.
export function getGenerationModel() {
  return process.env.AI_GENERATION_MODEL || getDefaultAiModel();
}
