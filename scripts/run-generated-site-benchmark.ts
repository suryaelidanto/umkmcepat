import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  runOneStreamedResponse,
  buildReferenceCalibratedWriterPrompt,
} from "../src/lib/projects/batched-generator";
import { parseProjectBrief } from "../src/lib/projects/brief";
import { parseBuildContract } from "../src/lib/projects/build-contract";
import {
  parseBuildPlan,
  validatePlanAgainstContract,
} from "../src/lib/projects/build-plan";
import { parseCanonicalBrief } from "../src/lib/projects/canonical-brief";
import { runGeneratedSiteBrowserGates } from "../src/lib/projects/generated-site-browser-runner";
import {
  compileGeneratedSiteContract,
  compileGeneratedSiteWriterContractV2,
  createDeterministicGeneratedSiteControlRoute,
} from "../src/lib/projects/generated-site-contract";
import {
  deriveGeneratedSiteKitSelectionInput,
  selectGeneratedSiteDesignKit,
} from "../src/lib/projects/generated-site-design-kits/catalog";
import { runGeneratedSitePipeline } from "../src/lib/projects/generated-site-pipeline";
import {
  compileGeneratedSiteThemeV2,
  applyGeneratedSiteThemeV2,
} from "../src/lib/projects/generated-site-theme";
import { buildGeneratedProject } from "../src/lib/projects/generated-source";
import { createViteTanStackShadcnStarterFiles } from "../src/lib/projects/scaffold/vite-tanstack-shadcn-starter";
import { createProjectSiteSchemaFromBrief } from "../src/lib/projects/site-schema";
import { runGeneratedSiteVisualReview } from "../src/lib/projects/visual-critic";

import type { BrowserGateReport } from "../src/lib/projects/browser-gates";
import type { AcceptedBuildHandoff } from "../src/lib/projects/build-handoffs";
import type { WriterDesignPlanV2 } from "../src/lib/projects/generated-site-design-plan";
import type { GeneratedSiteQualityProofV2 } from "../src/lib/projects/generated-site-quality-proof";
import type {
  GeneratedDistFile,
  GeneratedProjectFile,
} from "../src/lib/projects/generated-types";
import type {
  GeneratedSiteEvaluationManifestV3,
  GeneratedSiteEvaluationTrialV3,
} from "../src/lib/projects/generation-evaluation";

const ROOT = process.cwd();
const DEFAULT_ROOT = path.join(ROOT, ".data", "generation-evaluation");
const PHONE = "+6281100000000";

type Fixture = {
  schemaVersion: 2;
  id: string;
  briefSnapshot: unknown;
  acceptedContract: unknown;
  acceptedPlan: unknown;
  expected: {
    compatibleKitIds: string[];
    mediaMode: "owner_assets" | "graphic" | "typographic";
  };
};

