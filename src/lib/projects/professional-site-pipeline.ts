import { createHash } from "node:crypto";

import {
  classifyProfessionalBrowserReport,
  type BrowserGateReportV2,
} from "./browser-gates";
import { GeneratedSiteCallBudget as SiteCallBudget } from "./generated-site-call-budget";
import {
  evaluateProfessionalSiteReleaseEligibility,
  type ProfessionalCalibrationSummaryV1,
  type ProfessionalSiteReleaseManifestV1,
} from "./professional-site-calibration";
import {
  deriveProfessionalReviewVerdict,
  type GeneratedSiteProfessionalReviewV1,
} from "./professional-site-critic";
import {
  createEmptyGeneratedSiteQualityProofV3,
  sanitizeGeneratedSiteQualityProofV3,
  type GeneratedSiteQualityProofV3,
} from "./professional-site-quality-proof";

import type { GeneratedSiteCallBudget } from "./generated-site-call-budget";
import type { GeneratedSiteWriterContractV3 } from "./generated-site-contract";
import type {
  GeneratedDistFile,
  GeneratedProjectFile,
} from "./generated-types";
import type { ProfessionalSiteBlueprintV1 } from "./professional-site-blueprint";
import type { GeneratedSiteDesignKitV2 } from "./professional-site-kits";
import type { WriterDesignPlanV3 } from "./professional-site-plan";
import type { ProfessionalSiteGenerateResult } from "./professional-site-writer";

export type ProfessionalCorrectionReason =
  "transport" | "response_contract" | "source_gate" | "build" | "browser";

export type ProfessionalSitePipelineScreenshot = {
  route: string;
  viewport: "mobile" | "desktop";
  bytes: Uint8Array;
};

export type RunProfessionalSitePipelineInput = {
  mode: "calibration" | "selection";
  releaseManifest: ProfessionalSiteReleaseManifestV1;
  calibrationSummary: ProfessionalCalibrationSummaryV1;
  requestedModelId: string;
  projectId: string;
  userId: string;
  attemptId: string;
  buildId: string | null;
};

export type ProfessionalSitePipelineDeps = {
  deriveSelectionInput: () => unknown | Promise<unknown>;
  selectKit: (selectionInput: unknown) => GeneratedSiteDesignKitV2;
  compileContract: (input: {
    selectionInput: unknown;
    kit: GeneratedSiteDesignKitV2;
  }) => GeneratedSiteWriterContractV3;
  compileBlueprint: (input: {
    contract: GeneratedSiteWriterContractV3;
    kit: GeneratedSiteDesignKitV2;
  }) => ProfessionalSiteBlueprintV1;
  runWriter: (input: {
    contract: GeneratedSiteWriterContractV3;
    blueprint: ProfessionalSiteBlueprintV1;
    kit: GeneratedSiteDesignKitV2;
    projectId: string;
    userId: string;
    attemptId: string;
    buildId: string | null;
    budget: GeneratedSiteCallBudget;
  }) => Promise<ProfessionalSiteGenerateResult>;
  runCorrection: (input: {
    reason: ProfessionalCorrectionReason;
    contract: GeneratedSiteWriterContractV3;
    blueprint: ProfessionalSiteBlueprintV1;
    kit: GeneratedSiteDesignKitV2;
    plan: WriterDesignPlanV3;
    files: GeneratedProjectFile[];
    projectId: string;
    userId: string;
    attemptId: string;
    buildId: string | null;
    budget: GeneratedSiteCallBudget;
  }) => Promise<ProfessionalSiteGenerateResult>;
  build: (
    files: GeneratedProjectFile[],
    projectId: string,
  ) => Promise<{
    ok: boolean;
    distFiles: GeneratedDistFile[];
    log: string;
  }>;
  runBrowser: (input: {
    files: GeneratedDistFile[];
    contract: GeneratedSiteWriterContractV3;
    blueprint: ProfessionalSiteBlueprintV1;
    projectId: string;
    candidateId: string;
  }) => Promise<BrowserGateReportV2>;
  loadEvidence: (
    report: BrowserGateReportV2,
  ) => Promise<ProfessionalSitePipelineScreenshot[]>;
  review: (input: {
    contract: GeneratedSiteWriterContractV3;
    blueprint: ProfessionalSiteBlueprintV1;
    plan: WriterDesignPlanV3;
    kit: GeneratedSiteDesignKitV2;
    sourceReport: NonNullable<
      Extract<ProfessionalSiteGenerateResult, { ok: true }>["sourceReport"]
    >;
    browserReport: BrowserGateReportV2;
    screenshots: ProfessionalSitePipelineScreenshot[];
    budget: GeneratedSiteCallBudget;
  }) => Promise<GeneratedSiteProfessionalReviewV1>;
  now: () => number;
};

