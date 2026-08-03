import { describe, expect, it } from "vitest";

import { evaluateCriticCalibration } from "./critic-calibration";

describe("evaluateCriticCalibration", () => {
  it("requires sample sizes, precision, recall, and zero P0 regressions", () => {
    const result = evaluateCriticCalibration({
      precision: 0.9,
      recall: 0.7,
      samples: 30,
      seededDefects: 20,
      p0Regressions: 0,
    });
    expect(result.eligibleForRepair).toBe(false);
  });

  it("approves only when all thresholds are met", () => {
    const result = evaluateCriticCalibration({
      precision: 0.95,
      recall: 0.8,
      samples: 60,
      seededDefects: 35,
      p0Regressions: 0,
    });
    expect(result.eligibleForRepair).toBe(true);
  });

  it("blocks automatic repair on any P0 regression", () => {
    const result = evaluateCriticCalibration({
      precision: 0.95,
      recall: 0.8,
      samples: 60,
      seededDefects: 35,
      p0Regressions: 1,
    });
    expect(result.eligibleForRepair).toBe(false);
  });
});
