// src/lib/projects/generation-evaluation.ts
// Frozen scoring contract for generation evaluation. Phase 0 freezes a
// baseline/corpus/evaluator version before any treatment code is enabled.

export type GenerationTrialOutcome = "pass" | "fail" | "infrastructure_error";

export type EvaluationTrialResultV1 = {
  briefId: string;
  trial: 1 | 2;
  outcome: GenerationTrialOutcome;
  gateVersion: string;
};

export type EvaluationManifestV1 = {
  schemaVersion: 1;
  baselineId: string;
  corpusVersion: string;
  evaluatorVersion: string;
  scheduledTrials: Array<{ briefId: string; trial: 1 | 2 }>;
};

export type GenerationMetricName =
  "firstPassHardGateSuccess" | "unresolvedOperationalFailures";

export type GenerationMetricSummary = Record<GenerationMetricName, number>;

export type EvaluationTrialSummary = {
  briefId: string;
  trial: 1 | 2;
  outcome: GenerationTrialOutcome;
};

export type EvaluationReportV1 = {
  schemaVersion: 1;
  baselineId: string;
  corpusVersion: string;
  evaluatorVersion: string;
  metrics: GenerationMetricSummary;
  operationalFailures: number;
  trials: EvaluationTrialSummary[];
};

function scheduledKey(t: { briefId: string; trial: 1 | 2 }): string {
  return `${t.briefId}:${t.trial}`;
}

/** Freeze the evaluation contract. Missing scheduled trials are errors, never
 * silently dropped; infra errors stay in the denominator and are reported
 * separately from model-quality failures. */
export function buildEvaluationReport(
  manifest: EvaluationManifestV1,
  results: EvaluationTrialResultV1[],
): EvaluationReportV1 {
  const byKey = new Map<string, EvaluationTrialResultV1>();
  for (const r of results) {
    byKey.set(scheduledKey(r), r);
  }

  for (const scheduled of manifest.scheduledTrials) {
    if (!byKey.has(scheduledKey(scheduled))) {
      throw new Error(`missing scheduled trial: ${scheduledKey(scheduled)}`);
    }
  }

  const trials: EvaluationTrialSummary[] = results.map((r) => ({
    briefId: r.briefId,
    trial: r.trial,
    outcome: r.outcome,
  }));

  const total = manifest.scheduledTrials.length;
  const passed = results.filter((r) => r.outcome === "pass").length;
  const operationalFailures = results.filter(
    (r) => r.outcome === "infrastructure_error",
  ).length;

  return {
    schemaVersion: 1,
    baselineId: manifest.baselineId,
    corpusVersion: manifest.corpusVersion,
    evaluatorVersion: manifest.evaluatorVersion,
    metrics: {
      firstPassHardGateSuccess: total ? passed / total : 0,
      unresolvedOperationalFailures: operationalFailures,
    },
    operationalFailures,
    trials,
  };
}

export type GeneratedSiteEvaluationManifestV2 = {
  schemaVersion: 2;
  corpusVersion: string;
  evaluatorVersion: string;
  cases: Array<{ briefId: string; trials: Array<1 | 2> }>;
};

export type GeneratedSiteEvaluationTrialV2 = {
  briefId: string;
  trial: 1 | 2;
  outcome: GenerationTrialOutcome;
  cleanBuildMs: number;
  technicalSuccess: boolean;
  deterministicQualityPass: boolean;
  criticalAccessibilityFailures: number;
  brokenActionFailures: number;
  fabricatedFactFailures: number;
  criticInvoked: boolean;
  visualRepairInvoked: boolean;
  visualRepairSucceeded: boolean;
};

export type GeneratedSiteEvaluationReportV2 = {
  schemaVersion: 2;
  corpusVersion: string;
  evaluatorVersion: string;
  scheduled: number;
  completed: number;
  metrics: {
    cleanBuildP50Ms: number;
    firstBuildTechnicalSuccess: number;
    deterministicQualityPass: number;
    criticalAccessibilityFailures: number;
    brokenActionFailures: number;
    fabricatedFactFailures: number;
    criticInvocationRate: number;
    visualRepairRate: number;
    visualRepairSuccessRate: number;
  };
  release: { pass: boolean; reasons: string[] };
};

