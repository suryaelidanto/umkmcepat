import type { BlindPreferenceV2 } from "./generation-evaluation";

type Arm = "control" | "treatment";

type Mapping = {
  leftArm: Arm;
  rightArm: Arm;
};

type RawPreference = {
  key: string;
  choice: "left" | "right" | "tie";
  leftReady: boolean;
  rightReady: boolean;
};

export function normalizeBlindPreferencesV2(
  value: unknown,
  mapping: unknown,
): BlindPreferenceV2[] {
  if (
    Array.isArray(value) &&
    value.every((item) => isNormalizedPreference(item))
  ) {
    return value;
  }
  if (
    !isRecord(value) ||
    !Array.isArray(value.preferences) ||
    !isRecord(mapping) ||
    !isRecord(mapping.mapping)
  ) {
    return [];
  }
  const result: BlindPreferenceV2[] = [];
  for (const item of value.preferences) {
    const preference = parseRawPreference(item);
    if (!preference) {
      continue;
    }
    const pair = parseMapping(mapping.mapping[preference.key]);
    const [briefId, trialText, ...extra] = preference.key.split(":");
    const trial = trialText === "1" ? 1 : trialText === "2" ? 2 : null;
    if (!pair || !trial || extra.length > 0 || !briefId) {
      continue;
    }
    const selectedArm =
      preference.choice === "tie"
        ? "tie"
        : preference.choice === "left"
          ? pair.leftArm
          : pair.rightArm;
    result.push({
      briefId,
      trial,
      choice:
        selectedArm === "tie"
          ? "tie"
          : selectedArm === "treatment"
            ? "treatment"
            : "control",
      controlReady:
        pair.leftArm === "control"
          ? preference.leftReady
          : preference.rightReady,
      treatmentReady:
        pair.leftArm === "treatment"
          ? preference.leftReady
          : preference.rightReady,
    });
  }
  return result;
}

function parseRawPreference(value: unknown): RawPreference | null {
  if (
    !isRecord(value) ||
    typeof value.key !== "string" ||
    (value.choice !== "left" &&
      value.choice !== "right" &&
      value.choice !== "tie") ||
    typeof value.leftReady !== "boolean" ||
    typeof value.rightReady !== "boolean"
  ) {
    return null;
  }
  return {
    key: value.key,
    choice: value.choice,
    leftReady: value.leftReady,
    rightReady: value.rightReady,
  };
}

function parseMapping(value: unknown): Mapping | null {
  if (
    !isRecord(value) ||
    (value.leftArm !== "control" && value.leftArm !== "treatment") ||
    (value.rightArm !== "control" && value.rightArm !== "treatment")
  ) {
    return null;
  }
  return { leftArm: value.leftArm, rightArm: value.rightArm };
}

function isNormalizedPreference(value: unknown): value is BlindPreferenceV2 {
  return (
    isRecord(value) &&
    typeof value.briefId === "string" &&
    (value.trial === 1 || value.trial === 2) &&
    (value.choice === "control" ||
      value.choice === "treatment" ||
      value.choice === "tie") &&
    typeof value.controlReady === "boolean" &&
    typeof value.treatmentReady === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
