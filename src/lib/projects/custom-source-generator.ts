import { isStepCount, tool, ToolLoopAgent } from "ai";
import { z } from "zod";

import { getAiModel, getAiTelemetry } from "@/lib/ai";
import { getAgentMaxSteps } from "@/lib/ai-agent-steps";
import { getGenerationModel } from "@/lib/ai-models";
import { withAiTimeout } from "@/lib/ai-timeouts";
import {
  runGeneratedAppAgentTools,
  type GeneratedAppAgentOperation,
  type GeneratedAppAgentToolCommand,
} from "@/lib/projects/agent-tool-runner";
import {
  createGeneratedViteTanStackStarterFiles,
  createStarterContractStyles,
} from "@/lib/projects/generated-source";
import { type GeneratedProjectFile } from "@/lib/projects/generated-types";
import { type ImplementationSpec } from "@/lib/projects/implementation-spec";
import { type ProjectSiteSchema } from "@/lib/projects/site-schema";

/** Paths auto-touched by ensureStylesCoverClassNames — not agent edits. */
const AUTO_STYLE_PATH = "src/styles.css";

const NO_MEANINGFUL_EDIT_ISSUES = [
  "agent did not edit enough files",
  "agent did not edit any presentation or content files",
] as const;

export type CustomGeneratedSourceResult = {
  buildSpec: string;
  files: GeneratedProjectFile[];
  generationMode: "agent-custom" | "agent-partial";
  modelId?: string;
  operationTrace: GeneratedAppAgentOperation[];
  partial?: boolean;
  repairAttempts: number;
  summary: string;
  touchedFiles: string[];
  usage?: { inputTokens: number; outputTokens: number };
};

type RunCommand = (command: GeneratedAppAgentToolCommand) => unknown;

