import { createHash } from "node:crypto";

import { classifyBrowserReport, type BrowserGateReport } from "./browser-gates";
import { GeneratedSiteCallBudget } from "./generated-site-call-budget";
import {
  createEmptyGeneratedSiteQualityProofV2,
  type GeneratedSiteQualityProofV2,
} from "./generated-site-quality-proof";

import type { ReferenceCalibratedGenerateResult } from "./batched-generator";
import type { ProjectBrief } from "./brief";
import type { ProjectBriefV2 } from "./canonical-brief";
import type {
  GeneratedSiteHandoffInput,
  GeneratedSiteWriterContractV2,
} from "./generated-site-contract";
import type {
  GeneratedSiteDesignKitV1,
  GeneratedSiteKitSelectionInput,
} from "./generated-site-design-kits/types";
import type { WriterDesignPlanV2 } from "./generated-site-design-plan";
import type {
  GeneratedProjectFile,
  GeneratedDistFile,
} from "./generated-types";
import type { ProjectSiteSchema } from "./site-schema";
import type {
  GeneratedSiteVisualFindingV2,
  GeneratedSiteVisualReviewV2,
} from "./visual-critic";

export type RunGeneratedSitePipelineInput = {
  attemptId: string;
  buildId: string | null;
  projectId: string;
  userId: string;
  brief: ProjectBrief;
  briefSnapshot: ProjectBriefV2;
  handoff: GeneratedSiteHandoffInput;
  schema: ProjectSiteSchema;
  photoEnabled: boolean;
  abortSignal?: AbortSignal;
  onEvent?: (
    type: "progress" | "operation",
    data: Record<string, unknown>,
  ) => void;
  onFileStaged?: (file: GeneratedProjectFile) => void;
};

type WriterInput = {
  abortSignal?: AbortSignal;
  attemptId: string;
  buildId: string | null;
  brief: ProjectBrief;
  contract: GeneratedSiteWriterContractV2;
  kit: GeneratedSiteDesignKitV1;
  onEvent?: RunGeneratedSitePipelineInput["onEvent"];
  onFileStaged?: (file: GeneratedProjectFile) => void;
  projectId: string;
  schema: ProjectSiteSchema;
  userId: string;
  budget: GeneratedSiteCallBudget;
};

type CorrectionInput = {
  files: GeneratedProjectFile[];
  findings: GeneratedSiteVisualFindingV2[];
  contract: GeneratedSiteWriterContractV2;
  kit: GeneratedSiteDesignKitV1;
  designPlan: WriterDesignPlanV2 | null;
  budget: GeneratedSiteCallBudget;
  reason:
    | "transport"
    | "response_contract"
    | "source_gate"
    | "build"
    | "browser"
    | "visual_machine_verifiable";
};

export type GeneratedSitePipelineDeps = {
  deriveKitInput: (input: {
    handoff: GeneratedSiteHandoffInput;
    briefSnapshot: ProjectBriefV2;
    photoEnabled: boolean;
  }) => GeneratedSiteKitSelectionInput;
  selectKit: (
    input: GeneratedSiteKitSelectionInput,
  ) => GeneratedSiteDesignKitV1;
  compileContract: (input: {
    handoff: GeneratedSiteHandoffInput;
    briefSnapshot: ProjectBriefV2;
    photoEnabled: boolean;
    kit: GeneratedSiteDesignKitV1;
  }) => GeneratedSiteWriterContractV2;
  runWriter: (input: WriterInput) => Promise<ReferenceCalibratedGenerateResult>;
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
    contract: GeneratedSiteWriterContractV2;
    projectId: string;
    candidateId: string;
  }) => Promise<BrowserGateReport>;
  loadVisualEvidence: (report: BrowserGateReport) => Promise<Uint8Array[]>;
  reviewVisual: (input: {
    contract: GeneratedSiteWriterContractV2;
    designPlan: WriterDesignPlanV2;
    kit: GeneratedSiteDesignKitV1;
    browserReport: BrowserGateReport;
    screenshots: Uint8Array[];
    budget: GeneratedSiteCallBudget;
  }) => Promise<GeneratedSiteVisualReviewV2>;
  runCorrection: (input: CorrectionInput) => Promise<{
    files: GeneratedProjectFile[];
    designPlan: WriterDesignPlanV2;
  }>;
  now: () => number;
};

export type RunGeneratedSitePipelineResult =
  | {
      ok: true;
      files: GeneratedProjectFile[];
      distFiles: GeneratedDistFile[];
      designPlan: WriterDesignPlanV2;
      proof: GeneratedSiteQualityProofV2;
    }
  | {
      ok: false;
      failureClass: string;
      safeMessage: string;
      proof: GeneratedSiteQualityProofV2;
      stagedFiles: GeneratedProjectFile[];
    };

