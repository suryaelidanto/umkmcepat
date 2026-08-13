import { describe, expect, it } from "vitest";

import {
  buildEvaluationReport,
  buildGeneratedSiteEvaluationReport,
  buildGeneratedSiteEvaluationReportV3,
  type BlindPreference,
  type EvaluationManifestV1,
  type EvaluationTrialResultV1,
  type GeneratedSiteEvaluationManifestV2,
  type GeneratedSiteEvaluationTrialV2,
  type GeneratedSiteEvaluationManifestV3,
  type GeneratedSiteEvaluationTrialV3,
} from "./generation-evaluation";

import type { GeneratedSiteCallBudgetSnapshot } from "./generated-site-call-budget";

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

describe("buildGeneratedSiteEvaluationReportV3", () => {
  const v3Manifest: GeneratedSiteEvaluationManifestV3 = {
    schemaVersion: 3,
    baselineId: "control-v1",
    corpusVersion: "corpus-v3",
    evaluatorVersion: "3",
    cases: Array.from({ length: 12 }, (_, index) => ({
      briefId: `case-${index + 1}`,
      fixture: `briefs/case-${index + 1}.json`,
      trials: [1, 2] as const,
    })),
  };
  const calls: GeneratedSiteCallBudgetSnapshot = {
    writerCalls: 1,
    criticCalls: 1,
    correctionCalls: 0,
    correctionReason: null,
  };
  function v3Trials(): GeneratedSiteEvaluationTrialV3[] {
    const kits = [
      "editorial-airy",
      "menu-led-editorial",
      "catalog-story",
      "warm-commerce",
      "bold-typographic",
    ] as const;
    return v3Manifest.cases.flatMap((entry, index) =>
      entry.trials.flatMap((trial) => [
        {
          runId: "run-1",
          arm: "reference-calibrated-v2" as const,
          briefId: entry.briefId,
          trial,
          outcome: "pass" as const,
          kitId: kits[index % kits.length],
          calls,
          totalToDecisionMs: 80_000,
          firstFileClosedMs: 20_000,
          editableBytes: 10_000,
          technicalSuccess: true,
          criticalAccessibilityFailures: 0,
          brokenActionFailures: 0,
          fabricatedFactFailures: 0,
          placeholderMediaFailures: 0,
          visualFindings: { critical: 0, high: 0, medium: 0, low: 0 },
          compositionPatternId: `pattern-${index}`,
          desktopEvidenceRef: "private-desktop",
          mobileEvidenceRef: "private-mobile",
        },
        {
          runId: "run-1",
          arm: "deterministic-control-v1" as const,
          briefId: entry.briefId,
          trial,
          outcome: "pass" as const,
          kitId: "control" as const,
          calls: {
            writerCalls: 0,
            criticCalls: 0,
            correctionCalls: 0,
            correctionReason: null,
          },
          totalToDecisionMs: 7_000,
          firstFileClosedMs: null,
          editableBytes: 0,
          technicalSuccess: true,
          criticalAccessibilityFailures: 0,
          brokenActionFailures: 0,
          fabricatedFactFailures: 0,
          placeholderMediaFailures: 0,
          visualFindings: { critical: 0, high: 0, medium: 0, low: 0 },
          compositionPatternId: null,
          desktopEvidenceRef: "private-control-desktop",
          mobileEvidenceRef: "private-control-mobile",
        },
      ]),
    );
  }
  function preferences(): BlindPreference[] {
    return v3Manifest.cases.flatMap((entry) =>
      entry.trials.map((trial) => ({
        briefId: entry.briefId,
        trial,
        choice: "treatment" as const,
      })),
    );
  }

  it("passes only a complete 24-trial treatment/control corpus with blind labels", () => {
    const report = buildGeneratedSiteEvaluationReportV3(
      v3Manifest,
      v3Trials(),
      preferences(),
    );
    expect(report).toMatchObject({
      scheduledTreatmentTrials: 24,
      completedTreatmentTrials: 24,
      release: { pass: true, reasons: [] },
    });
  });

  it("keeps missing blind labels and bad call counts blocking release", () => {
    const trials = v3Trials().map((trial) =>
      trial.arm === "reference-calibrated-v2" &&
      trial.briefId === "case-1" &&
      trial.trial === 1
        ? { ...trial, calls: { ...calls, criticCalls: 0 as const } }
        : trial,
    );
    const report = buildGeneratedSiteEvaluationReportV3(v3Manifest, trials, []);
    expect(report.release.pass).toBe(false);
    expect(report.release.reasons).toEqual(
      expect.arrayContaining([
        "critic call count is not exactly one",
        "blind preference input missing",
      ]),
    );
  });
});

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