export async function generateCustomProjectFilesWithAgent({
  implementationBrief,
  onOperation,
  projectId,
  implementationSpec,
  schema,
}: {
  implementationBrief?: string;
  implementationSpec?: ImplementationSpec;
  onOperation?: (operation: GeneratedAppAgentOperation) => void;
  projectId: string;
  schema: ProjectSiteSchema;
}): Promise<CustomGeneratedSourceResult> {
  const starterFiles = createGeneratedViteTanStackStarterFiles(
    projectId,
    schema,
  );
  const appSpec = buildGeneratedAppBuildSpec({
    conversationBrief: implementationBrief,
    implementationSpec,
    schema,
  });
  let files = starterFiles;
  const operationTrace: GeneratedAppAgentOperation[] = [];
  const touchedFiles = new Set<string>();
  /** Paths the agent actually write/replace'd (excludes auto CSS ensure). */
  const agentEditedFiles = new Set<string>();

  const runCommand: RunCommand = (command) => {
    const result = runGeneratedAppAgentTools({
      commands: [command],
      files,
      onOperation(operation) {
        const traced = { ...operation, id: `${operationTrace.length + 1}` };
        operationTrace.push(traced);
        onOperation?.(traced);
      },
    });
    files = result.files;

    for (const effect of result.sideEffects) {
      if (effect.path) {
        touchedFiles.add(effect.path);
        if (
          command.type === "write_file" ||
          command.type === "replace_in_file"
        ) {
          agentEditedFiles.add(effect.path);
        }
      }
    }

    return result.outputs.at(-1) ?? { type: command.type };
  };

  try {
    const generateSteps = getAgentMaxSteps("generate");
    const agent = new ToolLoopAgent({
      model: getAiModel(getGenerationModel()),
      // Reasoning models emit hidden reasoning_content per step; without a
      // generous per-step budget the visible tool-call never lands.
      maxOutputTokens: 12_000,
      instructions: buildGeneratedAppAgentInstructions(
        schema,
        implementationSpec,
        "generate",
      ),
      telemetry: getAiTelemetry("project-source-generation-agent", {
        projectId,
      }),
      // Step cap is a brake only — outcome still comes from quality checklist.
      stopWhen: isStepCount(generateSteps),
      tools: createAgentTools(runCommand),
    });

    const result = await withAiTimeout(
      agent.generate({ prompt: buildAgentPrompt(appSpec) }),
      "sourceGeneration",
    ).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "timeout";
      if (
        /timeout|timed out|aborted/i.test(message) ||
        /rate.?limit|exceeded|too many/i.test(message)
      ) {
        return {
          text: "Agent stopped early, using partial files.",
          partial: true,
        };
      }
      throw error;
    });

    const isPartialResult = "partial" in result && result.partial === true;

    // CSS coverage is non-negotiable. Auto-touch must not count as agent edit.
    files = ensureStylesCoverClassNames(files, schema);
    touchedFiles.add(AUTO_STYLE_PATH);

    let quality = checkAgentSourceQuality(files, agentEditedFiles);
    if (!quality.ok && isNoMeaningfulEditFailure(quality.issues)) {
      // One forced rewrite: coding-only. Step budget small (repair cap).
      await runForcedRewritePass({
        appSpec,
        implementationSpec,
        projectId,
        runCommand,
        schema,
      });
      files = ensureStylesCoverClassNames(files, schema);
      touchedFiles.add(AUTO_STYLE_PATH);
      quality = checkAgentSourceQuality(files, agentEditedFiles);
    }

    if (!quality.ok) {
      // Second ensure after any exotic paths; still fail hard if incomplete.
      files = ensureStylesCoverClassNames(files, schema);
      const recheck = checkAgentSourceQuality(files, agentEditedFiles);
      if (!recheck.ok) {
        throw new Error(
          `AI agent produced invalid source: ${recheck.issues.join(", ")}`,
        );
      }
    }

    // Structural partial (timeout) is OK only after CSS/quality gate passes.
    return {
      buildSpec: appSpec,
      files,
      generationMode: isPartialResult ? "agent-partial" : "agent-custom",
      modelId:
        "response" in result && result.response
          ? result.response.modelId
          : undefined,
      operationTrace,
      partial: isPartialResult,
      repairAttempts: 0,
      summary: result.text || "AI coding agent generated custom source files.",
      touchedFiles: [...touchedFiles].sort(),
      usage: {
        inputTokens: "usage" in result ? (result.usage?.inputTokens ?? 0) : 0,
        outputTokens: "usage" in result ? (result.usage?.outputTokens ?? 0) : 0,
      },
    };
  } catch (error) {
    throw new Error(
      `AI source generation failed: ${error instanceof Error ? error.message : "agent failed"}`,
    );
  }
}

function isNoMeaningfulEditFailure(issues: string[]): boolean {
  return issues.some((issue) =>
    (NO_MEANINGFUL_EDIT_ISSUES as readonly string[]).includes(issue),
  );
}

async function runForcedRewritePass({
  appSpec,
  implementationSpec,
  projectId,
  runCommand,
  schema,
}: {
  appSpec: string;
  implementationSpec?: ImplementationSpec;
  projectId: string;
  runCommand: RunCommand;
  schema: ProjectSiteSchema;
}) {
  const rewriteSteps = Math.min(12, getAgentMaxSteps("repair"));
  const agent = new ToolLoopAgent({
    model: getAiModel(getGenerationModel()),
    maxOutputTokens: 12_000,
    instructions: buildGeneratedAppAgentInstructions(
      schema,
      implementationSpec,
      "rewrite",
    ),
    telemetry: getAiTelemetry("project-source-generation-agent-rewrite", {
      projectId,
    }),
    stopWhen: isStepCount(rewriteSteps),
    tools: createAgentTools(runCommand),
  });

  await withAiTimeout(
    agent.generate({
      prompt: `FORCED REWRITE — previous pass produced no meaningful file edits.

You MUST call write_file or replace_in_file on at least:
- src/content/site.ts
- src/routes/index.tsx
- src/styles.css (if you add classNames)

Do NOT call read_skill. Prefer write over endless reads.
Then call check_app once.

Static only: no auth/DB/payment gateway/fake /api. Use WA/contact CTA and real Indonesian business copy.

Build intent:
${appSpec}`,
    }),
    "sourceGeneration",
  ).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (
      /timeout|timed out|aborted/i.test(message) ||
      /rate.?limit|exceeded|too many/i.test(message)
    ) {
      return {
        text: "Rewrite stopped early.",
        partial: true,
      };
    }
    throw error;
  });
}

