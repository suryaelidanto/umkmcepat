import { classifyBrowserReport, type BrowserGateReport } from "./browser-gates";
import {
  QualificationRunBudgetImpl,
  createQualificationRunBudget,
} from "./candidate-qualification";

import type { GeneratedSiteRiskReportV1 } from "./generated-site-risk";
import type { GeneratedProjectFile } from "./generated-types";
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
    if (!riskReport.risky) {
      return {
        ok: true,
        files,
        browserReport,
        riskReport,
        criticReport: null,
        visualRepairCount,
      };
    }
    const criticReport = await deps.runCritic(files, browserReport, riskReport);
    if (criticReport.status !== "complete") {
      return {
        ok: false,
        reason: "generated-site visual evidence unavailable",
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
        reason: "generated-site visual repair did not qualify",
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
