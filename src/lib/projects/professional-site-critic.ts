import { generateText, type ModelMessage } from "ai";

import {
  classifyProfessionalBrowserReport,
  type BrowserGateReportV2,
} from "./browser-gates";

import type { GeneratedSiteCallBudget } from "./generated-site-call-budget";
import type { GeneratedSiteWriterContractV3 } from "./generated-site-contract";
import type { ProfessionalSiteBlueprintV1 } from "./professional-site-blueprint";
import type { GeneratedSiteDesignKitV2 } from "./professional-site-kits";
import type { WriterDesignPlanV3 } from "./professional-site-plan";
import type { ProfessionalSiteSourceGateReportV1 } from "./professional-site-source-gates";

import {
  getAiModel,
  getAiTelemetry,
  getNoReasoningCallOptions,
} from "@/lib/ai";
import { getGenerationModel } from "@/lib/ai-models";
import { getAiTimeoutMs } from "@/lib/ai-timeouts";

export const PROFESSIONAL_REVIEW_CATEGORIES = [
  "business_specificity",
  "first_view_hierarchy",
  "content_architecture",
  "composition_rhythm",
  "typography",
  "color_system",
  "media_integrity",
  "mobile_quality",
  "professional_finish",
] as const;

export type ProfessionalReviewCategory =
  (typeof PROFESSIONAL_REVIEW_CATEGORIES)[number];

export type ProfessionalCategoryAssessment = {
  route: string;
  category: ProfessionalReviewCategory;
  rating: 1 | 2 | 3 | 4;
  viewport: "both" | "mobile" | "desktop";
  evidence: string;
  blueprintReference: string;
  suggestedRevision: string | null;
  confidence: number;
};

export type ProfessionalReviewUnknownReason =
  | "missing_evidence"
  | "transport"
  | "empty"
  | "malformed"
  | "incomplete"
  | "low_confidence"
  | "uncalibrated_requested_model"
  | "uncalibrated_served_model";

export type GeneratedSiteProfessionalReviewV1 =
  | {
      status: "complete";
      promptVersion: string;
      requestedModel: string;
      servedModel: string;
      assessments: ProfessionalCategoryAssessment[];
    }
  | {
      status: "unknown";
      reason: ProfessionalReviewUnknownReason;
      requestedModel?: string;
      servedModel?: string | null;
    };

export const PROFESSIONAL_REVIEW_PROMPT_VERSION =
  "professional-static-review-v1";

const MAX_ROUTE_COUNT = 3;
const MAX_SCREENSHOT_COUNT = 6;
const MIN_CONFIDENCE = 0.8;

export function deriveProfessionalReviewVerdict(input: {
  review: GeneratedSiteProfessionalReviewV1;
  routes: string[];
}): {
  pass: boolean;
  minimumRating: number | null;
  averageRating: number | null;
  categoryRatings: Partial<Record<ProfessionalReviewCategory, number>>;
  reason: string | null;
} {
  if (input.review.status !== "complete") {
    return {
      pass: false,
      minimumRating: null,
      averageRating: null,
      categoryRatings: {},
      reason: `professional review is ${input.review.reason}`,
    };
  }
  const expected = new Set(
    input.routes.flatMap((route) =>
      PROFESSIONAL_REVIEW_CATEGORIES.map((category) => `${route}:${category}`),
    ),
  );
  const categoryRatings: Partial<Record<ProfessionalReviewCategory, number>> =
    {};
  for (const category of PROFESSIONAL_REVIEW_CATEGORIES) {
    const ratings = input.review.assessments
      .filter((assessment) => assessment.category === category)
      .filter((assessment) => input.routes.includes(assessment.route))
      .map((assessment) => assessment.rating);
    if (ratings.length !== input.routes.length) {
      return {
        pass: false,
        minimumRating: null,
        averageRating: null,
        categoryRatings,
        reason: `professional review is incomplete for ${category}`,
      };
    }
    categoryRatings[category] = Math.min(...ratings);
  }
  const observedKeys = new Set(
    input.review.assessments.map(
      (assessment) => `${assessment.route}:${assessment.category}`,
    ),
  );
  if (
    observedKeys.size !== expected.size ||
    [...expected].some((key) => !observedKeys.has(key))
  ) {
    return {
      pass: false,
      minimumRating: null,
      averageRating: null,
      categoryRatings,
      reason: "professional review has duplicate or unexpected assessments",
    };
  }
  const values = Object.values(categoryRatings).filter(
    (rating): rating is number => typeof rating === "number",
  );
  const minimumRating = values.length ? Math.min(...values) : null;
  const averageRating = values.length
    ? values.reduce((sum, rating) => sum + rating, 0) / values.length
    : null;
  return {
    pass: minimumRating !== null && minimumRating >= 3,
    minimumRating,
    averageRating,
    categoryRatings,
    reason:
      minimumRating !== null && minimumRating >= 3
        ? null
        : "professional category rating below 3",
  };
}

