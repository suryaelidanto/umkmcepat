export const DEFAULT_AI_MODELS = [
  "cmc/deepseek/deepseek-v4-pro",
  "cmc/deepseek/deepseek-v4-flash",
  "cmc/moonshotai/Kimi-K2.6",
] as const;

export function getAvailableAiModels(rawModels = process.env.AI_MODELS) {
  const models = rawModels
    ?.split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  return models?.length ? models : [...DEFAULT_AI_MODELS];
}

export function getDefaultAiModel(models = getAvailableAiModels()) {
  return models[0];
}
