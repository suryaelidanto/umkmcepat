import { generateText, type ModelMessage } from "ai";

import type { BuildContractV1 } from "./build-contract";

import {
  getAiModel,
  getAiTelemetry,
  getNoReasoningCallOptions,
} from "@/lib/ai/ai";
import { getGenerationModel } from "@/lib/ai/ai-models";
import { getAiTimeoutMs } from "@/lib/ai/ai-timeouts";

export const OUTCOME_REVIEW_CATEGORIES = [
  "business_specificity",
  "visitor_job_clarity",
  "first_view_hierarchy",
  "content_judgment",
  "composition_rhythm",
  "typography",
  "color_system",
  "mobile_composition",
  "interaction_clarity",
  "professional_finish",
] as const;

export type OutcomeReviewCategory = (typeof OUTCOME_REVIEW_CATEGORIES)[number];

export type OutcomeVisualAssessment = {
  route: string;
  category: OutcomeReviewCategory;
  rating: 1 | 2 | 3 | 4;
  viewport: "mobile" | "desktop" | "both";
  evidence: string;
  suggestedRevision: string | null;
  confidence: number;
};

export type OutcomeVisualReviewV1 =
  | {
      status: "complete";
      assessments: OutcomeVisualAssessment[];
      modelId: string | null;
    }
  | {
      status: "unknown" | "unavailable";
      assessments: [];
      modelId: null;
    };

export function deriveOutcomeReviewVerdict(review: OutcomeVisualReviewV1):
  | { ok: true }
  | {
      ok: false;
      reason:
        "unknown" | "incomplete" | "low_confidence" | "below_quality_floor";
    } {
  if (review.status !== "complete") {
    return { ok: false, reason: "unknown" };
  }
  const categorySet = new Set(review.assessments.map((item) => item.category));
  if (
    review.assessments.length !== OUTCOME_REVIEW_CATEGORIES.length ||
    OUTCOME_REVIEW_CATEGORIES.some((category) => !categorySet.has(category))
  ) {
    return { ok: false, reason: "incomplete" };
  }
  if (review.assessments.some((item) => item.confidence < 0.8)) {
    return { ok: false, reason: "low_confidence" };
  }
  if (
    review.assessments.some((item) => item.rating < 3 || !item.evidence.trim())
  ) {
    return { ok: false, reason: "below_quality_floor" };
  }
  return { ok: true };
}

export function parseOutcomeReviewResponse(
  text: string,
  modelId: string,
): OutcomeVisualReviewV1 {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { assessments: [], modelId: null, status: "unknown" };
  }
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      assessments?: unknown;
    };
    if (!Array.isArray(parsed.assessments)) {
      return { assessments: [], modelId: null, status: "unknown" };
    }
    const assessments = parsed.assessments.filter(
      (item): item is OutcomeVisualAssessment =>
        Boolean(item) &&
        typeof item === "object" &&
        OUTCOME_REVIEW_CATEGORIES.includes(
          (item as OutcomeVisualAssessment).category,
        ),
    );
    const review: OutcomeVisualReviewV1 = {
      assessments,
      modelId,
      status: "complete",
    };
    const verdict = deriveOutcomeReviewVerdict(review);
    return !verdict.ok && verdict.reason === "incomplete"
      ? { assessments: [], modelId: null, status: "unknown" }
      : review;
  } catch {
    return { assessments: [], modelId: null, status: "unknown" };
  }
}

const REVIEW_SYSTEM = `You are the final independent reviewer for an Indonesian small-business website. Judge rendered evidence, not compliance with a template. Return JSON only with exactly {"assessments":[...]}. Assess every category exactly once across the supplied mobile and desktop screenshots.

Categories: ${OUTCOME_REVIEW_CATEGORIES.join(", ")}.
Ratings: 1 broken/unusable; 2 generic, unfinished, incoherent, or needs major revision; 3 coherent, business-specific, and ready to publish; 4 unusually strong and memorable without reducing clarity.
Every item requires route, category, integer rating 1-4, viewport mobile|desktop|both, specific visible evidence, suggestedRevision (required for 1-2, null for 3-4), and confidence 0-1.
Ask: Could this design belong unchanged to an unrelated business? Would a strong human designer publish it without major visual revision? Do not require a hero, cards, a section sequence, a palette family, a font, or any named layout pattern. Never invent facts.`;

export async function runOutcomeVisualReview(input: {
  contract: BuildContractV1;
  screenshots: Uint8Array[];
  modelId?: string | null;
}): Promise<OutcomeVisualReviewV1> {
  if (!input.screenshots.length) {
    return { assessments: [], modelId: null, status: "unknown" };
  }
  try {
    const requestedModel = input.modelId ?? getGenerationModel();
    const messages: ModelMessage[] = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              business: input.contract.identity,
              visitorJobs: input.contract.visitorJobs,
              actions: input.contract.ctaIntents,
              prohibitedClaims: input.contract.prohibitedClaims,
            }),
          },
          ...input.screenshots.slice(0, 6).map((data) => ({
            data,
            mediaType: "image/jpeg" as const,
            type: "file" as const,
          })),
        ],
      },
    ];
    const result = await generateText({
      abortSignal: AbortSignal.timeout(getAiTimeoutMs("visualCritic")),
      maxOutputTokens: 4_096,
      maxRetries: 0,
      messages,
      model: getAiModel(requestedModel),
      system: REVIEW_SYSTEM,
      temperature: 0,
      telemetry: getAiTelemetry("outcome-site-visual-review"),
      ...getNoReasoningCallOptions(),
    });
    return parseOutcomeReviewResponse(
      result.text,
      result.response.modelId ?? requestedModel,
    );
  } catch {
    return { assessments: [], modelId: null, status: "unavailable" };
  }
}
