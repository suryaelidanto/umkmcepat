import {
  runOneStreamedResponse,
  type BatchedGenerateEventSink,
} from "./batched-generator";
import {
  buildProfessionalSiteCorrectionPrompt,
  buildProfessionalSiteWriterPrompt,
} from "./batched-prompt";
import { compileProfessionalSiteTheme } from "./generated-site-theme";
import { compileProfessionalSiteRouter } from "./professional-site-router";
import {
  inspectProfessionalStaticSiteSource,
  type ProfessionalSiteSourceGateReportV1,
} from "./professional-site-source-gates";
import { createGeneratedSitePrimitiveFiles } from "./scaffold/generated-site-primitives";
import { createViteTanStackShadcnStarterFiles } from "./scaffold/vite-tanstack-shadcn-starter";
import { createFallbackProjectSiteSchema } from "./site-schema";

import type { GeneratedSiteCallBudgetSnapshot } from "./generated-site-call-budget";
import type {
  GeneratedSiteWriterContractV3,
  ProfessionalSiteContentV1,
} from "./generated-site-contract";
import type { GeneratedProjectFile } from "./generated-types";
import type { ProfessionalSiteBlueprintV1 } from "./professional-site-blueprint";
import type { GeneratedSiteDesignKitV2 } from "./professional-site-kits";
import type { WriterDesignPlanV3 } from "./professional-site-plan";

export type { ProfessionalSiteSourceGateReportV1 } from "./professional-site-source-gates";

export type ProfessionalSiteGenerateResult =
  | {
      ok: true;
      files: GeneratedProjectFile[];
      plan: WriterDesignPlanV3;
      summary: string;
      writtenPaths: string[];
      sourceReport: ProfessionalSiteSourceGateReportV1;
      modelRequested: string;
      modelServed: string | null;
      writerMs: number;
      firstFileClosedMs: number | null;
      editableBytes: number;
    }
  | {
      ok: false;
      reason: string;
      stagedFiles: GeneratedProjectFile[];
      plan: WriterDesignPlanV3 | null;
      sourceReport: ProfessionalSiteSourceGateReportV1 | null;
      modelRequested: string;
      modelServed: string | null;
      writerMs: number;
      firstFileClosedMs: number | null;
      editableBytes: number;
    };

export function professionalEditableBytes(input: {
  plan: WriterDesignPlanV3;
  files: GeneratedProjectFile[];
}): number {
  return (
    Buffer.byteLength(JSON.stringify(input.plan), "utf8") +
    input.files.reduce(
      (total, file) => total + Buffer.byteLength(file.content, "utf8"),
      0,
    )
  );
}

