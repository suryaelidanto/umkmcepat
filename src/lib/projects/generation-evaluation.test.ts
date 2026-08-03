import { describe, expect, it } from "vitest";

import {
  buildEvaluationReport,
  type EvaluationManifestV1,
  type EvaluationTrialResultV1,
} from "./generation-evaluation";

function manifestWithTwoTrials(): EvaluationManifestV1 {
  return {
    schemaVersion: 1,
    baselineId: "baseline-1",
    corpusVersion: "corpus-1",
    evaluatorVersion: "1",
    scheduledTrials: [
      { briefId: "b1", trial: 1 },
      { briefId: "b1", trial: 2 },
    ],
  };
}

function passingTrial(
  briefId = "b1",
  trial: 1 | 2 = 1,
): EvaluationTrialResultV1 {
  return {
    briefId,
    trial,
    outcome: "pass",
    gateVersion: "1",
  };
}

function infrastructureErrorTrial(): EvaluationTrialResultV1 {
  return {
    briefId: "b1",
    trial: 2,
    outcome: "infrastructure_error",
    gateVersion: "1",
  };
}

describe("buildEvaluationReport", () => {
  it("counts missing and infrastructure-error trials in release denominators", () => {
    const report = buildEvaluationReport(manifestWithTwoTrials(), [
      passingTrial(),
      infrastructureErrorTrial(),
    ]);
    expect(report.metrics.firstPassHardGateSuccess).toBe(0.5);
    expect(report.operationalFailures).toBe(1);
  });

  it("fails a brief-level metric unless both frozen trials exist", () => {
    expect(() =>
      buildEvaluationReport(manifestWithTwoTrials(), [passingTrial("b1", 1)]),
    ).toThrow("missing scheduled trial");
  });

  it("reports each missing or infra-error result separately from model quality", () => {
    const report = buildEvaluationReport(manifestWithTwoTrials(), [
      passingTrial(),
      infrastructureErrorTrial(),
    ]);
    expect(report.operationalFailures).toBe(1);
    expect(report.trials.every((t) => t.outcome === "pass")).toBe(false);
    expect(report.metrics.unresolvedOperationalFailures).toBe(1);
  });
});