export async function runGeneratedSitePipeline(
  input: RunGeneratedSitePipelineInput,
  deps: GeneratedSitePipelineDeps,
): Promise<RunGeneratedSitePipelineResult> {
  const startedAt = deps.now();
  const budget = new GeneratedSiteCallBudget();
  let kit: GeneratedSiteDesignKitV1;
  let contract: GeneratedSiteWriterContractV2;
  try {
    const selectionInput = deps.deriveKitInput({
      handoff: input.handoff,
      briefSnapshot: input.briefSnapshot,
      photoEnabled: input.photoEnabled,
    });
    kit = deps.selectKit(selectionInput);
    contract = deps.compileContract({
      handoff: input.handoff,
      briefSnapshot: input.briefSnapshot,
      photoEnabled: input.photoEnabled,
      kit,
    });
  } catch (error) {
    const kitId = "bold-typographic" as const;
    const proof = createEmptyGeneratedSiteQualityProofV2({
      contractHash: "unavailable",
      planHash: input.handoff.planHash,
      kitId,
      mediaMode: "typographic",
    });
    return failure(proof, "contract", messageOf(error), []);
  }

  let proof = createEmptyGeneratedSiteQualityProofV2({
    contractHash: contract.contractHash,
    planHash: input.handoff.planHash,
    kitId: kit.id,
    mediaMode: contract.media.mode,
  });
  proof = withTiming(proof, "contract", elapsed(startedAt, deps.now()));
  let stagedFiles: GeneratedProjectFile[] = [];
  let designPlan: WriterDesignPlanV2 | null = null;
  let writer: ReferenceCalibratedGenerateResult;
  try {
    writer = await deps.runWriter({
      abortSignal: input.abortSignal,
      attemptId: input.attemptId,
      buildId: input.buildId,
      brief: input.brief,
      contract,
      kit,
      onEvent: input.onEvent,
      onFileStaged: input.onFileStaged,
      projectId: input.projectId,
      schema: input.schema,
      userId: input.userId,
      budget,
    });
  } catch (error) {
    const corrected = await correctOnce({
      budget,
      contract,
      deps,
      designPlan: null,
      files: stagedFiles,
      kit,
      reason: "transport",
    });
    if (!corrected) {
      proof = withCalls(proof, budget);
      return failure(proof, "writer", messageOf(error), stagedFiles);
    }
    stagedFiles = corrected.files;
    designPlan = corrected.designPlan;
    proof = withCalls(
      {
        ...proof,
        designPlanHash: hashPlan(designPlan),
        gates: { ...proof.gates, response: "pass", source: "pass" },
        timingsMs: { ...proof.timingsMs, correction: 1 },
      },
      budget,
    );
    writer = {
      ok: true,
      files: stagedFiles,
      designPlan,
      summary: "corrected",
      writtenPaths: stagedFiles.map((file) => file.path),
      writerMs: 0,
      firstFileClosedMs: null,
      editableBytes: stagedFiles.reduce(
        (total, file) => total + file.content.length,
        0,
      ),
    };
  }
  stagedFiles = writer.ok ? writer.files : writer.stagedFiles;
  designPlan = writer.designPlan;
  proof = withCalls(
    {
      ...proof,
      designPlanHash: designPlan ? hashPlan(designPlan) : null,
      gates: {
        ...proof.gates,
        response: writer.ok ? "pass" : "fail",
        source: writer.ok ? "pass" : "fail",
      },
      output: {
        editableFileCount: writer.ok
          ? writer.writtenPaths.length
          : writer.stagedFiles.length,
        editableBytes: writer.editableBytes,
        firstFileClosedMs: writer.firstFileClosedMs,
      },
      timingsMs: { ...proof.timingsMs, writer: writer.writerMs },
    },
    budget,
  );
  if (!writer.ok || !designPlan) {
    const corrected = await correctOnce({
      budget,
      contract,
      deps,
      designPlan,
      files: stagedFiles,
      kit,
      reason: "response_contract",
    });
    if (!corrected) {
      return failure(
        proof,
        "writer",
        writer.ok ? "design plan missing" : writer.reason,
        stagedFiles,
      );
    }
    stagedFiles = corrected.files;
    designPlan = corrected.designPlan;
    proof = withCalls(
      {
        ...proof,
        designPlanHash: hashPlan(designPlan),
        gates: { ...proof.gates, response: "pass", source: "pass" },
        timingsMs: { ...proof.timingsMs, correction: 1 },
      },
      budget,
    );
  }

  const firstBuild = await deps.build(stagedFiles, input.projectId);
  proof = withCalls(
    {
      ...proof,
      gates: { ...proof.gates, build: firstBuild.ok ? "pass" : "fail" },
    },
    budget,
  );
  let build = firstBuild;
  if (!build.ok) {
    const corrected = await correctOnce({
      budget,
      contract,
      deps,
      designPlan,
      files: stagedFiles,
      kit,
      reason: "build",
    });
    if (!corrected) {
      return failure(
        proof,
        "build",
        build.log || "generated-site build failed",
        stagedFiles,
      );
    }
    stagedFiles = corrected.files;
    designPlan = corrected.designPlan;
    build = await deps.build(stagedFiles, input.projectId);
    proof = withCalls(
      {
        ...proof,
        gates: { ...proof.gates, build: build.ok ? "pass" : "fail" },
        timingsMs: { ...proof.timingsMs, correction: 1 },
      },
      budget,
    );
    if (!build.ok) {
      return failure(
        proof,
        "build",
        build.log || "generated-site correction failed to build",
        stagedFiles,
      );
    }
  }

  const browserStarted = deps.now();
  let browser = await deps.runBrowser({
    files: build.distFiles,
    contract,
    projectId: input.projectId,
    candidateId: input.attemptId,
  });
  proof = withCalls(
    withTiming(
      {
        ...proof,
        gates: { ...proof.gates, browser: browser.status },
        timingsMs: {
          ...proof.timingsMs,
          browser: elapsed(browserStarted, deps.now()),
        },
      },
      "browser",
      elapsed(browserStarted, deps.now()),
    ),
    budget,
  );
  if (classifyBrowserReport(browser) !== "pass") {
    const corrected = await correctOnce({
      budget,
      contract,
      deps,
      designPlan,
      files: stagedFiles,
      kit,
      reason: "browser",
    });
    if (!corrected) {
      return failure(
        proof,
        "browser",
        "generated-site browser qualification failed",
        stagedFiles,
      );
    }
    stagedFiles = corrected.files;
    designPlan = corrected.designPlan;
    build = await deps.build(stagedFiles, input.projectId);
    if (!build.ok) {
      return failure(
        proof,
        "build",
        build.log || "generated-site correction failed to build",
        stagedFiles,
      );
    }
    browser = await deps.runBrowser({
      files: build.distFiles,
      contract,
      projectId: input.projectId,
      candidateId: input.attemptId,
    });
    proof = withCalls(
      {
        ...proof,
        gates: { ...proof.gates, build: "pass", browser: browser.status },
        timingsMs: { ...proof.timingsMs, correction: 1 },
      },
      budget,
    );
    if (classifyBrowserReport(browser) !== "pass") {
      return failure(
        proof,
        "browser",
        "generated-site browser correction failed",
        stagedFiles,
      );
    }
  }

  const screenshots = await deps.loadVisualEvidence(browser);
  const criticStarted = deps.now();
  const review = await deps.reviewVisual({
    contract,
    designPlan,
    kit,
    browserReport: browser,
    screenshots,
    budget,
  });
  proof = withCalls(
    {
      ...proof,
      gates: {
        ...proof.gates,
        visual:
          review.status === "complete"
            ? "pass"
            : review.status === "unknown"
              ? "unknown"
              : "fail",
      },
      timingsMs: {
        ...proof.timingsMs,
        critic: elapsed(criticStarted, deps.now()),
      },
      visualFindings: findingCounts(review),
    },
    budget,
  );
  if (review.status === "unknown") {
    return {
      ok: true,
      files: stagedFiles,
      distFiles: build.distFiles,
      designPlan,
      proof: {
        ...proof,
        outcome: "pass",
        timingsMs: {
          ...proof.timingsMs,
          totalToDecision: elapsed(startedAt, deps.now()),
        },
      },
    };
  }
  if (review.status !== "complete") {
    return failure(
      proof,
      "visual_review",
      "generated-site visual evidence unavailable",
      stagedFiles,
    );
  }

  const blocking = review.findings.filter(
    (finding) => finding.severity === "critical" || finding.severity === "high",
  );
  if (blocking.length > 0) {
    const allowed = new Set([
      "computed-contrast",
      "heading-overflow",
      "horizontal-overflow",
      "primary-cta",
      "touch-target",
      "required-content-visible",
      "content-hidden-by-navigation",
    ]);
    if (
      blocking.some(
        (finding) =>
          finding.verificationMode === "human_only" ||
          finding.verificationAssertions.some(
            (assertion) => !allowed.has(assertion),
          ),
      )
    ) {
      return failure(
        proof,
        "visual_review",
        "generated-site visual review requires human approval",
        stagedFiles,
      );
    }
    const corrected = await correctOnce({
      budget,
      contract,
      deps,
      designPlan,
      files: stagedFiles,
      kit,
      reason: "visual_machine_verifiable",
      findings: blocking,
    });
    if (!corrected) {
      return failure(
        proof,
        "visual_correction",
        "generated-site visual correction was not available",
        stagedFiles,
      );
    }
    stagedFiles = corrected.files;
    designPlan = corrected.designPlan;
    build = await deps.build(stagedFiles, input.projectId);
    if (!build.ok) {
      return failure(
        proof,
        "build",
        build.log || "generated-site visual correction failed to build",
        stagedFiles,
      );
    }
    browser = await deps.runBrowser({
      files: build.distFiles,
      contract,
      projectId: input.projectId,
      candidateId: input.attemptId,
    });
    proof = withCalls(
      {
        ...proof,
        gates: { ...proof.gates, build: "pass", browser: browser.status },
        timingsMs: { ...proof.timingsMs, correction: 1 },
      },
      budget,
    );
    if (
      classifyBrowserReport(browser) !== "pass" ||
      !assertionsPass(browser, blocking)
    ) {
      return failure(
        proof,
        "visual_correction",
        "generated-site visual correction did not qualify",
        stagedFiles,
      );
    }
  }

  proof = withCalls(
    {
      ...proof,
      gates: {
        ...proof.gates,
        source: "pass",
        build: "pass",
        browser: "pass",
        visual: "pass",
      },
      outcome: "pass",
      timingsMs: {
        ...proof.timingsMs,
        totalToDecision: elapsed(startedAt, deps.now()),
      },
    },
    budget,
  );
  return {
    ok: true,
    files: stagedFiles,
    distFiles: build.distFiles,
    designPlan,
    proof,
  };
}