export type RunProfessionalSitePipelineResult =
  | {
      ok: true;
      files: GeneratedProjectFile[];
      distFiles: GeneratedDistFile[];
      contract: GeneratedSiteWriterContractV3;
      blueprint: ProfessionalSiteBlueprintV1;
      plan: WriterDesignPlanV3;
      sourceReport: NonNullable<
        Extract<ProfessionalSiteGenerateResult, { ok: true }>["sourceReport"]
      >;
      browserReport: BrowserGateReportV2;
      review: Extract<
        GeneratedSiteProfessionalReviewV1,
        { status: "complete" }
      >;
      proof: GeneratedSiteQualityProofV3;
    }
  | {
      ok: false;
      failureClass: string;
      safeMessage: string;
      stagedFiles: GeneratedProjectFile[];
      proof: GeneratedSiteQualityProofV3;
    };

export async function runProfessionalSitePipeline(
  input: RunProfessionalSitePipelineInput,
  deps: ProfessionalSitePipelineDeps,
): Promise<RunProfessionalSitePipelineResult> {
  const budget = new SiteCallBudget();
  if (input.mode === "selection") {
    const preflight = evaluateProfessionalSiteReleaseEligibility({
      manifest: input.releaseManifest,
      summary: input.calibrationSummary,
      requestedModelId: input.requestedModelId,
      writerModelIds: input.releaseManifest.allowedWriterModelIds,
      criticModelIds: input.releaseManifest.allowedCriticModelIds,
      promptVersion: input.releaseManifest.criticPromptVersion,
      kitVersion: input.releaseManifest.kitVersion,
      evaluatorVersion: input.releaseManifest.evaluatorVersion,
      corpusVersion: input.releaseManifest.corpusVersion,
    });
    if (!preflight.eligibleForSelection) {
      return failedResult(
        createEmptyGeneratedSiteQualityProofV3({
          contractHash: "unavailable",
          blueprintHash: "unavailable",
          kitId: "bold-typographic",
          mediaMode: "typographic",
        }),
        "release_authority",
        preflight.reasons.join("; "),
        [],
      );
    }
  }

  let selectionInput: unknown;
  let kit: GeneratedSiteDesignKitV2;
  let contract: GeneratedSiteWriterContractV3;
  let blueprint: ProfessionalSiteBlueprintV1;
  try {
    selectionInput = await deps.deriveSelectionInput();
    kit = deps.selectKit(selectionInput);
    contract = deps.compileContract({ selectionInput, kit });
    blueprint = deps.compileBlueprint({ contract, kit });
  } catch (error) {
    return failedResult(
      createEmptyGeneratedSiteQualityProofV3({
        contractHash: "unavailable",
        blueprintHash: "unavailable",
        kitId: "bold-typographic",
        mediaMode: "typographic",
      }),
      "contract",
      safeMessage(error, "professional contract compilation failed"),
      [],
    );
  }

  let candidate: Extract<ProfessionalSiteGenerateResult, { ok: true }> | null =
    null;
  let writerRequested = input.requestedModelId;
  let writerServed: string | null = null;
  let stagedFiles: GeneratedProjectFile[] = [];
  let writerFailure: Extract<
    ProfessionalSiteGenerateResult,
    { ok: false }
  > | null = null;
  try {
    const writerResult = await deps.runWriter({
      contract,
      blueprint,
      kit,
      projectId: input.projectId,
      userId: input.userId,
      attemptId: input.attemptId,
      buildId: input.buildId,
      budget,
    });
    ensureWriterConsumed(budget);
    stagedFiles = writerResult.ok
      ? writerResult.files
      : writerResult.stagedFiles;
    writerRequested = writerResult.modelRequested;
    writerServed = writerResult.modelServed;
    if (writerResult.ok) {
      candidate = writerResult;
    } else {
      writerFailure = writerResult;
    }
  } catch (error) {
    ensureWriterConsumed(budget);
    writerRequested = input.requestedModelId;
    writerServed = null;
    writerFailure = {
      ok: false,
      reason: safeMessage(error, "professional writer failed"),
      stagedFiles,
      plan: null,
      sourceReport: null,
      modelRequested: input.requestedModelId,
      modelServed: null,
      writerMs: 0,
      firstFileClosedMs: null,
      editableBytes: 0,
    };
  }

  let correctionRequested: string | null = null;
  let correctionServed: string | null = null;
  let correctionReason: ProfessionalCorrectionReason | null = null;
  const correct = async (
    reason: ProfessionalCorrectionReason,
    current: Extract<ProfessionalSiteGenerateResult, { ok: false }> | null,
  ): Promise<boolean> => {
    if (budget.snapshot().correctionCalls === 1 || !current?.plan) {
      return false;
    }
    correctionReason = reason;
    let corrected: ProfessionalSiteGenerateResult;
    try {
      corrected = await deps.runCorrection({
        reason,
        contract,
        blueprint,
        kit,
        plan: current.plan,
        files: current.stagedFiles,
        projectId: input.projectId,
        userId: input.userId,
        attemptId: input.attemptId,
        buildId: input.buildId,
        budget,
      });
    } catch {
      ensureCorrectionConsumed(budget, reason);
      return false;
    }
    ensureCorrectionConsumed(budget, reason);
    correctionRequested = corrected.modelRequested;
    correctionServed = corrected.modelServed;
    stagedFiles = corrected.ok ? corrected.files : corrected.stagedFiles;
    if (!corrected.ok) {
      return false;
    }
    candidate = corrected;
    writerFailure = null;
    return true;
  };

  if (!candidate) {
    const reason =
      writerFailure?.sourceReport?.status === "fail"
        ? "source_gate"
        : "response_contract";
    if (!(await correct(reason, writerFailure))) {
      return failureFromCandidate({
        contract,
        blueprint,
        kit,
        budget,
        candidate,
        writerFailure,
        correctionReason,
        correctionRequested,
        correctionServed,
        failureClass: "writer",
        safeMessage:
          writerFailure?.reason ?? "professional writer did not qualify",
      });
    }
  }

  if (!candidate) {
    return failureFromCandidate({
      contract,
      blueprint,
      kit,
      budget,
      candidate,
      writerFailure,
      correctionReason,
      correctionRequested,
      correctionServed,
      failureClass: "writer",
      safeMessage: "professional writer did not produce a candidate",
    });
  }
  if (candidate.sourceReport.status === "fail") {
    const failedCandidate = asFailedCandidate(
      candidate,
      "professional source gate failed",
      candidate.sourceReport.findings.map((finding) => finding.code).join(", "),
    );
    if (!(await correct("source_gate", failedCandidate)) || !candidate) {
      return failureFromCandidate({
        contract,
        blueprint,
        kit,
        budget,
        candidate,
        writerFailure: failedCandidate,
        correctionReason,
        correctionRequested,
        correctionServed,
        failureClass: "source_gate",
        safeMessage: "professional source gate failed",
      });
    }
  }

  let build = await deps.build(candidate.files, input.projectId);
  if (!build.ok) {
    const failedCandidate = asFailedCandidate(
      candidate,
      "professional build failed",
      build.log,
    );
    if (!(await correct("build", failedCandidate)) || !candidate) {
      return failureFromCandidate({
        contract,
        blueprint,
        kit,
        budget,
        candidate,
        writerFailure: failedCandidate,
        correctionReason,
        correctionRequested,
        correctionServed,
        failureClass: "build",
        safeMessage: build.log || "professional build failed",
      });
    }
    build = await deps.build(candidate.files, input.projectId);
    if (!build.ok) {
      return failureFromCandidate({
        contract,
        blueprint,
        kit,
        budget,
        candidate,
        writerFailure: asFailedCandidate(
          candidate,
          "professional correction build failed",
          build.log,
        ),
        correctionReason,
        correctionRequested,
        correctionServed,
        failureClass: "build",
        safeMessage: build.log || "professional correction build failed",
      });
    }
  }

  let browser = await deps.runBrowser({
    files: build.distFiles,
    contract,
    blueprint,
    projectId: input.projectId,
    candidateId: input.attemptId,
  });
  if (browser.status === "infrastructure_error") {
    return failureFromCandidate({
      contract,
      blueprint,
      kit,
      budget,
      candidate,
      writerFailure: null,
      correctionReason,
      correctionRequested,
      correctionServed,
      browser,
      failureClass: "browser_infrastructure",
      safeMessage: "professional browser qualification infrastructure failed",
    });
  }
  if (
    classifyProfessionalBrowserReport(
      browser,
      blueprint.routes.map((route) => route.path),
    ) !== "pass"
  ) {
    const failedCandidate = asFailedCandidate(
      candidate,
      "professional browser qualification failed",
      "browser assertions failed",
    );
    if (!(await correct("browser", failedCandidate)) || !candidate) {
      return failureFromCandidate({
        contract,
        blueprint,
        kit,
        budget,
        candidate,
        writerFailure: failedCandidate,
        correctionReason,
        correctionRequested,
        correctionServed,
        browser,
        failureClass: "browser",
        safeMessage: "professional browser qualification failed",
      });
    }
    build = await deps.build(candidate.files, input.projectId);
    if (!build.ok) {
      return failureFromCandidate({
        contract,
        blueprint,
        kit,
        budget,
        candidate,
        writerFailure: asFailedCandidate(
          candidate,
          "professional browser correction build failed",
          build.log,
        ),
        correctionReason,
        correctionRequested,
        correctionServed,
        browser,
        failureClass: "build",
        safeMessage:
          build.log || "professional browser correction build failed",
      });
    }
    browser = await deps.runBrowser({
      files: build.distFiles,
      contract,
      blueprint,
      projectId: input.projectId,
      candidateId: input.attemptId,
    });
    if (
      browser.status !== "pass" ||
      classifyProfessionalBrowserReport(
        browser,
        blueprint.routes.map((route) => route.path),
      ) !== "pass"
    ) {
      return failureFromCandidate({
        contract,
        blueprint,
        kit,
        budget,
        candidate,
        writerFailure: null,
        correctionReason,
        correctionRequested,
        correctionServed,
        browser,
        failureClass:
          browser.status === "infrastructure_error"
            ? "browser_infrastructure"
            : "browser",
        safeMessage: "professional browser correction failed",
      });
    }
  }

  const screenshots = await deps.loadEvidence(browser);
  let review: GeneratedSiteProfessionalReviewV1;
  try {
    review = await deps.review({
      contract,
      blueprint,
      plan: candidate.plan,
      kit,
      sourceReport: candidate.sourceReport,
      browserReport: browser,
      screenshots,
      budget,
    });
  } catch {
    ensureCriticConsumed(budget);
    review = {
      status: "unknown",
      reason: "transport",
      requestedModel: input.requestedModelId,
      servedModel: null,
    };
  }
  ensureCriticConsumed(budget);
  const proofBase = buildProof({
    contract,
    blueprint,
    kit,
    candidate,
    browser,
    review,
    budget,
    correctionReason,
    correctionRequested,
    correctionServed,
    writerRequested,
    writerServed,
  });
  if (review.status !== "complete") {
    return failedResult(
      sanitizeGeneratedSiteQualityProofV3({
        ...proofBase,
        outcome: "fail",
        gates: { ...proofBase.gates, professionalVisual: "unknown" },
        professional: {
          ...proofBase.professional,
          unknownReason: review.reason,
        },
      }),
      "professional_visual",
      "professional visual review was unknown",
      candidate.files,
    );
  }
  const verdict = deriveProfessionalReviewVerdict({
    review,
    routes: blueprint.routes.map((route) => route.path),
  });
  if (!verdict.pass) {
    return failedResult(
      sanitizeGeneratedSiteQualityProofV3({
        ...proofBase,
        outcome: "fail",
        gates: { ...proofBase.gates, professionalVisual: "fail" },
        professional: {
          ...proofBase.professional,
          minimumRating: verdict.minimumRating,
          averageRating: verdict.averageRating,
          categoryRatings: verdict.categoryRatings,
        },
      }),
      "professional_visual",
      verdict.reason ?? "professional visual review failed",
      candidate.files,
    );
  }
  if (input.mode === "selection") {
    const authority = evaluateProfessionalSiteReleaseEligibility({
      manifest: input.releaseManifest,
      summary: input.calibrationSummary,
      requestedModelId: input.requestedModelId,
      writerModelIds: [
        writerRequested,
        writerServed,
        correctionRequested,
        correctionServed,
      ].filter((model): model is string => Boolean(model)),
      criticModelIds: [review.requestedModel, review.servedModel],
      promptVersion: review.promptVersion,
      kitVersion: kit.version,
      evaluatorVersion: input.releaseManifest.evaluatorVersion,
      corpusVersion: input.releaseManifest.corpusVersion,
    });
    if (!authority.eligibleForSelection) {
      return failedResult(
        sanitizeGeneratedSiteQualityProofV3({
          ...proofBase,
          outcome: "fail",
          gates: { ...proofBase.gates, professionalVisual: "pass" },
          professional: {
            ...proofBase.professional,
            minimumRating: verdict.minimumRating,
            averageRating: verdict.averageRating,
            categoryRatings: verdict.categoryRatings,
          },
        }),
        "release_authority",
        authority.reasons.join("; "),
        candidate.files,
      );
    }
  }
  const proof = sanitizeGeneratedSiteQualityProofV3({
    ...proofBase,
    outcome: "pass",
    gates: { ...proofBase.gates, professionalVisual: "pass" },
    professional: {
      ...proofBase.professional,
      promptVersion: review.promptVersion,
      minimumRating: verdict.minimumRating,
      averageRating: verdict.averageRating,
      categoryRatings: verdict.categoryRatings,
      unknownReason: null,
    },
  });
  return {
    ok: true,
    files: candidate.files,
    distFiles: build.distFiles,
    contract,
    blueprint,
    plan: candidate.plan,
    sourceReport: candidate.sourceReport,
    browserReport: browser,
    review,
    proof,
  };
}

