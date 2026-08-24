import { classifyBrowserReport, type BrowserGateReport } from "./browser-gates";
import {
  QualificationRunBudgetImpl,
  createQualificationRunBudget,
} from "./candidate-qualification";

import type { GeneratedSiteCallBudget } from "./generated-site-call-budget";
import type { GeneratedSiteRiskReportV1 } from "./generated-site-risk";
import type { GeneratedProjectFile } from "./generated-types";
import type {
  GeneratedSiteVisualFindingV2,
  GeneratedSiteVisualReviewV2,
} from "./visual-critic";
import type { VisualCriticReport } from "./visual-critic";

export type GeneratedSiteQualificationResult =
  | {
      ok: true;
      files: GeneratedProjectFile[];
      browserReport: BrowserGateReport;
      riskReport: GeneratedSiteRiskReportV1;
      criticReport: VisualCriticReport | null;
      visualRepairCount: 0 | 1;
    }
  | {
      ok: false;
      reason: string;
      browserReport?: BrowserGateReport;
      riskReport?: GeneratedSiteRiskReportV1;
      criticReport?: VisualCriticReport;
      visualRepairCount: 0 | 1;
    };

type QualificationDeps = {
  runBrowser: (files: GeneratedProjectFile[]) => Promise<BrowserGateReport>;
  classifyRisk: (
    files: GeneratedProjectFile[],
    report: BrowserGateReport,
  ) => GeneratedSiteRiskReportV1;
  runCritic: (
    files: GeneratedProjectFile[],
    report: BrowserGateReport,
    risk: GeneratedSiteRiskReportV1,
  ) => Promise<VisualCriticReport>;
  repair: (
    files: GeneratedProjectFile[],
    critic: Extract<VisualCriticReport, { status: "complete" }>,
  ) => Promise<GeneratedProjectFile[]>;
};

export async function qualifyReferenceCalibratedSite(
  initialFiles: GeneratedProjectFile[],
  deps: {
    runBrowser: (files: GeneratedProjectFile[]) => Promise<BrowserGateReport>;
    loadScreenshots: (report: BrowserGateReport) => Promise<Uint8Array[]>;
    review: (input: {
      files: GeneratedProjectFile[];
      report: BrowserGateReport;
      screenshots: Uint8Array[];
      budget: GeneratedSiteCallBudget;
    }) => Promise<GeneratedSiteVisualReviewV2>;
    repair: (
      files: GeneratedProjectFile[],
      findings: GeneratedSiteVisualFindingV2[],
    ) => Promise<GeneratedProjectFile[]>;
    budget: GeneratedSiteCallBudget;
  },
): Promise<{
  ok: boolean;
  files: GeneratedProjectFile[];
  reason?: string;
  visualRepairCount: 0 | 1;
}> {
  let files = initialFiles;
  let visualRepairCount: 0 | 1 = 0;
  const browserReport = await deps.runBrowser(files);
  if (classifyBrowserReport(browserReport) !== "pass") {
    return {
      ok: false,
      files,
      reason: "generated-site browser qualification failed",
      visualRepairCount,
    };
  }
  const screenshots = await deps.loadScreenshots(browserReport);
  const review = await deps.review({
    files,
    report: browserReport,
    screenshots,
    budget: deps.budget,
  });
  if (review.status !== "complete") {
    return {
      ok: false,
      files,
      reason: `generated-site visual review ${review.status}`,
      visualRepairCount,
    };
  }
  const blocking = review.findings.filter(
    (finding) => finding.severity === "critical" || finding.severity === "high",
  );
  if (blocking.length === 0) {
    return { ok: true, files, visualRepairCount };
  }
  if (blocking.some((finding) => finding.verificationMode === "human_only")) {
    return {
      ok: false,
      files,
      reason: "generated-site visual review requires human approval",
      visualRepairCount,
    };
  }
  const allowedAssertions = new Set([
    "computed-contrast",
    "heading-overflow",
    "horizontal-overflow",
    "primary-cta",
    "touch-target",
    "required-content-visible",
    "content-hidden-by-navigation",
  ]);
  if (
    blocking.some((finding) =>
      finding.verificationAssertions.some(
        (assertion) => !allowedAssertions.has(assertion),
      ),
    )
  ) {
    return {
      ok: false,
      files,
      reason: "generated-site visual review contains an unverifiable finding",
      visualRepairCount,
    };
  }
  deps.budget.consumeCorrection("visual_machine_verifiable");
  files = await deps.repair(files, blocking);
  visualRepairCount = 1;
  const repairedReport = await deps.runBrowser(files);
  if (classifyBrowserReport(repairedReport) !== "pass") {
    return {
      ok: false,
      files,
      reason: "generated-site visual correction failed browser qualification",
      visualRepairCount,
    };
  }
  const failedAssertions = repairedReport.routes.flatMap((route) =>
    route.assertions.filter(
      (assertion) =>
        blocking.some((finding) =>
          finding.verificationAssertions.includes(assertion.name),
        ) && assertion.status !== "pass",
    ),
  );
  if (failedAssertions.length > 0) {
    return {
      ok: false,
      files,
      reason: "generated-site visual correction did not qualify",
      visualRepairCount,
    };
  }
  return { ok: true, files, visualRepairCount };
}

export async function qualifyGeneratedSite(
  initialFiles: GeneratedProjectFile[],
  deps: QualificationDeps,
): Promise<GeneratedSiteQualificationResult> {
  const budget = new QualificationRunBudgetImpl(
    createQualificationRunBudget({ visualRepairEnabled: true }),
  );
  let files = initialFiles;
  let visualRepairCount: 0 | 1 = 0;

  for (;;) {
    const browserReport = await deps.runBrowser(files);
    if (classifyBrowserReport(browserReport) !== "pass") {
      return {
        ok: false,
        reason: "generated-site browser qualification failed",
        browserReport,
        visualRepairCount,
      };
    }
    const riskReport = deps.classifyRisk(files, browserReport);
    const criticReport = await deps.runCritic(files, browserReport, riskReport);
    if (criticReport.status !== "complete") {
      return {
        ok: false,
        reason: `generated-site visual review ${criticReport.status}`,
        browserReport,
        riskReport,
        criticReport,
        visualRepairCount,
      };
    }
    if (criticReport.findings.length === 0) {
      return {
        ok: true,
        files,
        browserReport,
        riskReport,
        criticReport,
        visualRepairCount,
      };
    }
    if (visualRepairCount === 1) {
      return {
        ok: false,
        reason: "generated-site final visual review failed",
        browserReport,
        riskReport,
        criticReport,
        visualRepairCount,
      };
    }
    budget.consume("visual");
    files = await deps.repair(files, criticReport);
    budget.createdCandidate();
    visualRepairCount = 1;
  }
}