async function correctOnce(input: {
  budget: GeneratedSiteCallBudget;
  contract: GeneratedSiteWriterContractV2;
  deps: GeneratedSitePipelineDeps;
  designPlan: WriterDesignPlanV2 | null;
  files: GeneratedProjectFile[];
  kit: GeneratedSiteDesignKitV1;
  reason: CorrectionInput["reason"];
  findings?: GeneratedSiteVisualFindingV2[];
}): Promise<{
  files: GeneratedProjectFile[];
  designPlan: WriterDesignPlanV2;
} | null> {
  try {
    input.budget.consumeCorrection(input.reason);
    return await input.deps.runCorrection({
      files: input.files,
      findings: input.findings ?? [],
      contract: input.contract,
      kit: input.kit,
      designPlan: input.designPlan,
      budget: input.budget,
      reason: input.reason,
    });
  } catch {
    return null;
  }
}

function assertionsPass(
  report: BrowserGateReport,
  findings: GeneratedSiteVisualFindingV2[],
): boolean {
  const required = new Set(
    findings.flatMap((finding) => finding.verificationAssertions),
  );
  return report.routes.every((route) =>
    route.assertions.every(
      (assertion) =>
        !required.has(assertion.name) || assertion.status === "pass",
    ),
  );
}

function findingCounts(
  review: GeneratedSiteVisualReviewV2,
): Record<"critical" | "high" | "medium" | "low", number> {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  if (review.status === "complete") {
    for (const finding of review.findings) {
      counts[finding.severity] += 1;
    }
  }
  return counts;
}