function createAgentTools(runCommand: RunCommand) {
  return {
    list_files: tool({
      description: "List generated project files.",
      inputSchema: z.object({ pathPrefix: z.string().optional() }),
      execute: ({ pathPrefix }) =>
        runCommand({ pathPrefix, type: "list_files" }),
    }),
    read_file: tool({
      description: "Read one generated project file.",
      inputSchema: z.object({
        endLineOneIndexedInclusive: z.number().int().min(1).optional(),
        path: z.string(),
        startLineOneIndexed: z.number().int().min(1).optional(),
      }),
      execute: ({ endLineOneIndexedInclusive, path, startLineOneIndexed }) =>
        runCommand({
          endLineOneIndexedInclusive,
          path,
          startLineOneIndexed,
          type: "read_file",
        }),
    }),
    search_files: tool({
      description: "Search generated project files by exact text.",
      inputSchema: z.object({
        pathPrefix: z.string().optional(),
        query: z.string(),
      }),
      execute: ({ pathPrefix, query }) =>
        runCommand({ pathPrefix, query, type: "search_files" }),
    }),
    write_file: tool({
      description: "Create or overwrite a generated project file.",
      inputSchema: z.object({ content: z.string(), path: z.string() }),
      execute: ({ content, path }) =>
        runCommand({ content, path, type: "write_file" }),
    }),
    replace_in_file: tool({
      description: "Replace exact text in a generated project file.",
      inputSchema: z.object({
        find: z.string(),
        path: z.string(),
        replace: z.string(),
      }),
      execute: ({ find, path, replace }) =>
        runCommand({ find, path, replace, type: "replace_in_file" }),
    }),
    read_skill: tool({
      description:
        "Read an internal skill document (generated-app-builder, design-quality, anti-slop, indonesian-business).",
      inputSchema: z.object({ name: z.string() }),
      execute: ({ name }) => runCommand({ name, type: "read_skill" }),
    }),
    check_app: tool({
      description:
        "Validate manifest, package policy, and source safety after edits.",
      inputSchema: z.object({}),
      execute: () => runCommand({ type: "check_app" }),
    }),
  };
}

export function extractClassNamesFromTsx(source: string) {
  const classes = new Set<string>();
  const patterns = [
    /className\s*=\s*"([^"]+)"/g,
    /className\s*=\s*'([^']+)'/g,
    /className\s*=\s*`([^`${}]+)`/g,
    /className\s*=\s*\{\s*"([^"]+)"\s*\}/g,
    /className\s*=\s*\{\s*'([^']+)'\s*\}/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      for (const token of match[1].split(/\s+/)) {
        if (/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(token) && token.length > 1) {
          classes.add(token);
        }
      }
    }
  }

  return classes;
}

export function cssCoversClassName(styleContent: string, className: string) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\.${escaped}(?![a-zA-Z0-9_-])`).test(styleContent);
}

export function findMissingCssClasses(
  files: GeneratedProjectFile[],
  styleContent: string,
) {
  const used = new Set<string>();
  for (const file of files) {
    if (!file.path.endsWith(".tsx")) {
      continue;
    }
    for (const className of extractClassNamesFromTsx(file.content)) {
      used.add(className);
    }
  }

  return [...used]
    .filter((className) => !cssCoversClassName(styleContent, className))
    .sort();
}

/** Starter seed before agent; also detects legacy tiny starter CSS. */
export function isStarterStylesContent(styleContent: string) {
  const trimmed = styleContent.trim();
  if (!trimmed) {
    return true;
  }
  // Legacy tiny starter: only shell + no design tokens.
  if (
    trimmed.includes(".starter-shell") &&
    !trimmed.includes("--accent") &&
    !trimmed.includes(".page{") &&
    !trimmed.includes(".page {")
  ) {
    return true;
  }
  return false;
}

