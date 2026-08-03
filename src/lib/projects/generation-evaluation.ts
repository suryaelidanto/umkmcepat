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
