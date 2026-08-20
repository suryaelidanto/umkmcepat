// src/lib/projects/generation-evaluation.ts

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

export type GeneratedSiteEvaluationManifestV4 = {
  schemaVersion: 4;
  baselineId: "deterministic-control-v1";
  treatmentId: "professional-static-v3";
  corpusVersion: string;
  evaluatorVersion: string;
  cases: Array<{
    briefId: string;
    fixture: string;
    expectedRouteCount: 1 | 2 | 3;
    expectedKitIds: GeneratedSiteDesignKitId[];
    trials: [1, 2];
  }>;
};

export type GeneratedSiteEvaluationTrialV4 = {
  runId: string;
  arm: "deterministic-control-v1" | "professional-static-v3";
  briefId: string;
  trial: 1 | 2;
  outcome: GenerationTrialOutcome;
  routeCount: number;
  kitId: GeneratedSiteDesignKitId | "control";
  calls: GeneratedSiteCallBudgetSnapshot;
  totalToDecisionMs: number;
  firstFileClosedMs: number | null;
  editableBytes: number;
  hardFailures: {
    fact: number;
    action: number;
    media: number;
    accessibility: number;
    route: number;
    contract: number;
  };
  professionalVisual: "pass" | "fail" | "unknown" | "not_run";
  minimumProfessionalRating: number | null;
  categoryRatings: Partial<Record<ProfessionalReviewCategoryV4, number>>;
  routePatternIds: string[];
  desktopEvidenceRefs: string[];
  mobileEvidenceRefs: string[];
};

export type ProfessionalReviewCategoryV4 =
  | "business_specificity"
  | "first_view_hierarchy"
  | "content_architecture"
  | "composition_rhythm"
  | "typography"
  | "color_system"
  | "media_integrity"
  | "mobile_quality"
  | "professional_finish";

export type BlindPreferenceV2 = {
  briefId: string;
  trial: 1 | 2;
  choice: "control" | "treatment" | "tie";
  controlReady: boolean;
  treatmentReady: boolean;
};

export type GeneratedSiteEvaluationReportV4 = {
  schemaVersion: 4;
  baselineId: "deterministic-control-v1";
  treatmentId: "professional-static-v3";
  corpusVersion: string;
  evaluatorVersion: string;
  scheduledTreatmentTrials: number;
  completedTreatmentTrials: number;
  metrics: {
    totalP50Ms: number;
    totalP95Ms: number;
    firstFileP50Ms: number;
    singlePageEditableBytesP95: number;
    multiPageEditableBytesMax: number;
    correctionRate: number;
    decisiveTreatmentPreference: number;
    tieRate: number;
    treatmentReadyRate: number;
    infrastructureErrors: number;
    hardFailures: GeneratedSiteEvaluationTrialV4["hardFailures"];
    professionalVisualFailures: number;
    minimumProfessionalRating: number | null;
    multiRoutePassingCases: number;
  };
  release: { pass: boolean; reasons: string[] };
};

export function trialFromProfessionalResult(input: {
  runId: string;
  arm: GeneratedSiteEvaluationTrialV4["arm"];
  briefId: string;
  trial: 1 | 2;
  result: {
    ok: boolean;
    proof: {
      outcome: GenerationTrialOutcome;
      kitId: GeneratedSiteEvaluationTrialV4["kitId"];
      calls: GeneratedSiteCallBudgetSnapshot;
      output: {
        routeCount: number;
        editableBytes: number;
        firstFileClosedMs: number | null;
      };
      timingsMs: { totalToDecision: number };
      hardFailures: GeneratedSiteEvaluationTrialV4["hardFailures"];
      gates: {
        professionalVisual: GeneratedSiteEvaluationTrialV4["professionalVisual"];
      };
      professional: {
        minimumRating: number | null;
        categoryRatings: Partial<Record<ProfessionalReviewCategoryV4, number>>;
      };
    };
  };
  routePatternIds: string[];
  desktopEvidenceRefs: string[];
  mobileEvidenceRefs: string[];
}): GeneratedSiteEvaluationTrialV4 {
  return {
    runId: input.runId,
    arm: input.arm,
    briefId: input.briefId,
    trial: input.trial,
    outcome: input.result.proof.outcome,
    routeCount: input.result.proof.output.routeCount,
    kitId: input.result.proof.kitId,
    calls: input.result.proof.calls,
    totalToDecisionMs: input.result.proof.timingsMs.totalToDecision,
    firstFileClosedMs: input.result.proof.output.firstFileClosedMs,
    editableBytes: input.result.proof.output.editableBytes,
    hardFailures: { ...input.result.proof.hardFailures },
    professionalVisual: input.result.proof.gates.professionalVisual,
    minimumProfessionalRating: input.result.proof.professional.minimumRating,
    categoryRatings: { ...input.result.proof.professional.categoryRatings },
    routePatternIds: [...input.routePatternIds],
    desktopEvidenceRefs: [...input.desktopEvidenceRefs],
    mobileEvidenceRefs: [...input.mobileEvidenceRefs],
  };
}

