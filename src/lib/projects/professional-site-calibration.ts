import { PROFESSIONAL_REVIEW_CATEGORIES } from "./professional-site-critic";

import type { ProfessionalReviewCategory } from "./professional-site-critic";

export type ProfessionalCalibrationSummaryV1 = {
  schemaVersion: 1;
  promptVersion: string;
  kitVersion: 2;
  evaluatorVersion: string;
  samples: number;
  seededDefects: number;
  categories: Record<
    ProfessionalReviewCategory,
    { positives: number; negatives: number }
  >;
  blockerPrecision: number;
  blockerRecall: number;
  falseReadyRate: number;
  p0FalseAccepts: number;
  acceptedReference07RejectedForMinimalism: boolean;
};

export type ProfessionalSiteReleaseManifestV1 = {
  schemaVersion: 1;
  approved: boolean;
  requestedModelId: string;
  allowedWriterModelIds: string[];
  allowedCriticModelIds: string[];
  criticPromptVersion: string;
  kitVersion: 2;
  evaluatorVersion: string;
  corpusVersion: string;
  calibration: {
    samples: number;
    seededDefects: number;
    blockerPrecision: number;
    blockerRecall: number;
    falseReadyRate: number;
    p0FalseAccepts: number;
  };
  benchmark: {
    runId: string;
    completedTreatmentTrials: number;
    treatmentReadyRate: number;
    decisiveTreatmentPreference: number;
  };
  ownerApprovedAt: string | null;
};

export const PROFESSIONAL_CALIBRATION_THRESHOLDS = {
  samples: 50,
  seededDefects: 30,
  blockerPrecision: 0.9,
  blockerRecall: 0.8,
  falseReadyRate: 0.05,
  p0FalseAccepts: 0,
} as const;

export function evaluateProfessionalCalibration(
  input: ProfessionalCalibrationSummaryV1,
): { eligibleForSelection: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.samples < PROFESSIONAL_CALIBRATION_THRESHOLDS.samples) {
    reasons.push(
      `samples ${input.samples} < ${PROFESSIONAL_CALIBRATION_THRESHOLDS.samples}`,
    );
  }
  if (input.seededDefects < PROFESSIONAL_CALIBRATION_THRESHOLDS.seededDefects) {
    reasons.push(
      `seededDefects ${input.seededDefects} < ${PROFESSIONAL_CALIBRATION_THRESHOLDS.seededDefects}`,
    );
  }
  if (
    input.blockerPrecision <
    PROFESSIONAL_CALIBRATION_THRESHOLDS.blockerPrecision
  ) {
    reasons.push(
      `blockerPrecision ${input.blockerPrecision} < ${PROFESSIONAL_CALIBRATION_THRESHOLDS.blockerPrecision}`,
    );
  }
  if (input.blockerRecall < PROFESSIONAL_CALIBRATION_THRESHOLDS.blockerRecall) {
    reasons.push(
      `blockerRecall ${input.blockerRecall} < ${PROFESSIONAL_CALIBRATION_THRESHOLDS.blockerRecall}`,
    );
  }
  if (
    input.falseReadyRate > PROFESSIONAL_CALIBRATION_THRESHOLDS.falseReadyRate
  ) {
    reasons.push(
      `falseReadyRate ${input.falseReadyRate} > ${PROFESSIONAL_CALIBRATION_THRESHOLDS.falseReadyRate}`,
    );
  }
  if (
    input.p0FalseAccepts !== PROFESSIONAL_CALIBRATION_THRESHOLDS.p0FalseAccepts
  ) {
    reasons.push(`p0FalseAccepts ${input.p0FalseAccepts} != 0`);
  }
  for (const category of PROFESSIONAL_REVIEW_CATEGORIES) {
    const coverage = input.categories[category];
    if (
      !coverage ||
      !Number.isInteger(coverage.positives) ||
      !Number.isInteger(coverage.negatives) ||
      coverage.positives < 1 ||
      coverage.negatives < 1
    ) {
      reasons.push(
        `${category} coverage requires positive and negative samples`,
      );
    }
  }
  if (input.acceptedReference07RejectedForMinimalism) {
    reasons.push("reference-07 false rejection for minimalism is true");
  }
  return { eligibleForSelection: reasons.length === 0, reasons };
}

