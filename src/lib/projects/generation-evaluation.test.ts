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
  buildGeneratedSiteEvaluationReportV4,
  GENERATION_TRIAL_DIAGNOSTIC_MESSAGE_LIMIT,
  summarizeGenerationTrialDiagnostics,
  trialFromProfessionalResult,
  type BlindPreferenceV2,
  type GeneratedSiteEvaluationManifestV4,
  type GeneratedSiteEvaluationTrialV4,
} from "./generation-evaluation";

import type { GeneratedSiteCallBudgetSnapshot } from "./generated-site-call-budget";
import type { GeneratedSiteDesignKitId } from "./generated-site-design-kits/types";

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

const v4Manifest: GeneratedSiteEvaluationManifestV4 = {
  schemaVersion: 4,
  baselineId: "deterministic-control-v1",
  treatmentId: "professional-static-v3",
  corpusVersion: "professional-static-v3",
  evaluatorVersion: "4",
  cases: Array.from({ length: 12 }, (_, index) => ({
    briefId: `case-${index + 1}`,
    fixture: `briefs/case-${index + 1}.json`,
    expectedRouteCount: index < 2 ? 2 : 1,
    expectedKitIds: [
      [
        "editorial-airy",
        "menu-led-editorial",
        "catalog-story",
        "warm-commerce",
        "bold-typographic",
      ][index % 5] as GeneratedSiteDesignKitId,
    ],
    trials: [1, 2],
  })),
};

const v4Calls = {
  writerCalls: 1 as const,
  criticCalls: 1 as const,
  correctionCalls: 0 as const,
  correctionReason: null,
};

function qualifyingV4Trials(): GeneratedSiteEvaluationTrialV4[] {
  return v4Manifest.cases.flatMap((entry, index) =>
    entry.trials.flatMap((trial) => {
      const treatment: GeneratedSiteEvaluationTrialV4 = {
        runId: "run-4",
        arm: "professional-static-v3",
        briefId: entry.briefId,
        trial,
        outcome: "pass",
        routeCount: entry.expectedRouteCount,
        kitId: entry.expectedKitIds[0]!,
        calls: v4Calls,
        totalToDecisionMs: 80_000,
        firstFileClosedMs: 20_000,
        editableBytes: entry.expectedRouteCount === 1 ? 10_000 : 30_000,
        hardFailures: {
          fact: 0,
          action: 0,
          media: 0,
          accessibility: 0,
          route: 0,
          contract: 0,
        },
        professionalVisual: "pass",
        minimumProfessionalRating: 3,
        categoryRatings: {
          business_specificity: 3,
          first_view_hierarchy: 3,
          content_architecture: 3,
          composition_rhythm: 3,
          typography: 3,
          color_system: 3,
          media_integrity: 3,
          mobile_quality: 3,
          professional_finish: 3,
        },
        routePatternIds: [`pattern-${index}`],
        desktopEvidenceRefs: [`desktop-${entry.briefId}-${trial}`],
        mobileEvidenceRefs: [`mobile-${entry.briefId}-${trial}`],
      };
      const control: GeneratedSiteEvaluationTrialV4 = {
        ...treatment,
        arm: "deterministic-control-v1",
        kitId: "control",
        calls: {
          writerCalls: 0,
          criticCalls: 0,
          correctionCalls: 0,
          correctionReason: null,
        },
        routePatternIds: [],
        desktopEvidenceRefs: [],
        mobileEvidenceRefs: [],
      };
      return [treatment, control];
    }),
  );
}

function v4Preferences(): BlindPreferenceV2[] {
  return v4Manifest.cases.flatMap((entry) =>
    entry.trials.map((trial) => ({
      briefId: entry.briefId,
      trial,
      choice: "treatment" as const,
      controlReady: false,
      treatmentReady: true,
    })),
  );
}