type StoredEvidence = {
  report: string | null;
  mobile: string | null;
  desktop: string | null;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(
    ROOT,
    args.manifest ?? "fixtures/generation-evaluation/manifest.json",
  );
  const manifest = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as GeneratedSiteEvaluationManifestV3;
  if (manifest.schemaVersion !== 3) {
    throw new Error("benchmark manifest must use schemaVersion 3");
  }
  const runId =
    args.runId ??
    `${new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, "")
      .slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const runDir = path.resolve(args.output ?? path.join(DEFAULT_ROOT, runId));
  await mkdir(runDir, { recursive: true });
  const results: GeneratedSiteEvaluationTrialV3[] = [];
  for (const entry of manifest.cases) {
    const fixture = JSON.parse(
      await readFile(
        path.resolve(
          ROOT,
          "fixtures/generation-evaluation",
          entry.fixture.replace(/^briefs\//, "briefs/"),
        ),
        "utf8",
      ),
    ) as Fixture;
    for (const trial of entry.trials) {
      const base = path.join(runDir, entry.briefId, `trial-${trial}`);
      await mkdir(base, { recursive: true });
      results.push(await runControl(fixture, base, runId, trial));
      results.push(await runTreatment(fixture, base, runId, trial));
    }
  }
  await writeFile(
    path.join(runDir, "trials.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
  await writeFile(
    path.join(runDir, "run.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        runId,
        manifest: {
          corpusVersion: manifest.corpusVersion,
          evaluatorVersion: manifest.evaluatorVersion,
        },
        treatmentTrials: results.filter(
          (result) => result.arm === "reference-calibrated-v2",
        ).length,
        controlTrials: results.filter(
          (result) => result.arm === "deterministic-control-v1",
        ).length,
      },
      null,
      2,
    ) + "\n",
  );
  process.stdout.write(
    JSON.stringify(
      {
        runId,
        runDir,
        treatmentTrials: results.filter(
          (result) => result.arm === "reference-calibrated-v2",
        ).length,
        controlTrials: results.filter(
          (result) => result.arm === "deterministic-control-v1",
        ).length,
      },
      null,
      2,
    ) + "\n",
  );
}

async function runTreatment(
  fixture: Fixture,
  base: string,
  runId: string,
  trial: 1 | 2,
): Promise<GeneratedSiteEvaluationTrialV3> {
  const started = Date.now();
  const input = createSyntheticInput(fixture);
  const evidenceDir = path.join(base, "treatment-evidence");
  await mkdir(evidenceDir, { recursive: true });
  let lastEvidence: StoredEvidence = {
    report: null,
    mobile: null,
    desktop: null,
  };
  try {
    const result = await runGeneratedSitePipeline(input.pipelineInput, {
      deriveKitInput: ({ handoff, briefSnapshot, photoEnabled }) =>
        deriveGeneratedSiteKitSelectionInput({
          archetype: handoff.plan.archetype,
          density:
            briefSnapshot.offers.length > 2
              ? "rich"
              : briefSnapshot.offers.length === 0
                ? "sparse"
                : "regular",
          mediaMode:
            photoEnabled && handoff.contract.assets.length > 0
              ? "owner_assets"
              : "graphic",
          primaryJobKind: "inquire",
          hasOperationalDetails:
            briefSnapshot.content.hours.length > 0 ||
            Boolean(briefSnapshot.content.address),
        }),
      selectKit: selectGeneratedSiteDesignKit,
      compileContract: compileGeneratedSiteWriterContractV2,
      runWriter: async (writerInput) =>
        (
          await import("../src/lib/projects/batched-generator")
        ).runReferenceCalibratedGenerate(writerInput),
      build: async (files, projectId) =>
        buildGeneratedProject(files, {
          workspaceKey: `evaluation-${fixture.id}-${trial}-${projectId}`,
        }),
      runBrowser: async ({ files, projectId, candidateId }) => {
        const report = await runGeneratedSiteBrowserGates(
          {
            projectId,
            candidateId,
            files,
            contract: input.browserContract,
            timeoutMs: 10_000,
          },
          evidenceStore(evidenceDir),
        );
        lastEvidence = evidenceFromReport(report);
        return report;
      },
      loadVisualEvidence: async (report) => loadScreenshots(report),
      reviewVisual: async ({
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
        _designPlan,
        _budget,
        reason,
        findings,
      }) => {
        if (reason === "visual_machine_verifiable" && findings.length === 0) {
          throw new Error("correction requires findings");
        }
        const prompt = buildReferenceCalibratedWriterPrompt({
          contract,
          kit,
          projectId: input.projectId,
          schema: input.schema,
        });
        const call = await runOneStreamedResponse({
          projectId: input.projectId,
          phase: "repair",
          retryCount: 0,
          maxRetries: 0,
          requireDesignPlan: true,
          designPlanV2Expected: {
            contractHash: contract.contractHash,
            kit,
            mediaMode: contract.media.mode,
            requiredSectionIds: contract.obligations.sections.map(
              (section) => section.id,
            ),
          },
          system: prompt.system,
          user: `${prompt.user}\n\nCorrection reason: ${reason}\nFindings: ${JSON.stringify(findings)}\nCurrent files:\n${files
            .filter((file) => file.path.startsWith("src/routes/"))
            .map((file) => `<file path="${file.path}">${file.content}</file>`)
            .join("\n")}`,
        });
        if (call.parseError || !call.response.designPlanV2) {
          throw new Error("correction response was not valid");
        }
        const theme = compileGeneratedSiteThemeV2({
          kit,
          palette: call.response.designPlanV2.palette,
        });
        return {
          files: applyGeneratedSiteThemeV2({
            files: files.map(
              (file) => call.response.files.get(file.path) ?? file,
            ),
            schema: input.schema,
            theme,
          }),
          designPlan: call.response.designPlanV2,
        };
      },
      now: () => Date.now(),
    });
    await persistCandidate(
      base,
      "treatment",
      result.ok ? result.files : result.stagedFiles,
      result.ok ? result.distFiles : [],
    );
    return trialResult({
      runId,
      arm: "reference-calibrated-v2",
      fixture,
      trial,
      started,
      proof: result.proof,
      designPlan: result.ok ? result.designPlan : null,
      evidence: lastEvidence,
      technicalSuccess:
        result.ok &&
        fixture.expected.compatibleKitIds.includes(result.proof.kitId),
    });
  } catch (error) {
    return infrastructureTrial({
      runId,
      arm: "reference-calibrated-v2",
      fixture,
      trial,
      started,
      evidence: lastEvidence,
      message: messageOf(error),
    });
  }
}

async function runControl(
  fixture: Fixture,
  base: string,
  runId: string,
  trial: 1 | 2,
): Promise<GeneratedSiteEvaluationTrialV3> {
  const started = Date.now();
  const input = createSyntheticInput(fixture);
  const evidenceDir = path.join(base, "control-evidence");
  await mkdir(evidenceDir, { recursive: true });
  try {
    const files = createViteTanStackShadcnStarterFiles(
      input.projectId,
      input.schema,
    ).map((file) =>
      file.path === "src/routes/index.tsx"
        ? {
            ...file,
            content: createDeterministicGeneratedSiteControlRoute(
              input.controlContract,
            ),
          }
        : file,
    );
    const build = await buildGeneratedProject(files, {
      workspaceKey: `evaluation-control-${fixture.id}`,
    });
    let report: BrowserGateReport = {
      version: 1,
      status: "infrastructure_error",
      routes: [],
      evidenceIds: [],
      overheadMs: 0,
    };
    if (build.ok) {
      report = await runGeneratedSiteBrowserGates(
        {
          projectId: input.projectId,
          candidateId: `control-${fixture.id}`,
          files: build.distFiles,
          contract: input.controlContract,
          timeoutMs: 10_000,
        },
        evidenceStore(evidenceDir),
      );
    }
    await persistCandidate(
      base,
      "control",
      files,
      build.ok ? build.distFiles : [],
    );
    const evidence = evidenceFromReport(report);
    return {
      runId,
      arm: "deterministic-control-v1",
      briefId: fixture.id,
      trial,
      outcome:
        build.ok && report.status === "pass"
          ? "pass"
          : report.status === "infrastructure_error"
            ? "infrastructure_error"
            : "fail",
      kitId: "control",
      calls: {
        writerCalls: 0,
        criticCalls: 0,
        correctionCalls: 0,
        correctionReason: null,
      },
      totalToDecisionMs: Date.now() - started,
      firstFileClosedMs: null,
      editableBytes: 0,
      technicalSuccess: build.ok && report.status === "pass",
      criticalAccessibilityFailures: 0,
      brokenActionFailures: 0,
      fabricatedFactFailures: 0,
      placeholderMediaFailures: 0,
      visualFindings: { critical: 0, high: 0, medium: 0, low: 0 },
      compositionPatternId: null,
      desktopEvidenceRef: evidence.desktop ?? "",
      mobileEvidenceRef: evidence.mobile ?? "",
    };
  } catch (error) {
    return infrastructureTrial({
      runId,
      arm: "deterministic-control-v1",
      fixture,
      trial,
      started,
      evidence: { report: null, desktop: null, mobile: null },
      message: messageOf(error),
    });
  }
}

type SyntheticInput = {
  projectId: string;
  schema: ReturnType<typeof createProjectSiteSchemaFromBrief>;
  browserContract: ReturnType<typeof compileGeneratedSiteContract>;
  controlContract: ReturnType<typeof compileGeneratedSiteContract>;
  pipelineInput: Parameters<typeof runGeneratedSitePipeline>[0];
};

function createSyntheticInput(fixture: Fixture): SyntheticInput {
  const contractResult = parseBuildContract(fixture.acceptedContract);
  const planResult = parseBuildPlan(fixture.acceptedPlan);
  if (!contractResult.ok) {
    throw new Error(contractResult.reason);
  }
  if (!planResult.ok) {
    throw new Error(planResult.reason);
  }
  const validation = validatePlanAgainstContract(
    planResult.value,
    contractResult.value,
  );
  if (!validation.ok) {
    throw new Error(validation.reason);
  }
  const briefSnapshot = parseCanonicalBrief(fixture.briefSnapshot, fixture.id);
  const brief = parseProjectBrief(
    {
      businessName: briefSnapshot.business.name,
      businessType: briefSnapshot.business.type,
      contact: PHONE,
      offer: briefSnapshot.offers[0]?.name,
      targetCustomer: briefSnapshot.audience,
      stylePreference: briefSnapshot.visualDirection,
    },
    fixture.id,
  );
  const schema = createProjectSiteSchemaFromBrief(brief);
  const photoEnabled = fixture.expected.mediaMode === "owner_assets";
  const handoff = {
    id: `fixture-${fixture.id}`,
    briefSnapshot,
    briefHash: "b".repeat(64),
    briefRevision: 2,
    contract: contractResult.value,
    plan: planResult.value,
    contractHash: contractResult.value.contentHash,
    planHash: planResult.value.contentHash,
    contractRevision: 1,
    planRevision: 1,
  } as AcceptedBuildHandoff;
  const recipe = {
    id: planResult.value.archetype,
    version: 1,
    compatibleArchetypes: [planResult.value.archetype],
    composition: "fixture control",
    hierarchy: ["offer", "action"],
    preferredPatterns: ["fixture"],
    avoidPatterns: [],
    mediaGuidance: {
      owner_assets: "approved",
      replaceable_slots: "unused",
      graphic: "graphic",
      typographic: "type",
    },
    riskTags: [],
  } as never;
  const controlContract = compileGeneratedSiteContract({
    contract: contractResult.value,
    plan: planResult.value,
    briefSnapshot,
    photoEnabled,
    recipe,
  });
  return {
    projectId: `evaluation-${fixture.id}`,
    schema,
    browserContract: controlContract,
    controlContract,
    pipelineInput: {
      attemptId: `evaluation-${fixture.id}`,
      buildId: null,
      projectId: `evaluation-${fixture.id}`,
      userId: "evaluation",
      brief,
      briefSnapshot,
      handoff,
      schema,
      photoEnabled,
    },
  };
}

function evidenceStore(directory: string) {
  return {
    storeEvidence: async (input: {
      route: string;
      viewport: "mobile" | "desktop";
      value: unknown;
      screenshot?: Uint8Array;
    }) => {
      const safe = input.viewport;
      const report = path.join(directory, `${safe}-report.json`);
      await writeFile(report, JSON.stringify(input.value));
      const refs = [report];
      if (input.screenshot) {
        const image = path.join(directory, `${safe}.jpg`);
        await writeFile(image, input.screenshot);
        refs.push(image);
      }
      return refs;
    },
  };
}
async function loadScreenshots(
  report: BrowserGateReport,
): Promise<Uint8Array[]> {
  const refs = report.evidenceIds.filter((ref) => ref.endsWith(".jpg"));
  return Promise.all(refs.map((ref) => readFile(ref)));
}
function evidenceFromReport(report: BrowserGateReport): StoredEvidence {
  return {
    report:
      report.evidenceIds.find((ref) => ref.endsWith("report.json")) ?? null,
    mobile:
      report.evidenceIds.find((ref) => ref.endsWith("mobile.jpg")) ?? null,
    desktop:
      report.evidenceIds.find((ref) => ref.endsWith("desktop.jpg")) ?? null,
  };
}
async function persistCandidate(
  directory: string,
  arm: string,
  files: GeneratedProjectFile[],
  distFiles: GeneratedDistFile[],
): Promise<void> {
  await writeFile(
    path.join(directory, `${arm}-source.json`),
    JSON.stringify(files),
  );
  await writeFile(
    path.join(directory, `${arm}-dist.json`),
    JSON.stringify(distFiles),
  );
}
function trialResult(input: {
  runId: string;
  arm: "reference-calibrated-v2";
  fixture: Fixture;
  trial: 1 | 2;
  started: number;
  proof: GeneratedSiteQualityProofV2;
  designPlan: WriterDesignPlanV2 | null;
  evidence: StoredEvidence;
  technicalSuccess: boolean;
}): GeneratedSiteEvaluationTrialV3 {
  return {
    runId: input.runId,
    arm: input.arm,
    briefId: input.fixture.id,
    trial: input.trial,
    outcome:
      input.technicalSuccess && input.proof.outcome === "pass"
        ? "pass"
        : "fail",
    kitId: input.proof.kitId,
    calls: input.proof.calls,
    totalToDecisionMs:
      input.proof.timingsMs.totalToDecision || Date.now() - input.started,
    firstFileClosedMs: input.proof.output.firstFileClosedMs,
    editableBytes: input.proof.output.editableBytes,
    technicalSuccess: input.technicalSuccess,
    criticalAccessibilityFailures: 0,
    brokenActionFailures: 0,
    fabricatedFactFailures: 0,
    placeholderMediaFailures: 0,
    visualFindings: input.proof.visualFindings,
    compositionPatternId: input.designPlan?.compositionPatternId ?? null,
    desktopEvidenceRef: input.evidence.desktop ?? "",
    mobileEvidenceRef: input.evidence.mobile ?? "",
  };
}
function infrastructureTrial(input: {
  runId: string;
  arm: "deterministic-control-v1" | "reference-calibrated-v2";
  fixture: Fixture;
  trial: 1 | 2;
  started: number;
  evidence: StoredEvidence;
  message: string;
}): GeneratedSiteEvaluationTrialV3 {
  return {
    runId: input.runId,
    arm: input.arm,
    briefId: input.fixture.id,
    trial: input.trial,
    outcome: "infrastructure_error",
    kitId:
      input.arm === "reference-calibrated-v2" ? "bold-typographic" : "control",
    calls: {
      writerCalls: 0,
      criticCalls: 0,
      correctionCalls: 0,
      correctionReason: null,
    },
    totalToDecisionMs: Date.now() - input.started,
    firstFileClosedMs: null,
    editableBytes: 0,
    technicalSuccess: false,
    criticalAccessibilityFailures: 0,
    brokenActionFailures: 0,
    fabricatedFactFailures: 0,
    placeholderMediaFailures: 0,
    visualFindings: { critical: 0, high: 0, medium: 0, low: 0 },
    compositionPatternId: null,
    desktopEvidenceRef: input.evidence.desktop ?? "",
    mobileEvidenceRef: input.evidence.mobile ?? "",
  };
}
function parseArgs(argv: string[]): {
  manifest?: string;
  output?: string;
  runId?: string;
} {
  const args: { manifest?: string; output?: string; runId?: string } = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--manifest") {
      args.manifest = argv[++index];
    } else if (argv[index] === "--output") {
      args.output = argv[++index];
    } else if (argv[index] === "--run-id") {
      args.runId = argv[++index];
    }
  }
  return args;
}
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "benchmark trial failed";
}

await main();
