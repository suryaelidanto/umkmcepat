export type ReferenceCalibratedGenerationMode = "off" | "shadow" | "replace";

// Reference-calibrated generation is the only contract-v1 build path. The
// shadow/flag rollout scaffolding was removed: every build runs the design-kit
// pipeline once and uses its output directly. The union type is retained so
// worker call-sites keep compiling without churn.
export function resolveApprovedReferenceCalibratedMode(): ReferenceCalibratedGenerationMode {
  return "replace";
}
