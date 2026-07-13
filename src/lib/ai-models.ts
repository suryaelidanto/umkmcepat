export const DEFAULT_AI_MODEL = "umkmcepat-combo";

export function getDefaultAiModel(rawModels = process.env.AI_MODELS) {
  const models = rawModels
    ?.split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  return models?.length ? models[0] : DEFAULT_AI_MODEL;
}
