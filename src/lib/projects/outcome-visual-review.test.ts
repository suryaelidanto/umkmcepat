import { describe, expect, it } from "vitest";

import {
  OUTCOME_REVIEW_CATEGORIES,
  deriveOutcomeReviewVerdict,
  parseOutcomeReviewResponse,
  type OutcomeVisualReviewV1,
} from "./outcome-visual-review";

function completeReview(rating = 3): OutcomeVisualReviewV1 {
  return {
    assessments: OUTCOME_REVIEW_CATEGORIES.map((category) => ({
      category,
      confidence: 0.9,
      evidence: `Visible evidence for ${category}`,
      rating: rating as 1 | 2 | 3 | 4,
      route: "/",
      suggestedRevision: rating < 3 ? `Fix ${category}` : null,
      viewport: "both" as const,
    })),
    modelId: "critic-model",
    status: "complete",
  };
}

describe("parseOutcomeReviewResponse", () => {
  it("extracts JSON from a fenced model response", () => {
    const parsed = parseOutcomeReviewResponse(
      `Review:\n\`\`\`json\n${JSON.stringify({ assessments: completeReview().assessments })}\n\`\`\``,
      "model",
    );
    expect(parsed.status).toBe("complete");
  });
});

describe("deriveOutcomeReviewVerdict", () => {
  it("passes only a complete category review at rating 3 or higher", () => {
    expect(deriveOutcomeReviewVerdict(completeReview())).toEqual({ ok: true });
  });

  it("fails an incomplete review", () => {
    const review = completeReview();
    review.assessments.pop();
    expect(deriveOutcomeReviewVerdict(review)).toEqual({
      ok: false,
      reason: "incomplete",
    });
  });

  it("fails a generic or unfinished category rating", () => {
    const review = completeReview();
    review.assessments[0].rating = 2;
    review.assessments[0].suggestedRevision =
      "Make it specific to the business";
    expect(deriveOutcomeReviewVerdict(review)).toEqual({
      ok: false,
      reason: "below_quality_floor",
    });
  });

  it("fails low-confidence evidence", () => {
    const review = completeReview();
    review.assessments[0].confidence = 0.5;
    expect(deriveOutcomeReviewVerdict(review)).toEqual({
      ok: false,
      reason: "low_confidence",
    });
  });
});
