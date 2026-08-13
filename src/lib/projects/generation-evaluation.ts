// src/lib/projects/generation-evaluation.ts
// Frozen scoring contract for generation evaluation. Phase 0 freezes a
// baseline/corpus/evaluator version before any treatment code is enabled.

import type { GeneratedSiteCallBudgetSnapshot } from "./generated-site-call-budget";
import type { GeneratedSiteDesignKitId } from "./generated-site-design-kits/types";

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

export type GeneratedSiteEvaluationManifestV3 = {
  schemaVersion: 3;
  baselineId: string;
  corpusVersion: string;
  evaluatorVersion: string;
  cases: Array<{
    briefId: string;
    fixture: string;
    trials: Array<1 | 2>;
  }>;
};

export type GeneratedSiteEvaluationTrialV3 = {
  runId: string;
  arm: "deterministic-control-v1" | "reference-calibrated-v2";
  briefId: string;
  trial: 1 | 2;
  outcome: GenerationTrialOutcome;
  kitId: GeneratedSiteDesignKitId | "control";
  calls: GeneratedSiteCallBudgetSnapshot;
  totalToDecisionMs: number;
  firstFileClosedMs: number | null;
  editableBytes: number;
  technicalSuccess: boolean;
  criticalAccessibilityFailures: number;
  brokenActionFailures: number;
  fabricatedFactFailures: number;
  placeholderMediaFailures: number;
  visualFindings: Record<"critical" | "high" | "medium" | "low", number>;
  compositionPatternId: string | null;
  desktopEvidenceRef: string;
  mobileEvidenceRef: string;
};

export type BlindPreference = {
  briefId: string;
  trial: 1 | 2;
  choice: "control" | "treatment" | "tie";
};

export type GeneratedSiteEvaluationReportV3 = {
  schemaVersion: 3;
  baselineId: string;
  corpusVersion: string;
  evaluatorVersion: string;
  scheduledTreatmentTrials: number;
  completedTreatmentTrials: number;
  metrics: {
    totalP50Ms: number;
    totalP95Ms: number;
    firstFileP50Ms: number;
    editableBytesP95: number;
    correctionRate: number;
    decisiveTreatmentPreference: number;
    tieRate: number;
    infrastructureErrors: number;
    criticalAccessibilityFailures: number;
    brokenActionFailures: number;
    fabricatedFactFailures: number;
    placeholderMediaFailures: number;
    criticalVisualFindings: number;
    highVisualFindings: number;
  };
  release: { pass: boolean; reasons: string[] };
};

