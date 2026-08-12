import { generateText } from "ai";

import type { BuildContractV1 } from "./build-contract";

import {
  getAiModel,
  getAiTelemetry,
  getNoReasoningCallOptions,
} from "@/lib/ai";
import { getGenerationModel } from "@/lib/ai-models";

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
  if (input.hardGateStatus !== "pass") {
    return { status: "unknown", mode: "shadow", findings: [] };
  }
  try {
    const requestedModel = input.modelId ?? getGenerationModel();
    const result = await generateText({
      model: getAiModel(requestedModel),
      maxOutputTokens: 2_048,
      maxRetries: 1,
      temperature: 0,
      ...getNoReasoningCallOptions(),
      telemetry: getAiTelemetry("generated-site-visual-critic"),
      system: `You are a read-only generated-site visual critic. Return JSON only: {"findings":[{"category":"hierarchy|business_fit|layout_intent|responsive|typography|color_contrast|imagery|consistency|genericness|content_density","severity":"critical|high|medium|low","route":"/","viewport":"mobile|desktop","evidence":"specific visible evidence","proposedCorrection":"bounded correction","confidence":0.0}]}. Never propose facts, files, tools, deployment, or contract changes. Empty findings means the supplied evidence meets the rubric.`,
      prompt: JSON.stringify({
        contract: {
          identity: input.contract.identity,
          visitorJobs: input.contract.visitorJobs,
          ctaIntents: input.contract.ctaIntents,
          preferences: input.contract.preferences,
          prohibitedClaims: input.contract.prohibitedClaims,
        },
        plan: input.plan,
        screenshots: input.screenshots,
      }),
    });
    const findings = parseFindings(result.text);
    if (!findings) {
      return { status: "unavailable", mode: "shadow", findings: [] };
    }
    return {
      status: "complete",
      mode: "shadow",
      modelId: result.response.modelId ?? requestedModel,
      findings,
    };
  } catch {
    return { status: "unavailable", mode: "shadow", findings: [] };
  }
}

function parseFindings(text: string): VisualFinding[] | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const findings = (value as Record<string, unknown>).findings;
  if (!Array.isArray(findings) || findings.length > 24) {
    return null;
  }
  const parsed: VisualFinding[] = [];
  for (const finding of findings) {
    const item = parseFinding(finding);
    if (!item) {
      return null;
    }
    parsed.push(item);
  }
  return parsed;
}

function parseFinding(value: unknown): VisualFinding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const item = value as Record<string, unknown>;
  const categories: VisualFindingCategory[] = [
    "hierarchy",
    "business_fit",
    "layout_intent",
    "responsive",
    "typography",
    "color_contrast",
    "imagery",
    "consistency",
    "genericness",
    "content_density",
  ];
  const severities: VisualFindingSeverity[] = [
    "critical",
    "high",
    "medium",
    "low",
  ];
  if (
    !categories.includes(item.category as VisualFindingCategory) ||
    !severities.includes(item.severity as VisualFindingSeverity) ||
    typeof item.route !== "string" ||
    (item.viewport !== "mobile" && item.viewport !== "desktop") ||
    typeof item.evidence !== "string" ||
    typeof item.proposedCorrection !== "string" ||
    typeof item.confidence !== "number" ||
    item.confidence < 0 ||
    item.confidence > 1
  ) {
    return null;
  }
  return {
    category: item.category as VisualFindingCategory,
    severity: item.severity as VisualFindingSeverity,
    route: item.route,
    viewport: item.viewport,
    evidence: item.evidence,
    proposedCorrection: item.proposedCorrection,
    confidence: item.confidence,
    ...(typeof item.contractOrPlanReference === "string"
      ? { contractOrPlanReference: item.contractOrPlanReference }
      : {}),
  };
}