export function buildProfessionalReviewPrompt(input: {
  contract: GeneratedSiteWriterContractV3;
  blueprint: ProfessionalSiteBlueprintV1;
  plan: WriterDesignPlanV3;
  kit: GeneratedSiteDesignKitV2;
  sourceReport: ProfessionalSiteSourceGateReportV1;
  browserReport: BrowserGateReportV2;
  routes: string[];
}): { system: string; messages: ModelMessage[] } {
  const system = `You are a read-only professional reviewer for an Indonesian landing/static marketing site. Return JSON only with exactly {"assessments":[...]} and never a pass boolean. Assess every route against every category exactly once. Ratings are integers 1-4: 1-2 means a concrete blocker and requires suggestedRevision; 3-4 means ready enough for this category. Evidence must describe visible mobile/desktop evidence and blueprintReference must name the selected contract, blueprint, kit, or browser assertion.

Categories: ${PROFESSIONAL_REVIEW_CATEGORIES.join(", ")}.
Do not reward section count, decoration, filler copy, card quantity, or reference copying. Do not reject reference-07-style sparse bold minimalism merely because it omits unsupported sections. Respect accepted facts, the one first view, one primary action per route, route-owned sections, mobile transforms, semantic tokens, and the selected kit's rubric. Never propose a new fact, CTA target, route, asset, tool, file, or deployment change. Confidence must be a number from 0 to 1.

Schema: {"assessments":[{"route":"/","category":"business_specificity|first_view_hierarchy|content_architecture|composition_rhythm|typography|color_system|media_integrity|mobile_quality|professional_finish","rating":1,"viewport":"both|mobile|desktop","evidence":"specific visible evidence","blueprintReference":"specific accepted reference","suggestedRevision":"bounded revision or null","confidence":0.9}]}`;
  const reviewContext = {
    contract: input.contract,
    blueprint: input.blueprint,
    plan: input.plan,
    kit: {
      id: input.kit.id,
      version: input.kit.version,
      criticRubric: input.kit.criticRubric,
      antiPatterns: input.kit.antiPatterns,
      sourceAssertions: input.kit.sourceAssertions,
      browserAssertions: input.kit.browserAssertions,
    },
    deterministicEvidence: {
      routes: input.routes,
      sourceFindings: input.sourceReport.findings.map((finding) => ({
        category: finding.category,
        severity: finding.severity,
        code: finding.code,
        path: finding.path,
      })),
      professionalSignals: input.sourceReport.professionalSignals,
      browserRoutes: input.browserReport.routes.map((route) => ({
        route: route.route,
        viewport: route.viewport,
        assertions: route.assertions,
        professionalSignals: route.professionalSignals,
      })),
    },
  };
  return {
    system,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: JSON.stringify(reviewContext) }],
      },
    ],
  };
}