export function ensureStylesCoverClassNames(
  files: GeneratedProjectFile[],
  schema: ProjectSiteSchema,
): GeneratedProjectFile[] {
  const styleIndex = files.findIndex((file) => file.path === "src/styles.css");
  const current =
    styleIndex >= 0
      ? files[styleIndex].content
      : createStarterContractStyles(schema);
  let next = isStarterStylesContent(current)
    ? createStarterContractStyles(schema)
    : current;

  const withStyles = files.map((file) =>
    file.path === "src/styles.css" ? { ...file, content: next } : file,
  );
  const filesForScan =
    styleIndex >= 0
      ? withStyles
      : [...withStyles, { path: "src/styles.css", content: next }];

  const missing = findMissingCssClasses(filesForScan, next);
  if (missing.length > 0) {
    const stubs = missing
      .map(
        (className) =>
          `.${className}{color:var(--fg);/* auto-cover: define layout in agent styles */}`,
      )
      .join("");
    next = `${next.trim()}\n/* auto-covered classNames */\n${stubs}\n`;
  }

  if (styleIndex >= 0) {
    return files.map((file, index) =>
      index === styleIndex ? { ...file, content: next } : file,
    );
  }

  return [...files, { path: "src/styles.css", content: next }];
}

/**
 * Technical checklist: is source ready to attempt compile?
 * `agentEditedFiles` must exclude auto CSS ensure paths.
 * Exported for unit tests.
 */
export function checkAgentSourceQuality(
  files: GeneratedProjectFile[],
  agentEditedFiles: Set<string>,
): { issues: string[]; ok: false } | { issues: []; ok: true } {
  const check = runGeneratedAppAgentTools({
    commands: [{ type: "check_app" }],
    files,
  });
  const issues = [...(check.check?.issues ?? [])];

  if (!check.ok) {
    issues.push("agent check failed");
  }

  // Meaningful agent edits only (auto styles.css alone must fail).
  if (agentEditedFiles.size < 2) {
    issues.push("agent did not edit enough files");
  }

  if (!files.some((file) => file.path.startsWith("src/routes/"))) {
    issues.push("missing route files");
  }

  const presentationEdited = [...agentEditedFiles].some(
    (path) =>
      path.startsWith("src/components/") ||
      path.startsWith("src/routes/") ||
      path === "src/styles.css",
  );
  const contentEdited = [...agentEditedFiles].some((path) =>
    path.startsWith("src/content/"),
  );

  if (!presentationEdited && !contentEdited) {
    issues.push("agent did not edit any presentation or content files");
  }

  if (!files.some((file) => file.path.startsWith("src/content/"))) {
    issues.push("missing content files");
  }

  const allSourceText = files
    .filter((file) =>
      /^(src\/(routes|components|content|lib)\/|src\/styles\.css)/.test(
        file.path,
      ),
    )
    .map((file) => file.content)
    .join("\n")
    .toLowerCase();

  if (!allSourceText.includes("generated-app-preview-ready")) {
    issues.push("preview-ready signal missing");
  }

  const styleFile = files.find((file) => file.path === "src/styles.css");
  const styleContent = styleFile?.content || "";
  const missingCss = findMissingCssClasses(files, styleContent);

  if (missingCss.length > 0) {
    issues.push(
      `missing CSS rules for classNames: ${missingCss.slice(0, 8).join(", ")}`,
    );
  }

  const customPresentation =
    files.some(
      (file) =>
        file.path.startsWith("src/components/") && file.path.endsWith(".tsx"),
    ) ||
    files.some(
      (file) =>
        file.path === "src/routes/index.tsx" &&
        !file.content.includes("starter-shell"),
    );

  if (customPresentation && isStarterStylesContent(styleContent)) {
    issues.push("custom presentation still uses starter-only styles.css");
  }

  return issues.length ? { issues, ok: false } : { issues: [], ok: true };
}