describe("buildGeneratedSiteEvaluationReportV4", () => {
  it("passes a complete 24-trial treatment/control release corpus", () => {
    const report = buildGeneratedSiteEvaluationReportV4(
      v4Manifest,
      qualifyingV4Trials(),
      v4Preferences(),
    );
    expect(report).toMatchObject({
      schemaVersion: 4,
      completedTreatmentTrials: 24,
      release: { pass: true, reasons: [] },
    });
  });

  it.each([
    [
      "missing treatment",
      (trials: GeneratedSiteEvaluationTrialV4[]) =>
        trials.filter(
          (trial) =>
            !(
              trial.arm === "professional-static-v3" &&
              trial.briefId === "case-1" &&
              trial.trial === 1
            ),
        ),
      "missing treatment trial: case-1:1",
    ],
    [
      "infrastructure",
      (trials: GeneratedSiteEvaluationTrialV4[]) =>
        trials.map((trial) =>
          trial.arm === "professional-static-v3" && trial.briefId === "case-1"
            ? { ...trial, outcome: "infrastructure_error" as const }
            : trial,
        ),
      "infrastructure errors present",
    ],
    [
      "hard fact",
      (trials: GeneratedSiteEvaluationTrialV4[]) =>
        trials.map((trial) =>
          trial.arm === "professional-static-v3"
            ? { ...trial, hardFailures: { ...trial.hardFailures, fact: 1 } }
            : trial,
        ),
      "hard fact/action/media/accessibility/route/contract failure present",
    ],
    [
      "visual unknown",
      (trials: GeneratedSiteEvaluationTrialV4[]) =>
        trials.map((trial) =>
          trial.arm === "professional-static-v3"
            ? { ...trial, professionalVisual: "unknown" as const }
            : trial,
        ),
      "professional visual status is not pass",
    ],
    [
      "low rating",
      (trials: GeneratedSiteEvaluationTrialV4[]) =>
        trials.map((trial) =>
          trial.arm === "professional-static-v3"
            ? { ...trial, minimumProfessionalRating: 2 }
            : trial,
        ),
      "professional minimum rating below 3",
    ],
  ] as const)("fails %s evidence", (_name, mutate, reason) => {
    const report = buildGeneratedSiteEvaluationReportV4(
      v4Manifest,
      mutate(qualifyingV4Trials()),
      v4Preferences(),
    );
    expect(report.release.pass).toBe(false);
    expect(report.release.reasons).toContain(reason);
  });

  it("enforces speed, size, readiness, kit, multi-route, and pattern thresholds", () => {
    const trials = qualifyingV4Trials().map((trial) =>
      trial.arm === "professional-static-v3"
        ? {
            ...trial,
            totalToDecisionMs: 150_001,
            firstFileClosedMs: 45_001,
            editableBytes: trial.routeCount === 1 ? 32_769 : 49 * 1024,
            routePatternIds: ["same-pattern"],
          }
        : trial,
    );
    const preferences = v4Preferences().map((preference) => ({
      ...preference,
      choice: "tie" as const,
      treatmentReady: false,
    }));
    const report = buildGeneratedSiteEvaluationReportV4(
      v4Manifest,
      trials,
      preferences,
    );
    expect(report.release.pass).toBe(false);
    expect(report.release.reasons).toEqual(
      expect.arrayContaining([
        "total decision p95 exceeds 150000ms",
        "first editable file p50 exceeds 45000ms",
        "treatment readiness below 0.90",
        "decisive treatment preference below 0.75",
        "blind preference ties exceed 0.25",
        "case loses both treatment trials: case-1",
      ]),
    );
  });
});

