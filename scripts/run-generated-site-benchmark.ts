import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseProjectBrief } from "../src/lib/projects/brief";
import { parseBuildContract } from "../src/lib/projects/build-contract";
import {
  validatePlanAgainstContract,
  parseBuildPlan,
} from "../src/lib/projects/build-plan";
import { parseCanonicalBrief } from "../src/lib/projects/canonical-brief";
import { runProfessionalSiteBrowserGates } from "../src/lib/projects/generated-site-browser-runner";
import { GeneratedSiteCallBudget } from "../src/lib/projects/generated-site-call-budget";
import {
  compileGeneratedSiteContract,
  compileGeneratedSiteWriterContractV3,
} from "../src/lib/projects/generated-site-contract";
import { buildGeneratedProject } from "../src/lib/projects/generated-source";
import {
  summarizeGenerationTrialDiagnostics,
  trialFromProfessionalResult,
} from "../src/lib/projects/generation-evaluation";
import { deriveProfessionalRouteRoles } from "../src/lib/projects/professional-site-blueprint";
import { compileProfessionalSiteBlueprint } from "../src/lib/projects/professional-site-blueprint";
import {
  parseProfessionalSiteReleaseManifest,
  type ProfessionalCalibrationSummaryV1,
  type ProfessionalSiteReleaseManifestV1,
} from "../src/lib/projects/professional-site-calibration";
import {
  PROFESSIONAL_REVIEW_CATEGORIES,
  runProfessionalSiteReview,
} from "../src/lib/projects/professional-site-critic";
import {
  applyProfessionalDefect,
  type ProfessionalDefectDefinition,
} from "../src/lib/projects/professional-site-defects";
import { selectProfessionalSiteKit } from "../src/lib/projects/professional-site-kits";
import { runProfessionalSitePipeline } from "../src/lib/projects/professional-site-pipeline";
import { compileProfessionalSiteRouter } from "../src/lib/projects/professional-site-router";
import {
  runProfessionalSiteCorrection,
  runProfessionalSiteGenerate,
} from "../src/lib/projects/professional-site-writer";
import { createViteTanStackShadcnStarterFiles } from "../src/lib/projects/scaffold/vite-tanstack-shadcn-starter";
import { createProjectSiteSchemaFromBrief } from "../src/lib/projects/site-schema";

import type { BrowserGateReport } from "../src/lib/projects/browser-gates";
import type { AcceptedBuildHandoff } from "../src/lib/projects/build-handoffs";
import type { GeneratedSiteWriterContractV3 } from "../src/lib/projects/generated-site-contract";
import type {
  GeneratedDistFile,
  GeneratedProjectFile,
} from "../src/lib/projects/generated-types";
import type {
  GeneratedSiteEvaluationManifestV4,
  GeneratedSiteEvaluationTrialV4,
} from "../src/lib/projects/generation-evaluation";
import type { ProfessionalSiteBlueprintV1 } from "../src/lib/projects/professional-site-blueprint";
import type {
  GeneratedSiteProfessionalReviewV1,
  ProfessionalReviewCategory,
} from "../src/lib/projects/professional-site-critic";
import type { GeneratedSiteDesignKitV2 } from "../src/lib/projects/professional-site-kits";

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
    routes: string[];
    compatibleKitIds: string[];
    mediaMode: "owner_assets" | "graphic" | "typographic";
  };
};

type BenchmarkInput = {
  fixture: Fixture;
  projectId: string;
  briefSnapshot: ReturnType<typeof parseCanonicalBrief>;
  handoff: AcceptedBuildHandoff;
  schema: ReturnType<typeof createProjectSiteSchemaFromBrief>;
  photoEnabled: boolean;
  contract: GeneratedSiteWriterContractV3;
  blueprint: ProfessionalSiteBlueprintV1;
  kit: GeneratedSiteDesignKitV2;
  controlContract: ReturnType<typeof compileGeneratedSiteContract>;
};

type EvidenceRefs = {
  desktop: string[];
  mobile: string[];
  images: Map<string, Uint8Array>;
};