export async function runProfessionalSiteReview(input: {
  contract: GeneratedSiteWriterContractV3;
  blueprint: ProfessionalSiteBlueprintV1;
  plan: WriterDesignPlanV3;
  kit: GeneratedSiteDesignKitV2;
  sourceReport: ProfessionalSiteSourceGateReportV1;
  browserReport: BrowserGateReportV2;
  screenshots: Array<{
    route: string;
    viewport: "mobile" | "desktop";
    bytes: Uint8Array;
  }>;
  budget: GeneratedSiteCallBudget;
  modelId?: string | null;
}): Promise<GeneratedSiteProfessionalReviewV1> {
  const requestedModel = input.modelId ?? getGenerationModel();
  if (
    input.blueprint.routes.length === 0 ||
    input.blueprint.routes.length > MAX_ROUTE_COUNT ||
    input.sourceReport.status !== "pass" ||
    classifyProfessionalBrowserReport(
      input.browserReport,
      input.blueprint.routes.map((route) => route.path),
    ) !== "pass"
  ) {
    return {
      status: "unknown",
      reason: "missing_evidence",
      requestedModel,
      servedModel: null,
    };
  }
  const screenshots = normalizeScreenshots(input);
  if (!screenshots) {
    return {
      status: "unknown",
      reason: "missing_evidence",
      requestedModel,
      servedModel: null,
    };
  }
  input.budget.consumeCritic();
  const prompt = buildProfessionalReviewPrompt({
    contract: input.contract,
    blueprint: input.blueprint,
    plan: input.plan,
    kit: input.kit,
    sourceReport: input.sourceReport,
    browserReport: input.browserReport,
    routes: input.blueprint.routes.map((route) => route.path),
  });
  try {
    const result = await generateText({
      model: getAiModel(requestedModel),
      maxOutputTokens: 6_144,
      maxRetries: 0,
      temperature: 0,
      abortSignal: AbortSignal.timeout(getAiTimeoutMs("visualCritic")),
      ...getNoReasoningCallOptions(),
      telemetry: getAiTelemetry("professional-static-site-review", {
        promptVersion: PROFESSIONAL_REVIEW_PROMPT_VERSION,
        requestedModel,
      }),
      system: prompt.system,
      messages: [
        ...prompt.messages,
        {
          role: "user",
          content: screenshots.map((screenshot) => ({
            type: "file" as const,
            mediaType: "image/jpeg",
            data: screenshot.bytes,
          })),
        },
      ],
    });
    const servedModel = result.response?.modelId ?? requestedModel;
    const text = result.text.trim();
    if (!text) {
      return {
        status: "unknown",
        reason: "empty",
        requestedModel,
        servedModel,
      };
    }
    const parsed = parseProfessionalAssessments({
      text,
      routes: input.blueprint.routes.map((route) => route.path),
    });
    if (parsed.status !== "complete") {
      return {
        status: "unknown",
        reason: parsed.reason,
        requestedModel,
        servedModel,
      };
    }
    return {
      status: "complete",
      promptVersion: PROFESSIONAL_REVIEW_PROMPT_VERSION,
      requestedModel,
      servedModel,
      assessments: parsed.assessments,
    };
  } catch {
    return {
      status: "unknown",
      reason: "transport",
      requestedModel,
      servedModel: null,
    };
  }
}

function normalizeScreenshots(input: {
  blueprint: ProfessionalSiteBlueprintV1;
  screenshots: Array<{
    route: string;
    viewport: "mobile" | "desktop";
    bytes: Uint8Array;
  }>;
}): Array<{
  route: string;
  viewport: "mobile" | "desktop";
  bytes: Uint8Array;
}> | null {
  if (
    input.screenshots.length === 0 ||
    input.screenshots.length > MAX_SCREENSHOT_COUNT
  ) {
    return null;
  }
  const expected = input.blueprint.routes.flatMap((route) =>
    (["mobile", "desktop"] as const).map(
      (viewport) => `${route.path}:${viewport}`,
    ),
  );
  const byKey = new Map(
    input.screenshots.map((screenshot) => [
      `${screenshot.route}:${screenshot.viewport}`,
      screenshot,
    ]),
  );
  if (
    byKey.size !== expected.length ||
    expected.some((key) => {
      const screenshot = byKey.get(key);
      return !screenshot || screenshot.bytes.length === 0;
    })
  ) {
    return null;
  }
  return expected.map((key) => byKey.get(key)!);
}