function buildProof(input: {
  contract: GeneratedSiteWriterContractV3;
  blueprint: ProfessionalSiteBlueprintV1;
  kit: GeneratedSiteDesignKitV2;
  candidate: Extract<ProfessionalSiteGenerateResult, { ok: true }>;
  browser: BrowserGateReportV2;
  review: GeneratedSiteProfessionalReviewV1;
  budget: GeneratedSiteCallBudget;
  correctionReason: ProfessionalCorrectionReason | null;
  correctionRequested: string | null;
  correctionServed: string | null;
  writerRequested: string;
  writerServed: string | null;
}): GeneratedSiteQualityProofV3 {
  const base = createEmptyGeneratedSiteQualityProofV3({
    contractHash: input.contract.contractHash,
    blueprintHash: input.blueprint.blueprintHash,
    kitId: input.kit.id,
    mediaMode: input.contract.media.mode,
  });
  const proof = {
    ...base,
    writerPlanHash: hashPlan(input.candidate.plan),
    calls: input.budget.snapshot(),
    models: {
      writerRequested: input.writerRequested,
      writerServed: input.writerServed,
      criticRequested:
        input.review.status === "complete"
          ? input.review.requestedModel
          : (input.review.requestedModel ?? null),
      criticServed:
        input.review.status === "complete"
          ? input.review.servedModel
          : (input.review.servedModel ?? null),
      correctionRequested: input.correctionRequested,
      correctionServed: input.correctionServed,
    },
    gates: {
      response: "pass" as const,
      source: "pass" as const,
      build: "pass" as const,
      browser:
        input.browser.status === "pass"
          ? ("pass" as const)
          : input.browser.status,
      professionalVisual: "not_run" as const,
    },
    professional: {
      promptVersion:
        input.review.status === "complete" ? input.review.promptVersion : null,
      minimumRating: null,
      averageRating: null,
      categoryRatings: {},
      unknownReason:
        input.review.status === "unknown" ? input.review.reason : null,
    },
    timingsMs: {
      ...base.timingsMs,
      writer: input.candidate.writerMs,
      sourceGates: 0,
      browser: input.browser.overheadMs,
    },
    output: {
      routeCount: input.blueprint.routes.length,
      editableFileCount: input.candidate.writtenPaths.length,
      editableBytes: input.candidate.editableBytes,
      firstFileClosedMs: input.candidate.firstFileClosedMs,
    },
  };
  return sanitizeGeneratedSiteQualityProofV3(proof);
}

