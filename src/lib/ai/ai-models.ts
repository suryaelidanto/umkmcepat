import { getSettingSync } from "@/lib/config/app-settings";

export const DEFAULT_AI_MODEL = "default-combo";

function readSettingString(key: string): string | undefined {
  const raw = (
    getSettingSync as unknown as (
      k: string,
      fallback: undefined,
    ) => string | undefined
  )(key, undefined);
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

function firstCsvModel(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const models = raw
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return models[0];
}

export function getDefaultAiModel(
  rawModels = readSettingString("ai.models_default") || process.env.AI_MODELS,
) {
  return firstCsvModel(rawModels) || DEFAULT_AI_MODEL;
}

function resolveTaskModel(settingKey: string, envKeys: string[]): string {
  const fromSetting = readSettingString(settingKey);
  if (fromSetting) {
    return fromSetting;
  }
  for (const envKey of envKeys) {
    const fromEnv = process.env[envKey]?.trim();
    if (fromEnv) {
      return fromEnv;
    }
  }
  return getDefaultAiModel();
}

export function getModerationModel() {
  return resolveTaskModel("ai.model.moderation", ["AI_MODEL_MODERATION"]);
}

export function getDiscussModel() {
  return resolveTaskModel("ai.model.discuss", ["AI_MODEL_DISCUSS"]);
}

export function getGenerationModel() {
  return resolveTaskModel("ai.model.build", [
    "AI_MODEL_BUILD",
    "AI_GENERATION_MODEL",
  ]);
}