type ParsedReview =
  | { status: "complete"; assessments: ProfessionalCategoryAssessment[] }
  | {
      status: "unknown";
      reason: "malformed" | "incomplete" | "low_confidence" | "empty";
    };

function parseProfessionalAssessments(input: {
  text: string;
  routes: string[];
}): ParsedReview {
  const jsonText = extractJsonObject(input.text);
  if (!jsonText) {
    return { status: "unknown", reason: "malformed" };
  }
  let value: unknown;
  try {
    value = JSON.parse(jsonText);
  } catch {
    return { status: "unknown", reason: "malformed" };
  }
  if (
    !isRecord(value) ||
    !exactKeys(value, ["assessments"]) ||
    !Array.isArray(value.assessments)
  ) {
    return { status: "unknown", reason: "malformed" };
  }
  if (value.assessments.length === 0) {
    return { status: "unknown", reason: "empty" };
  }
  const assessments: ProfessionalCategoryAssessment[] = [];
  let lowConfidence = false;
  for (const raw of value.assessments) {
    if (!isRecord(raw)) {
      return { status: "unknown", reason: "malformed" };
    }
    if (
      !exactKeys(raw, [
        "route",
        "category",
        "rating",
        "viewport",
        "evidence",
        "blueprintReference",
        "suggestedRevision",
        "confidence",
      ])
    ) {
      return { status: "unknown", reason: "malformed" };
    }
    const rating = raw.rating;
    if (typeof raw.route !== "string" || !input.routes.includes(raw.route)) {
      return { status: "unknown", reason: "incomplete" };
    }
    if (
      typeof raw.category !== "string" ||
      !isProfessionalReviewCategory(raw.category)
    ) {
      return { status: "unknown", reason: "incomplete" };
    }
    if (
      typeof rating !== "number" ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 4 ||
      (raw.viewport !== "both" &&
        raw.viewport !== "mobile" &&
        raw.viewport !== "desktop") ||
      typeof raw.evidence !== "string" ||
      raw.evidence.trim().length === 0 ||
      typeof raw.blueprintReference !== "string" ||
      raw.blueprintReference.trim().length === 0 ||
      (raw.suggestedRevision !== null &&
        (typeof raw.suggestedRevision !== "string" ||
          raw.suggestedRevision.trim().length === 0)) ||
      typeof raw.confidence !== "number" ||
      !Number.isFinite(raw.confidence) ||
      raw.confidence < 0 ||
      raw.confidence > 1 ||
      (rating <= 2 &&
        (typeof raw.suggestedRevision !== "string" ||
          raw.suggestedRevision.trim().length === 0))
    ) {
      return { status: "unknown", reason: "malformed" };
    }
    if (raw.confidence < MIN_CONFIDENCE) {
      lowConfidence = true;
    }
    assessments.push({
      route: raw.route,
      category: raw.category,
      rating: rating as 1 | 2 | 3 | 4,
      viewport: raw.viewport as "both" | "mobile" | "desktop",
      evidence: raw.evidence,
      blueprintReference: raw.blueprintReference,
      suggestedRevision: raw.suggestedRevision,
      confidence: raw.confidence,
    });
  }
  if (lowConfidence) {
    return { status: "unknown", reason: "low_confidence" };
  }
  const expected = new Set(
    input.routes.flatMap((route) =>
      PROFESSIONAL_REVIEW_CATEGORIES.map((category) => `${route}:${category}`),
    ),
  );
  const observed = new Set(
    assessments.map(
      (assessment) => `${assessment.route}:${assessment.category}`,
    ),
  );
  if (
    observed.size !== expected.size ||
    observed.size !== assessments.length ||
    [...expected].some((key) => !observed.has(key))
  ) {
    return { status: "unknown", reason: "incomplete" };
  }
  return { status: "complete", assessments };
}

function isProfessionalReviewCategory(
  value: string,
): value is ProfessionalReviewCategory {
  return PROFESSIONAL_REVIEW_CATEGORIES.includes(
    value as ProfessionalReviewCategory,
  );
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
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }
  return null;
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const expected = new Set(keys);
  return (
    Object.keys(value).length === expected.size &&
    Object.keys(value).every((key) => expected.has(key))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
