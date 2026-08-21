import { describe, expect, it } from "vitest";

import {
  OUTCOME_GENERATION_RELEASE_MANIFEST,
  OUTCOME_RELEASE_THRESHOLDS,
  assertOutcomeGenerationReleaseAuthority,
  evaluateOutcomeGenerationRelease,
  type OutcomeGenerationReleaseEvidence,
  type OutcomeGenerationReleaseManifestV1,
} from "./outcome-generation-release";

const manifest: OutcomeGenerationReleaseManifestV1 = {
  schemaVersion: 1,
  approved: true,
  contractVersion: 1,
  directionPromptVersion: "outcome-direction-v1",
  buildPromptVersion: "outcome-build-v1",
  reviewPromptVersion: "outcome-review-v1",
  allowedWriterModelIds: ["writer-1"],
  allowedReviewerModelIds: ["reviewer-1"],
  ownerApprovedAt: "2026-08-21T00:00:00.000Z",
};

const passingEvidence: OutcomeGenerationReleaseEvidence = {
  completedTreatmentTrials: 40,
  readyToPublishRate: 0.9,
  businessSpecificRate: 0.9,
  templateRecognitionRate: 0.1,
  decisivePreferenceRate: 0.75,
  criticFalseReadyRate: 0.05,
  hardFailures: 0,
  corpusCaseCount: 20,
  corpusCoverageComplete: true,
};

describe("tracked outcome generation release manifest", () => {
  it("stays blocked until private evidence and owner approval exist", () => {
    expect(OUTCOME_GENERATION_RELEASE_MANIFEST).toMatchObject({
      approved: false,
      ownerApprovedAt: null,
      allowedWriterModelIds: [],
      allowedReviewerModelIds: [],
    });
  });
});

describe("evaluateOutcomeGenerationRelease", () => {
  it("requires every release threshold together", () => {
    expect(evaluateOutcomeGenerationRelease(passingEvidence)).toEqual({
      ok: true,
      failures: [],
    });

    const misses: Array<[keyof OutcomeGenerationReleaseEvidence, number]> = [
      ["completedTreatmentTrials", 39],
      ["readyToPublishRate", 0.89],
      ["businessSpecificRate", 0.89],
      ["templateRecognitionRate", 0.11],
      ["decisivePreferenceRate", 0.74],
      ["criticFalseReadyRate", 0.06],
      ["hardFailures", 1],
      ["corpusCaseCount", 19],
    ];

    for (const [field, value] of misses) {
      const result = evaluateOutcomeGenerationRelease({
        ...passingEvidence,
        [field]: value,
      });
      expect(result.ok, field).toBe(false);
      expect(result.failures, field).toContain(field);
    }
  });

  it("requires complete corpus coverage", () => {
    expect(
      evaluateOutcomeGenerationRelease({
        ...passingEvidence,
        corpusCoverageComplete: false,
      }),
    ).toEqual({ ok: false, failures: ["corpusCoverageComplete"] });
  });
});

describe("assertOutcomeGenerationReleaseAuthority", () => {
  it("rejects a blocked manifest", () => {
    expect(() =>
      assertOutcomeGenerationReleaseAuthority({
        manifest: { ...manifest, approved: false, ownerApprovedAt: null },
        evidence: passingEvidence,
        contractVersion: 1,
        directionPromptVersion: "outcome-direction-v1",
        buildPromptVersion: "outcome-build-v1",
        reviewPromptVersion: "outcome-review-v1",
        writerModelId: "writer-1",
        reviewerModelId: "reviewer-1",
      }),
    ).toThrow(/not approved/i);
  });

  it("rejects version or served-model drift", () => {
    expect(() =>
      assertOutcomeGenerationReleaseAuthority({
        manifest,
        evidence: passingEvidence,
        contractVersion: 1,
        directionPromptVersion: "outcome-direction-v1",
        buildPromptVersion: "outcome-build-v1",
        reviewPromptVersion: "outcome-review-v1",
        writerModelId: "writer-2",
        reviewerModelId: "reviewer-1",
      }),
    ).toThrow(/model/i);
  });
});

expect(OUTCOME_RELEASE_THRESHOLDS.completedTreatmentTrials).toBe(40);
