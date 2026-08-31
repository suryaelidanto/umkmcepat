import { describe, expect, it } from "vitest";

import {
  diagnoseVisualCandidate,
  qualifyVisualCandidate,
  type VisualCandidateEvidence,
} from "./visual-qualification";

const viewport = (
  overrides: Partial<VisualCandidateEvidence["desktop"]> = {},
) => ({
  width: 1440,
  height: 1000,
  contentVisible: true,
  horizontalOverflowPx: 0,
  emptyCtaCount: 0,
  missingImageAltCount: 0,
  ...overrides,
});

const mobileViewport = (
  overrides: Partial<VisualCandidateEvidence["mobile"]> = {},
) => ({
  width: 390,
  height: 844,
  contentVisible: true,
  horizontalOverflowPx: 0,
  emptyCtaCount: 0,
  missingImageAltCount: 0,
  ...overrides,
});

const passingEvidence = (): VisualCandidateEvidence => ({
  desktop: viewport(),
  mobile: mobileViewport(),
  consoleErrorCount: 0,
  failedRequestCount: 0,
  unsupportedClaimCount: 0,
  visualScore: 85,
});

describe("qualifyVisualCandidate", () => {
  it("releases a complete candidate with exact viewport evidence", () => {
    expect(qualifyVisualCandidate(passingEvidence())).toEqual({
      status: "qualified",
      release: true,
      revisionAllowed: false,
      reasons: [],
    });
  });

  it("keeps console errors out of the release path", () => {
    const result = qualifyVisualCandidate({
      ...passingEvidence(),
      consoleErrorCount: 1,
    });

    expect(result.release).toBe(false);
    expect(result.reasons).toContain("console_errors");
  });

  it("keeps failed requests out of the release path", () => {
    const result = qualifyVisualCandidate({
      ...passingEvidence(),
      failedRequestCount: 1,
    });

    expect(result.release).toBe(false);
    expect(result.reasons).toContain("failed_requests");
  });

  it("requires the exact desktop and mobile viewport contracts", () => {
    const result = qualifyVisualCandidate({
      ...passingEvidence(),
      desktop: viewport({ width: 1280 }),
      mobile: mobileViewport({ height: 800 }),
    });

    expect(result.reasons).toEqual([
      "desktop_viewport_mismatch",
      "mobile_viewport_mismatch",
    ]);
  });

  it("rejects hidden content and horizontal overflow", () => {
    const result = qualifyVisualCandidate({
      ...passingEvidence(),
      mobile: mobileViewport({
        contentVisible: false,
        horizontalOverflowPx: 2,
      }),
    });

    expect(result.reasons).toEqual([
      "mobile_content_hidden",
      "mobile_horizontal_overflow",
    ]);
  });

  it("requires a sufficiently strong visual review score", () => {
    const result = qualifyVisualCandidate({
      ...passingEvidence(),
      visualScore: 69,
    });

    expect(result.status).toBe("revision_required");
    expect(result.revisionAllowed).toBe(true);
    expect(result.reasons).toEqual(["visual_score_low"]);
  });

  it("allows at most one diagnosis-driven revision", () => {
    const result = qualifyVisualCandidate(
      { ...passingEvidence(), visualScore: 69 },
      1,
    );

    expect(result).toEqual({
      status: "rejected",
      release: false,
      revisionAllowed: false,
      reasons: ["visual_score_low"],
    });
  });

  it("rejects unsupported claims even when visual signals pass", () => {
    const result = qualifyVisualCandidate({
      ...passingEvidence(),
      unsupportedClaimCount: 1,
    });

    expect(result.release).toBe(false);
    expect(result.reasons).toContain("unsupported_claims");
  });

  it("rejects missing alt text and empty calls to action", () => {
    const result = qualifyVisualCandidate({
      ...passingEvidence(),
      desktop: viewport({ emptyCtaCount: 1 }),
      mobile: mobileViewport({ missingImageAltCount: 1 }),
    });

    expect(result.reasons).toEqual([
      "desktop_empty_cta",
      "mobile_missing_image_alt",
    ]);
  });

  it("fails closed for malformed evidence", () => {
    const evidence = {
      ...passingEvidence(),
      consoleErrorCount: -1,
      visualScore: 101,
    };

    expect(diagnoseVisualCandidate(evidence)).toEqual([
      "visual_evidence_invalid",
      "console_evidence_invalid",
    ]);
  });
});
