import releaseManifestJson from "./outcome-generation-release.json";

export const OUTCOME_RELEASE_THRESHOLDS = {
  completedTreatmentTrials: 40,
  readyToPublishRate: 0.9,
  businessSpecificRate: 0.9,
  maximumTemplateRecognitionRate: 0.1,
  decisivePreferenceRate: 0.75,
  maximumCriticFalseReadyRate: 0.05,
  acceptedHardFailures: 0,
  corpusCaseCount: 20,
} as const;

export type OutcomeGenerationReleaseManifestV1 = {
  schemaVersion: 1;
  approved: boolean;
  contractVersion: 1;
  directionPromptVersion: "outcome-direction-v1";
  buildPromptVersion: "outcome-build-v1";
  reviewPromptVersion: "outcome-review-v1";
  allowedWriterModelIds: string[];
  allowedReviewerModelIds: string[];
  ownerApprovedAt: string | null;
};

export const OUTCOME_GENERATION_RELEASE_MANIFEST =
  releaseManifestJson as OutcomeGenerationReleaseManifestV1;

export type OutcomeGenerationReleaseEvidence = {
  completedTreatmentTrials: number;
  readyToPublishRate: number;
  businessSpecificRate: number;
  templateRecognitionRate: number;
  decisivePreferenceRate: number;
  criticFalseReadyRate: number;
  hardFailures: number;
  corpusCaseCount: number;
  corpusCoverageComplete: boolean;
};

type EvidenceField = keyof OutcomeGenerationReleaseEvidence;

export function evaluateOutcomeGenerationRelease(
  evidence: OutcomeGenerationReleaseEvidence,
): { ok: boolean; failures: EvidenceField[] } {
  const failures: EvidenceField[] = [];
  const minimums: Array<[EvidenceField, number, number]> = [
    [
      "completedTreatmentTrials",
      evidence.completedTreatmentTrials,
      OUTCOME_RELEASE_THRESHOLDS.completedTreatmentTrials,
    ],
    [
      "readyToPublishRate",
      evidence.readyToPublishRate,
      OUTCOME_RELEASE_THRESHOLDS.readyToPublishRate,
    ],
    [
      "businessSpecificRate",
      evidence.businessSpecificRate,
      OUTCOME_RELEASE_THRESHOLDS.businessSpecificRate,
    ],
    [
      "decisivePreferenceRate",
      evidence.decisivePreferenceRate,
      OUTCOME_RELEASE_THRESHOLDS.decisivePreferenceRate,
    ],
    [
      "corpusCaseCount",
      evidence.corpusCaseCount,
      OUTCOME_RELEASE_THRESHOLDS.corpusCaseCount,
    ],
  ];
  for (const [field, actual, minimum] of minimums) {
    if (actual < minimum) {
      failures.push(field);
    }
  }

  if (
    evidence.templateRecognitionRate >
    OUTCOME_RELEASE_THRESHOLDS.maximumTemplateRecognitionRate
  ) {
    failures.push("templateRecognitionRate");
  }
  if (
    evidence.criticFalseReadyRate >
    OUTCOME_RELEASE_THRESHOLDS.maximumCriticFalseReadyRate
  ) {
    failures.push("criticFalseReadyRate");
  }
  if (evidence.hardFailures > OUTCOME_RELEASE_THRESHOLDS.acceptedHardFailures) {
    failures.push("hardFailures");
  }
  if (!evidence.corpusCoverageComplete) {
    failures.push("corpusCoverageComplete");
  }

  return { ok: failures.length === 0, failures };
}

export function assertOutcomeGenerationReleaseAuthority(input: {
  manifest: OutcomeGenerationReleaseManifestV1;
  evidence: OutcomeGenerationReleaseEvidence;
  contractVersion: 1;
  directionPromptVersion: "outcome-direction-v1";
  buildPromptVersion: "outcome-build-v1";
  reviewPromptVersion: "outcome-review-v1";
  writerModelId: string;
  reviewerModelId: string;
}): void {
  const { manifest } = input;
  if (!manifest.approved || !manifest.ownerApprovedAt) {
    throw new Error("Outcome generation release is not approved.");
  }
  if (
    manifest.contractVersion !== input.contractVersion ||
    manifest.directionPromptVersion !== input.directionPromptVersion ||
    manifest.buildPromptVersion !== input.buildPromptVersion ||
    manifest.reviewPromptVersion !== input.reviewPromptVersion
  ) {
    throw new Error("Outcome generation release version does not match.");
  }
  if (
    !manifest.allowedWriterModelIds.includes(input.writerModelId) ||
    !manifest.allowedReviewerModelIds.includes(input.reviewerModelId)
  ) {
    throw new Error("Outcome generation served model is not approved.");
  }

  const evaluation = evaluateOutcomeGenerationRelease(input.evidence);
  if (!evaluation.ok) {
    throw new Error(
      `Outcome generation release evidence failed: ${evaluation.failures.join(", ")}`,
    );
  }
}
