import { getSettingSync } from "@/lib/app-settings";

export type ReferenceCalibratedGenerationMode = "off" | "shadow" | "replace";

export const REFERENCE_CALIBRATED_REPLACEMENT_APPROVAL: {
  evaluatorVersion: string;
  runId: string;
  kitCatalogVersion: 1;
} | null = null;

export function resolveReferenceCalibratedGenerationMode(): ReferenceCalibratedGenerationMode {
  const enabled = getSettingSync(
    "feature.reference_calibrated_generation_enabled",
    false,
  );
  if (!enabled) {
    return "off";
  }
  return getSettingSync("feature.reference_calibrated_generation_shadow", true)
    ? "shadow"
    : "replace";
}

export function resolveApprovedReferenceCalibratedMode(): ReferenceCalibratedGenerationMode {
  const requested = resolveReferenceCalibratedGenerationMode();
  if (requested !== "replace") {
    return requested;
  }
  return REFERENCE_CALIBRATED_REPLACEMENT_APPROVAL ? "replace" : "shadow";
}
