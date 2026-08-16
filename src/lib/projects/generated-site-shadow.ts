import {
  runGeneratedSiteCorrection,
  runReferenceCalibratedGenerate,
} from "./batched-generator";
import { referenceCalibratedWritablePaths } from "./batched-prompt";
import { compileGeneratedSiteWriterContractV2 } from "./generated-site-contract";
import {
  deriveGeneratedSiteKitSelectionInput,
  selectGeneratedSiteDesignKit,
} from "./generated-site-design-kits/catalog";
import {
  runGeneratedSitePipeline,
  type RunGeneratedSitePipelineInput,
  type RunGeneratedSitePipelineResult,
} from "./generated-site-pipeline";
import { runGeneratedSiteVisualReview } from "./visual-critic";

import type { ProjectBrief } from "./brief";
import type { BrowserGateReport } from "./browser-gates";
import type { ProjectBriefV2 } from "./canonical-brief";
import type {
  GeneratedSiteContractV1,
  GeneratedSiteHandoffInput,
} from "./generated-site-contract";
import type {
  GeneratedDistFile,
  GeneratedProjectFile,
} from "./generated-types";
import type { ProjectSiteSchema } from "./site-schema";

export type GeneratedSiteShadowInput = {
  attemptId: string;
  buildId: string | null;
  projectId: string;
  userId: string;
  brief: ProjectBrief;
  briefSnapshot: ProjectBriefV2;
  handoff: GeneratedSiteHandoffInput;
  schema: ProjectSiteSchema;
  photoEnabled: boolean;
  browserContract: GeneratedSiteContractV1;
  creativeDirection?: string | null;
  abortSignal?: AbortSignal;
  build: (
    files: GeneratedProjectFile[],
    projectId: string,
  ) => Promise<{ ok: boolean; distFiles: GeneratedDistFile[]; log: string }>;
  runBrowser: (input: {
    files: GeneratedDistFile[];
    contract: GeneratedSiteContractV1;
    projectId: string;
    candidateId: string;
  }) => Promise<BrowserGateReport>;
  loadVisualEvidence: (report: BrowserGateReport) => Promise<Uint8Array[]>;
};

export async function runGeneratedSiteShadowCandidate(
  input: GeneratedSiteShadowInput,
): Promise<RunGeneratedSitePipelineResult> {
  const pipelineInput: RunGeneratedSitePipelineInput = {
    attemptId: input.attemptId,
    buildId: input.buildId,
    projectId: input.projectId,
    userId: input.userId,
    brief: input.brief,
    briefSnapshot: input.briefSnapshot,
    handoff: input.handoff,
    schema: input.schema,
    photoEnabled: input.photoEnabled,
    abortSignal: input.abortSignal,
  };
  return runGeneratedSitePipeline(pipelineInput, {
    deriveKitInput: (selection) =>
      deriveGeneratedSiteKitSelectionInput(selection),
    selectKit: selectGeneratedSiteDesignKit,
    compileContract: ({ handoff, briefSnapshot, photoEnabled, kit }) =>
      compileGeneratedSiteWriterContractV2({
        handoff,
        briefSnapshot,
        photoEnabled,
        kit,
      }),
    runWriter: (writerInput) =>
      runReferenceCalibratedGenerate({
        ...writerInput,
        creativeDirection: input.creativeDirection,
      }),
    build: input.build,
    runBrowser: async ({
      files,
      contract: _contract,
      projectId,
      candidateId,
    }) =>
      input.runBrowser({
        files,
        contract: input.browserContract,
        projectId,
        candidateId,
      }),
    loadVisualEvidence: input.loadVisualEvidence,
    reviewVisual: ({
      contract,
      designPlan,
      kit,
      browserReport,
      screenshots,
      budget,
    }) =>
      runGeneratedSiteVisualReview({
        contract,
        designPlan,
        kit,
        browserReport,
        screenshots,
        budget,
      }),
    runCorrection: async ({
      files,
      contract,
      kit,
      designPlan,
      budget,
      reason,
      findings,
    }) =>
      runGeneratedSiteCorrection({
        abortSignal: input.abortSignal,
        contract,
        kit,
        budget,
        projectId: input.projectId,
        request: {
          reason,
          diagnostics: findings.map((finding) => finding.evidence),
          implicatedPaths: referenceCalibratedWritablePaths(contract),
          acceptedPlan: designPlan,
          stagedFiles: files,
        },
      }),
    now: () => Date.now(),
  });
}
