export type ReferenceCalibratedGenerationMode = "off" | "shadow" | "replace";

// Reference-calibrated generation is the only contract-v1 build path. The
export function resolveApprovedReferenceCalibratedMode(): ReferenceCalibratedGenerationMode {
  return "replace";
}