export async function runProfessionalSiteGenerate(input: {
  contract: GeneratedSiteWriterContractV3;
  blueprint: ProfessionalSiteBlueprintV1;
  kit: GeneratedSiteDesignKitV2;
  projectId: string;
  userId: string;
  attemptId: string;
  buildId: string | null;
  budget: {
    consumeWriter: () => void;
    snapshot: () => GeneratedSiteCallBudgetSnapshot;
  };
  abortSignal?: AbortSignal;
  onEvent?: BatchedGenerateEventSink;
  onFileStaged?: (file: { content: string; path: string }) => void;
}): Promise<ProfessionalSiteGenerateResult> {
  const requiredFilePaths = requiredProfessionalFilePaths(input.blueprint);
  const schema = createFallbackProjectSiteSchema(input.contract.business.name);
  const primitiveFiles = createGeneratedSitePrimitiveFiles(input.kit);
  const starterFiles = filterMediaStarterFiles(
    createViteTanStackShadcnStarterFiles(
      input.projectId,
      schema,
      primitiveFiles,
    ),
    input.contract.media.mode,
  );
  const prompt = buildProfessionalSiteWriterPrompt({
    contract: input.contract,
    blueprint: input.blueprint,
    kit: input.kit,
  });
  const startedAt = Date.now();
  input.budget.consumeWriter();
  const writer = await runOneStreamedResponse({
    abortSignal: input.abortSignal,
    attemptId: input.attemptId,
    buildId: input.buildId,
    designPlanV3Expected: {
      blueprint: input.blueprint,
      kit: input.kit,
    },
    maxRetries: 0,
    onEvent: input.onEvent,
    onFileStaged: input.onFileStaged,
    phase: "writer",
    projectId: input.projectId,
    requiredFilePaths,
    retryCount: 0,
    requireDesignPlan: true,
    stopAfterRequiredFilePaths: true,
    system: prompt.system,
    task: "build-step",
    user: prompt.user,
  });
  const writerMs = writer.requestMs || Date.now() - startedAt;
  const editableFiles = [...writer.response.files.values()];
  const plan = writer.response.designPlanV3 ?? null;
  const editableBytes = plan
    ? professionalEditableBytes({ plan, files: editableFiles })
    : editableFiles.reduce(
        (total, file) => total + Buffer.byteLength(file.content, "utf8"),
        0,
      );
  const stagedFiles = [...starterFiles, ...editableFiles];

  if (writer.parseError || !plan) {
    return failure({
      reason:
        writer.parseError?.message ??
        "professional writer did not return a complete V3 design plan",
      stagedFiles,
      plan,
      modelRequested: writer.modelRequested,
      modelServed: writer.modelServed,
      writerMs,
      firstFileClosedMs: writer.firstFileClosedMs ?? null,
      editableBytes,
    });
  }
  if (editableBytes > editableByteLimit(input.blueprint)) {
    return failure({
      reason: "professional writer exceeded its UTF-8 editable byte budget",
      stagedFiles,
      plan,
      modelRequested: writer.modelRequested,
      modelServed: writer.modelServed,
      writerMs,
      firstFileClosedMs: writer.firstFileClosedMs ?? null,
      editableBytes,
    });
  }
  const required = new Set(requiredFilePaths);
  const missing = requiredFilePaths.filter(
    (path) => !writer.response.files.has(path),
  );
  if (missing.length > 0) {
    return failure({
      reason: `professional writer omitted required files: ${missing.join(", ")}`,
      stagedFiles,
      plan,
      modelRequested: writer.modelRequested,
      modelServed: writer.modelServed,
      writerMs,
      firstFileClosedMs: writer.firstFileClosedMs ?? null,
      editableBytes,
    });
  }
  const unexpected = editableFiles.filter((file) => !required.has(file.path));
  if (unexpected.length > 0) {
    return failure({
      reason: `professional writer emitted unexpected paths: ${unexpected
        .map((file) => file.path)
        .join(", ")}`,
      stagedFiles,
      plan,
      modelRequested: writer.modelRequested,
      modelServed: writer.modelServed,
      writerMs,
      firstFileClosedMs: writer.firstFileClosedMs ?? null,
      editableBytes,
    });
  }
  const protectedEmission = editableFiles.find((file) =>
    isProfessionalProtectedPath(file.path),
  );
  if (protectedEmission) {
    return failure({
      reason: `professional writer emitted protected path: ${protectedEmission.path}`,
      stagedFiles,
      plan,
      modelRequested: writer.modelRequested,
      modelServed: writer.modelServed,
      writerMs,
      firstFileClosedMs: writer.firstFileClosedMs ?? null,
      editableBytes,
    });
  }

  try {
    const theme = compileProfessionalSiteTheme({ kit: input.kit, plan });
    const router = compileProfessionalSiteRouter(input.blueprint.routes);
    const content = compileProfessionalSiteContentFile(input.contract.content);
    const files = mergeProfessionalFiles({
      starterFiles,
      editableFiles,
      protectedFiles: [
        content,
        { path: "src/index.css", content: theme.css },
        router,
      ],
    });
    const sourceReport = inspectProfessionalStaticSiteSource({
      contract: input.contract,
      blueprint: input.blueprint,
      kit: input.kit,
      plan,
      files,
      starterFiles,
      themeChecks: theme.checks,
    });
    if (sourceReport.status === "fail") {
      return failure({
        reason: `professional source gate failed: ${sourceReport.findings
          .map((finding) => finding.code)
          .join(", ")}`,
        stagedFiles: files,
        plan,
        sourceReport,
        modelRequested: writer.modelRequested,
        modelServed: writer.modelServed,
        writerMs,
        firstFileClosedMs: writer.firstFileClosedMs ?? null,
        editableBytes,
      });
    }
    return {
      ok: true,
      files,
      plan,
      summary: writer.response.doneSummary ?? "Professional site emitted.",
      writtenPaths: editableFiles.map((file) => file.path).sort(),
      sourceReport,
      modelRequested: writer.modelRequested,
      modelServed: writer.modelServed,
      writerMs,
      firstFileClosedMs: writer.firstFileClosedMs ?? null,
      editableBytes,
    };
  } catch (error) {
    return failure({
      reason:
        error instanceof Error
          ? error.message
          : "professional scaffold merge failed",
      stagedFiles,
      plan,
      modelRequested: writer.modelRequested,
      modelServed: writer.modelServed,
      writerMs,
      firstFileClosedMs: writer.firstFileClosedMs ?? null,
      editableBytes,
    });
  }
}