function hashPlan(plan: WriterDesignPlanV3): string {
  return createHash("sha256")
    .update(JSON.stringify(plan), "utf8")
    .digest("hex");
}

function asFailedCandidate(
  candidate: Extract<ProfessionalSiteGenerateResult, { ok: true }>,
  reason: string,
  detail: string,
): Extract<ProfessionalSiteGenerateResult, { ok: false }> {
  return {
    ok: false,
    reason: `${reason}: ${detail}`,
    stagedFiles: candidate.files,
    plan: candidate.plan,
    sourceReport: candidate.sourceReport,
    modelRequested: candidate.modelRequested,
    modelServed: candidate.modelServed,
    writerMs: candidate.writerMs,
    firstFileClosedMs: candidate.firstFileClosedMs,
    editableBytes: candidate.editableBytes,
  };
}

function ensureWriterConsumed(budget: GeneratedSiteCallBudget): void {
  if (budget.snapshot().writerCalls === 0) {
    budget.consumeWriter();
  }
}

function ensureCorrectionConsumed(
  budget: GeneratedSiteCallBudget,
  reason: ProfessionalCorrectionReason,
): void {
  if (budget.snapshot().correctionCalls === 0) {
    budget.consumeCorrection(reason);
  }
}

function ensureCriticConsumed(budget: GeneratedSiteCallBudget): void {
  if (budget.snapshot().criticCalls === 0) {
    budget.consumeCritic();
  }
}

