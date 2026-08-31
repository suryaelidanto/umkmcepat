export const VISUAL_REVIEW_CATEGORIES = [
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
] as const;

export const VISUAL_REVIEW_GATES = [
  "source",
  "build",
  "browser",
  "claim",
  "cta",
  "overflow",
  "reduced_motion",
  "visual",
] as const;

export type VisualReviewCategory = (typeof VISUAL_REVIEW_CATEGORIES)[number];
export type VisualReviewGate = (typeof VISUAL_REVIEW_GATES)[number];
export type VisualReviewState = "pass" | "fail" | "unknown";
export type VisualReviewSeverity = "P0" | "P1" | "P2" | "none";

export type VisualReviewItem = {
  category: VisualReviewCategory;
  diagnosis: string;
  rating: 1 | 2 | 3 | 4;
  severity: VisualReviewSeverity;
  state: VisualReviewState;
};

export type VisualReview = {
  categories: VisualReviewItem[];
  confidence: number;
  unresolvedP0P1: number;
  version: 1;
};

export type VisualReviewParseResult =
  { ok: true; value: VisualReview } | { ok: false; reason: string };

export type VisualReviewGateRuns = Partial<Record<VisualReviewGate, number>>;

export type VisualReviewQualificationResult = {
  status: "qualified" | "revision_required" | "rejected";
  release: boolean;
  revisionAllowed: boolean;
  reasons: string[];
};

const CATEGORY_SET: ReadonlySet<string> = new Set(VISUAL_REVIEW_CATEGORIES);
const STATE_SET: ReadonlySet<string> = new Set(["pass", "fail"]);
const SEVERITY_SET: ReadonlySet<string> = new Set(["P0", "P1", "P2", "none"]);

export function parseVisualReview(input: unknown): VisualReviewParseResult {
  if (!isRecord(input) || input.version !== 1) {
    return { ok: false, reason: "invalid visual review schema" };
  }
  if (!Array.isArray(input.categories) || input.categories.length !== 10) {
    return {
      ok: false,
      reason: "visual review must contain exactly the ten required categories",
    };
  }

  const seen = new Set<string>();
  const categories: VisualReviewItem[] = [];
  for (const candidate of input.categories) {
    const parsed = parseReviewItem(candidate);
    if (!parsed) {
      return { ok: false, reason: "invalid visual review category" };
    }
    if (seen.has(parsed.category)) {
      return { ok: false, reason: "duplicate visual review category" };
    }
    seen.add(parsed.category);
    categories.push(parsed);
  }
  if (seen.size !== VISUAL_REVIEW_CATEGORIES.length) {
    return {
      ok: false,
      reason: "visual review must contain exactly the ten required categories",
    };
  }
  if (
    typeof input.confidence !== "number" ||
    !Number.isFinite(input.confidence) ||
    input.confidence < 0.8 ||
    input.confidence > 1
  ) {
    return { ok: false, reason: "visual review confidence is below the floor" };
  }
  if (
    typeof input.unresolvedP0P1 !== "number" ||
    !Number.isInteger(input.unresolvedP0P1) ||
    input.unresolvedP0P1 < 0
  ) {
    return { ok: false, reason: "invalid unresolved visual findings count" };
  }

  return {
    ok: true,
    value: {
      categories,
      confidence: input.confidence,
      unresolvedP0P1: input.unresolvedP0P1,
      version: 1,
    },
  };
}

export function parseVisualReviewGateRuns(
  input: unknown,
): VisualReviewGateRuns | undefined {
  if (!isRecord(input)) {
    return undefined;
  }
  const runs: VisualReviewGateRuns = {};
  for (const gate of VISUAL_REVIEW_GATES) {
    const value = input[gate];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      return undefined;
    }
    runs[gate] = value;
  }
  return runs;
}

export function qualifyVisualReview(
  review: VisualReview,
  revisionCount = 0,
  gateRuns?: VisualReviewGateRuns,
): VisualReviewQualificationResult {
  const reasons = diagnoseVisualReview(review, revisionCount, gateRuns);
  if (reasons.length === 0) {
    return {
      status: "qualified",
      release: true,
      revisionAllowed: false,
      reasons: [],
    };
  }
  if (revisionCount < 1) {
    return {
      status: "revision_required",
      release: false,
      revisionAllowed: true,
      reasons,
    };
  }
  return {
    status: "rejected",
    release: false,
    revisionAllowed: false,
    reasons,
  };
}

export function diagnoseVisualReview(
  review: VisualReview,
  revisionCount = 0,
  gateRuns?: VisualReviewGateRuns,
): string[] {
  const reasons: string[] = [];
  const seen = new Set<string>();
  if (review.version !== 1 || review.categories.length !== 10) {
    reasons.push("visual_review_incomplete");
  }
  for (const item of review.categories) {
    if (!CATEGORY_SET.has(item.category)) {
      reasons.push(`category_unknown:${String(item.category)}`);
      continue;
    }
    if (seen.has(item.category)) {
      reasons.push(`category_duplicate:${item.category}`);
    }
    seen.add(item.category);
    if (item.state === "unknown") {
      reasons.push(`category_unknown:${item.category}`);
    }
    if (!Number.isInteger(item.rating) || item.rating < 1 || item.rating > 4) {
      reasons.push(`rating_invalid:${item.category}`);
    } else if (item.rating < 3) {
      reasons.push(`rating_below_floor:${item.category}`);
    }
    if ((item.state === "fail" || item.rating < 3) && !item.diagnosis.trim()) {
      reasons.push(`diagnosis_missing:${item.category}`);
    }
  }
  if (seen.size !== VISUAL_REVIEW_CATEGORIES.length) {
    reasons.push("visual_review_incomplete");
  }
  if (
    !Number.isFinite(review.confidence) ||
    review.confidence < 0.8 ||
    review.confidence > 1
  ) {
    reasons.push("confidence_below_floor");
  }
  if (!Number.isInteger(review.unresolvedP0P1) || review.unresolvedP0P1 < 0) {
    reasons.push("unresolved_findings_invalid");
  } else if (review.unresolvedP0P1 > 0) {
    reasons.push("unresolved_priority_findings");
  }
  if (revisionCount > 1) {
    reasons.push("revision_limit_exceeded");
  }
  if (revisionCount > 0) {
    for (const gate of VISUAL_REVIEW_GATES) {
      const runs = gateRuns?.[gate];
      if (typeof runs !== "number" || !Number.isInteger(runs) || runs < 1) {
        reasons.push(`gate_not_rerun:${gate}`);
      }
    }
  }
  return [...new Set(reasons)];
}

function parseReviewItem(value: unknown): VisualReviewItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const category = value.category;
  const diagnosis = value.diagnosis;
  const rating = value.rating;
  const severity = value.severity;
  const state = value.state;
  if (
    typeof category !== "string" ||
    !CATEGORY_SET.has(category) ||
    typeof diagnosis !== "string" ||
    !diagnosis.trim() ||
    typeof rating !== "number" ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 4 ||
    typeof severity !== "string" ||
    !SEVERITY_SET.has(severity) ||
    typeof state !== "string" ||
    !STATE_SET.has(state)
  ) {
    return null;
  }
  return {
    category: category as VisualReviewCategory,
    diagnosis,
    rating: rating as VisualReviewItem["rating"],
    severity: severity as VisualReviewSeverity,
    state: state as "pass" | "fail",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
