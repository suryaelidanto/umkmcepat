import { describe, expect, it } from "vitest";

import {
  VISUAL_REVIEW_CATEGORIES,
  parseVisualReview,
  parseVisualReviewGateRuns,
  qualifyVisualReview,
  type VisualReview,
} from "./visual-review";

const completeReview = (): VisualReview => ({
  categories: VISUAL_REVIEW_CATEGORIES.map((category) => ({
    category,
    diagnosis: "none",
    rating: 3,
    severity: "none",
    state: "pass",
  })),
  confidence: 0.85,
  unresolvedP0P1: 0,
  version: 1,
});

describe("parseVisualReview", () => {
  it("accepts exactly one result for each required visual category", () => {
    const result = parseVisualReview(completeReview());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.categories).toHaveLength(10);
    }
  });

  it.each([
    "business_specificity",
    "visitor_job_clarity",
    "hierarchy",
    "content_judgment",
    "composition",
    "typography",
    "color",
    "mobile_composition",
    "interaction_motion",
    "finish",
  ] as const)("requires the %s category", (category) => {
    const candidate = completeReview();
    candidate.categories = candidate.categories.filter(
      (item) => item.category !== category,
    );

    expect(parseVisualReview(candidate)).toEqual({
      ok: false,
      reason: "visual review must contain exactly the ten required categories",
    });
  });

  it("rejects duplicate categories", () => {
    const candidate = completeReview();
    candidate.categories[1] = { ...candidate.categories[0] };

    expect(parseVisualReview(candidate).ok).toBe(false);
  });

  it("rejects unknown ratings and review states", () => {
    const candidate = completeReview();
    candidate.categories[0] = {
      ...candidate.categories[0],
      rating: 2,
      state: "unknown",
    };

    expect(parseVisualReview(candidate).ok).toBe(false);
  });

  it("parses all release gate counters without accepting malformed values", () => {
    const runs = parseVisualReviewGateRuns({
      browser: 1,
      build: 1,
      claim: 1,
      cta: 1,
      overflow: 1,
      reduced_motion: 1,
      source: 1,
      visual: 1,
    });

    expect(runs?.visual).toBe(1);
    expect(
      parseVisualReviewGateRuns({ browser: 1, build: -1 }),
    ).toBeUndefined();
  });

  it("rejects confidence below the release floor", () => {
    const candidate = completeReview();
    candidate.confidence = 0.79;

    expect(parseVisualReview(candidate).ok).toBe(false);
  });
});

describe("qualifyVisualReview", () => {
  it("qualifies a complete review without scheduling a revision", () => {
    expect(qualifyVisualReview(completeReview())).toMatchObject({
      release: true,
      revisionAllowed: false,
      status: "qualified",
    });
  });

  it("requires one revision for a complete sub-floor review", () => {
    const candidate = completeReview();
    candidate.categories[0] = {
      ...candidate.categories[0],
      diagnosis: "hierarchy",
      rating: 2,
      severity: "P1",
      state: "fail",
    };

    const result = qualifyVisualReview(candidate);
    expect(result).toMatchObject({
      release: false,
      revisionAllowed: true,
      status: "revision_required",
    });
    expect(result.reasons).toContain("rating_below_floor:business_specificity");
  });

  it("rejects a second failing review after the single revision", () => {
    const candidate = completeReview();
    candidate.categories[0] = {
      ...candidate.categories[0],
      diagnosis: "hierarchy",
      rating: 2,
      severity: "P1",
      state: "fail",
    };

    const result = qualifyVisualReview(candidate, 1, {
      browser: 1,
      build: 1,
      claim: 1,
      cta: 1,
      overflow: 1,
      reduced_motion: 1,
      source: 1,
      visual: 1,
    });
    expect(result).toMatchObject({
      release: false,
      revisionAllowed: false,
      status: "rejected",
    });
  });

  it("rejects unknown categories, low confidence, and unresolved P0/P1 findings", () => {
    const candidate = completeReview();
    candidate.categories[0] = {
      ...candidate.categories[0],
      diagnosis: "missing",
      rating: 3,
      severity: "P0",
      state: "unknown",
    };
    candidate.confidence = 0.8;
    candidate.unresolvedP0P1 = 1;

    const result = qualifyVisualReview(candidate);
    expect(result.release).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "category_unknown:business_specificity",
        "unresolved_priority_findings",
      ]),
    );
  });

  it("requires every release gate to rerun after a revision", () => {
    const result = qualifyVisualReview(completeReview(), 1, {
      browser: 1,
      build: 1,
      claim: 1,
      cta: 1,
      overflow: 1,
      reduced_motion: 1,
      source: 1,
      visual: 0,
    });

    expect(result.status).toBe("rejected");
    expect(result.reasons).toContain("gate_not_rerun:visual");
  });

  it("never permits a revision count above one", () => {
    const result = qualifyVisualReview(completeReview(), 2, {
      browser: 1,
      build: 1,
      claim: 1,
      cta: 1,
      overflow: 1,
      reduced_motion: 1,
      source: 1,
      visual: 1,
    });

    expect(result).toMatchObject({
      release: false,
      revisionAllowed: false,
      status: "rejected",
    });
  });
});
