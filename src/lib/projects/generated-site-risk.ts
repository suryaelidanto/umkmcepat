import { createHash } from "node:crypto";

import type { BrowserGateReport } from "./browser-gates";

export type GeneratedSiteRiskCategory =
  | "borderline_contrast"
  | "business_fit"
  | "content_density"
  | "genericness"
  | "hierarchy"
  | "image_led"
  | "novel_recipe"
  | "render_contract_mismatch"
  | "sampled";

export type GeneratedSiteRiskReportV1 = {
  version: 1;
  risky: boolean;
  reasons: Array<{
    category: GeneratedSiteRiskCategory;
    route: string;
    viewport: "mobile" | "desktop";
    evidence: string;
  }>;
};

export function classifyGeneratedSiteRisk(input: {
  attemptId: string;
  recipeId: string;
  recipeRiskTags: string[];
  sourceRiskSignals: Array<{
    code: string;
    message: string;
    category: string;
  }>;
  browserReport: BrowserGateReport;
  sampleRate: number;
  deterministicSource?: boolean;
}): GeneratedSiteRiskReportV1 {
  if (input.deterministicSource) {
    return { version: 1, risky: false, reasons: [] };
  }
  const reasons: GeneratedSiteRiskReportV1["reasons"] = [];
  for (const tag of input.recipeRiskTags) {
    const category = riskCategory(tag);
    if (category) {
      reasons.push({
        category,
        route: "/",
        viewport: "desktop",
        evidence: `recipe ${input.recipeId}: ${tag}`,
      });
    }
  }
  for (const signal of input.sourceRiskSignals) {
    reasons.push({
      category: riskCategory(signal.category) ?? "genericness",
      route: "/",
      viewport: "desktop",
      evidence: `${signal.code}: ${signal.message}`,
    });
  }
  for (const route of input.browserReport.routes) {
    for (const assertion of route.assertions) {
      if (assertion.status !== "pass") {
        reasons.push({
          category: "render_contract_mismatch",
          route: route.route,
          viewport: route.viewport,
          evidence: `${assertion.name}: ${assertion.detail ?? assertion.status}`,
        });
      }
    }
  }
  const sampleRate = Math.min(1, Math.max(0, input.sampleRate));
  if (sampleRate > 0 && stableFraction(input.attemptId) < sampleRate) {
    reasons.push({
      category: "sampled",
      route: "/",
      viewport: "desktop",
      evidence: `stable calibration sample at rate ${sampleRate}`,
    });
  }
  return { version: 1, risky: reasons.length > 0, reasons };
}

function stableFraction(value: string): number {
  const digest = createHash("sha256").update(value, "utf8").digest();
  return digest.readUInt32BE(0) / 0xffffffff;
}

function riskCategory(value: string): GeneratedSiteRiskCategory | null {
  const allowed: GeneratedSiteRiskCategory[] = [
    "borderline_contrast",
    "business_fit",
    "content_density",
    "genericness",
    "hierarchy",
    "image_led",
    "novel_recipe",
    "render_contract_mismatch",
    "sampled",
  ];
  return allowed.includes(value as GeneratedSiteRiskCategory)
    ? (value as GeneratedSiteRiskCategory)
    : null;
}
