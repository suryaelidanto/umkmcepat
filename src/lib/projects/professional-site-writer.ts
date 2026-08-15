import {
  runOneStreamedResponse,
  type BatchedGenerateEventSink,
} from "./batched-generator";
import { buildProfessionalSiteWriterPrompt } from "./batched-prompt";
import { compileProfessionalSiteTheme } from "./generated-site-theme";
import { compileProfessionalSiteRouter } from "./professional-site-router";
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

export type ProfessionalSiteHardFailureKind =
  "fact" | "action" | "media" | "accessibility" | "route" | "contract";

export type ProfessionalSiteSourceGateReportV1 = {
  version: 1;
  status: "pass" | "fail";
  findings: Array<{ code: string; message: string; path?: string }>;
  hardFailureCounts: Record<ProfessionalSiteHardFailureKind, number>;
  professionalSignals: Array<{ code: string; path: string; detail: string }>;
};

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
    const sourceReport = createPendingSourceReport();
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

function createPendingSourceReport(): ProfessionalSiteSourceGateReportV1 {
  return {
    version: 1,
    status: "pass",
    findings: [],
    hardFailureCounts: {
      fact: 0,
      action: 0,
      media: 0,
      accessibility: 0,
      route: 0,
      contract: 0,
    },
    professionalSignals: [],
  };
}

function failure(input: {
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
    sourceReport: null,
    modelRequested: input.modelRequested,
    modelServed: input.modelServed,
    writerMs: input.writerMs,
    firstFileClosedMs: input.firstFileClosedMs,
    editableBytes: input.editableBytes,
  };
}