export function buildGeneratedSiteEvaluationReportV4(
  manifest: GeneratedSiteEvaluationManifestV4,
  results: GeneratedSiteEvaluationTrialV4[],
  preferences: BlindPreferenceV2[] = [],
): GeneratedSiteEvaluationReportV4 {
  const scheduled = manifest.cases.flatMap((entry) =>
    entry.trials.map((trial) => ({ briefId: entry.briefId, trial })),
  );
  const expected = new Set(scheduled.map(scheduledKey));
  const treatment = results.filter(
    (result) => result.arm === "professional-static-v3",
  );
  const controls = results.filter(
    (result) => result.arm === "deterministic-control-v1",
  );
  const reasons: string[] = [];
  const treatmentByKey = new Map(
    treatment.map((result) => [scheduledKey(result), result]),
  );
  const controlByKey = new Map(
    controls.map((result) => [scheduledKey(result), result]),
  );
  for (const key of expected) {
    if (!treatmentByKey.has(key)) {
      reasons.push(`missing treatment trial: ${key}`);
    }
    if (!controlByKey.has(key)) {
      reasons.push(`missing control trial: ${key}`);
    }
  }
  for (const result of results) {
    if (!expected.has(scheduledKey(result))) {
      reasons.push(`unexpected trial: ${scheduledKey(result)}`);
    }
  }
  if (duplicateKeys(treatment).length > 0) {
    reasons.push("duplicate treatment trial");
  }
  if (duplicateKeys(controls).length > 0) {
    reasons.push("duplicate control trial");
  }
  if (treatment.length !== scheduled.length) {
    reasons.push(`expected ${scheduled.length} treatment trials`);
  }
  if (controls.length !== scheduled.length) {
    reasons.push(`expected ${scheduled.length} control trials`);
  }
  if (controls.some((result) => result.outcome !== "pass")) {
    reasons.push("control outcome failure present");
  }
  for (const entry of manifest.cases) {
    const caseTrials = treatment.filter(
      (result) => result.briefId === entry.briefId,
    );
    for (const result of caseTrials) {
      if (result.routeCount !== entry.expectedRouteCount) {
        reasons.push(`route count mismatch: ${entry.briefId}`);
      }
      if (
        result.kitId === "control" ||
        !entry.expectedKitIds.includes(result.kitId)
      ) {
        reasons.push(`kit mismatch: ${entry.briefId}`);
      }
    }
  }
  const infrastructureErrors = treatment.filter(
    (result) => result.outcome === "infrastructure_error",
  ).length;
  if (infrastructureErrors > 0) {
    reasons.push("infrastructure errors present");
  }
  if (treatment.some((result) => result.outcome !== "pass")) {
    reasons.push("treatment outcome failure present");
  }
  if (
    treatment.some(
      (result) =>
        result.calls.writerCalls !== 1 || result.calls.criticCalls !== 1,
    )
  ) {
    reasons.push("writer/critic call count is not exactly one");
  }
  const correctionRate = scheduled.length
    ? treatment.filter((result) => result.calls.correctionCalls > 0).length /
      scheduled.length
    : 0;
  if (
    treatment.some((result) => result.calls.correctionCalls > 1) ||
    correctionRate > 0.2
  ) {
    reasons.push("correction count/rate exceeds the release budget");
  }
  const hardFailureKeys = [
    "fact",
    "action",
    "media",
    "accessibility",
    "route",
    "contract",
  ] as const;
  const hardFailures = Object.fromEntries(
    hardFailureKeys.map((key) => [
      key,
      treatment.reduce((total, result) => total + result.hardFailures[key], 0),
    ]),
  ) as GeneratedSiteEvaluationTrialV4["hardFailures"];
  if (Object.values(hardFailures).some((count) => count > 0)) {
    reasons.push(
      "hard fact/action/media/accessibility/route/contract failure present",
    );
  }
  const professionalVisualFailures = treatment.filter(
    (result) => result.professionalVisual !== "pass",
  ).length;
  if (professionalVisualFailures > 0) {
    reasons.push("professional visual status is not pass");
  }
  const categories: ProfessionalReviewCategoryV4[] = [
    "business_specificity",
    "first_view_hierarchy",
    "content_architecture",
    "composition_rhythm",
    "typography",
    "color_system",
    "media_integrity",
    "mobile_quality",
    "professional_finish",
  ];
  for (const result of treatment) {
    if (
      result.minimumProfessionalRating === null ||
      result.minimumProfessionalRating < 3
    ) {
      reasons.push("professional minimum rating below 3");
      break;
    }
    if (
      categories.some((category) => {
        const rating = result.categoryRatings[category];
        return rating === undefined || rating < 3;
      })
    ) {
      reasons.push("professional category rating missing or below 3");
      break;
    }
  }
  const durations = treatment.map((result) => result.totalToDecisionMs);
  const firstFiles = treatment
    .map((result) => result.firstFileClosedMs)
    .filter((value): value is number => value !== null);
  const singlePageBytes = treatment
    .filter((result) => result.routeCount === 1)
    .map((result) => result.editableBytes);
  const multiPageBytes = treatment
    .filter((result) => result.routeCount > 1)
    .map((result) => result.editableBytes);
  const totalP50Ms = percentile(durations, 0.5);
  const totalP95Ms = percentile(durations, 0.95);
  const firstFileP50Ms = percentile(firstFiles, 0.5);
  const singlePageEditableBytesP95 = percentile(singlePageBytes, 0.95);
  const multiPageEditableBytesMax = multiPageBytes.length
    ? Math.max(...multiPageBytes)
    : 0;
  if (totalP50Ms > 90_000) {
    reasons.push("total decision p50 exceeds 90000ms");
  }
  if (totalP95Ms > 150_000) {
    reasons.push("total decision p95 exceeds 150000ms");
  }
  if (firstFileP50Ms > 45_000) {
    reasons.push("first editable file p50 exceeds 45000ms");
  }
  if (singlePageEditableBytesP95 > 32 * 1024) {
    reasons.push("single-page editable p95 exceeds 32768 bytes");
  }
  if (multiPageEditableBytesMax > 48 * 1024) {
    reasons.push("multi-page editable output exceeds 49152 bytes");
  }
  const expectedKitIds = new Set(
    manifest.cases.flatMap((entry) => entry.expectedKitIds),
  );
  for (const kitId of expectedKitIds) {
    if (!treatment.some((result) => result.kitId === kitId)) {
      reasons.push(`kit lacks conformance case: ${kitId}`);
    }
  }
  const multiRouteCases = new Set(
    treatment
      .filter((result) => result.outcome === "pass" && result.routeCount > 1)
      .map((result) => result.briefId),
  );
  if (multiRouteCases.size < 2) {
    reasons.push("fewer than two multi-route passing cases");
  }
  const patternCounts = new Map<string, number>();
  const routeDenominator = treatment.reduce(
    (total, result) => total + result.routeCount,
    0,
  );
  for (const result of treatment) {
    for (const pattern of result.routePatternIds) {
      patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1);
    }
  }
  for (const [pattern, count] of patternCounts) {
    if (count / Math.max(1, routeDenominator) > 0.5) {
      reasons.push(`composition pattern overused: ${pattern}`);
    }
  }
  const preferenceByKey = new Map(
    preferences.map((preference) => [scheduledKey(preference), preference]),
  );
  if (preferenceByKey.size !== preferences.length) {
    reasons.push("duplicate blind preference");
  }
  if (
    preferences.some((preference) => !expected.has(scheduledKey(preference)))
  ) {
    reasons.push("unexpected blind preference");
  }
  const normalizedPreferences = scheduled
    .map((entry) => preferenceByKey.get(scheduledKey(entry)))
    .filter((value): value is BlindPreferenceV2 => value !== undefined);
  if (normalizedPreferences.length !== scheduled.length) {
    reasons.push("blind preference input missing");
  }
  const decisive = normalizedPreferences.filter(
    (preference) => preference.choice !== "tie",
  );
  const decisiveTreatmentPreference = decisive.length
    ? decisive.filter((preference) => preference.choice === "treatment")
        .length / decisive.length
    : 0;
  const tieRate = scheduled.length
    ? normalizedPreferences.filter((preference) => preference.choice === "tie")
        .length / scheduled.length
    : 0;
  const treatmentReadyRate = normalizedPreferences.length
    ? normalizedPreferences.filter((preference) => preference.treatmentReady)
        .length / normalizedPreferences.length
    : 0;
  if (decisiveTreatmentPreference < 0.75) {
    reasons.push("decisive treatment preference below 0.75");
  }
  if (tieRate > 0.25) {
    reasons.push("blind preference ties exceed 0.25");
  }
  if (treatmentReadyRate < 0.9) {
    reasons.push("treatment readiness below 0.90");
  }
  for (const entry of manifest.cases) {
    const casePreferences = normalizedPreferences.filter(
      (preference) => preference.briefId === entry.briefId,
    );
    if (
      casePreferences.length === 2 &&
      casePreferences.every((preference) => !preference.treatmentReady)
    ) {
      reasons.push(`case loses both treatment trials: ${entry.briefId}`);
    }
  }
  const minimumProfessionalRating = treatment.length
    ? Math.min(
        ...treatment.map((result) => result.minimumProfessionalRating ?? 0),
      )
    : null;
  return {
    schemaVersion: 4,
    baselineId: manifest.baselineId,
    treatmentId: manifest.treatmentId,
    corpusVersion: manifest.corpusVersion,
    evaluatorVersion: manifest.evaluatorVersion,
    scheduledTreatmentTrials: scheduled.length,
    completedTreatmentTrials: treatment.length,
    metrics: {
      totalP50Ms,
      totalP95Ms,
      firstFileP50Ms,
      singlePageEditableBytesP95,
      multiPageEditableBytesMax,
      correctionRate,
      decisiveTreatmentPreference,
      tieRate,
      treatmentReadyRate,
      infrastructureErrors,
      hardFailures,
      professionalVisualFailures,
      minimumProfessionalRating,
      multiRoutePassingCases: multiRouteCases.size,
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

export const GENERATION_TRIAL_DIAGNOSTIC_MESSAGE_LIMIT = 200;

export type GenerationTrialDiagnostic = {
  briefId: string;
  trial: 1 | 2;
  arm: GeneratedSiteEvaluationTrialV4["arm"];
  outcome: GenerationTrialOutcome;
  failureClass: string | null;
  safeMessage: string;
  gates: Record<string, string>;
  calls: GeneratedSiteCallBudgetSnapshot;
};

export function summarizeGenerationTrialDiagnostics(input: {
  briefId: string;
  trial: 1 | 2;
  arm: GeneratedSiteEvaluationTrialV4["arm"];
  outcome: GenerationTrialOutcome;
  failureClass: string | null;
  safeMessage: string | null;
  gates: Record<string, string>;
  calls: GeneratedSiteCallBudgetSnapshot;
}): GenerationTrialDiagnostic {
  return {
    briefId: input.briefId,
    trial: input.trial,
    arm: input.arm,
    outcome: input.outcome,
    failureClass: input.failureClass,
    safeMessage: (input.safeMessage ?? "")
      .replaceAll(/\s+/gu, " ")
      .trim()
      .slice(0, GENERATION_TRIAL_DIAGNOSTIC_MESSAGE_LIMIT),
    gates: { ...input.gates },
    calls: { ...input.calls },
  };
}