export async function runProfessionalSiteCorrection(input: {
  contract: GeneratedSiteWriterContractV3;
  blueprint: ProfessionalSiteBlueprintV1;
  kit: GeneratedSiteDesignKitV2;
  acceptedPlan: WriterDesignPlanV3;
  reason: import("./generated-site-call-budget").GeneratedSiteCorrectionReason;
  diagnostics: string[];
  implicatedPaths: string[];
  files: GeneratedProjectFile[];
  projectId: string;
  attemptId: string;
  buildId: string | null;
  budget: {
    consumeCorrection: (
      reason: import("./generated-site-call-budget").GeneratedSiteCorrectionReason,
    ) => void;
  };
  abortSignal?: AbortSignal;
  onEvent?: BatchedGenerateEventSink;
  onFileStaged?: (file: { content: string; path: string }) => void;
}): Promise<ProfessionalSiteGenerateResult> {
  const writablePaths = new Set(requiredProfessionalFilePaths(input.blueprint));
  const invalidPaths = input.implicatedPaths.filter(
    (path) => !writablePaths.has(path),
  );
  if (input.implicatedPaths.length === 0 || invalidPaths.length > 0) {
    return failure({
      reason: invalidPaths.length
        ? `professional correction implicated protected or unknown paths: ${invalidPaths.join(", ")}`
        : "professional correction requires at least one implicated path",
      stagedFiles: input.files,
      plan: input.acceptedPlan,
      modelRequested: "unrequested",
      modelServed: null,
      writerMs: 0,
      firstFileClosedMs: null,
      editableBytes: professionalEditableBytes({
        plan: input.acceptedPlan,
        files: input.files.filter((file) => writablePaths.has(file.path)),
      }),
    });
  }
  const schema = createFallbackProjectSiteSchema(input.contract.business.name);
  const primitiveFiles = createGeneratedSitePrimitiveFiles(input.kit);
  const starterFiles = filterMediaStarterFiles(
    createViteTanStackShadcnStarterFiles(
      input.projectId,
      schema,
      primitiveFiles,
    ),
    input.contract.media.mode,
  );
  const prompt = buildProfessionalSiteCorrectionPrompt({
    contract: input.contract,
    blueprint: input.blueprint,
    kit: input.kit,
    acceptedPlan: input.acceptedPlan,
    reason: input.reason,
    diagnostics: input.diagnostics,
    implicatedPaths: input.implicatedPaths,
    files: input.files,
  });
  const startedAt = Date.now();
  input.budget.consumeCorrection(input.reason);
  const response = await runOneStreamedResponse({
    abortSignal: input.abortSignal,
    attemptId: input.attemptId,
    buildId: input.buildId,
    designPlanV3Expected: {
      blueprint: input.blueprint,
      kit: input.kit,
    },
    maxRetries: 0,
    onEvent: input.onEvent,
    onFileStaged: input.onFileStaged,
    phase: "repair",
    projectId: input.projectId,
    requiredFilePaths: input.implicatedPaths,
    retryCount: 0,
    requireDesignPlan: true,
    stopAfterRequiredFilePaths: true,
    system: prompt.system,
    task: "build-step",
    user: prompt.user,
  });
  const writerMs = response.requestMs || Date.now() - startedAt;
  const responseFiles = [...response.response.files.values()];
  const plan = response.response.designPlanV3 ?? null;
  const editableBeforeCompile = input.files.filter((file) =>
    writablePaths.has(file.path),
  );
  const editableByPath = new Map(
    editableBeforeCompile.map((file) => [file.path, file]),
  );
  for (const file of responseFiles) {
    if (!writablePaths.has(file.path)) {
      return failure({
        reason: `professional correction emitted an out-of-scope path: ${file.path}`,
        stagedFiles: input.files,
        plan,
        modelRequested: response.modelRequested,
        modelServed: response.modelServed,
        writerMs,
        firstFileClosedMs: response.firstFileClosedMs ?? null,
        editableBytes: plan
          ? professionalEditableBytes({ plan, files: responseFiles })
          : 0,
      });
    }
    editableByPath.set(file.path, file);
  }
  const missing = input.implicatedPaths.filter(
    (path) => !response.response.files.has(path),
  );
  const sameAcceptedPlan =
    plan !== null &&
    JSON.stringify(plan) === JSON.stringify(input.acceptedPlan);
  const editableBytes = plan
    ? professionalEditableBytes({ plan, files: [...editableByPath.values()] })
    : 0;
  if (response.parseError || !plan || !sameAcceptedPlan || missing.length > 0) {
    return failure({
      reason:
        response.parseError?.message ??
        (missing.length > 0
          ? `professional correction omitted implicated paths: ${missing.join(", ")}`
          : "professional correction changed or omitted the accepted V3 plan"),
      stagedFiles: input.files,
      plan,
      modelRequested: response.modelRequested,
      modelServed: response.modelServed,
      writerMs,
      firstFileClosedMs: response.firstFileClosedMs ?? null,
      editableBytes,
    });
  }
  try {
    const theme = compileProfessionalSiteTheme({
      kit: input.kit,
      plan: input.acceptedPlan,
    });
    const compiledFiles = mergeProfessionalFiles({
      starterFiles,
      editableFiles: [...editableByPath.values()],
      protectedFiles: [
        compileProfessionalSiteContentFile(input.contract.content),
        { path: "src/index.css", content: theme.css },
        compileProfessionalSiteRouter(input.blueprint.routes),
      ],
    });
    const sourceReport = inspectProfessionalStaticSiteSource({
      contract: input.contract,
      blueprint: input.blueprint,
      kit: input.kit,
      plan: input.acceptedPlan,
      files: compiledFiles,
      starterFiles,
      themeChecks: theme.checks,
    });
    if (sourceReport.status === "fail") {
      return failure({
        reason: `professional correction source gate failed: ${sourceReport.findings
          .map((finding) => finding.code)
          .join(", ")}`,
        stagedFiles: compiledFiles,
        plan: input.acceptedPlan,
        sourceReport,
        modelRequested: response.modelRequested,
        modelServed: response.modelServed,
        writerMs,
        firstFileClosedMs: response.firstFileClosedMs ?? null,
        editableBytes,
      });
    }
    return {
      ok: true,
      files: compiledFiles,
      plan: input.acceptedPlan,
      summary:
        response.response.doneSummary ?? "Professional correction emitted.",
      writtenPaths: responseFiles.map((file) => file.path).sort(),
      sourceReport,
      modelRequested: response.modelRequested,
      modelServed: response.modelServed,
      writerMs,
      firstFileClosedMs: response.firstFileClosedMs ?? null,
      editableBytes,
    };
  } catch (error) {
    return failure({
      reason:
        error instanceof Error
          ? error.message
          : "professional correction scaffold merge failed",
      stagedFiles: input.files,
      plan: input.acceptedPlan,
      modelRequested: response.modelRequested,
      modelServed: response.modelServed,
      writerMs,
      firstFileClosedMs: response.firstFileClosedMs ?? null,
      editableBytes,
    });
  }
}