describe("trialFromProfessionalResult", () => {
  it("copies non-zero proof, route, category, timing, and evidence fields", () => {
    const proof = {
      schemaVersion: 3 as const,
      engine: "professional-static-single-shot" as const,
      contractHash: "c",
      blueprintHash: "b",
      writerPlanHash: "p",
      kitId: "warm-commerce" as const,
      kitVersion: 2 as const,
      mediaMode: "graphic" as const,
      calls: v4Calls,
      models: {
        writerRequested: "requested",
        writerServed: "served",
        criticRequested: "critic",
        criticServed: "critic-served",
        correctionRequested: null,
        correctionServed: null,
      },
      gates: {
        response: "pass" as const,
        source: "pass" as const,
        build: "pass" as const,
        browser: "pass" as const,
        professionalVisual: "pass" as const,
      },
      hardFailures: {
        fact: 2,
        action: 1,
        media: 0,
        accessibility: 0,
        route: 0,
        contract: 0,
      },
      professional: {
        promptVersion: "v1",
        minimumRating: 3,
        averageRating: 3.2,
        categoryRatings: { business_specificity: 3 },
        unknownReason: null,
      },
      timingsMs: {
        contract: 1,
        blueprint: 2,
        writer: 3,
        sourceGates: 4,
        build: 5,
        browser: 6,
        critic: 7,
        correction: 0,
        totalToDecision: 8,
      },
      output: {
        routeCount: 2,
        editableFileCount: 3,
        editableBytes: 1234,
        firstFileClosedMs: 9,
      },
      outcome: "pass" as const,
    };
    const result = trialFromProfessionalResult({
      runId: "run",
      arm: "professional-static-v3",
      briefId: "b1",
      trial: 1,
      result: {
        ok: false,
        proof,
      },
      routePatternIds: ["split"],
      desktopEvidenceRefs: ["desktop-ref"],
      mobileEvidenceRefs: ["mobile-ref"],
    });
    expect(result).toMatchObject({
      outcome: "pass",
      routeCount: 2,
      totalToDecisionMs: 8,
      editableBytes: 1234,
      hardFailures: { fact: 2, action: 1 },
      desktopEvidenceRefs: ["desktop-ref"],
      mobileEvidenceRefs: ["mobile-ref"],
      routePatternIds: ["split"],
    });
  });
  it("bounds a failed trial diagnostic to one short single-line reason", () => {
    const summary = summarizeGenerationTrialDiagnostics({
      briefId: "fnb-menu",
      trial: 1,
      arm: "professional-static-v3",
      outcome: "fail",
      failureClass: "source_gate",
      safeMessage: `professional source gate failed:\n${"Nasi Goreng Spesial ".repeat(40)}`,
      gates: {
        response: "pass",
        source: "fail",
        build: "not_run",
        browser: "not_run",
        professionalVisual: "not_run",
      },
      calls: {
        writerCalls: 1,
        criticCalls: 0,
        correctionCalls: 1,
        correctionReason: "source_gate",
      },
    });
    expect(summary.failureClass).toBe("source_gate");
    expect(summary.gates.source).toBe("fail");
    expect(summary.calls.correctionCalls).toBe(1);
    expect(summary.safeMessage.length).toBeLessThanOrEqual(
      GENERATION_TRIAL_DIAGNOSTIC_MESSAGE_LIMIT,
    );
    expect(
      summary.safeMessage.startsWith("professional source gate failed"),
    ).toBe(true);
    expect(summary.safeMessage).not.toContain("\n");
    expect(summary.safeMessage.endsWith("Spesial ".repeat(40).trim())).toBe(
      false,
    );
  });

  it("keeps a passing trial diagnostic free of any message", () => {
    const summary = summarizeGenerationTrialDiagnostics({
      briefId: "local-service",
      trial: 2,
      arm: "professional-static-v3",
      outcome: "pass",
      failureClass: null,
      safeMessage: null,
      gates: {
        response: "pass",
        source: "pass",
        build: "pass",
        browser: "pass",
        professionalVisual: "pass",
      },
      calls: {
        writerCalls: 1,
        criticCalls: 1,
        correctionCalls: 0,
        correctionReason: null,
      },
    });
    expect(summary.failureClass).toBeNull();
    expect(summary.safeMessage).toBe("");
  });
});