function failureFromCandidate(input: {
  contract: GeneratedSiteWriterContractV3;
  blueprint: ProfessionalSiteBlueprintV1;
  kit: GeneratedSiteDesignKitV2;
  budget: GeneratedSiteCallBudget;
  candidate: Extract<ProfessionalSiteGenerateResult, { ok: true }> | null;
  writerFailure: Extract<ProfessionalSiteGenerateResult, { ok: false }> | null;
  correctionReason: ProfessionalCorrectionReason | null;
  correctionRequested: string | null;
  correctionServed: string | null;
  browser?: BrowserGateReportV2;
  failureClass: string;
  safeMessage: string;
}): RunProfessionalSitePipelineResult {
  const base = createEmptyGeneratedSiteQualityProofV3({
    contractHash: input.contract.contractHash,
    blueprintHash: input.blueprint.blueprintHash,
    kitId: input.kit.id,
    mediaMode: input.contract.media.mode,
  });
  const candidate = input.candidate;
  const failure = input.writerFailure;
  const proof = sanitizeGeneratedSiteQualityProofV3({
    ...base,
    outcome:
      input.failureClass === "browser_infrastructure"
        ? "infrastructure_error"
        : "fail",
    writerPlanHash: candidate
      ? hashPlan(candidate.plan)
      : failure?.plan
        ? hashPlan(failure.plan)
        : null,
    calls: input.budget.snapshot(),
    models: {
      writerRequested:
        candidate?.modelRequested ?? failure?.modelRequested ?? null,
      writerServed: candidate?.modelServed ?? failure?.modelServed ?? null,
      criticRequested: null,
      criticServed: null,
      correctionRequested: input.correctionRequested,
      correctionServed: input.correctionServed,
    },
    gates: {
      response: candidate ? "pass" : "fail",
      source: candidate ? "pass" : failure?.sourceReport ? "fail" : "not_run",
      build: "not_run",
      browser: input.browser?.status ?? "not_run",
      professionalVisual: "not_run",
    },
    hardFailures: failure?.sourceReport?.hardFailureCounts ?? base.hardFailures,
    output: candidate
      ? {
          routeCount: input.blueprint.routes.length,
          editableFileCount: candidate.writtenPaths.length,
          editableBytes: candidate.editableBytes,
          firstFileClosedMs: candidate.firstFileClosedMs,
        }
      : base.output,
  });
  return failedResult(
    proof,
    input.failureClass,
    input.safeMessage,
    candidate?.files ?? failure?.stagedFiles ?? [],
  );
}

function failedResult(
  proof: GeneratedSiteQualityProofV3,
  failureClass: string,
  safeMessage: string,
  stagedFiles: GeneratedProjectFile[],
): RunProfessionalSitePipelineResult {
  return { ok: false, failureClass, safeMessage, stagedFiles, proof };
}

function safeMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}