export function buildGeneratedSiteEvaluationReportV3(
  manifest: GeneratedSiteEvaluationManifestV3,
  results: GeneratedSiteEvaluationTrialV3[],
  preferences: BlindPreference[] = [],
): GeneratedSiteEvaluationReportV3 {
  const scheduled = manifest.cases.flatMap((entry) =>
    entry.trials.map((trial) => ({ briefId: entry.briefId, trial })),
  );
  const treatment = results.filter(
    (result) => result.arm === "reference-calibrated-v2",
  );
  const controls = results.filter(
    (result) => result.arm === "deterministic-control-v1",
  );
  const treatmentKeys = new Set(treatment.map(scheduledKey));
  const reasons: string[] = [];
  for (const expected of scheduled) {
    if (!treatmentKeys.has(scheduledKey(expected))) {
      reasons.push(`missing treatment trial: ${scheduledKey(expected)}`);
    }
    if (
      !controls.some(
        (result) => scheduledKey(result) === scheduledKey(expected),
      )
    ) {
      reasons.push(`missing control trial: ${scheduledKey(expected)}`);
    }
  }
  const duplicateTreatmentKeys = duplicateKeys(treatment);
  if (duplicateTreatmentKeys.length > 0) {
    reasons.push(
      `duplicate treatment trials: ${duplicateTreatmentKeys.join(",")}`,
    );
  }
  if (treatment.length !== scheduled.length) {
    reasons.push(`expected ${scheduled.length} treatment trials`);
  }
  const infrastructureErrors = treatment.filter(
    (result) => result.outcome === "infrastructure_error",
  ).length;
  if (infrastructureErrors > 0) {
    reasons.push("infrastructure errors present");
  }
  const durations = treatment.map((result) => result.totalToDecisionMs);
  const firstFiles = treatment
    .map((result) => result.firstFileClosedMs)
    .filter((value): value is number => value !== null);
  const bytes = treatment.map((result) => result.editableBytes);
  const correctionRate = scheduled.length
    ? treatment.filter((result) => result.calls.correctionCalls > 0).length /
      scheduled.length
    : 0;
  if (treatment.some((result) => result.calls.writerCalls !== 1)) {
    reasons.push("writer call count is not exactly one");
  }
  if (treatment.some((result) => result.calls.criticCalls !== 1)) {
    reasons.push("critic call count is not exactly one");
  }
  if (
    treatment.some((result) => result.calls.correctionCalls > 1) ||
    correctionRate > 0.2
  ) {
    reasons.push("correction budget or rate exceeded");
  }
  if (
    treatment.some(
      (result) => !result.technicalSuccess || result.outcome !== "pass",
    )
  ) {
    reasons.push("technical or outcome failure present");
  }
  const criticalAccessibilityFailures = totalV3(
    treatment,
    "criticalAccessibilityFailures",
  );
  const brokenActionFailures = totalV3(treatment, "brokenActionFailures");
  const fabricatedFactFailures = totalV3(treatment, "fabricatedFactFailures");
  const placeholderMediaFailures = totalV3(
    treatment,
    "placeholderMediaFailures",
  );
  const criticalVisualFindings = treatment.reduce(
    (total, result) => total + result.visualFindings.critical,
    0,
  );
  const highVisualFindings = treatment.reduce(
    (total, result) => total + result.visualFindings.high,
    0,
  );
  if (criticalAccessibilityFailures > 0) {
    reasons.push("critical accessibility failures present");
  }
  if (brokenActionFailures > 0) {
    reasons.push("broken action failures present");
  }
  if (fabricatedFactFailures > 0) {
    reasons.push("fabricated fact failures present");
  }
  if (placeholderMediaFailures > 0) {
    reasons.push("placeholder media failures present");
  }
  if (criticalVisualFindings > 0) {
    reasons.push("critical visual findings present");
  }
  if (highVisualFindings > 0) {
    reasons.push("high visual findings present");
  }
  const totalP50Ms = percentile(durations, 0.5);
  const totalP95Ms = percentile(durations, 0.95);
  const firstFileP50Ms = percentile(firstFiles, 0.5);
  const editableBytesP95 = percentile(bytes, 0.95);
  if (totalP50Ms > 90_000) {
    reasons.push("total decision p50 exceeds 90000ms");
  }
  if (totalP95Ms > 150_000) {
    reasons.push("total decision p95 exceeds 150000ms");
  }
  if (firstFileP50Ms > 45_000) {
    reasons.push("first editable file p50 exceeds 45000ms");
  }
  if (editableBytesP95 > 32 * 1024) {
    reasons.push("editable response p95 exceeds 32768 bytes");
  }

  const preferenceByKey = new Map(
    preferences.map((preference) => [scheduledKey(preference), preference]),
  );
  for (const expected of scheduled) {
    if (!preferenceByKey.has(scheduledKey(expected))) {
      reasons.push(`blind preference missing: ${scheduledKey(expected)}`);
    }
  }
  const preferenceValues = scheduled
    .map((expected) => preferenceByKey.get(scheduledKey(expected)))
    .filter((value): value is BlindPreference => value !== undefined);
  const decisive = preferenceValues.filter((value) => value.choice !== "tie");
  const decisiveTreatmentPreference = decisive.length
    ? decisive.filter((value) => value.choice === "treatment").length /
      decisive.length
    : 0;
  const tieRate = scheduled.length
    ? preferenceValues.filter((value) => value.choice === "tie").length /
      scheduled.length
    : 0;
  if (preferenceValues.length !== scheduled.length) {
    reasons.push("blind preference input missing");
  }
  if (decisiveTreatmentPreference < 0.75) {
    reasons.push("decisive treatment preference below 0.75");
  }
  if (tieRate > 0.25) {
    reasons.push("blind preference ties exceed 0.25");
  }

  for (const entry of manifest.cases) {
    const caseTrials = treatment.filter(
      (result) => result.briefId === entry.briefId,
    );
    if (
      caseTrials.length === 2 &&
      caseTrials.every((result) => result.outcome !== "pass")
    ) {
      reasons.push(`case loses both treatment trials: ${entry.briefId}`);
    }
  }
  const kitIds = new Set(treatment.map((result) => result.kitId));
  for (const kit of [
    "editorial-airy",
    "menu-led-editorial",
    "catalog-story",
    "warm-commerce",
    "bold-typographic",
  ] as const) {
    if (!kitIds.has(kit)) {
      reasons.push(`kit lacks conformance case: ${kit}`);
    }
  }
  const patternCounts = new Map<string, number>();
  for (const result of treatment) {
    if (result.compositionPatternId) {
      patternCounts.set(
        result.compositionPatternId,
        (patternCounts.get(result.compositionPatternId) ?? 0) + 1,
      );
    }
  }
  for (const [pattern, count] of patternCounts) {
    if (count / Math.max(1, treatment.length) > 0.5) {
      reasons.push(`composition pattern overused: ${pattern}`);
    }
  }

  return {
    schemaVersion: 3,
    baselineId: manifest.baselineId,
    corpusVersion: manifest.corpusVersion,
    evaluatorVersion: manifest.evaluatorVersion,
    scheduledTreatmentTrials: scheduled.length,
    completedTreatmentTrials: treatment.length,
    metrics: {
      totalP50Ms,
      totalP95Ms,
      firstFileP50Ms,
      editableBytesP95,
      correctionRate,
      decisiveTreatmentPreference,
      tieRate,
      infrastructureErrors,
      criticalAccessibilityFailures,
      brokenActionFailures,
      fabricatedFactFailures,
      placeholderMediaFailures,
      criticalVisualFindings,
      highVisualFindings,
    },
    release: { pass: reasons.length === 0, reasons: [...new Set(reasons)] },
  };
}

function totalV3(
  results: GeneratedSiteEvaluationTrialV3[],
  key:
    | "criticalAccessibilityFailures"
    | "brokenActionFailures"
    | "fabricatedFactFailures"
    | "placeholderMediaFailures",
): number {
  return results.reduce((total, result) => total + result[key], 0);
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(sorted.length * fraction) - 1),
    )
  ];
}

function duplicateKeys(
  results: Array<{ briefId: string; trial: 1 | 2 }>,
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const result of results) {
    const key = scheduledKey(result);
    if (seen.has(key)) {
      duplicates.add(key);
    }
    seen.add(key);
  }
  return [...duplicates];
}
