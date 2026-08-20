import { generateText, type ModelMessage } from "ai";

import type { BrowserAssertionName } from "./browser-gates";
import type { BuildContractV1 } from "./build-contract";
import type { GeneratedSiteCallBudget } from "./generated-site-call-budget";
import type { GeneratedSiteWriterContractV2 } from "./generated-site-contract";
import type { GeneratedSiteDesignKitV1 } from "./generated-site-design-kits/types";
import type { WriterDesignPlanV2 } from "./generated-site-design-plan";

import {
  getAiModel,
  getAiTelemetry,
  getNoReasoningCallOptions,
} from "@/lib/ai/ai";
import { getGenerationModel } from "@/lib/ai/ai-models";
import { getAiTimeoutMs } from "@/lib/ai/ai-timeouts";

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

export type GeneratedSiteVisualFindingV2 = {
  category:
    | "business_fit"
    | "hierarchy"
    | "composition"
    | "typography"
    | "color_contrast"
    | "imagery"
    | "content_usefulness"
    | "mobile_quality"
    | "genericness";
  severity: VisualFindingSeverity;
  route: string;
  viewport: "mobile" | "desktop";
  evidence: string;
  kitReference: string;
  proposedCorrection: string;
  verificationMode: "browser_assertion" | "human_only";
  verificationAssertions: string[];
  confidence: number;
};

export type GeneratedSiteVisualReviewV2 =
  | {
      status: "complete";
      findings: GeneratedSiteVisualFindingV2[];
      modelId: string | null;
    }
  | { status: "unknown"; findings: [] }
  | { status: "unavailable"; findings: [] };

export type VisualCriticReport =
  | {
      status: "complete";
      mode: "shadow";
      findings: VisualFinding[];
      modelId: string | null;
    }
  | { status: "unknown"; mode: "shadow"; findings: [] }
  | { status: "unavailable"; mode: "shadow"; findings: [] };

export async function runGeneratedSiteVisualReview(input: {
  contract: GeneratedSiteWriterContractV2;
  designPlan: WriterDesignPlanV2;
  kit: GeneratedSiteDesignKitV1;
  browserReport: {
    status: "pass" | "fail" | "infrastructure_error";
    [key: string]: unknown;
  };
  screenshots: Uint8Array[];
  budget: GeneratedSiteCallBudget;
  modelId?: string | null;
}): Promise<GeneratedSiteVisualReviewV2> {
  if (input.browserReport.status !== "pass" || input.screenshots.length === 0) {
    return { status: "unknown", findings: [] };
  }
  input.budget.consumeCritic();
  try {
    const requestedModel = input.modelId ?? getGenerationModel();
    const result = await generateText({
      model: getAiModel(requestedModel),
      maxOutputTokens: 2_048,
      maxRetries: 0,
      temperature: 0,
      abortSignal: AbortSignal.timeout(getAiTimeoutMs("visualCritic")),
      ...getNoReasoningCallOptions(),
      telemetry: getAiTelemetry("generated-site-visual-review-v2"),
      system:
        'Return JSON only: {"findings":[{"category":"business_fit|hierarchy|composition|typography|color_contrast|imagery|content_usefulness|mobile_quality|genericness","severity":"critical|high|medium|low","route":"/","viewport":"mobile|desktop","evidence":"specific visible evidence","kitReference":"specific selected-kit trait","proposedCorrection":"bounded correction","verificationMode":"browser_assertion|human_only","verificationAssertions":["computed-contrast"|"heading-overflow"|"horizontal-overflow"|"primary-cta"|"touch-target"|"required-content-visible"|"content-hidden-by-navigation"],"confidence":0.0}]}. Only report critical/high severity when directly backed by machine-verifiable browser assertions (computed-contrast, heading-overflow, horizontal-overflow, primary-cta, touch-target, required-content-visible, content-hidden-by-navigation). Never mark machine-verifiable findings as human_only. Never change facts, routes, kit, theme contract, or deployment. If the layout is aesthetically sound and free of objective structural defects, return {"findings":[]}.',
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                contract: input.contract,
                designPlan: input.designPlan,
                kit: {
                  id: input.kit.id,
                  referenceLabels: input.kit.referenceLabels,
                  criticRubric: input.kit.criticRubric,
                  antiPatterns: input.kit.antiPatterns,
                },
              }),
            },
            ...input.screenshots.map((data) => ({
              type: "file" as const,
              mediaType: "image/jpeg",
              data,
            })),
          ],
        },
      ],
    });
    const findings = parseGeneratedSiteFindings(result.text);
    if (!findings) {
      return { status: "unknown", findings: [] };
    }
    return {
      status: "complete",
      findings,
      modelId: result.response.modelId ?? requestedModel,
    };
  } catch {
    return { status: "unknown", findings: [] };
  }
}

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
    const images = extractScreenshotParts(input.screenshots);
    if (images.length === 0) {
      return { status: "unknown", mode: "shadow", findings: [] };
    }
    const criticPrompt = buildCriticPrompt(
      { contract: input.contract, plan: input.plan },
      images,
    );
    let result = await generateText({
      model: getAiModel(requestedModel),
      maxOutputTokens: 2_048,
      maxRetries: 1,
      temperature: 0,
      abortSignal: AbortSignal.timeout(getAiTimeoutMs("visualCritic")),
      ...getNoReasoningCallOptions(),
      telemetry: getAiTelemetry("generated-site-visual-critic"),
      ...criticPrompt,
    });
    let findings = parseFindings(result.text);
    // Vision models occasionally return an empty stream on the first attempt
    if (!findings && result.text.trim().length === 0) {
      result = await generateText({
        model: getAiModel(requestedModel),
        maxOutputTokens: 2_048,
        maxRetries: 1,
        temperature: 0,
        abortSignal: AbortSignal.timeout(getAiTimeoutMs("visualCritic")),
        ...getNoReasoningCallOptions(),
        telemetry: getAiTelemetry("generated-site-visual-critic"),
        ...criticPrompt,
      });
      findings = parseFindings(result.text);
    }
    if (!findings) {
      // Distinguish a model that cannot process images (returns 0 tokens —
      if (result.text.trim().length === 0) {
        return { status: "unknown", mode: "shadow", findings: [] };
      }
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

const CRITIC_SYSTEM_PROMPT = `You are a read-only generated-site visual critic. Return JSON only: {"findings":[{"category":"hierarchy|business_fit|layout_intent|responsive|typography|color_contrast|imagery|consistency|genericness|content_density","severity":"critical|high|medium|low","route":"/","viewport":"mobile|desktop","evidence":"specific visible evidence","proposedCorrection":"bounded correction","confidence":0.0}]}. Never propose facts, files, tools, deployment, or contract changes. Empty findings means the supplied evidence meets the rubric.`;

function buildCriticPrompt(
  input: { contract: BuildContractV1; plan: unknown },
  images: Uint8Array[],
): { system: string; messages: ModelMessage[] } {
  return {
    system: CRITIC_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              contract: {
                identity: input.contract.identity,
                visitorJobs: input.contract.visitorJobs,
                ctaIntents: input.contract.ctaIntents,
                preferences: input.contract.preferences,
                prohibitedClaims: input.contract.prohibitedClaims,
              },
              plan: input.plan,
            }),
          },
          ...images.map((data) => ({
            type: "file" as const,
            mediaType: "image/jpeg",
            data,
          })),
        ],
      },
    ],
  };
}

