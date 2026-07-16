import { isStepCount, tool, ToolLoopAgent } from "ai";
import { z } from "zod";

import { getAiModel, getAiTelemetry } from "@/lib/ai";
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

export type CustomGeneratedSourceResult = {
  buildSpec: string;
  files: GeneratedProjectFile[];
  generationMode: "agent-custom" | "agent-partial";
  operationTrace: GeneratedAppAgentOperation[];
  partial?: boolean;
  repairAttempts: number;
  summary: string;
  touchedFiles: string[];
  usage?: { inputTokens: number; outputTokens: number };
};

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

  const runCommand = (command: GeneratedAppAgentToolCommand) => {
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
      }
    }

    return result.outputs.at(-1) ?? { type: command.type };
  };

  try {
    const agent = new ToolLoopAgent({
      model: getAiModel(getGenerationModel()),
      // Reasoning models emit hidden reasoning_content per step; without a
      // generous per-step budget the visible tool-call never lands.
      maxOutputTokens: 12_000,
      instructions: buildGeneratedAppAgentInstructions(
        schema,
        implementationSpec,
      ),
      telemetry: getAiTelemetry("project-source-generation-agent", {
        projectId,
      }),
      stopWhen: isStepCount(8),
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

    // CSS coverage is non-negotiable: never ship custom JSX with starter-only
    // styles. Deterministic ensure first, then quality gate. Timeout/rate-limit
    // partials still get ensure so preview is not unstyled.
    files = ensureStylesCoverClassNames(files, schema);
    touchedFiles.add("src/styles.css");

    const quality = checkAgentSourceQuality(files, touchedFiles);
    if (!quality.ok) {
      // Second ensure after any exotic paths; still fail hard if incomplete.
      files = ensureStylesCoverClassNames(files, schema);
      const recheck = checkAgentSourceQuality(files, touchedFiles);
      if (!recheck.ok) {
        throw new Error(
          `AI agent produced invalid source: ${recheck.issues.join(", ")}`,
        );
      }
    }

    // Structural partial (timeout) is OK only after CSS gate passes.
    return {
      buildSpec: appSpec,
      files,
      generationMode: isPartialResult ? "agent-partial" : "agent-custom",
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

function createAgentTools(
  runCommand: (command: GeneratedAppAgentToolCommand) => unknown,
) {
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

function checkAgentSourceQuality(
  files: GeneratedProjectFile[],
  touchedFiles: Set<string>,
): { issues: string[]; ok: false } | { issues: []; ok: true } {
  const check = runGeneratedAppAgentTools({
    commands: [{ type: "check_app" }],
    files,
  });
  const issues = [...(check.check?.issues ?? [])];

  if (!check.ok) {
    issues.push("agent check failed");
  }

  if (touchedFiles.size < 2) {
    issues.push("agent did not edit enough files");
  }

  if (!files.some((file) => file.path.startsWith("src/routes/"))) {
    issues.push("missing route files");
  }

  const presentationEdited = [...touchedFiles].some(
    (path) =>
      path.startsWith("src/components/") ||
      path.startsWith("src/routes/") ||
      path === "src/styles.css",
  );
  const contentEdited = [...touchedFiles].some((path) =>
    path.startsWith("src/content/"),
  );

  // Routes come from the starter factory; the agent does not always need to
  // edit them. Only require that the agent touched at least one content area.
  if (!presentationEdited && !contentEdited) {
    issues.push("agent did not edit any presentation or content files");
  }

  if (!files.some((file) => file.path.startsWith("src/content/"))) {
    issues.push("missing content files");
  }

  const sourceText = files
    .filter((file) =>
      /^(src\/(routes|components|content|lib)\/|src\/styles\.css)/.test(
        file.path,
      ),
    )
    .map((file) => file.content)
    .join("\n")
    .toLowerCase();

  if (/checkout|payment|login|register|api\//i.test(sourceText)) {
    issues.push("unsupported fake backend/auth/payment language detected");
  }

  if (!sourceText.includes("generated-app-preview-ready")) {
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

Read the generated-app-builder skill for the development workflow.
Key rule: EDIT src/routes/index.tsx FIRST with real business content.
Keep usePreviewReady() in the rendered route.
Prefer contract classes already in src/styles.css (.page, .site-header, .hero, .section, .primary, .fab-wa).
If you invent new classNames, rewrite src/styles.css fully so every class has a rule — never leave starter-only CSS.
Run check_app after all writes.`;
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
) {
  return `You are a frontend coding agent for UMKM Cepat generated apps.

Business: ${implementationSpec?.businessName || schema.businessName} — ${implementationSpec?.appKind || "landing"} — ${(implementationSpec?.features || [schema.offer, schema.audience]).join(", ")}

Before coding, read these skills via read_skill tool:
1. generated-app-builder — development workflow and file structure
2. design-quality — design best practices (color, typography, layout)
3. anti-slop — avoid generic AI patterns
4. indonesian-business — business context and copy rules

Then follow the skill instructions. The project uses Vite + React + TanStack Router.
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

  const runCommand = (command: GeneratedAppAgentToolCommand) => {
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

  const agent = new ToolLoopAgent({
    model: getAiModel(getGenerationModel()),
    maxOutputTokens: 12_000,
    instructions: buildGeneratedAppAgentInstructions(
      schema,
      implementationSpec,
    ),
    telemetry: getAiTelemetry("project-source-generation-agent-repair", {
      projectId,
    }),
    stopWhen: isStepCount(4),
    tools: createAgentTools(runCommand),
  });

  const result = await withAiTimeout(
    agent.generate({
      prompt: `The previous build failed with these TypeScript/build errors. Fix them using read_file and replace_in_file or write_file. Do NOT rewrite the entire app — only fix the specific errors.

Build errors:
${buildLog.slice(0, 2000)}

Steps:
1. read_file the files mentioned in the errors
2. Fix the specific TypeScript issues
3. run check_app
4. Brief summary of what you fixed`,
    }),
    "sourceGeneration",
  );

  currentFiles = ensureStylesCoverClassNames(currentFiles, schema);
  touchedFiles.add("src/styles.css");

  return {
    buildSpec: buildGeneratedAppBuildSpec({ implementationSpec, schema }),
    files: currentFiles,
    generationMode: "agent-custom",
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