function requiredProfessionalFilePaths(
  blueprint: ProfessionalSiteBlueprintV1,
): string[] {
  const paths = blueprint.routes.map((route) => route.filePath);
  if (blueprint.pageStrategy.mode === "multi") {
    paths.push("src/components/site/generated-shell.tsx");
  }
  return paths;
}

function editableByteLimit(blueprint: ProfessionalSiteBlueprintV1): number {
  return blueprint.pageStrategy.mode === "multi" ? 48 * 1024 : 32 * 1024;
}

function filterMediaStarterFiles(
  files: GeneratedProjectFile[],
  mediaMode: GeneratedSiteWriterContractV3["media"]["mode"],
): GeneratedProjectFile[] {
  if (mediaMode === "owner_assets") {
    return files;
  }
  return files.filter(
    (file) =>
      file.path !== "public/placeholder.svg" &&
      file.path !== "public/placeholder-vertical.svg",
  );
}

function compileProfessionalSiteContentFile(
  content: ProfessionalSiteContentV1,
): GeneratedProjectFile {
  return {
    path: "src/content/site.ts",
    content: `export const site = ${JSON.stringify(content, null, 2)} as const;\nexport default site;\n`,
  };
}

function isProfessionalProtectedPath(path: string): boolean {
  return new Set([
    "src/content/site.ts",
    "src/index.css",
    "src/router.tsx",
    "src/main.tsx",
    "src/routes/__root.tsx",
    "src/lib/preview-ready.ts",
    "src/lib/utils.ts",
    "src/components/site/layout.tsx",
  ]).has(path);
}

