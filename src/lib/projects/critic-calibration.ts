// src/lib/projects/critic-calibration.ts
// Per-category calibration gate for the visual critic. Automatic repair is
// allowed only after a category meets precision/recall/sample thresholds with
// zero observed P0 hard-gate regressions. Until then the critic stays in
// shadow mode (findings recorded, never blocking or repairing).
export type CalibrationInput = {
  precision: number;
  recall: number;
  samples: number;
  seededDefects: number;
  p0Regressions: number;
};

export type CalibrationDecision = {
  eligibleForRepair: boolean;
  reasons: string[];
};

export const CRITIC_MIN_SAMPLES = 50;
export const CRITIC_MIN_SEEDED_DEFECTS = 30;
export const CRITIC_PRECISION_THRESHOLD = 0.9;
export const CRITIC_RECALL_THRESHOLD = 0.8;

export function evaluateCriticCalibration(
  input: CalibrationInput,
): CalibrationDecision {
  const reasons: string[] = [];
  if (input.samples < CRITIC_MIN_SAMPLES) {
    reasons.push(
      `need >= ${CRITIC_MIN_SAMPLES} human-labeled findings (have ${input.samples})`,
    );
  }
  if (input.seededDefects < CRITIC_MIN_SEEDED_DEFECTS) {
    reasons.push(
      `need >= ${CRITIC_MIN_SEEDED_DEFECTS} seeded defects (have ${input.seededDefects})`,
    );
  }
  if (input.precision < CRITIC_PRECISION_THRESHOLD) {
    reasons.push(
      `precision ${input.precision} < ${CRITIC_PRECISION_THRESHOLD}`,
    );
  }
  if (input.recall < CRITIC_RECALL_THRESHOLD) {
    reasons.push(`recall ${input.recall} < ${CRITIC_RECALL_THRESHOLD}`);
  }
  if (input.p0Regressions > 0) {
    reasons.push(`${input.p0Regressions} P0 hard-gate regressions`);
  }

  return {
    eligibleForRepair: reasons.length === 0,
    reasons,
  };
}
