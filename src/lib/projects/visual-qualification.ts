export const VISUAL_QUALIFICATION_VIEWPORTS = {
  desktop: { height: 1000, width: 1440 },
  mobile: { height: 844, width: 390 },
} as const;

export const MAX_VISUAL_REVISIONS = 1;
export const MIN_VISUAL_SCORE = 70;

export type VisualViewportEvidence = {
  width: number;
  height: number;
  contentVisible: boolean;
  horizontalOverflowPx: number;
  emptyCtaCount: number;
  missingImageAltCount: number;
};

export type VisualCandidateEvidence = {
  desktop: VisualViewportEvidence;
  mobile: VisualViewportEvidence;
  consoleErrorCount: number;
  failedRequestCount: number;
  imageRequestCount: number;
  remoteImageRequestCount: number;
  unsupportedClaimCount: number;
  visualScore: number;
};

export type VisualQualificationResult = {
  status: "qualified" | "revision_required" | "rejected";
  release: boolean;
  revisionAllowed: boolean;
  reasons: string[];
};

export type VisualEvidenceParseResult =
  { ok: true; value: VisualCandidateEvidence } | { ok: false; reason: string };

export function parseVisualCandidateEvidence(
  input: unknown,
): VisualEvidenceParseResult {
  if (!isRecord(input)) {
    return { ok: false, reason: "evidence must be an object" };
  }
  const desktop = parseViewportEvidence(input.desktop);
  const mobile = parseViewportEvidence(input.mobile);
  if (!desktop || !mobile) {
    return { ok: false, reason: "desktop and mobile evidence are required" };
  }
  if (
    typeof input.consoleErrorCount !== "number" ||
    typeof input.failedRequestCount !== "number" ||
    typeof input.imageRequestCount !== "number" ||
    typeof input.remoteImageRequestCount !== "number" ||
    typeof input.unsupportedClaimCount !== "number" ||
    typeof input.visualScore !== "number"
  ) {
    return { ok: false, reason: "global evidence metrics are required" };
  }
  return {
    ok: true,
    value: {
      consoleErrorCount: input.consoleErrorCount,
      desktop,
      failedRequestCount: input.failedRequestCount,
      imageRequestCount: input.imageRequestCount,
      mobile,
      remoteImageRequestCount: input.remoteImageRequestCount,
      unsupportedClaimCount: input.unsupportedClaimCount,
      visualScore: input.visualScore,
    },
  };
}

export function qualifyVisualCandidate(
  evidence: VisualCandidateEvidence,
  revisionCount = 0,
): VisualQualificationResult {
  const reasons = diagnoseVisualCandidate(evidence);
  if (reasons.length === 0) {
    return {
      status: "qualified",
      release: true,
      revisionAllowed: false,
      reasons: [],
    };
  }

  if (revisionCount < MAX_VISUAL_REVISIONS) {
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

export function diagnoseVisualCandidate(
  evidence: VisualCandidateEvidence,
): string[] {
  const reasons: string[] = [];
  if (
    !Number.isFinite(evidence.visualScore) ||
    evidence.visualScore < 0 ||
    evidence.visualScore > 100
  ) {
    reasons.push("visual_evidence_invalid");
  }
  if (!Number.isFinite(evidence.visualScore)) {
    reasons.push("visual_score_missing");
  } else if (evidence.visualScore < MIN_VISUAL_SCORE) {
    reasons.push("visual_score_low");
  }
  if (!isNonNegativeInteger(evidence.consoleErrorCount)) {
    reasons.push("console_evidence_invalid");
  } else if (evidence.consoleErrorCount !== 0) {
    reasons.push("console_errors");
  }
  if (!isNonNegativeInteger(evidence.failedRequestCount)) {
    reasons.push("request_evidence_invalid");
  } else if (evidence.failedRequestCount !== 0) {
    reasons.push("failed_requests");
  }
  if (!isNonNegativeInteger(evidence.imageRequestCount)) {
    reasons.push("image_request_evidence_invalid");
  }
  if (!isNonNegativeInteger(evidence.remoteImageRequestCount)) {
    reasons.push("remote_image_request_evidence_invalid");
  } else if (evidence.remoteImageRequestCount !== 0) {
    reasons.push("remote_image_requests");
  }
  if (
    isNonNegativeInteger(evidence.imageRequestCount) &&
    isNonNegativeInteger(evidence.remoteImageRequestCount) &&
    evidence.remoteImageRequestCount > evidence.imageRequestCount
  ) {
    reasons.push("image_request_evidence_invalid");
  }
  if (!isNonNegativeInteger(evidence.unsupportedClaimCount)) {
    reasons.push("claim_evidence_invalid");
  } else if (evidence.unsupportedClaimCount !== 0) {
    reasons.push("unsupported_claims");
  }
  appendViewportReasons(reasons, "desktop", evidence.desktop);
  appendViewportReasons(reasons, "mobile", evidence.mobile);
  return reasons;
}

function parseViewportEvidence(value: unknown): VisualViewportEvidence | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.width !== "number" ||
    typeof value.height !== "number" ||
    typeof value.contentVisible !== "boolean" ||
    typeof value.horizontalOverflowPx !== "number" ||
    typeof value.emptyCtaCount !== "number" ||
    typeof value.missingImageAltCount !== "number"
  ) {
    return null;
  }
  return {
    contentVisible: value.contentVisible,
    emptyCtaCount: value.emptyCtaCount,
    height: value.height,
    horizontalOverflowPx: value.horizontalOverflowPx,
    missingImageAltCount: value.missingImageAltCount,
    width: value.width,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function appendViewportReasons(
  reasons: string[],
  viewport: "desktop" | "mobile",
  evidence: VisualViewportEvidence,
): void {
  const expected = VISUAL_QUALIFICATION_VIEWPORTS[viewport];
  if (
    evidence.width !== expected.width ||
    evidence.height !== expected.height
  ) {
    reasons.push(`${viewport}_viewport_mismatch`);
  }
  if (!evidence.contentVisible) {
    reasons.push(`${viewport}_content_hidden`);
  }
  if (evidence.horizontalOverflowPx > 0) {
    reasons.push(`${viewport}_horizontal_overflow`);
  }
  if (!isNonNegativeInteger(evidence.emptyCtaCount)) {
    reasons.push(`${viewport}_cta_evidence_invalid`);
  } else if (evidence.emptyCtaCount > 0) {
    reasons.push(`${viewport}_empty_cta`);
  }
  if (!isNonNegativeInteger(evidence.missingImageAltCount)) {
    reasons.push(`${viewport}_alt_evidence_invalid`);
  } else if (evidence.missingImageAltCount > 0) {
    reasons.push(`${viewport}_missing_image_alt`);
  }
  if (
    !Number.isFinite(evidence.horizontalOverflowPx) ||
    evidence.horizontalOverflowPx < 0
  ) {
    reasons.push(`${viewport}_overflow_evidence_invalid`);
  }
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}
