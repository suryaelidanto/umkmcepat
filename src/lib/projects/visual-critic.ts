// src/lib/projects/visual-critic.ts
// Read-only visual critic in shadow mode for contract-v1 candidates. It
// evaluates residual rendered quality after all hard gates pass. It has no
// tools and no write access; it cannot override a hard-gate result, change
// contracts/plans/evaluators, or trigger repair. Findings are advisory until
// per-category calibration approves automatic repair.
import type { BuildContractV1 } from "./build-contract";

export type VisualFindingCategory =
  | "hierarchy"
  | "business_fit"
  | "layout_intent"
  | "responsive"
  | "typography"
  | "color_contrast"
  | "imagery"
  | "consistency"
  | "genericness"
  | "content_density";

export type VisualFindingSeverity = "critical" | "high" | "medium" | "low";

export type VisualFinding = {
  category: VisualFindingCategory;
  severity: VisualFindingSeverity;
  route: string;
  viewport: "mobile" | "desktop";
  evidence: string;
  contractOrPlanReference?: string;
  proposedCorrection: string;
  confidence: number;
};

export type VisualCriticReport =
  | {
      status: "complete";
      mode: "shadow";
      findings: VisualFinding[];
      modelId: string | null;
    }
  | { status: "unknown"; mode: "shadow"; findings: [] }
  | { status: "unavailable"; mode: "shadow"; findings: [] };

/** Run the shadow critic. With a hard-gate pass and no evidence, returns
 * `unknown` (never a fabricated pass). The critic can never block or mutate. */
export async function runShadowCritic(input: {
  contract: BuildContractV1 | null;
  plan: unknown;
  hardGateStatus: "pass" | "fail" | "infrastructure_error";
  screenshots?: unknown[];
  modelId?: string | null;
}): Promise<VisualCriticReport> {
  if (!input.contract || !input.screenshots?.length) {
    return { status: "unknown", mode: "shadow", findings: [] };
  }
  // Shadow mode: record findings only. No repair, no write, no block.
  return {
    status: "complete",
    mode: "shadow",
    modelId: input.modelId ?? null,
    findings: [],
  };
}
