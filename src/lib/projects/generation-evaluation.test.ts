import { describe, expect, it } from "vitest";

import {
  buildEvaluationReport,
  buildGeneratedSiteEvaluationReport,
  type EvaluationManifestV1,
  type EvaluationTrialResultV1,
  type GeneratedSiteEvaluationManifestV2,
  type GeneratedSiteEvaluationTrialV2,
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
  return { briefId, trial, outcome: "pass", gateVersion: "1" };
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
  it("counts infrastructure-error trials in release denominators", () => {
    const report = buildEvaluationReport(manifestWithTwoTrials(), [
      passingTrial(),
      infrastructureErrorTrial(),
    ]);
    expect(report.metrics.firstPassHardGateSuccess).toBe(0.5);
    expect(report.operationalFailures).toBe(1);
  });

  it("fails unless every frozen trial exists", () => {
    expect(() =>
      buildEvaluationReport(manifestWithTwoTrials(), [passingTrial("b1", 1)]),
    ).toThrow("missing scheduled trial");
  });
});

const v2Manifest: GeneratedSiteEvaluationManifestV2 = {
  schemaVersion: 2,
  corpusVersion: "generated-site-v1",
  evaluatorVersion: "2",
  cases: [
    { briefId: "retail", trials: [1, 2] },
    { briefId: "service", trials: [1, 2] },
  ],
};

function qualifyingV2Trial(
  briefId: string,
  trial: 1 | 2,
): GeneratedSiteEvaluationTrialV2 {
  return {
    briefId,
    trial,
    outcome: "pass",
    cleanBuildMs: 80_000,
    technicalSuccess: true,
    deterministicQualityPass: true,
    criticalAccessibilityFailures: 0,
    brokenActionFailures: 0,
    fabricatedFactFailures: 0,
    criticInvoked: false,
    visualRepairInvoked: false,
    visualRepairSucceeded: false,
  };
}

function qualifyingV2Trials(): GeneratedSiteEvaluationTrialV2[] {
  return v2Manifest.cases.flatMap((entry) =>
    entry.trials.map((trial) => qualifyingV2Trial(entry.briefId, trial)),
  );
}

describe("buildGeneratedSiteEvaluationReport", () => {
  it("passes a complete qualifying corpus", () => {
    const report = buildGeneratedSiteEvaluationReport(
      v2Manifest,
      qualifyingV2Trials(),
    );
    expect(report).toMatchObject({
      scheduled: 4,
      completed: 4,
      release: { pass: true, reasons: [] },
      metrics: {
        cleanBuildP50Ms: 80_000,
        firstBuildTechnicalSuccess: 1,
        deterministicQualityPass: 1,
        criticalAccessibilityFailures: 0,
        brokenActionFailures: 0,
        fabricatedFactFailures: 0,
      },
    });
  });

  it("fails when a scheduled trial is absent or a case lacks two trials", () => {
    const report = buildGeneratedSiteEvaluationReport(v2Manifest, [
      qualifyingV2Trial("retail", 1),
      qualifyingV2Trial("retail", 2),
      qualifyingV2Trial("service", 1),
    ]);
    expect(report.completed).toBe(3);
    expect(report.release).toMatchObject({ pass: false });
    expect(report.release.reasons).toEqual(
      expect.arrayContaining([
        "missing scheduled trial: service:2",
        "corpus case requires two trials: service",
      ]),
    );
  });

  it.each([
    ["p50", { cleanBuildMs: 120_001 }, "clean build p50 exceeds 120000ms"],
    [
      "technical",
      { technicalSuccess: false },
      "first build technical success below 0.95",
    ],
    [
      "quality",
      { deterministicQualityPass: false },
      "deterministic quality pass below 0.90",
    ],
    [
      "accessibility",
      { criticalAccessibilityFailures: 1 },
      "critical accessibility failures present",
    ],
    ["action", { brokenActionFailures: 1 }, "broken action failures present"],
    ["fact", { fabricatedFactFailures: 1 }, "fabricated fact failures present"],
  ] as const)("fails the %s release threshold", (_name, patch, reason) => {
    const trials = qualifyingV2Trials().map((trial) => ({
      ...trial,
      ...patch,
    }));
    const report = buildGeneratedSiteEvaluationReport(v2Manifest, trials);
    expect(report.release.pass).toBe(false);
    expect(report.release.reasons).toContain(reason);
  });

  it("keeps infrastructure errors in every success denominator", () => {
    const trials = qualifyingV2Trials();
    trials[0] = {
      ...trials[0],
      outcome: "infrastructure_error",
      technicalSuccess: false,
      deterministicQualityPass: false,
    };
    const report = buildGeneratedSiteEvaluationReport(v2Manifest, trials);
    expect(report.metrics.firstBuildTechnicalSuccess).toBe(0.75);
    expect(report.metrics.deterministicQualityPass).toBe(0.75);
    expect(report.release.pass).toBe(false);
  });
});