function buildAgentPrompt(implementationBrief: string) {
  return `Build a custom standalone app from starter files.

Implementation brief:
${implementationBrief}

CODING FIRST (required order):
1. write_file or replace_in_file on src/content/site.ts AND src/routes/index.tsx (and src/styles.css if needed)
2. Optional: at most 2 read_skill calls if stuck (prefer skill "generated-app-builder")
3. check_app ONLY after at least one write/replace

STATIC ONLY (platform limit — soft but important):
- Frontend marketing/catalog site only. No auth, session, database, payment gateway, or real backend.
- Prefer WhatsApp/contact CTA, price list, static catalog. Copy may mention cara bayar; do not build fake login/checkout systems or fetch invented /api/* endpoints.
- Do not add dependencies. package.json is platform-owned.

Key rule: EDIT src/routes/index.tsx with real business content early.
Keep usePreviewReady() in the rendered route.
Prefer contract classes already in src/styles.css (.page, .site-header, .hero, .section, .primary, .fab-wa).
If you invent new classNames, rewrite src/styles.css fully so every class has a rule — never leave starter-only CSS.
Do not spend the whole budget reading — empty edits fail the build.`;
}

export function buildGeneratedAppBuildSpec(
  input:
    | ProjectSiteSchema
    | {
        conversationBrief?: string;
        implementationSpec?: ImplementationSpec;
        schema: ProjectSiteSchema;
      },
  legacyConversationBrief = "",
) {
  const { conversationBrief, implementationSpec, schema } =
    "schema" in input
      ? {
          conversationBrief: input.conversationBrief ?? "",
          implementationSpec: input.implementationSpec,
          schema: input.schema,
        }
      : {
          conversationBrief: legacyConversationBrief,
          implementationSpec: undefined,
          schema: input,
        };
  return [
    implementationSpec
      ? `App kind: ${implementationSpec.appKind}`
      : "App kind: landing page",
    `Business: ${implementationSpec?.businessName || schema.businessName}`,
    implementationSpec
      ? `Pages: ${implementationSpec.pages.map((page) => `${page.slug} — ${page.title}: ${page.purpose}`).join(" | ")}`
      : `Audience: ${schema.audience}`,
    implementationSpec
      ? `Components: ${implementationSpec.components.map((component) => `${component.name}: ${component.purpose}`).join(" | ")}`
      : `Offer: ${schema.offer}`,
    implementationSpec
      ? `Features: ${implementationSpec.features.join(", ")}`
      : `Primary CTA: ${schema.primaryCta}`,
    `Visual direction: ${implementationSpec?.style.direction || `background ${schema.theme.background}; foreground ${schema.theme.foreground}; muted ${schema.theme.muted}; accent ${schema.theme.accent}`}`,
    conversationBrief ? `Conversation summary:\n${conversationBrief}` : "",
    implementationSpec
      ? `Structured content:\n${JSON.stringify(implementationSpec.content, null, 2)}`
      : "",
    "Build intent:",
    "- Build the structure declared above. Do not force everything into one generic landing page.",
    "- If appKind is interactive_app, create useful static frontend interactions only; no backend persistence.",
    "- Invent layout, hierarchy, cards, flows, pages, and proof points that fit the business.",
    "- Rewrite user answers into customer-facing Indonesian copy; the result must feel designed, not a transcript.",
    "- Use business-specific visual metaphors; avoid generic white cards copied from a schema.",
    "Required source shape:",
    "- Routes own composition only.",
    "- Content module owns structured copy/data.",
    "- CSS owns visual identity.",
    "- Components own specific visual or interactive sections.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildGeneratedAppAgentInstructions(
  schema: ProjectSiteSchema,
  implementationSpec?: ImplementationSpec,
  mode: "generate" | "repair" | "rewrite" = "generate",
) {
  const skillsBlock =
    mode === "generate"
      ? `\nOptional skills (max 2 read_skill calls total — do not tour all skills):
- generated-app-builder
- design-quality OR anti-slop OR indonesian-business

WRITE first: src/content/site.ts + src/routes/index.tsx before check_app.
Never call check_app before at least one write_file or replace_in_file.`
      : mode === "rewrite"
        ? `\nFORCED REWRITE MODE: no read_skill. Write core files immediately, then check_app.`
        : "";

  return `You are a frontend coding agent for UMKM Cepat generated apps.

Business: ${implementationSpec?.businessName || schema.businessName} — ${implementationSpec?.appKind || "landing"} — ${(implementationSpec?.features || [schema.offer, schema.audience]).join(", ")}
${skillsBlock}
The project uses Vite + React + TanStack Router.
Static frontend only. User-facing copy in Indonesian.
Call check_app after all writes.`;
}

export async function repairGeneratedProjectFiles({
  files,
  buildLog,
  onOperation,
  projectId,
  schema,
  implementationSpec,
}: {
  files: GeneratedProjectFile[];
  buildLog: string;
  onOperation?: (operation: GeneratedAppAgentOperation) => void;
  projectId: string;
  schema: ProjectSiteSchema;
  implementationSpec?: ImplementationSpec;
}): Promise<CustomGeneratedSourceResult> {
  const operationTrace: GeneratedAppAgentOperation[] = [];
  const touchedFiles = new Set<string>();
  let currentFiles = files;

  const runCommand: RunCommand = (command) => {
    const result = runGeneratedAppAgentTools({
      commands: [command],
      files: currentFiles,
      onOperation(operation) {
        const traced = { ...operation, id: `${operationTrace.length + 1}` };
        operationTrace.push(traced);
        onOperation?.(traced);
      },
    });
    currentFiles = result.files;

    for (const effect of result.sideEffects) {
      if (effect.path) {
        touchedFiles.add(effect.path);
      }
    }

    return result.outputs.at(-1) ?? { type: command.type };
  };

  const repairSteps = getAgentMaxSteps("repair");
  const agent = new ToolLoopAgent({
    model: getAiModel(getGenerationModel()),
    maxOutputTokens: 12_000,
    instructions: buildGeneratedAppAgentInstructions(
      schema,
      implementationSpec,
      "repair",
    ),
    telemetry: getAiTelemetry("project-source-generation-agent-repair", {
      projectId,
    }),
    stopWhen: isStepCount(repairSteps),
    tools: createAgentTools(runCommand),
  });

  const result = await withAiTimeout(
    agent.generate({
      prompt: `The previous build failed with TypeScript/vite errors. Fix ONLY those errors.

Rules:
- Edit only under src/ (or PRODUCT.md / DESIGN.md / AGENTS.md). Never package.json, locks, vite/tsconfig/eslint, netlify/vercel, .npmrc.
- Prefer replace_in_file on paths named in the log. Do not add dependencies or deploy configs.
- check_app validates policy only — it is NOT proof the compile passes.

Build errors:
${buildLog.slice(0, 8000)}

Steps:
1. read_file the files mentioned in the errors
2. Fix the specific TypeScript/build issues
3. run check_app once
4. Brief summary of what you fixed`,
    }),
    "sourceGeneration",
  );

  currentFiles = ensureStylesCoverClassNames(currentFiles, schema);
  touchedFiles.add(AUTO_STYLE_PATH);

  return {
    buildSpec: buildGeneratedAppBuildSpec({ implementationSpec, schema }),
    files: currentFiles,
    generationMode: "agent-custom",
    modelId: result.response?.modelId,
    operationTrace,
    repairAttempts: 1,
    summary: result.text || "AI agent repaired source files.",
    touchedFiles: [...touchedFiles].sort(),
    usage: {
      inputTokens: "usage" in result ? (result.usage?.inputTokens ?? 0) : 0,
      outputTokens: "usage" in result ? (result.usage?.outputTokens ?? 0) : 0,
    },
  };
}