export function evaluateProfessionalSiteReleaseEligibility(input: {
  manifest: ProfessionalSiteReleaseManifestV1;
  summary: ProfessionalCalibrationSummaryV1;
  requestedModelId: string;
  writerModelIds: string[];
  criticModelIds: string[];
  promptVersion: string;
  kitVersion: number;
  evaluatorVersion: string;
  corpusVersion: string;
}): { eligibleForSelection: boolean; reasons: string[] } {
  const reasons = [...evaluateProfessionalCalibration(input.summary).reasons];
  const manifest = input.manifest;
  if (!manifest.approved) {
    reasons.push("manifest approved is false");
  }
  if (manifest.requestedModelId !== input.requestedModelId) {
    reasons.push(
      `requestedModelId ${input.requestedModelId} does not equal manifest ${manifest.requestedModelId}`,
    );
  }
  if (
    input.writerModelIds.some(
      (model) => !manifest.allowedWriterModelIds.includes(model),
    )
  ) {
    reasons.push("writer model authority contains an unlisted model ID");
  }
  if (
    input.criticModelIds.some(
      (model) => !manifest.allowedCriticModelIds.includes(model),
    )
  ) {
    reasons.push("critic model authority contains an unlisted model ID");
  }
  if (input.writerModelIds.length === 0 || input.criticModelIds.length === 0) {
    reasons.push(
      "writer and critic model authority sets must be observed and non-empty",
    );
  }
  const calibrationFields = [
    "samples",
    "seededDefects",
    "blockerPrecision",
    "blockerRecall",
    "falseReadyRate",
    "p0FalseAccepts",
  ] as const;
  for (const field of calibrationFields) {
    if (manifest.calibration[field] !== input.summary[field]) {
      reasons.push(`manifest calibration ${field} does not match summary`);
    }
  }
  if (manifest.criticPromptVersion !== input.promptVersion) {
    reasons.push("critic prompt version does not match release authority");
  }
  if (manifest.kitVersion !== input.kitVersion) {
    reasons.push("kit version does not match release authority");
  }
  if (manifest.evaluatorVersion !== input.evaluatorVersion) {
    reasons.push("evaluator version does not match release authority");
  }
  if (manifest.corpusVersion !== input.corpusVersion) {
    reasons.push("corpus version does not match release authority");
  }
  if (manifest.benchmark.completedTreatmentTrials !== 24) {
    reasons.push(
      `completedTreatmentTrials ${manifest.benchmark.completedTreatmentTrials} != 24`,
    );
  }
  if (!manifest.ownerApprovedAt) {
    reasons.push("ownerApprovedAt is null");
  }
  return { eligibleForSelection: reasons.length === 0, reasons };
}