type CalibrationSample = {
  sampleId: string;
  defectId: string;
  expectedRatingMaximum: 1 | 2;
  route: string;
  mobileEvidenceRef: string;
  desktopEvidenceRef: string;
  predictedRatings: Partial<Record<ProfessionalReviewCategory, number>>;
};

type Args = {
  manifest?: string;
  output?: string;
  runId?: string;
  modelId?: string;
  releaseManifest?: string;
  calibration: boolean;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(
    ROOT,
    args.manifest ?? "fixtures/generation-evaluation/manifest.json",
  );
  const manifest = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as GeneratedSiteEvaluationManifestV4;
  if (
    manifest.schemaVersion !== 4 ||
    manifest.treatmentId !== "professional-static-v3"
  ) {
    throw new Error(
      "benchmark manifest must use schemaVersion 4 and professional-static-v3",
    );
  }
  const releaseManifest = parseProfessionalSiteReleaseManifest(
    JSON.parse(
      await readFile(
        path.resolve(
          ROOT,
          args.releaseManifest ??
            "config/professional-site-quality-release.json",
        ),
        "utf8",
      ),
    ),
  );
  const runId =
    args.runId ??
    `${new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, "")
      .slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const runDir = path.resolve(args.output ?? path.join(DEFAULT_ROOT, runId));
  await mkdir(runDir, { recursive: true });
  const calibrationDefects = args.calibration
    ? await readCalibrationDefects()
    : [];
  const results: GeneratedSiteEvaluationTrialV4[] = [];
  for (const entry of manifest.cases) {
    const fixture = JSON.parse(
      await readFile(
        path.resolve(ROOT, "fixtures/generation-evaluation", entry.fixture),
        "utf8",
      ),
    ) as Fixture;
    if (fixtureRouteCount(fixture) !== entry.expectedRouteCount) {
      throw new Error(
        `fixture route count does not match manifest: ${entry.briefId}`,
      );
    }
    for (const trial of entry.trials) {
      const base = path.join(runDir, entry.briefId, `trial-${trial}`);
      await mkdir(base, { recursive: true });
      results.push(await runControl(fixture, base, runId, trial));
      results.push(
        await runTreatment(
          fixture,
          base,
          runId,
          trial,
          releaseManifest,
          args.modelId ?? releaseManifest.requestedModelId,
          calibrationDefects,
        ),
      );
    }
  }
  await writeFile(
    path.join(runDir, "trials.json"),
    `${JSON.stringify(results, null, 2)}\n`,
  );
  const treatmentTrials = results.filter(
    (result) => result.arm === "professional-static-v3",
  ).length;
  const controlTrials = results.filter(
    (result) => result.arm === "deterministic-control-v1",
  ).length;
  await writeFile(
    path.join(runDir, "run.json"),
    `${JSON.stringify(
      {
        schemaVersion: 2,
        runId,
        manifest: {
          corpusVersion: manifest.corpusVersion,
          evaluatorVersion: manifest.evaluatorVersion,
        },
        treatmentTrials,
        controlTrials,
        modelId: args.modelId ?? releaseManifest.requestedModelId,
        mode: args.calibration ? "calibration" : "benchmark",
        evidencePolicy: "private route/viewport evidence references only",
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(
    `${JSON.stringify({ runId, runDir, treatmentTrials, controlTrials }, null, 2)}\n`,
  );
}

async function runTreatment(
  fixture: Fixture,
  base: string,
  runId: string,
  trial: 1 | 2,
  releaseManifest: ProfessionalSiteReleaseManifestV1,
  requestedModelId: string,
  calibrationDefects: ProfessionalDefectDefinition[],
): Promise<GeneratedSiteEvaluationTrialV4> {
  const input = createBenchmarkInput(fixture);
  const evidenceDir = path.join(base, "treatment-evidence");
  await mkdir(evidenceDir, { recursive: true });
  const evidence: EvidenceRefs = { desktop: [], mobile: [], images: new Map() };
  const calibrationSummary = emptyCalibrationSummary(releaseManifest);
  let pipelineResult: Awaited<ReturnType<typeof runProfessionalSitePipeline>>;
  try {
    pipelineResult = await runProfessionalSitePipeline(
      {
        mode: "calibration",
        releaseManifest,
        calibrationSummary,
        requestedModelId,
        projectId: input.projectId,
        userId: "generation-evaluation",
        attemptId: `${runId}-${fixture.id}-${trial}`,
        buildId: null,
      },
      {
        deriveSelectionInput: () => selectionInput(input),
        selectKit: (selection) =>
          selectProfessionalSiteKit(
            selection as Parameters<typeof selectProfessionalSiteKit>[0],
          ),
        compileContract: ({ selectionInput: _selectionInput, kit }) =>
          compileGeneratedSiteWriterContractV3({
            handoff: input.handoff,
            briefSnapshot: input.briefSnapshot,
            photoEnabled: input.photoEnabled,
            kit,
          }),
        compileBlueprint: ({ contract, kit }) =>
          compileProfessionalSiteBlueprint({ contract, kit }),
        runWriter: (writerInput) => runProfessionalSiteGenerate(writerInput),
        runCorrection: (correctionInput) =>
          runProfessionalSiteCorrection({
            ...correctionInput,
            acceptedPlan: correctionInput.plan,
            diagnostics: [correctionInput.reason],
            implicatedPaths: correctionInput.plan.routes.map((route) =>
              route.path === "/"
                ? "src/routes/index.tsx"
                : `src/routes/${route.path.slice(1)}.tsx`,
            ),
          }),
        build: async (files, projectId) =>
          buildGeneratedProject(files, {
            workspaceKey: `evaluation-${fixture.id}-${trial}-${projectId}`,
          }),
        runBrowser: async ({
          files,
          contract,
          blueprint,
          projectId,
          candidateId,
        }) =>
          runProfessionalSiteBrowserGates(
            {
              files,
              contract,
              blueprint,
              projectId,
              candidateId,
              timeoutMs: 10_000,
            },
            { storeEvidence: storeProfessionalEvidence(evidenceDir, evidence) },
          ),
        loadEvidence: async (report) =>
          loadProfessionalScreenshots(report, evidence),
        review: (reviewInput) =>
          runProfessionalSiteReview({
            ...reviewInput,
            modelId: requestedModelId,
          }),
        now: () => Date.now(),
      },
    );
  } catch (error) {
    throw new Error(
      `benchmark treatment failed before a proof was produced: ${messageOf(error)}`,
    );
  }
  await persistCandidate(
    base,
    "treatment",
    pipelineResult.ok ? pipelineResult.files : pipelineResult.stagedFiles,
    pipelineResult.ok ? pipelineResult.distFiles : [],
  );
  if (pipelineResult.ok && calibrationDefects.length > 0) {
    await captureCalibrationDefects({
      input,
      base,
      runId,
      requestedModelId,
      result: pipelineResult,
      defects: calibrationDefects,
    });
  }
  const proof = pipelineResult.proof;
  await recordTrialDiagnostic(runDir(base), {
    briefId: fixture.id,
    trial,
    arm: "professional-static-v3",
    outcome: proof.outcome,
    failureClass: pipelineResult.ok ? null : pipelineResult.failureClass,
    safeMessage: pipelineResult.ok ? null : pipelineResult.safeMessage,
    gates: { ...proof.gates },
    calls: proof.calls,
  });
  const reportEvidence = pipelineResult.ok
    ? pipelineResult.browserReport.evidenceIds
    : [];
  const refs =
    reportEvidence.length > 0
      ? reportEvidence
      : [...evidence.desktop, ...evidence.mobile];
  return trialFromProfessionalResult({
    runId,
    arm: "professional-static-v3",
    briefId: fixture.id,
    trial,
    result: { ok: pipelineResult.ok, proof },
    routePatternIds: pipelineResult.ok
      ? pipelineResult.plan.routes.map((route) => route.patternId)
      : [],
    desktopEvidenceRefs: refs.filter((ref) => ref.includes("-desktop.")),
    mobileEvidenceRefs: refs.filter((ref) => ref.includes("-mobile.")),
  });
}

async function captureCalibrationDefects(input: {
  input: BenchmarkInput;
  base: string;
  runId: string;
  requestedModelId: string;
  result: Extract<
    Awaited<ReturnType<typeof runProfessionalSitePipeline>>,
    { ok: true }
  >;
  defects: ProfessionalDefectDefinition[];
}): Promise<void> {
  const calibrationDir = path.join(input.base, "..", "..", "calibration");
  const marker = path.join(calibrationDir, "capture-complete");
  if (existsSync(marker)) {
    return;
  }
  const samples: CalibrationSample[] = [];
  for (const defect of input.defects) {
    const defectDir = path.join(calibrationDir, "defects", defect.id);
    await mkdir(defectDir, { recursive: true });
    const files = applyProfessionalDefect(input.result.files, defect);
    await writeFile(path.join(defectDir, "source.json"), JSON.stringify(files));
    const build = await buildGeneratedProject(files, {
      workspaceKey: `calibration-${input.runId}-${defect.id}`,
    });
    if (!build.ok) {
      continue;
    }
    const evidence: EvidenceRefs = {
      desktop: [],
      mobile: [],
      images: new Map(),
    };
    const browser = await runProfessionalSiteBrowserGates(
      {
        files: build.distFiles,
        contract: input.result.contract,
        blueprint: input.result.blueprint,
        projectId: input.input.projectId,
        candidateId: `calibration-${defect.id}`,
        timeoutMs: 10_000,
      },
      {
        storeEvidence: storeProfessionalEvidence(defectDir, evidence),
      },
    );
    const budget = new GeneratedSiteCallBudget();
    const review = await runProfessionalSiteReview({
      contract: input.result.contract,
      blueprint: input.result.blueprint,
      plan: input.result.plan,
      kit: input.input.kit,
      sourceReport: input.result.sourceReport,
      browserReport: browser,
      screenshots: await loadProfessionalScreenshots(browser, evidence),
      budget,
      modelId: input.requestedModelId,
    });
    const predictedRatings = categoryPredictions(review);
    for (const route of input.result.blueprint.routes) {
      const desktopEvidenceRef = evidence.images.has(`${route.path}:desktop`)
        ? evidence.desktop.find((ref) =>
            ref.endsWith(`${routeToken(route.path)}-desktop.jpg`),
          )
        : undefined;
      const mobileEvidenceRef = evidence.images.has(`${route.path}:mobile`)
        ? evidence.mobile.find((ref) =>
            ref.endsWith(`${routeToken(route.path)}-mobile.jpg`),
          )
        : undefined;
      if (!desktopEvidenceRef || !mobileEvidenceRef) {
        continue;
      }
      samples.push({
        sampleId: `defect:${defect.id}:${route.path}`,
        defectId: defect.id,
        expectedRatingMaximum: defect.expectedRatingMaximum,
        route: route.path,
        mobileEvidenceRef,
        desktopEvidenceRef,
        predictedRatings,
      });
    }
  }
  await writeFile(
    path.join(calibrationDir, "defect-samples.json"),
    `${JSON.stringify({ schemaVersion: 1, samples }, null, 2)}\n`,
  );
  await writeFile(marker, "complete\n");
}

function categoryPredictions(
  review: GeneratedSiteProfessionalReviewV1,
): Partial<Record<ProfessionalReviewCategory, number>> {
  if (review.status !== "complete") {
    return {};
  }
  return Object.fromEntries(
    [
      "business_specificity",
      "first_view_hierarchy",
      "content_architecture",
      "composition_rhythm",
      "typography",
      "color_system",
      "media_integrity",
      "mobile_quality",
      "professional_finish",
    ].flatMap((category) => {
      const ratings = review.assessments
        .filter((assessment) => assessment.category === category)
        .map((assessment) => assessment.rating);
      return ratings.length ? [[category, Math.min(...ratings)]] : [];
    }),
  ) as Partial<Record<ProfessionalReviewCategory, number>>;
}

function runDir(base: string): string {
  return path.join(base, "..", "..");
}

/**
 * Private per-trial progress. Without it a systematic treatment failure stays
 * invisible until the whole corpus finishes, which is how a full calibration
 * run was spent on trials that could never produce a sample.
 */
async function recordTrialDiagnostic(
  directory: string,
  input: Parameters<typeof summarizeGenerationTrialDiagnostics>[0],
): Promise<void> {
  const diagnostic = summarizeGenerationTrialDiagnostics(input);
  await appendFile(
    path.join(directory, "progress.jsonl"),
    `${JSON.stringify(diagnostic)}\n`,
  );
  process.stdout.write(
    `${input.briefId} trial-${input.trial} ${input.arm} ${input.outcome}${
      diagnostic.failureClass ? ` ${diagnostic.failureClass}` : ""
    }\n`,
  );
}

function routeToken(route: string): string {
  return route === "/" ? "home" : route.slice(1).replaceAll("/", "-");
}

async function runControl(
  fixture: Fixture,
  base: string,
  runId: string,
  trial: 1 | 2,
): Promise<GeneratedSiteEvaluationTrialV4> {
  const started = Date.now();
  let outcome: GeneratedSiteEvaluationTrialV4["outcome"] =
    "infrastructure_error";
  let routeCount = 0;
  const evidence: string[] = [];
  try {
    const input = createBenchmarkInput(fixture);
    const starterFiles = createViteTanStackShadcnStarterFiles(
      input.projectId,
      input.schema,
    );
    const routeFiles = input.blueprint.routes.map((route) => ({
      path: route.filePath,
      content: createControlRoute(input.controlContract, route.exportName),
    }));
    const existingPaths = new Set(starterFiles.map((file) => file.path));
    const files = [
      ...starterFiles.map((file) => {
        if (file.path === "src/router.tsx") {
          return compileProfessionalSiteRouter(input.blueprint.routes);
        }
        const route = routeFiles.find(
          (candidate) => candidate.path === file.path,
        );
        return route ?? file;
      }),
      ...routeFiles.filter((route) => !existingPaths.has(route.path)),
    ];
    const build = await buildGeneratedProject(files, {
      workspaceKey: `evaluation-control-${fixture.id}-${trial}`,
    });
    if (build.ok) {
      const report = await runLegacyBrowser(build.distFiles, input, base);
      outcome = report.status === "pass" ? "pass" : report.status;
      routeCount = new Set(report.routes.map((route) => route.route)).size;
      evidence.push(...report.evidenceIds);
    } else {
      outcome = "fail";
    }
    await persistCandidate(
      base,
      "control",
      files,
      build.ok ? build.distFiles : [],
    );
  } catch {
    outcome = "infrastructure_error";
  }
  await recordTrialDiagnostic(runDir(base), {
    briefId: fixture.id,
    trial,
    arm: "deterministic-control-v1",
    outcome,
    failureClass: outcome === "pass" ? null : outcome,
    safeMessage: null,
    gates: { browser: outcome },
    calls: {
      writerCalls: 0,
      criticCalls: 0,
      correctionCalls: 0,
      correctionReason: null,
    },
  });
  return {
    runId,
    arm: "deterministic-control-v1",
    briefId: fixture.id,
    trial,
    outcome,
    routeCount,
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
    hardFailures: {
      fact: 0,
      action: 0,
      media: 0,
      accessibility: 0,
      route: 0,
      contract: 0,
    },
    professionalVisual: "not_run",
    minimumProfessionalRating: null,
    categoryRatings: {},
    routePatternIds: [],
    desktopEvidenceRefs: evidence.filter((ref) => ref.includes("-desktop.")),
    mobileEvidenceRefs: evidence.filter((ref) => ref.includes("-mobile.")),
  };
}

function fixtureRouteCount(fixture: Fixture): number {
  const plan = parseBuildPlan(fixture.acceptedPlan);
  if (!plan.ok) {
    throw new Error(plan.reason);
  }
  return plan.value.pages.length;
}

function createBenchmarkInput(fixture: Fixture): BenchmarkInput {
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
  const roles = deriveProfessionalRouteRoles({ handoff });
  const selection = {
    archetype: planResult.value.archetype,
    density:
      briefSnapshot.offers.length > 2
        ? "rich"
        : briefSnapshot.offers.length === 0
          ? "sparse"
          : "regular",
    mediaMode: fixture.expected.mediaMode,
    hasOperationalDetails:
      briefSnapshot.content.hours.length > 0 ||
      Boolean(briefSnapshot.content.address),
    routeRoles: roles,
  } as Parameters<typeof selectProfessionalSiteKit>[0];
  const kit = selectProfessionalSiteKit(selection);
  const contract = compileGeneratedSiteWriterContractV3({
    handoff,
    briefSnapshot,
    photoEnabled: fixture.expected.mediaMode === "owner_assets",
    kit,
  });
  const blueprint = compileProfessionalSiteBlueprint({ contract, kit });
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
    photoEnabled: fixture.expected.mediaMode === "owner_assets",
    recipe,
  });
  return {
    fixture,
    projectId: `evaluation-${fixture.id}`,
    briefSnapshot,
    handoff,
    schema,
    photoEnabled: fixture.expected.mediaMode === "owner_assets",
    contract,
    blueprint,
    kit,
    controlContract,
  };
}

function selectionInput(
  input: BenchmarkInput,
): Parameters<typeof selectProfessionalSiteKit>[0] {
  return {
    archetype: input.handoff.plan.archetype,
    density: input.contract.visualInputs.density,
    mediaMode: input.contract.media.mode,
    hasOperationalDetails:
      input.contract.content.hours.length > 0 ||
      Boolean(input.contract.content.address),
    routeRoles: deriveProfessionalRouteRoles({ handoff: input.handoff }),
  };
}

function emptyCalibrationSummary(
  manifest: ProfessionalSiteReleaseManifestV1,
): ProfessionalCalibrationSummaryV1 {
  return {
    schemaVersion: 1,
    promptVersion: manifest.criticPromptVersion,
    kitVersion: 2,
    evaluatorVersion: manifest.evaluatorVersion,
    samples: manifest.calibration.samples,
    seededDefects: manifest.calibration.seededDefects,
    categories: Object.fromEntries(
      PROFESSIONAL_REVIEW_CATEGORIES.map((category) => [
        category,
        { positives: 1, negatives: 1 },
      ]),
    ) as ProfessionalCalibrationSummaryV1["categories"],
    blockerPrecision: manifest.calibration.blockerPrecision,
    blockerRecall: manifest.calibration.blockerRecall,
    falseReadyRate: manifest.calibration.falseReadyRate,
    p0FalseAccepts: manifest.calibration.p0FalseAccepts,
    acceptedReference07RejectedForMinimalism: false,
  };
}

function createControlRoute(
  contract: ReturnType<typeof compileGeneratedSiteContract>,
  exportName: string,
): string {
  return `import { Button } from "@/components/ui/button";\nimport { site } from "@/content/site";\nimport { usePreviewReady } from "@/lib/preview-ready";\n\nexport function ${exportName}() {\n  usePreviewReady();\n  return <main className="min-h-dvh bg-background p-8 text-foreground"><section className="mx-auto max-w-4xl py-16"><p className="text-sm font-semibold uppercase tracking-widest text-accent">{site.eyebrow}</p><h1 className="mt-4 text-5xl font-semibold">{site.headline}</h1><p className="mt-6 text-lg text-muted-foreground">{site.subheadline}</p><Button asChild className="mt-8"><a href="${whatsappHref(contract.business.primaryCta.target)}">{site.primaryCta}</a></Button></section></main>;\n}`;
}

function whatsappHref(target: string): string {
  return `https://wa.me/${target.replace(/\\D/g, "")}`;
}

async function runLegacyBrowser(
  files: GeneratedDistFile[],
  input: BenchmarkInput,
  base: string,
): Promise<BrowserGateReport> {
  const directory = path.join(base, "control-evidence");
  await mkdir(directory, { recursive: true });
  return (
    await import("../src/lib/projects/generated-site-browser-runner")
  ).runGeneratedSiteBrowserGates(
    {
      projectId: input.projectId,
      candidateId: `control-${input.fixture.id}`,
      files,
      contract: input.controlContract,
      timeoutMs: 10_000,
    },
    { storeEvidence: legacyEvidenceStore(directory) },
  );
}

function storeProfessionalEvidence(directory: string, evidence: EvidenceRefs) {
  return async (input: {
    route: string;
    viewport: "mobile" | "desktop";
    value: unknown;
    screenshot?: Uint8Array;
  }) => {
    const route =
      input.route === "/" ? "home" : input.route.slice(1).replaceAll("/", "-");
    const prefix = `${route}-${input.viewport}`;
    const report = path.join(directory, `${prefix}-report.json`);
    await writeFile(report, JSON.stringify(input.value));
    const refs = [report];
    const key = `${input.route}:${input.viewport}`;
    if (input.viewport === "mobile") {
      evidence.mobile.push(report);
    } else {
      evidence.desktop.push(report);
    }
    if (input.screenshot) {
      const image = path.join(directory, `${prefix}.jpg`);
      await writeFile(image, input.screenshot);
      evidence.images.set(key, input.screenshot);
      if (input.viewport === "mobile") {
        evidence.mobile.push(image);
      } else {
        evidence.desktop.push(image);
      }
      refs.push(image);
    }
    return refs;
  };
}

function legacyEvidenceStore(directory: string) {
  return async (input: {
    route: string;
    viewport: "mobile" | "desktop";
    value: unknown;
    screenshot?: Uint8Array;
  }) => {
    const prefix = `${input.route === "/" ? "home" : input.route.slice(1)}-${input.viewport}`;
    const report = path.join(directory, `${prefix}-report.json`);
    await writeFile(report, JSON.stringify(input.value));
    const refs = [report];
    if (input.screenshot) {
      const image = path.join(directory, `${prefix}.jpg`);
      await writeFile(image, input.screenshot);
      refs.push(image);
    }
    return refs;
  };
}

async function loadProfessionalScreenshots(
  report: {
    routes: Array<{ route: string; viewport: "mobile" | "desktop" }>;
    evidenceIds: string[];
  },
  evidence: EvidenceRefs,
): Promise<
  Array<{ route: string; viewport: "mobile" | "desktop"; bytes: Uint8Array }>
> {
  return report.routes.flatMap((route) => {
    const bytes = evidence.images.get(`${route.route}:${route.viewport}`);
    return bytes
      ? [{ route: route.route, viewport: route.viewport, bytes }]
      : [];
  });
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

function parseArgs(argv: string[]): Args {
  const result: Args = { calibration: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--manifest") {
      result.manifest = argv[++index];
    } else if (argv[index] === "--output") {
      result.output = argv[++index];
    } else if (argv[index] === "--run-id") {
      result.runId = argv[++index];
    } else if (argv[index] === "--model-id") {
      result.modelId = argv[++index];
    } else if (argv[index] === "--release-manifest") {
      result.releaseManifest = argv[++index];
    } else if (argv[index] === "--calibration") {
      result.calibration = true;
    }
  }
  return result;
}

async function readCalibrationDefects(): Promise<
  ProfessionalDefectDefinition[]
> {
  const value = JSON.parse(
    await readFile(
      path.join(
        ROOT,
        "fixtures/generation-evaluation/professional-defects.json",
      ),
      "utf8",
    ),
  ) as { defects: ProfessionalDefectDefinition[] };
  if (value.defects.length !== 30) {
    throw new Error("calibration requires exactly 30 seeded defects");
  }
  return value.defects;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "benchmark trial failed";
}

await main();