function extractScreenshotParts(values: unknown[]): Uint8Array[] {
  const seen = new Set<string>();
  const parts: Uint8Array[] = [];
  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const screenshot = (value as Record<string, unknown>).screenshot;
    if (typeof screenshot !== "string" || screenshot.length === 0) {
      continue;
    }
    // The browser runner stores both a report (with the base64 screenshot
    if (seen.has(screenshot)) {
      continue;
    }
    seen.add(screenshot);
    try {
      parts.push(Buffer.from(screenshot, "base64"));
    } catch {
      continue;
    }
  }
  return parts.slice(0, 2);
}

const BROWSER_ASSERTION_NAMES = new Set<BrowserAssertionName>([
  "route-load",
  "console-clean",
  "required-content-visible",
  "primary-cta",
  "internal-links",
  "horizontal-overflow",
  "heading-overflow",
  "image-health",
  "media-policy",
  "computed-contrast",
  "focus-visible",
  "touch-target",
]);

function parseGeneratedSiteFindings(
  text: string,
): GeneratedSiteVisualFindingV2[] | null {
  const jsonText = extractJsonObject(text) ?? text;
  let value: unknown;
  try {
    value = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (
    !isRecord(value) ||
    !Array.isArray(value.findings) ||
    value.findings.length > 24
  ) {
    return null;
  }
  const findings: GeneratedSiteVisualFindingV2[] = [];
  for (const raw of value.findings) {
    if (!isRecord(raw)) {
      return null;
    }
    const categories = [
      "business_fit",
      "hierarchy",
      "composition",
      "typography",
      "color_contrast",
      "imagery",
      "content_usefulness",
      "mobile_quality",
      "genericness",
    ] as const;
    const severities = ["critical", "high", "medium", "low"] as const;
    const modes = ["browser_assertion", "human_only"] as const;
    if (
      typeof raw.category !== "string" ||
      !categories.includes(raw.category as (typeof categories)[number]) ||
      typeof raw.severity !== "string" ||
      !severities.includes(raw.severity as (typeof severities)[number]) ||
      typeof raw.route !== "string" ||
      (raw.viewport !== "mobile" && raw.viewport !== "desktop") ||
      typeof raw.evidence !== "string" ||
      raw.evidence.trim().length === 0 ||
      typeof raw.kitReference !== "string" ||
      typeof raw.proposedCorrection !== "string" ||
      typeof raw.verificationMode !== "string" ||
      !modes.includes(raw.verificationMode as (typeof modes)[number]) ||
      !stringArray(raw.verificationAssertions) ||
      raw.verificationAssertions.some(
        (assertion) =>
          !BROWSER_ASSERTION_NAMES.has(assertion as BrowserAssertionName),
      ) ||
      typeof raw.confidence !== "number" ||
      raw.confidence < 0 ||
      raw.confidence > 1
    ) {
      return null;
    }
    findings.push({
      category: raw.category as GeneratedSiteVisualFindingV2["category"],
      severity: raw.severity as VisualFindingSeverity,
      route: raw.route,
      viewport: raw.viewport,
      evidence: raw.evidence,
      kitReference: raw.kitReference,
      proposedCorrection: raw.proposedCorrection,
      verificationMode: raw.verificationMode as
        "browser_assertion" | "human_only",
      verificationAssertions: raw.verificationAssertions,
      confidence: raw.confidence,
    });
  }
  return findings;
}

function parseFindings(text: string): VisualFinding[] | null {
  // Models often wrap JSON in markdown fences or prose; extract the first
  const jsonText = extractJsonObject(text) ?? text;
  let value: unknown;
  try {
    value = JSON.parse(jsonText);
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

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const start = text.indexOf("{");
  if (start < 0) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

function stringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