export function parseProfessionalSiteReleaseManifest(
  value: unknown,
): ProfessionalSiteReleaseManifestV1 {
  if (!isRecord(value)) {
    throw new Error("professional release manifest must be an object");
  }
  exactKeys(
    value,
    [
      "schemaVersion",
      "approved",
      "requestedModelId",
      "allowedWriterModelIds",
      "allowedCriticModelIds",
      "criticPromptVersion",
      "kitVersion",
      "evaluatorVersion",
      "corpusVersion",
      "calibration",
      "benchmark",
      "ownerApprovedAt",
    ],
    "manifest",
  );
  if (
    value.schemaVersion !== 1 ||
    typeof value.approved !== "boolean" ||
    typeof value.requestedModelId !== "string" ||
    !nonEmpty(value.requestedModelId) ||
    typeof value.criticPromptVersion !== "string" ||
    !nonEmpty(value.criticPromptVersion) ||
    value.kitVersion !== 2 ||
    typeof value.evaluatorVersion !== "string" ||
    !nonEmpty(value.evaluatorVersion) ||
    typeof value.corpusVersion !== "string" ||
    !nonEmpty(value.corpusVersion) ||
    (value.ownerApprovedAt !== null &&
      (typeof value.ownerApprovedAt !== "string" ||
        !nonEmpty(value.ownerApprovedAt)))
  ) {
    throw new Error("professional release manifest authority is invalid");
  }
  if (!modelIds(value.allowedWriterModelIds)) {
    throw new Error(
      "professional release manifest allowedWriterModelIds are invalid",
    );
  }
  if (!modelIds(value.allowedCriticModelIds)) {
    throw new Error(
      "professional release manifest allowedCriticModelIds are invalid",
    );
  }
  const calibration = parseCalibration(value.calibration);
  const benchmark = parseBenchmark(value.benchmark);
  return {
    schemaVersion: 1,
    approved: value.approved,
    requestedModelId: value.requestedModelId,
    allowedWriterModelIds: value.allowedWriterModelIds,
    allowedCriticModelIds: value.allowedCriticModelIds,
    criticPromptVersion: value.criticPromptVersion,
    kitVersion: 2,
    evaluatorVersion: value.evaluatorVersion,
    corpusVersion: value.corpusVersion,
    calibration,
    benchmark,
    ownerApprovedAt: value.ownerApprovedAt,
  };
}

function parseCalibration(
  value: unknown,
): ProfessionalSiteReleaseManifestV1["calibration"] {
  if (!isRecord(value)) {
    throw new Error("professional release manifest calibration is invalid");
  }
  exactKeys(
    value,
    [
      "samples",
      "seededDefects",
      "blockerPrecision",
      "blockerRecall",
      "falseReadyRate",
      "p0FalseAccepts",
    ],
    "calibration",
  );
  if (
    !integer(value.samples) ||
    !integer(value.seededDefects) ||
    !rate(value.blockerPrecision) ||
    !rate(value.blockerRecall) ||
    !rate(value.falseReadyRate) ||
    !integer(value.p0FalseAccepts)
  ) {
    throw new Error(
      "professional release manifest calibration values are invalid",
    );
  }
  return {
    samples: value.samples,
    seededDefects: value.seededDefects,
    blockerPrecision: value.blockerPrecision,
    blockerRecall: value.blockerRecall,
    falseReadyRate: value.falseReadyRate,
    p0FalseAccepts: value.p0FalseAccepts,
  };
}

function parseBenchmark(
  value: unknown,
): ProfessionalSiteReleaseManifestV1["benchmark"] {
  if (!isRecord(value)) {
    throw new Error("professional release manifest benchmark is invalid");
  }
  exactKeys(
    value,
    [
      "runId",
      "completedTreatmentTrials",
      "treatmentReadyRate",
      "decisiveTreatmentPreference",
    ],
    "benchmark",
  );
  if (
    typeof value.runId !== "string" ||
    !nonEmpty(value.runId) ||
    !integer(value.completedTreatmentTrials) ||
    !rate(value.treatmentReadyRate) ||
    !rate(value.decisiveTreatmentPreference)
  ) {
    throw new Error(
      "professional release manifest benchmark values are invalid",
    );
  }
  return {
    runId: value.runId,
    completedTreatmentTrials: value.completedTreatmentTrials,
    treatmentReadyRate: value.treatmentReadyRate,
    decisiveTreatmentPreference: value.decisiveTreatmentPreference,
  };
}

function exactKeys(
  value: Record<string, unknown>,
  keys: string[],
  label: string,
): void {
  const expected = new Set(keys);
  if (
    Object.keys(value).length !== expected.size ||
    Object.keys(value).some((key) => !expected.has(key))
  ) {
    throw new Error(
      `professional release manifest ${label} fields are invalid`,
    );
  }
}

function modelIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    new Set(value).size === value.length &&
    value.every((model) => typeof model === "string" && nonEmpty(model))
  );
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function rate(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