export function buildGeneratedSiteEvaluationReport(
  manifest: GeneratedSiteEvaluationManifestV2,
  results: GeneratedSiteEvaluationTrialV2[],
): GeneratedSiteEvaluationReportV2 {
  const scheduled = manifest.cases.flatMap((entry) =>
    entry.trials.map((trial) => ({ briefId: entry.briefId, trial })),
  );
  const expectedKeys = new Set(scheduled.map(scheduledKey));
  const resultByKey = new Map(
    results
      .filter((result) => expectedKeys.has(scheduledKey(result)))
      .map((result) => [scheduledKey(result), result]),
  );
  const reasons: string[] = [];

  for (const expected of scheduled) {
    if (!resultByKey.has(scheduledKey(expected))) {
      reasons.push(`missing scheduled trial: ${scheduledKey(expected)}`);
    }
  }
  for (const entry of manifest.cases) {
    const completedTrials = entry.trials.filter((trial) =>
      resultByKey.has(scheduledKey({ briefId: entry.briefId, trial })),
    );
    if (entry.trials.length !== 2 || completedTrials.length !== 2) {
      reasons.push(`corpus case requires two trials: ${entry.briefId}`);
    }
  }

  const denominator = scheduled.length;
  const included = [...resultByKey.values()];
  const durations = included
    .filter((result) => result.technicalSuccess)
    .map((result) => result.cleanBuildMs)
    .sort((left, right) => left - right);
  const cleanBuildP50Ms = durations.length
    ? durations[Math.floor((durations.length - 1) / 2)]
    : 0;
  const firstBuildTechnicalSuccess = denominator
    ? included.filter((result) => result.technicalSuccess).length / denominator
    : 0;
  const deterministicQualityPass = denominator
    ? included.filter((result) => result.deterministicQualityPass).length /
      denominator
    : 0;
  const criticalAccessibilityFailures = sum(
    included,
    "criticalAccessibilityFailures",
  );
  const brokenActionFailures = sum(included, "brokenActionFailures");
  const fabricatedFactFailures = sum(included, "fabricatedFactFailures");
  const criticInvocationRate = denominator
    ? included.filter((result) => result.criticInvoked).length / denominator
    : 0;
  const visualRepairs = included.filter((result) => result.visualRepairInvoked);
  const visualRepairRate = denominator ? visualRepairs.length / denominator : 0;
  const visualRepairSuccessRate = visualRepairs.length
    ? visualRepairs.filter((result) => result.visualRepairSucceeded).length /
      visualRepairs.length
    : 0;

  if (cleanBuildP50Ms > 120_000) {
    reasons.push("clean build p50 exceeds 120000ms");
  }
  if (firstBuildTechnicalSuccess < 0.95) {
    reasons.push("first build technical success below 0.95");
  }
  if (deterministicQualityPass < 0.9) {
    reasons.push("deterministic quality pass below 0.90");
  }
  if (criticalAccessibilityFailures > 0) {
    reasons.push("critical accessibility failures present");
  }
  if (brokenActionFailures > 0) {
    reasons.push("broken action failures present");
  }
  if (fabricatedFactFailures > 0) {
    reasons.push("fabricated fact failures present");
  }

  return {
    schemaVersion: 2,
    corpusVersion: manifest.corpusVersion,
    evaluatorVersion: manifest.evaluatorVersion,
    scheduled: denominator,
    completed: included.length,
    metrics: {
      cleanBuildP50Ms,
      firstBuildTechnicalSuccess,
      deterministicQualityPass,
      criticalAccessibilityFailures,
      brokenActionFailures,
      fabricatedFactFailures,
      criticInvocationRate,
      visualRepairRate,
      visualRepairSuccessRate,
    },
    release: { pass: reasons.length === 0, reasons },
  };
}

function sum(
  results: GeneratedSiteEvaluationTrialV2[],
  key:
    | "criticalAccessibilityFailures"
    | "brokenActionFailures"
    | "fabricatedFactFailures",
): number {
  return results.reduce((total, result) => total + result[key], 0);
}
