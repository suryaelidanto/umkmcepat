import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  evaluateProfessionalCalibration,
  evaluateProfessionalSiteReleaseEligibility,
  parseProfessionalSiteReleaseManifest,
  PROFESSIONAL_CALIBRATION_THRESHOLDS,
  type ProfessionalCalibrationSummaryV1,
  type ProfessionalSiteReleaseManifestV1,
} from "./professional-site-calibration";

const categories = {
  business_specificity: { positives: 2, negatives: 2 },
  first_view_hierarchy: { positives: 2, negatives: 2 },
  content_architecture: { positives: 2, negatives: 2 },
  composition_rhythm: { positives: 2, negatives: 2 },
  typography: { positives: 2, negatives: 2 },
  color_system: { positives: 2, negatives: 2 },
  media_integrity: { positives: 2, negatives: 2 },
  mobile_quality: { positives: 2, negatives: 2 },
  professional_finish: { positives: 2, negatives: 2 },
} as const;

function summary(
  overrides: Partial<ProfessionalCalibrationSummaryV1> = {},
): ProfessionalCalibrationSummaryV1 {
  return {
    schemaVersion: 1,
    promptVersion: "professional-static-review-v1",
    kitVersion: 2,
    evaluatorVersion: "4",
    samples: 50,
    seededDefects: 30,
    categories,
    blockerPrecision: 0.9,
    blockerRecall: 0.8,
    falseReadyRate: 0.05,
    p0FalseAccepts: 0,
    acceptedReference07RejectedForMinimalism: false,
    ...overrides,
  };
}

function manifest(
  overrides: Partial<ProfessionalSiteReleaseManifestV1> = {},
): ProfessionalSiteReleaseManifestV1 {
  return {
    schemaVersion: 1,
    approved: true,
    requestedModelId: "default-combo",
    allowedWriterModelIds: ["default-combo", "served-writer"],
    allowedCriticModelIds: ["served-critic"],
    criticPromptVersion: "professional-static-review-v1",
    kitVersion: 2,
    evaluatorVersion: "4",
    corpusVersion: "professional-static-v3",
    calibration: {
      samples: 50,
      seededDefects: 30,
      blockerPrecision: 0.9,
      blockerRecall: 0.8,
      falseReadyRate: 0.05,
      p0FalseAccepts: 0,
    },
    benchmark: {
      runId: "run-1",
      completedTreatmentTrials: 24,
      treatmentReadyRate: 0.8,
      decisiveTreatmentPreference: 0.6,
    },
    ownerApprovedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("professional calibration eligibility", () => {
  it("passes exactly at every calibration threshold", () => {
    expect(evaluateProfessionalCalibration(summary())).toEqual({
      eligibleForSelection: true,
      reasons: [],
    });
    expect(PROFESSIONAL_CALIBRATION_THRESHOLDS).toMatchObject({
      samples: 50,
      seededDefects: 30,
      blockerPrecision: 0.9,
      blockerRecall: 0.8,
      falseReadyRate: 0.05,
    });
  });

  it("names every failed threshold with the observed value", () => {
    const result = evaluateProfessionalCalibration(
      summary({
        samples: 49,
        seededDefects: 29,
        blockerPrecision: 0.89,
        blockerRecall: 0.79,
        falseReadyRate: 0.06,
        p0FalseAccepts: 1,
        acceptedReference07RejectedForMinimalism: true,
        categories: {
          ...categories,
          typography: { positives: 0, negatives: 2 },
        },
      }),
    );
    expect(result.eligibleForSelection).toBe(false);
    expect(result.reasons.join(" | ")).toContain("samples 49 < 50");
    expect(result.reasons.join(" | ")).toContain("seededDefects 29 < 30");
    expect(result.reasons.join(" | ")).toContain("blockerPrecision 0.89 < 0.9");
    expect(result.reasons.join(" | ")).toContain("falseReadyRate 0.06 > 0.05");
    expect(result.reasons.join(" | ")).toContain("p0FalseAccepts 1 != 0");
    expect(result.reasons.join(" | ")).toContain("typography coverage");
    expect(result.reasons.join(" | ")).toContain("reference-07");
  });
});

describe("professional release manifest", () => {
  it("strictly parses the tracked initial manifest", () => {
    const value: unknown = JSON.parse(
      readFileSync("config/professional-site-quality-release.json", "utf8"),
    );
    expect(parseProfessionalSiteReleaseManifest(value)).toMatchObject({
      schemaVersion: 1,
      approved: false,
      requestedModelId: "default-combo",
      benchmark: { completedTreatmentTrials: 0 },
    });
  });

  it("rejects unknown fields and invalid authority values", () => {
    expect(() =>
      parseProfessionalSiteReleaseManifest({ ...manifest(), unexpected: true }),
    ).toThrow("manifest fields");
    expect(() =>
      parseProfessionalSiteReleaseManifest({
        ...manifest(),
        allowedWriterModelIds: [""],
      }),
    ).toThrow("allowedWriterModelIds");
  });

  it("requires approval, exact versions, model authority, calibration, benchmark, and owner approval for selection", () => {
    const result = evaluateProfessionalSiteReleaseEligibility({
      manifest: manifest(),
      summary: summary(),
      requestedModelId: "default-combo",
      writerModelIds: ["default-combo", "served-writer"],
      criticModelIds: ["served-critic"],
      promptVersion: "professional-static-review-v1",
      kitVersion: 2,
      evaluatorVersion: "4",
      corpusVersion: "professional-static-v3",
    });
    expect(result).toEqual({ eligibleForSelection: true, reasons: [] });

    const blocked = evaluateProfessionalSiteReleaseEligibility({
      manifest: manifest({ approved: false, ownerApprovedAt: null }),
      summary: summary({ falseReadyRate: 0.2 }),
      requestedModelId: "other-model",
      writerModelIds: ["unlisted-writer"],
      criticModelIds: ["unlisted-critic"],
      promptVersion: "old",
      kitVersion: 1,
      evaluatorVersion: "old",
      corpusVersion: "old",
    });
    expect(blocked.eligibleForSelection).toBe(false);
    expect(blocked.reasons.length).toBeGreaterThan(5);
  });
});