function mergeProfessionalFiles(input: {
  starterFiles: GeneratedProjectFile[];
  editableFiles: GeneratedProjectFile[];
  protectedFiles: GeneratedProjectFile[];
}): GeneratedProjectFile[] {
  const byPath = new Map(input.starterFiles.map((file) => [file.path, file]));
  for (const file of input.editableFiles) {
    if (isProfessionalProtectedPath(file.path)) {
      throw new Error(
        `professional writer emitted protected path: ${file.path}`,
      );
    }
    byPath.set(file.path, file);
  }
  for (const file of input.protectedFiles) {
    byPath.set(file.path, file);
  }
  return [...byPath.values()];
}

function failure(input: {
  sourceReport?: ProfessionalSiteSourceGateReportV1 | null;
  reason: string;
  stagedFiles: GeneratedProjectFile[];
  plan: WriterDesignPlanV3 | null;
  modelRequested: string;
  modelServed: string | null;
  writerMs: number;
  firstFileClosedMs: number | null;
  editableBytes: number;
}): ProfessionalSiteGenerateResult {
  return {
    ok: false,
    reason: input.reason,
    stagedFiles: input.stagedFiles,
    plan: input.plan,
    sourceReport: input.sourceReport ?? null,
    modelRequested: input.modelRequested,
    modelServed: input.modelServed,
    writerMs: input.writerMs,
    firstFileClosedMs: input.firstFileClosedMs,
    editableBytes: input.editableBytes,
  };
}