function withCalls(
  proof: GeneratedSiteQualityProofV2,
  budget: GeneratedSiteCallBudget,
): GeneratedSiteQualityProofV2 {
  return { ...proof, calls: budget.snapshot() };
}

function withTiming(
  proof: GeneratedSiteQualityProofV2,
  stage: "contract" | "browser",
  value: number,
): GeneratedSiteQualityProofV2 {
  return { ...proof, timingsMs: { ...proof.timingsMs, [stage]: value } };
}

function failure(
  proof: GeneratedSiteQualityProofV2,
  failureClass: string,
  safeMessage: string,
  stagedFiles: GeneratedProjectFile[],
): RunGeneratedSitePipelineResult {
  return {
    ok: false,
    failureClass,
    safeMessage,
    stagedFiles,
    proof: {
      ...proof,
      outcome: "fail",
      timingsMs: {
        ...proof.timingsMs,
        totalToDecision: proof.timingsMs.totalToDecision || 0,
      },
    },
  };
}

function elapsed(start: number, end: number): number {
  return Math.max(0, end - start);
}
function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "generated-site pipeline failed";
}
function hashPlan(plan: WriterDesignPlanV2): string {
  return createHash("sha256")
    .update(JSON.stringify(plan), "utf8")
    .digest("hex");
}
