import { isStepCount, tool, ToolLoopAgent } from "ai";
import { z } from "zod";

import { getAiModel, getAiTelemetry } from "@/lib/ai";
import { getAgentMaxSteps } from "@/lib/ai-agent-steps";
import { getGenerationModel } from "@/lib/ai-models";
import { withAiTimeout } from "@/lib/ai-timeouts";
import { devLog } from "@/lib/dev-log";
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
const AUTO_STYLE_PATH = "src/index.css";

const NO_MEANINGFUL_EDIT_ISSUES = [
  "agent did not edit enough files",
  "agent did not edit any presentation or content files",
  "home route is still the starter placeholder",
] as const;

/**
 * Issue prefixes that indicate the agent's output is recoverable via a forced
 * rewrite pass. The missing-CSS issue carries a dynamic class-name list, so it
 * is matched by prefix rather than exact string.
 */
const REWRITE_RECOVERABLE_PREFIXES = ["missing CSS rules for classNames:"];

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
  onFilesChanged,
  abortSignal,
}: {
  implementationBrief?: string;
  implementationSpec?: ImplementationSpec;
  onOperation?: (operation: GeneratedAppAgentOperation) => void;
  projectId: string;
  schema: ProjectSiteSchema;
  onFilesChanged?: (files: GeneratedProjectFile[]) => void;
  abortSignal?: AbortSignal;
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
    // Guard: if the agent calls check_app before writing any custom files,
    // return an error forcing it to write code first. This prevents the
    // agent from seeing the starter compiles and exiting without edits.
    if (command.type === "check_app" && agentEditedFiles.size === 0) {
      return {
        type: command.type,
        error:
          "No custom source files written yet. You MUST call write_file on src/routes/index.tsx with your custom page layout BEFORE calling check_app.",
      };
    }

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
          onFilesChanged?.(files);
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

    const localAbortController = new AbortController();
    if (abortSignal) {
      abortSignal.addEventListener(
        "abort",
        () => localAbortController.abort(),
        {
          once: true,
        },
      );
      if (abortSignal.aborted) {
        localAbortController.abort();
      }
    }

    const result = await withAiTimeout(
      agent.generate({
        prompt: buildAgentPrompt(appSpec),
        abortSignal: localAbortController.signal,
      }),
      "sourceGeneration",
      localAbortController,
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

    // Auto-heal the router wiring if the agent shadowed rootRoute
    // and auto-heal the usePreviewReady signal so the preview iframe never hangs.
    files = ensureRouterRouteWired(files);
    files = ensurePreviewReadyCalled(files);

    // Ensure a index.css file exists (starter contract if absent), but do
    // NOT inject per-class stubs here — stubs would mask the missing-CSS gap
    // and defeat the quality gate below. Stubs are a last-resort fallback
    // only, applied after a rewrite pass has been attempted.
    files = ensureStylesFileExists(files, schema);
    touchedFiles.add(AUTO_STYLE_PATH);

    let quality = checkAgentSourceQuality(files, agentEditedFiles);
    if (!quality.ok && isNoMeaningfulEditFailure(quality.issues)) {
      // One forced rewrite: coding-only. Pass the missing-CSS list so the
      // agent writes real layout CSS, not color-only stubs.
      const missingCss = findMissingCssClasses(
        files,
        files.find((file) => file.path === "src/index.css")?.content ?? "",
      );
      await runForcedRewritePass({
        appSpec,
        implementationSpec,
        missingCss,
        projectId,
        runCommand,
        schema,
        abortSignal,
      });
      // The rewrite may have replaced src/routes/index.tsx or src/router.tsx
      // with fresh components that drop necessary wiring. Re-heal both.
      files = ensureRouterRouteWired(files);
      files = ensurePreviewReadyCalled(files);
      files = ensureStylesFileExists(files, schema);
      touchedFiles.add(AUTO_STYLE_PATH);
      quality = checkAgentSourceQuality(files, agentEditedFiles);
    }

    // Last-resort: if real CSS is still missing after rewrite attempts, inject
    // working Tailwind stubs/rules so the site at least renders — but cap it.
    // Too many unstyled components means the site is effectively broken; fail
    // hard instead of shipping a half-styled UI (the original silent-broken bug).
    const finalMissing = findMissingCssClasses(
      files,
      files.find((file) => file.path === "src/index.css")?.content ?? "",
    );
    if (finalMissing.length > 0) {
      const STUB_HARD_CAP = 30;
      devLog("generate", "css.fallback-stubs", {
        missingCount: finalMissing.length,
        missing: finalMissing.slice(0, 12),
        projectId: projectId,
      });
      if (finalMissing.length > STUB_HARD_CAP) {
        throw new Error(
          `AI source generation failed: too many unstyled custom components (${finalMissing.length}). Missing CSS for: ${finalMissing.slice(0, 20).join(", ")}. Ensure you write CSS rules for custom classNames in src/index.css.`,
        );
      }
      const stubbed = applyStylesCoverStubs(files);
      files = stubbed.files;
    }

    // Recheck quality. The stubs satisfy the missing CSS check, so other
    // quality rules (e.g. preview-ready signal) are verified one last time.
    quality = checkAgentSourceQuality(files, agentEditedFiles);

    if (!quality.ok) {
      throw new Error(
        `AI agent produced invalid source: ${quality.issues.join(", ")}`,
      );
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
  return issues.some(
    (issue) =>
      (NO_MEANINGFUL_EDIT_ISSUES as readonly string[]).includes(issue) ||
      REWRITE_RECOVERABLE_PREFIXES.some((prefix) => issue.startsWith(prefix)),
  );
}

async function runForcedRewritePass({
  appSpec,
  implementationSpec,
  missingCss = [],
  projectId,
  runCommand,
  schema,
  abortSignal,
}: {
  appSpec: string;
  implementationSpec?: ImplementationSpec;
  missingCss?: string[];
  projectId: string;
  runCommand: RunCommand;
  schema: ProjectSiteSchema;
  abortSignal?: AbortSignal;
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

  const localAbortController = new AbortController();
  if (abortSignal) {
    abortSignal.addEventListener("abort", () => localAbortController.abort(), {
      once: true,
    });
    if (abortSignal.aborted) {
      localAbortController.abort();
    }
  }

  const missingCssNote =
    missingCss.length > 0
      ? `\n\nMISSING CSS — these classNames are used in TSX but have NO real CSS rule (only a color stub or nothing):\n${missingCss.join(", ")}\nFor EACH one, write a complete rule in src/index.css with layout (display/padding/gap/grid/background/border-radius). Do NOT emit single color-only rules.`
      : "";

  await withAiTimeout(
    agent.generate({
      prompt: `FORCED REWRITE — previous pass produced no meaningful file edits.

You MUST call write_file or replace_in_file on at least:
- src/content/site.ts
- src/routes/index.tsx
- src/index.css (if you add classNames)

Do NOT call read_skill. Prefer write over endless reads.
Then call check_app once.

Static only: no auth/DB/payment gateway/fake /api. Use WA/contact CTA and real Indonesian business copy.
${missingCssNote}

Build intent:
${appSpec}`,
      abortSignal: localAbortController.signal,
    }),
    "sourceGeneration",
    localAbortController,
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

/**
 * Utility/state classNames that legitimately need only a 'color' declaration
 * (or are toggled at runtime, needing no static layout). Exempt from the
 * "meaningful rule" requirement so they don't get flagged as missing.
 */
const TRIVIAL_CSS_CLASS_ALLOWLIST = new Set([
  "active",
  "alt",
  "is-active",
  "muted",
  "open",
  "small",
]);

export function isTailwindUtilityClass(className: string): boolean {
  const baseClass = className.split(":").at(-1) || className;

  if (baseClass.includes("__") || baseClass.includes("--")) {
    return false;
  }

  const standardTrivial = new Set([
    "container",
    "flex",
    "grid",
    "hidden",
    "block",
    "inline",
    "inline-block",
    "inline-flex",
    "inline-grid",
    "absolute",
    "relative",
    "fixed",
    "sticky",
    "isolate",
    "truncate",
    "border",
    "shadow",
    "underline",
    "line-through",
    "no-underline",
    "overline",
    "uppercase",
    "lowercase",
    "capitalize",
    "antialiased",
    "subpixel-antialiased",
    "italic",
    "transition",
    "transform",
    "sr-only",
    "not-sr-only",
    "visible",
    "invisible",
    "collapse",
    "grow",
    "shrink",
    "clear-both",
    "clear-left",
    "clear-right",
    "clear-none",
    "float-right",
    "float-left",
    "float-none",
    "flow-root",
    "table",
    "table-row",
    "table-cell",
    "table-column",
    "table-caption",
    "flex-row",
    "flex-row-reverse",
    "flex-col",
    "flex-col-reverse",
    "flex-wrap",
    "flex-wrap-reverse",
    "flex-nowrap",
    "flex-1",
    "flex-auto",
    "flex-initial",
    "flex-none",
    "flex-grow",
    "flex-grow-0",
    "flex-shrink",
    "flex-shrink-0",
    "grow-0",
    "shrink-0",
  ]);

  if (standardTrivial.has(baseClass)) {
    return true;
  }

  const standardPrefixes = [
    "p-",
    "m-",
    "w-",
    "h-",
    "gap-",
    "bg-",
    "text-",
    "border-",
    "rounded-",
    "grid-",
    "col-",
    "row-",
    "items-",
    "justify-",
    "align-",
    "px-",
    "py-",
    "mx-",
    "my-",
    "pt-",
    "pb-",
    "pl-",
    "pr-",
    "mt-",
    "mb-",
    "ml-",
    "mr-",
    "font-",
    "leading-",
    "tracking-",
    "transition-",
    "duration-",
    "ease-",
    "z-",
    "delay-",
    "opacity-",
    "scale-",
    "rotate-",
    "translate-",
    "min-w-",
    "max-w-",
    "min-h-",
    "max-h-",
    "aspect-",
    "shrink-",
    "grow-",
    "self-",
    "place-",
    "overflow-",
    "whitespace-",
    "break-",
    "cursor-",
    "select-",
    "pointer-",
    "stroke-",
    "fill-",
    "animate-",
    "ring-",
    "divide-",
    "space-",
    "decoration-",
    "underline-",
    "line-clamp-",
    "flex-",
    "inset-",
    "object-",
    "shadow-",
    "top-",
    "bottom-",
    "left-",
    "right-",
    "size-",
    "appearance-",
    "list-",
    "from-",
    "to-",
    "via-",
    "pointer-events-",
    "content-",
    "delay-",
    "duration-",
    "ease-",
    "origin-",
  ];

  return standardPrefixes.some((prefix) => baseClass.startsWith(prefix));
}

/**
 * A class is "covered" only if it has a rule whose declaration block is
 * meaningful — i.e. not a bare 'color:...' stub. A rule counts if it has
 * ≥2 declarations OR a declaration whose property is not 'color'.
 *
 * This prevents ensureStylesCoverClassNames auto-cover stubs
 * (like '.{c}{color:var(--fg)}') and AI shortcuts (one giant selector list all
 * sharing 'color:var(--fg)') from defeating validation. Allowlisted utility
 * classes ('.muted', state classes) are exempt — they legitimately need
 * only a color declaration.
 */
export function cssCoversClassName(styleContent: string, className: string) {
  if (isTailwindUtilityClass(className)) {
    return true;
  }
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`\\.${escaped}(?![a-zA-Z0-9_-])`).test(styleContent)) {
    return false;
  }
  if (TRIVIAL_CSS_CLASS_ALLOWLIST.has(className)) {
    return true;
  }
  return hasMeaningfulRuleForClass(styleContent, className);
}

/**
 * Does 'styleContent' contain a rule matching '.className' whose declaration
 * block is meaningful (≥2 declarations OR a non-'color' property)? Strip
 * comments before counting declarations so auto-cover stubs
 * can't pad a single real declaration past the threshold.
 */
function hasMeaningfulRuleForClass(
  styleContent: string,
  className: string,
): boolean {
  const withoutComments = styleContent.replace(/\/\*[^*]*\*\//g, "");
  // Escape regex meta-characters in two passes: older Babel-based parsers
  // mis-lex template-literal start tokens inside a regex and break Prettier,
  // so we keep that sequence out of every literal.
  const escaped = className
    .replace(/[.*+?^$]/g, "\\$&")
    .replace(/[{}()|[\]\\]/g, "\\$&");
  // Assemble the rule pattern from plain string parts. The brace characters
  // inside a template literal trip older Babel-based parsers (used by Prettier)
  // after a template interpolation, so we avoid template literals here.
  const rulePattern = new RegExp(
    "(^|[,}>\\s])\\s*\\." + escaped + "(?![a-zA-Z0-9_-])[^{]*\\{([^}]*)\\}",
    "g",
  );
  for (const match of withoutComments.matchAll(rulePattern)) {
    const declarations = match[2]
      .split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean);
    if (declarations.length >= 2) {
      return true;
    }
    if (
      declarations.some((declaration) => isNonColorDeclaration(declaration))
    ) {
      return true;
    }
  }
  return false;
}

function isNonColorDeclaration(declaration: string) {
  const property = declaration.split(":")[0]?.trim().toLowerCase();
  if (!property) {
    return false;
  }
  if (property !== "color") {
    return true;
  }
  // Allow `color` declarations that target a real color (hex, rgb, hsl, named
  // CSS color). This lets Tailwind color utilities like text-emerald-600
  // pass validation when generated as fallbacks, while still rejecting the
  // lazy auto-cover stubs (.foo { color: var(--fg) }) and one-shot lists of
  // classes that all share `color: var(--fg)`.
  const value = declaration.split(":")[1]?.trim().toLowerCase() ?? "";
  if (
    value.startsWith("var(--") ||
    value === "inherit" ||
    value === "currentcolor"
  ) {
    return false;
  }
  return value.length > 0;
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
  // The new shadcn starter emits shadcnThemeCss (real theme tokens); the
  // legacy `.starter-shell` branch is retired. An empty stylesheet still
  // counts as starter-only so ensureStylesFileExists replaces it with the
  // starter contract.
  return styleContent.trim().length === 0;
}

/**
 * Ensure a 'src/index.css' file exists (starter contract if absent or legacy
 * starter-only). Does NOT inject per-class stubs -- stubbing is a separate
 * last-resort step (see applyStylesCoverStubs) so the quality gate sees the
 * real missing-class gap and can trigger a rewrite pass instead of being
 * masked by auto-cover stubs.
 */
export function ensureStylesFileExists(
  files: GeneratedProjectFile[],
  schema: ProjectSiteSchema,
): GeneratedProjectFile[] {
  const styleIndex = files.findIndex((file) => file.path === "src/index.css");
  if (styleIndex < 0) {
    return [
      ...files,
      { path: "src/index.css", content: createStarterContractStyles(schema) },
    ];
  }
  const current = files[styleIndex].content;
  if (isStarterStylesContent(current)) {
    return files.map((file, index) =>
      index === styleIndex
        ? { ...file, content: createStarterContractStyles(schema) }
        : file,
    );
  }
  return files;
}

/**
 * Auto-heal the broken "import rootRoute as RootComponent" pattern in
 * `src/router.tsx`. The agent routinely adds extra routes and aliases
 * the imported rootRoute as a component, then assigns it to a freshly
 * created `createRootRoute` (which is a Route, not a component). This
 * triggers a TypeScript build error (TS2322) and the repair loop is not
 * reliable enough to fix it consistently.
 *
 * Heals:
 *  - Drops the `as <X>` alias from the `rootRoute` import
 *  - Removes the local `const rootRoute = createRootRoute({...})` block so
 *    the imported rootRoute is used directly (matches the starter contract)
 *
 * Returns the original array unchanged when the file looks correct.
 */
export function ensureRouterRouteWired(
  files: GeneratedProjectFile[],
): GeneratedProjectFile[] {
  const routerFile = files.find((file) => file.path === "src/router.tsx");
  if (!routerFile) {
    return files;
  }

  let content = routerFile.content;
  let mutated = false;

  // 1) Drop the alias on the rootRoute import.
  const aliasedImport =
    /import\s*\{\s*rootRoute\s+as\s+([A-Za-z_$][\w$]*)\s*\}\s*from\s*["']\.\/routes\/__root["'];?/;
  const aliasedMatch = content.match(aliasedImport);
  if (aliasedMatch) {
    content = content.replace(
      aliasedImport,
      `import { rootRoute } from "./routes/__root";`,
    );
    mutated = true;

    // 2) Remove the local `const rootRoute = createRootRoute({...});` block
    //    so the imported rootRoute is used directly. The block may span
    //    multiple lines and may end with a `;`.
    const localDecl = new RegExp(
      `const\\s+rootRoute\\s*=\\s*createRootRoute\\s*\\(\\s*\\{[\\s\\S]*?\\}\\s*\\)\\s*;?`,
    );
    if (localDecl.test(content)) {
      content = content.replace(localDecl, "");
      mutated = true;
    }
  }

  if (!mutated) {
    return files;
  }

  return files.map((file) =>
    file.path === "src/router.tsx" ? { ...file, content } : file,
  );
}

/**
 * Auto-heal the usePreviewReady() signal in the index route. The agent
 * routinely rewrites src/routes/index.tsx and forgets the call — without
 * this, Vite tree-shakes the postMessage in the production bundle and the
 * preview iframe hangs forever on "Menyiapkan tampilan website".
 *
 * Heals:
 *  - Adds the import if missing
 *  - Injects `usePreviewReady();` at the top of the first component
 *    function/arrow body (HomeRouteComponent → Home → any PascalCase)
 *
 * Returns the original array unchanged when the call already exists or no
 * index route file is present.
 */
export function ensurePreviewReadyCalled(
  files: GeneratedProjectFile[],
): GeneratedProjectFile[] {
  const indexFile = files.find((file) => file.path === "src/routes/index.tsx");

  if (!indexFile) {
    return files;
  }

  if (/usePreviewReady\s*\(/.test(indexFile.content)) {
    return files;
  }

  let content = indexFile.content;

  // 1) Add the import if not present.
  if (!/import[^;\n]*usePreviewReady/.test(content)) {
    const lastImportIdx = content.lastIndexOf("import ");
    if (lastImportIdx >= 0) {
      const endOfImportLine = content.indexOf("\n", lastImportIdx);
      if (endOfImportLine >= 0) {
        content =
          content.slice(0, endOfImportLine + 1) +
          'import { usePreviewReady } from "../lib/preview-ready";\n' +
          content.slice(endOfImportLine + 1);
      } else {
        content =
          'import { usePreviewReady } from "../lib/preview-ready";\n' + content;
      }
    } else {
      content =
        'import { usePreviewReady } from "../lib/preview-ready";\n' + content;
    }
  }

  // 2) Inject the call into the first matching component body.
  const componentPatterns: RegExp[] = [
    /(export\s+default\s+function\s+HomeRouteComponent\s*\([^)]*\)\s*\{)/,
    /(export\s+function\s+HomeRouteComponent\s*\([^)]*\)\s*\{)/,
    /(function\s+HomeRouteComponent\s*\([^)]*\)\s*\{)/,
    /(export\s+default\s+const\s+HomeRouteComponent\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>\s*\{)/,
    /(export\s+const\s+HomeRouteComponent\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>\s*\{)/,
    /(const\s+HomeRouteComponent\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>\s*\{)/,
    /(export\s+default\s+function\s+Home\s*\([^)]*\)\s*\{)/,
    /(export\s+function\s+Home\s*\([^)]*\)\s*\{)/,
    /(function\s+Home\s*\([^)]*\)\s*\{)/,
    /(export\s+default\s+const\s+Home\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>\s*\{)/,
    /(export\s+const\s+Home\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>\s*\{)/,
    /(const\s+Home\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>\s*\{)/,
    /(export\s+default\s+function\s+[A-Z][a-zA-Z0-9_]*\s*\([^)]*\)\s*\{)/,
    /(export\s+function\s+[A-Z][a-zA-Z0-9_]*\s*\([^)]*\)\s*\{)/,
    /(function\s+[A-Z][a-zA-Z0-9_]*\s*\([^)]*\)\s*\{)/,
    /(export\s+default\s+const\s+[A-Z][a-zA-Z0-9_]*\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>\s*\{)/,
    /(export\s+const\s+[A-Z][a-zA-Z0-9_]*\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>\s*\{)/,
    /(const\s+[A-Z][a-zA-Z0-9_]*\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>\s*\{)/,
  ];

  for (const pattern of componentPatterns) {
    if (pattern.test(content)) {
      content = content.replace(pattern, "$1\n  usePreviewReady();");
      return files.map((file) =>
        file.path === "src/routes/index.tsx" ? { ...file, content } : file,
      );
    }
  }

  return files;
}

/**
 * Map a common Tailwind utility className to a working CSS rule body that
 * satisfies cssCoversClassName. Returns null for non-Tailwind / unknown names
 * so the caller can fall back to a color-only stub.
 *
 * This is the fix for the most common silent-broken-UI failure mode: the
 * agent leaks Tailwind classNames out of habit (its training data is full
 * of them) but Tailwind isn't installed, so the classNames render as nothing
 * in dist. Generating functional CSS keeps the build green AND the UI
 * visually correct.
 */
export function getTailwindCssRule(className: string): string | null {
  // Spacing/sibling utilities
  const spaceY = className.match(/^space-y-(\d+|px|\[[^\]]+\])$/);
  if (spaceY) {
    const value = twSpacingValue(spaceY[1]);
    return `.${className}>*+*{margin-top:${value}}`;
  }
  const spaceX = className.match(/^space-x-(\d+|px|\[[^\]]+\])$/);
  if (spaceX) {
    const value = twSpacingValue(spaceX[1]);
    return `.${className}>*+*{margin-left:${value}}`;
  }

  // Margin/padding (p, m with optional direction)
  const boxMatch = className.match(/^([pm])([tblrxy]?)-(\d+|px|\[[^\]]+\])$/);
  if (boxMatch) {
    const property = boxMatch[1] === "p" ? "padding" : "margin";
    const direction = boxMatch[2];
    const value = twSpacingValue(boxMatch[3]);
    const sides = twBoxSides(direction, property, value);
    if (sides) {
      return `.${className}{${sides}}`;
    }
  }

  // Text size (text-xs, text-2xl, …)
  const textSize = className.match(
    /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/,
  );
  if (textSize) {
    const size = twTextSize(textSize[1]);
    if (size) {
      return `.${className}{${size}}`;
    }
  }

  // Text alignment (text-left, text-center, text-right, text-justify)
  const textAlign = className.match(/^text-(left|center|right|justify)$/);
  if (textAlign) {
    return `.${className}{text-align:${textAlign[1]}}`;
  }

  // Font weight
  const fontWeight = className.match(
    /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/,
  );
  if (fontWeight) {
    const weights: Record<string, string> = {
      thin: "100",
      extralight: "200",
      light: "300",
      normal: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
      extrabold: "800",
      black: "900",
    };
    return `.${className}{font-weight:${weights[fontWeight[1]]}}`;
  }

  // Colors (text-/bg-/border-{color}-{shade})
  const color = className.match(/^(text|bg|border)-([a-z]+)-(\d{2,3})$/);
  if (color) {
    const hex = twColorHex(color[2], color[3]);
    if (hex) {
      const cssProperty =
        color[1] === "text"
          ? "color"
          : color[1] === "bg"
            ? "background-color"
            : "border-color";
      return `.${className}{${cssProperty}:${hex}}`;
    }
  }

  // Layout primitives
  const layoutSimple: Record<string, string> = {
    flex: "display:flex",
    "inline-flex": "display:inline-flex",
    grid: "display:grid",
    "inline-grid": "display:inline-grid",
    hidden: "display:none",
    block: "display:block",
    "inline-block": "display:inline-block",
    inline: "display:inline",
  };
  if (layoutSimple[className]) {
    return `.${className}{${layoutSimple[className]}}`;
  }

  // Alignment helpers
  const items = className.match(/^items-(start|end|center|baseline|stretch)$/);
  if (items) {
    const map: Record<string, string> = {
      start: "flex-start",
      end: "flex-end",
    };
    return `.${className}{align-items:${map[items[1]] ?? items[1]}}`;
  }
  const justify = className.match(
    /^justify-(start|end|center|between|around|evenly)$/,
  );
  if (justify) {
    const map: Record<string, string> = {
      start: "flex-start",
      end: "flex-end",
      between: "space-between",
      around: "space-around",
      evenly: "space-evenly",
    };
    return `.${className}{justify-content:${map[justify[1]] ?? justify[1]}}`;
  }

  // Flex direction / wrap
  const flexDir = className.match(/^flex-(row|row-reverse|col|col-reverse)$/);
  if (flexDir) {
    const map: Record<string, string> = {
      row: "row",
      "row-reverse": "row-reverse",
      col: "column",
      "col-reverse": "column-reverse",
    };
    return `.${className}{flex-direction:${map[flexDir[1]]}}`;
  }
  const flexWrap = className.match(/^flex-(wrap|wrap-reverse|nowrap)$/);
  if (flexWrap) {
    return `.${className}{flex-wrap:${flexWrap[1]}}`;
  }

  // Sizing helpers
  if (className === "w-full") {
    return `.${className}{width:100%}`;
  }
  if (className === "h-full") {
    return `.${className}{height:100%}`;
  }
  if (className === "min-h-full") {
    return `.${className}{min-height:100%}`;
  }
  if (className === "min-w-full") {
    return `.${className}{min-width:100%}`;
  }
  if (className === "max-w-full") {
    return `.${className}{max-width:100%}`;
  }

  // Border / radius
  const rounded = className.match(/^rounded(-(sm|md|lg|xl|2xl|3xl))?$/);
  if (rounded) {
    const size = rounded[2] ?? "DEFAULT";
    const radii: Record<string, string> = {
      DEFAULT: "0.25rem",
      sm: "0.125rem",
      md: "0.375rem",
      lg: "0.5rem",
      xl: "0.75rem",
      "2xl": "1rem",
      "3xl": "1.5rem",
    };
    return `.${className}{border-radius:${radii[size] ?? "0.25rem"}}`;
  }
  if (className === "rounded-full") {
    return `.${className}{border-radius:9999px}`;
  }
  if (className === "border") {
    return `.${className}{border-width:1px;border-style:solid}`;
  }

  // Opacity
  const opacity = className.match(/^opacity-(\d+)$/);
  if (opacity) {
    const n = Number(opacity[1]);
    if (n >= 0 && n <= 100) {
      return `.${className}{opacity:${(n / 100).toFixed(2)}}`;
    }
  }

  // Position
  const positionSimple: Record<string, string> = {
    static: "position:static",
    relative: "position:relative",
    absolute: "position:absolute",
    fixed: "position:fixed",
    sticky: "position:sticky",
  };
  if (positionSimple[className]) {
    return `.${className}{${positionSimple[className]}}`;
  }
  const inset = className.match(/^inset-(\d+|px|\[[^\]]+\])$/);
  if (inset) {
    const v = twSpacingValue(inset[1]);
    return `.${className}{top:${v};right:${v};bottom:${v};left:${v}}`;
  }
  const insetDir = className.match(
    /^(top|right|bottom|left)-(\d+|px|\[[^\]]+\])$/,
  );
  if (insetDir) {
    return `.${className}{${insetDir[1]}:${twSpacingValue(insetDir[2])}}`;
  }

  // Aspect ratio
  const aspect = className.match(/^aspect-(video|square|auto)$/);
  if (aspect) {
    const ratios: Record<string, string> = {
      auto: "auto",
      square: "1/1",
      video: "16/9",
    };
    return `.${className}{aspect-ratio:${ratios[aspect[1]]}}`;
  }

  // Backdrop blur
  const backdrop = className.match(/^backdrop-blur(-(sm|md|lg|xl|2xl|3xl))?$/);
  if (backdrop) {
    const size = backdrop[2] ?? "DEFAULT";
    const radii: Record<string, string> = {
      DEFAULT: "8px",
      sm: "4px",
      md: "12px",
      lg: "16px",
      xl: "24px",
      "2xl": "40px",
      "3xl": "64px",
    };
    return `.${className}{-webkit-backdrop-filter:blur(${radii[size]});backdrop-filter:blur(${radii[size]})}`;
  }

  // Gradients — Tailwind v3+ style. The from-/via-/to- classes set custom
  // properties; bg-gradient-to-* composes them into a working linear-gradient
  // with no agent-side knowledge of CSS.
  const gradient = className.match(/^bg-gradient-to-(r|l|t|b|tr|tl|br|bl)$/);
  if (gradient) {
    const dir: Record<string, string> = {
      r: "to right",
      l: "to left",
      t: "to top",
      b: "to bottom",
      tr: "to top right",
      tl: "to top left",
      br: "to bottom right",
      bl: "to bottom left",
    };
    return `.${className}{background-image:linear-gradient(${dir[gradient[1]]},var(--tw-gradient-from,transparent),var(--tw-gradient-to,transparent))}`;
  }
  const from = className.match(/^from-([a-z]+)-(\d{2,3})$/);
  if (from) {
    const hex = twColorHex(from[1], from[2]);
    if (hex) {
      return `.${className}{--tw-gradient-from:${hex};--tw-gradient-stops:var(--tw-gradient-from),var(--tw-gradient-to,transparent)}`;
    }
  }
  const via = className.match(/^via-([a-z]+)-(\d{2,3})$/);
  if (via) {
    const hex = twColorHex(via[1], via[2]);
    if (hex) {
      return `.${className}{--tw-gradient-stops:var(--tw-gradient-from),${hex},var(--tw-gradient-to,transparent)}`;
    }
  }
  const to = className.match(/^to-([a-z]+)-(\d{2,3})$/);
  if (to) {
    const hex = twColorHex(to[1], to[2]);
    if (hex) {
      return `.${className}{--tw-gradient-to:${hex}}`;
    }
  }

  // Accent / ring / divide / placeholder colors share the same shade scale
  // as text/bg/border — accept any prefix the agent reaches for.
  const wideColor = className.match(
    /^(accent|ring|divide|placeholder|caret|outline|fill|stroke|decoration)-([a-z]+)-(\d{2,3})$/,
  );
  if (wideColor) {
    const hex = twColorHex(wideColor[2], wideColor[3]);
    if (hex) {
      const cssProperty: Record<string, string> = {
        accent: "accent-color",
        ring: "--tw-ring-color",
        divide: "border-color",
        placeholder: "color",
        caret: "caret-color",
        outline: "outline-color",
        fill: "fill",
        stroke: "stroke",
        decoration: "text-decoration-color",
      };
      return `.${className}{${cssProperty[wideColor[1]]}:${hex}}`;
    }
  }
  // Solid border colors (border-white, border-black, border-transparent)
  const solidBorder = className.match(/^border-(white|black|transparent)$/);
  if (solidBorder) {
    const map: Record<string, string> = {
      white: "#fff",
      black: "#000",
      transparent: "transparent",
    };
    return `.${className}{border-color:${map[solidBorder[1]]}}`;
  }

  // Shadows
  const shadow = className.match(/^shadow(-(sm|md|lg|xl|2xl|inner))?$/);
  if (shadow) {
    const size = shadow[2] ?? "DEFAULT";
    const shadows: Record<string, string> = {
      DEFAULT: "0 1px 3px 0 rgba(0,0,0,0.1),0 1px 2px -1px rgba(0,0,0,0.1)",
      sm: "0 1px 2px 0 rgba(0,0,0,0.05)",
      md: "0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -2px rgba(0,0,0,0.1)",
      lg: "0 10px 15px -3px rgba(0,0,0,0.1),0 4px 6px -4px rgba(0,0,0,0.1)",
      xl: "0 20px 25px -5px rgba(0,0,0,0.1),0 8px 10px -6px rgba(0,0,0,0.1)",
      "2xl": "0 25px 50px -12px rgba(0,0,0,0.25)",
      inner: "inset 0 2px 4px 0 rgba(0,0,0,0.05)",
    };
    return `.${className}{box-shadow:${shadows[size] ?? shadows.DEFAULT}}`;
  }

  // Transitions
  if (className === "transition") {
    return `.${className}{transition-property:color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms}`;
  }
  if (className === "transition-all") {
    return `.${className}{transition-property:all;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms}`;
  }
  const duration = className.match(/^duration-(\d+)$/);
  if (duration) {
    return `.${className}{transition-duration:${duration[1]}ms}`;
  }
  if (className === "ease-in-out") {
    return `.${className}{transition-timing-function:cubic-bezier(0.4,0,0.2,1)}`;
  }
  if (className === "ease-in") {
    return `.${className}{transition-timing-function:cubic-bezier(0.4,0,1,1)}`;
  }
  if (className === "ease-out") {
    return `.${className}{transition-timing-function:cubic-bezier(0,0,0.2,1)}`;
  }

  // Form / interaction utilities
  if (className === "appearance-none") {
    return `.${className}{appearance:none;-webkit-appearance:none}`;
  }
  if (className === "cursor-pointer") {
    return `.${className}{cursor:pointer}`;
  }
  if (className === "select-none") {
    return `.${className}{user-select:none;-webkit-user-select:none}`;
  }

  // Overflow helpers
  if (className === "overflow-hidden") {
    return `.${className}{overflow:hidden}`;
  }
  if (className === "overflow-auto") {
    return `.${className}{overflow:auto}`;
  }
  if (className === "overflow-x-hidden") {
    return `.${className}{overflow-x:hidden}`;
  }
  if (className === "overflow-y-hidden") {
    return `.${className}{overflow-y:hidden}`;
  }
  if (className === "overflow-x-auto") {
    return `.${className}{overflow-x:auto}`;
  }
  if (className === "overflow-y-auto") {
    return `.${className}{overflow-y:auto}`;
  }

  // Sizing
  const size = className.match(
    /^(w|h|min-w|min-h|max-w|max-h)-(\d+|px|\[[^\]]+\])$/,
  );
  if (size) {
    return `.${className}{${size[1]}:${twSpacingValue(size[2])}}`;
  }

  // Whitespace / word-break
  if (className === "truncate") {
    return `.${className}{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`;
  }
  if (className === "whitespace-nowrap") {
    return `.${className}{white-space:nowrap}`;
  }
  if (className === "break-words") {
    return `.${className}{overflow-wrap:break-word}`;
  }

  return null;
}

function twSpacingValue(token: string): string {
  if (token === "px") {
    return "1px";
  }
  if (token.startsWith("[") && token.endsWith("]")) {
    // Arbitrary value like [10px] → unwrap.
    return token.slice(1, -1).trim() || "0";
  }
  const n = Number(token);
  if (Number.isFinite(n)) {
    return `${(n * 0.25).toFixed(2).replace(/\.?0+$/, "") || "0"}rem`;
  }
  return "0";
}

function twBoxSides(
  direction: string,
  property: string,
  value: string,
): string | null {
  switch (direction) {
    case "":
      return `${property}:${value}`;
    case "x":
      return `${property}-left:${value};${property}-right:${value}`;
    case "y":
      return `${property}-top:${value};${property}-bottom:${value}`;
    case "t":
      return `${property}-top:${value}`;
    case "b":
      return `${property}-bottom:${value}`;
    case "l":
      return `${property}-left:${value}`;
    case "r":
      return `${property}-right:${value}`;
    default:
      return null;
  }
}

function twTextSize(size: string): string | null {
  const sizes: Record<string, string> = {
    xs: "font-size:0.75rem;line-height:1rem",
    sm: "font-size:0.875rem;line-height:1.25rem",
    base: "font-size:1rem;line-height:1.5rem",
    lg: "font-size:1.125rem;line-height:1.75rem",
    xl: "font-size:1.25rem;line-height:1.75rem",
    "2xl": "font-size:1.5rem;line-height:2rem",
    "3xl": "font-size:1.875rem;line-height:2.25rem",
    "4xl": "font-size:2.25rem;line-height:2.5rem",
    "5xl": "font-size:3rem;line-height:1",
    "6xl": "font-size:3.75rem;line-height:1",
    "7xl": "font-size:4.5rem;line-height:1",
    "8xl": "font-size:6rem;line-height:1",
    "9xl": "font-size:8rem;line-height:1",
  };
  return sizes[size] ?? null;
}

function twColorHex(name: string, shade: string): string | null {
  // Curated palette covering the most common Tailwind colors an agent leaks.
  // Map of name -> shade -> hex.
  const palette: Record<string, Record<string, string>> = {
    slate: {
      "50": "#f8fafc",
      "100": "#f1f5f9",
      "200": "#e2e8f0",
      "300": "#cbd5e1",
      "400": "#94a3b8",
      "500": "#64748b",
      "600": "#475569",
      "700": "#334155",
      "800": "#1e293b",
      "900": "#0f172a",
    },
    gray: {
      "50": "#f9fafb",
      "100": "#f3f4f6",
      "200": "#e5e7eb",
      "300": "#d1d5db",
      "400": "#9ca3af",
      "500": "#6b7280",
      "600": "#4b5563",
      "700": "#374151",
      "800": "#1f2937",
      "900": "#111827",
    },
    zinc: {
      "50": "#fafafa",
      "100": "#f4f4f5",
      "200": "#e4e4e7",
      "300": "#d4d4d8",
      "400": "#a1a1aa",
      "500": "#71717a",
      "600": "#52525b",
      "700": "#3f3f46",
      "800": "#27272a",
      "900": "#18181b",
    },
    neutral: {
      "50": "#fafafa",
      "100": "#f5f5f5",
      "200": "#e5e5e5",
      "300": "#d4d4d4",
      "400": "#a3a3a3",
      "500": "#737373",
      "600": "#525252",
      "700": "#404040",
      "800": "#262626",
      "900": "#171717",
    },
    stone: {
      "50": "#fafaf9",
      "100": "#f5f5f4",
      "200": "#e7e5e4",
      "300": "#d6d3d1",
      "400": "#a8a29e",
      "500": "#78716c",
      "600": "#57534e",
      "700": "#44403c",
      "800": "#292524",
      "900": "#1c1917",
    },
    red: {
      "50": "#fef2f2",
      "100": "#fee2e2",
      "200": "#fecaca",
      "300": "#fca5a5",
      "400": "#f87171",
      "500": "#ef4444",
      "600": "#dc2626",
      "700": "#b91c1c",
      "800": "#991b1b",
      "900": "#7f1d1d",
    },
    orange: {
      "50": "#fff7ed",
      "100": "#ffedd5",
      "200": "#fed7aa",
      "300": "#fdba74",
      "400": "#fb923c",
      "500": "#f97316",
      "600": "#ea580c",
      "700": "#c2410c",
      "800": "#9a3412",
      "900": "#7c2d12",
    },
    amber: {
      "50": "#fffbeb",
      "100": "#fef3c7",
      "200": "#fde68a",
      "300": "#fcd34d",
      "400": "#fbbf24",
      "500": "#f59e0b",
      "600": "#d97706",
      "700": "#b45309",
      "800": "#92400e",
      "900": "#78350f",
    },
    yellow: {
      "50": "#fefce8",
      "100": "#fef9c3",
      "200": "#fef08a",
      "300": "#fde047",
      "400": "#facc15",
      "500": "#eab308",
      "600": "#ca8a04",
      "700": "#a16207",
      "800": "#854d0e",
      "900": "#713f12",
    },
    lime: {
      "50": "#f7fee7",
      "100": "#ecfccb",
      "200": "#d9f99d",
      "300": "#bef264",
      "400": "#a3e635",
      "500": "#84cc16",
      "600": "#65a30d",
      "700": "#4d7c0f",
      "800": "#3f6212",
      "900": "#365314",
    },
    green: {
      "50": "#f0fdf4",
      "100": "#dcfce7",
      "200": "#bbf7d0",
      "300": "#86efac",
      "400": "#4ade80",
      "500": "#22c55e",
      "600": "#16a34a",
      "700": "#15803d",
      "800": "#166534",
      "900": "#14532d",
    },
    emerald: {
      "50": "#ecfdf5",
      "100": "#d1fae5",
      "200": "#a7f3d0",
      "300": "#6ee7b7",
      "400": "#34d399",
      "500": "#10b981",
      "600": "#059669",
      "700": "#047857",
      "800": "#065f46",
      "900": "#064e3b",
    },
    teal: {
      "50": "#f0fdfa",
      "100": "#ccfbf1",
      "200": "#99f6e4",
      "300": "#5eead4",
      "400": "#2dd4bf",
      "500": "#14b8a6",
      "600": "#0d9488",
      "700": "#0f766e",
      "800": "#115e59",
      "900": "#134e4a",
    },
    cyan: {
      "50": "#ecfeff",
      "100": "#cffafe",
      "200": "#a5f3fc",
      "300": "#67e8f9",
      "400": "#22d3ee",
      "500": "#06b6d4",
      "600": "#0891b2",
      "700": "#0e7490",
      "800": "#155e75",
      "900": "#164e63",
    },
    sky: {
      "50": "#f0f9ff",
      "100": "#e0f2fe",
      "200": "#bae6fd",
      "300": "#7dd3fc",
      "400": "#38bdf8",
      "500": "#0ea5e9",
      "600": "#0284c7",
      "700": "#0369a1",
      "800": "#075985",
      "900": "#0c4a6e",
    },
    blue: {
      "50": "#eff6ff",
      "100": "#dbeafe",
      "200": "#bfdbfe",
      "300": "#93c5fd",
      "400": "#60a5fa",
      "500": "#3b82f6",
      "600": "#2563eb",
      "700": "#1d4ed8",
      "800": "#1e40af",
      "900": "#1e3a8a",
    },
    indigo: {
      "50": "#eef2ff",
      "100": "#e0e7ff",
      "200": "#c7d2fe",
      "300": "#a5b4fc",
      "400": "#818cf8",
      "500": "#6366f1",
      "600": "#4f46e5",
      "700": "#4338ca",
      "800": "#3730a3",
      "900": "#312e81",
    },
    violet: {
      "50": "#f5f3ff",
      "100": "#ede9fe",
      "200": "#ddd6fe",
      "300": "#c4b5fd",
      "400": "#a78bfa",
      "500": "#8b5cf6",
      "600": "#7c3aed",
      "700": "#6d28d9",
      "800": "#5b21b6",
      "900": "#4c1d95",
    },
    purple: {
      "50": "#faf5ff",
      "100": "#f3e8ff",
      "200": "#e9d5ff",
      "300": "#d8b4fe",
      "400": "#c084fc",
      "500": "#a855f7",
      "600": "#9333ea",
      "700": "#7e22ce",
      "800": "#6b21a8",
      "900": "#581c87",
    },
    fuchsia: {
      "50": "#fdf4ff",
      "100": "#fae8ff",
      "200": "#f5d0fe",
      "300": "#f0abfc",
      "400": "#e879f9",
      "500": "#d946ef",
      "600": "#c026d3",
      "700": "#a21caf",
      "800": "#86198f",
      "900": "#701a75",
    },
    pink: {
      "50": "#fdf2f8",
      "100": "#fce7f3",
      "200": "#fbcfe8",
      "300": "#f9a8d4",
      "400": "#f472b6",
      "500": "#ec4899",
      "600": "#db2777",
      "700": "#be185d",
      "800": "#9d174d",
      "900": "#831843",
    },
    rose: {
      "50": "#fff1f2",
      "100": "#ffe4e6",
      "200": "#fecdd3",
      "300": "#fda4af",
      "400": "#fb7185",
      "500": "#f43f5e",
      "600": "#e11d48",
      "700": "#be123c",
      "800": "#9f1239",
      "900": "#881337",
    },
  };
  return palette[name]?.[shade] ?? null;
}

/**
 * Last-resort: inject working CSS for classes the agent left unstyled. If the
 * class is a recognizable Tailwind utility, emit the real rule (not a
 * color-only stub). Falls back to a color-only stub for unknown names so the
 * site at least renders text. Returns { files, missing } so the caller can
 * enforce a hard cap (too many missing → fail) and log the fallback rate.
 *
 * NOTE: this is intentionally called only AFTER a rewrite pass has been
 * attempted — it must never run before the quality gate, or it defeats
 * validation (the original bug).
 */
export function applyStylesCoverStubs(files: GeneratedProjectFile[]): {
  files: GeneratedProjectFile[];
  missing: string[];
} {
  const styleIndex = files.findIndex((file) => file.path === "src/index.css");
  if (styleIndex < 0) {
    return { files, missing: [] };
  }
  const current = files[styleIndex].content;
  const missing = findMissingCssClasses(files, current);
  if (missing.length === 0) {
    return { files, missing };
  }
  const stubRules: string[] = [];
  for (const className of missing) {
    const twRule = getTailwindCssRule(className);
    if (twRule) {
      stubRules.push(twRule);
      continue;
    }
    // Unknown class name: emit a rule that satisfies the meaningful-CSS check
    // (≥2 declarations OR a non-color property) so the build gate accepts
    // it. The placeholder keeps the site text visible without inventing
    // arbitrary layout the agent didn't intend.
    stubRules.push(
      "." +
        className +
        "{color:var(--fg);display:inline-block;/* auto-cover: define layout in agent styles */}",
    );
  }
  const next =
    current.trim() +
    "\n/* auto-covered classNames (Tailwind-aware fallback) */\n" +
    stubRules.join("") +
    "\n";
  return {
    missing,
    files: files.map((file, index) =>
      index === styleIndex ? { ...file, content: next } : file,
    ),
  };
}

/**
 * Technical checklist: is source ready to attempt compile?
 * 'agentEditedFiles' must exclude auto CSS ensure paths.
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

  // Meaningful agent edits: at least one touched file. The real signal is
  // the presentationEdited/contentEdited check below (a styles-only touch
  // still fails there). size<2 was a holdover from the old edit-site.ts
  // + styles.css workflow; shadcn-only agents legitimately edit one route.
  if (agentEditedFiles.size < 1) {
    issues.push("agent did not edit enough files");
  }

  if (!files.some((file) => file.path.startsWith("src/routes/"))) {
    issues.push("missing route files");
  }

  // Stale-starter detector: if the agent left the scaffold's placeholder
  // home route in place (it compiles + has preview-ready, so size/route
  // checks pass), fail the gate and trip the forced-rewrite path via
  // NO_MEANINGFUL_EDIT_ISSUES. The marker lives in the starter's
  // src/routes/index.tsx (see vite-tanstack-shadcn-starter.ts).
  const homeRoute = files.find((file) => file.path === "src/routes/index.tsx");
  const STARTER_MARKERS = [
    "Replace this with the real home page built from the brief",
    "Replace real home page built from brief",
    "Replace this starter route",
  ];
  if (
    homeRoute &&
    STARTER_MARKERS.some((marker) => homeRoute.content.includes(marker))
  ) {
    issues.push("home route is still the starter placeholder");
  }

  const presentationEdited = [...agentEditedFiles].some(
    (path) =>
      path.startsWith("src/components/") ||
      path.startsWith("src/routes/") ||
      path === "src/styles.css" ||
      path === "src/index.css",
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
      /^(src\/(routes|components|content|lib)\/|src\/(styles|index)\.css)/.test(
        file.path,
      ),
    )
    .map((file) => file.content)
    .join("\n")
    .toLowerCase();

  if (!allSourceText.includes("generated-app-preview-ready")) {
    issues.push("preview-ready signal missing");
  } else {
    // The signal string existing in a file (e.g. src/lib/preview-ready.ts)
    // is not enough: Vite tree-shakes unused modules. Verify the hook is
    // actually called somewhere outside its definition, otherwise the
    // production bundle silently drops the postMessage and the preview
    // iframe hangs forever on "Menyiapkan tampilan website".
    const previewReadyDef = files.find(
      (file) =>
        file.path === "src/lib/preview-ready.ts" ||
        file.content.includes("function usePreviewReady"),
    );
    const hasCallSite = files.some(
      (file) =>
        previewReadyDef?.path !== file.path &&
        /usePreviewReady\s*\(/.test(file.content),
    );
    if (!hasCallSite) {
      issues.push(
        "preview-ready signal defined but never called (usePreviewReady must be invoked in a route/component)",
      );
    }
  }

  const styleFile = files.find((file) => file.path === "src/index.css");
  const styleContent = styleFile?.content || "";
  const missingCss = findMissingCssClasses(files, styleContent);

  if (missingCss.length > 0) {
    issues.push(
      `missing CSS rules for classNames: ${missingCss.slice(0, 8).join(", ")}`,
    );
  }

  return issues.length ? { issues, ok: false } : { issues: [], ok: true };
}

// Always-on design directive, distilled from anti-slop, design-quality, and
// the 3-dial taste skill. Inlined (not read_skill) so every generate/repair/
// rewrite pass gets the rules with zero tool round-trips. ~250 tokens.
const DESIGN_DIRECTIVE = `DESIGN STANDARDS (non-negotiable — output must look designed, not templated):

TASTE READ (decide before writing CSS): infer vibe from business (warung=friendly/warm, bengkel=industrial/bold, kopi=editorial/calm, laundry=clean/trust). Set 3 dials: DESIGN_VARIANCE (1 symmetrical→10 artsy, default 8), MOTION_INTENSITY (1 static→10 cinematic, default 6), VISUAL_DENSITY (1 airy→10 packed, default 4).

COLOR:
- Tinted neutrals only. No pure black (#000/#111/#0a0a0a) and no pure gray (#333/#444/#555). Use warm-tinted dark shades.
- BANNED: purple-blue gradients, gradient text (background-clip:text), mesh-gradient heroes — the #1 AI-slop signal. Use business-relevant solid colors from the palette.
- Body text contrast ≥4.5:1 against its background; large/bold ≥3:1. No muted gray text on colored bg — use a darker shade of the bg's own hue. Prefer OKLCH.
- Accent ≤10% of surface; one accent, used deliberately.

TYPOGRAPHY:
- Pair fonts on a contrast axis (serif+sans, geometric+humanist) OR one family in multiple weights. Avoid two near-identical sans-serifs.
- Distinctive fonts encouraged; avoid default Inter/Roboto/Arial-only pages.
- Display heading: clamp() max ≤6rem, letter-spacing ≥-0.04em. Cap body line length 65–75ch.
- Use text-wrap:balance on h1–h3, text-wrap:pretty on prose.

LAYOUT:
- Vary spacing for rhythm — uniform section padding reads AI-generated. "Art Gallery Airy": generous margins, let content breathe (section padding 48–96px vertical).
- Cards are the lazy answer. Avoid generic 3-equal-card grids; mix hero + text + list + grid. Nested cards are always wrong.
- Responsive grids without breakpoints: repeat(auto-fit, minmax(280px, 1fr)). Mobile-first: base mobile, @media (min-width:640px) scale up.
- Semantic z-index scale; never arbitrary 999/9999.
- Use h-screen via min-height:100dvh, never h-screen.

MOTION:
- Ease-out exponential curves (ease-out-quart/quint/expo). No bounce, no elastic. Don't animate layout properties.
- Every animation needs @media (prefers-reduced-motion:reduce) fallback. Reveals enhance already-visible content — never gate visibility on a class-triggered transition.

CONTENT:
- Real, specific Indonesian copy ("Sewa PS Rp 5.000/jam", not "Harga terjangkau"). No "Lorem ipsum" / "Coming soon".
- Use design tokens from src/index.css (--background/--foreground/--muted/--accent) as the single source of truth.`;

function buildAgentPrompt(implementationBrief: string) {
  return `Build a custom standalone app from starter files.

Implementation brief:
${implementationBrief}

${DESIGN_DIRECTIVE}

SPEED RULES (you have limited steps — write immediately):
1. FIRST STEP: write_file src/routes/index.tsx with the full home page using shadcn components + Tailwind utilities.
2. SECOND STEP: if the brief has distinct sections, write extra route files under src/routes/ (e.g. katalog.tsx, kontak.tsx) and register them in src/router.tsx with <Link> nav. Otherwise keep the single composed page.
3. THIRD STEP: write any extra shadcn components you need under src/components/ui/ — canonical new-york + Tailwind v4 shape, import cn from "@/lib/utils".
4. LAST STEP: check_app once.

DO NOT read_file before writing — starter files are predictable.
DO NOT spend steps exploring. Write complete files from the start.
Do NOT edit, overwrite, or modify src/content/site.ts. It is already fully populated with the business data. Only read from it using named import: "import { site } from '@/content/site'".
Do NOT edit src/index.css — it is platform-owned and pre-wired with shadcn theme vars.

STATIC ONLY: no auth, no backend, no DB, no payment gateway, no fake /api routes. Use WhatsApp/contact CTA and real Indonesian business copy.
Do not add or remove dependencies — package.json is platform-owned.

Keep usePreviewReady() called in the rendered route.`;
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

export function buildGeneratedAppAgentInstructions(
  schema: ProjectSiteSchema,
  implementationSpec?: ImplementationSpec,
  mode: "generate" | "repair" | "rewrite" = "generate",
) {
  const skillsBlock =
    mode === "generate"
      ? `\nWrite files directly; you already know the stack. You MAY call read_skill "tailwind-v4", "tanstack-router-static", or "shadcn-ui" if unsure, but do not stall on exploration.
WRITE first: src/routes/index.tsx (the home page, composing shadcn components + Tailwind utilities).
Then add any extra routes under src/routes/ and business-specific components under src/components/custom/.
Never call check_app before at least one write_file.`
      : mode === "rewrite"
        ? `\nFORCED REWRITE MODE: write core routes/components immediately, then check_app.`
        : "";

  return `You are a frontend coding agent for UMKM Cepat generated apps.

Business: ${implementationSpec?.businessName || schema.businessName} — ${implementationSpec?.appKind || "landing"} — ${(implementationSpec?.features || [schema.offer, schema.audience]).join(", ")}
${skillsBlock}
${DESIGN_DIRECTIVE}

STACK (locked — do not change tooling):
- Vite + React 19 + TypeScript + TanStack Router (hash history, static).
- Tailwind CSS v4 (utility classes inline; src/index.css pre-wires theme vars — do not edit it).
- shadcn/ui components in src/components/ui/ are platform-owned — do not edit them; compose them.
- package.json is platform-owned — do not add or remove dependencies.

STYLING (shadcn + Tailwind only — no custom CSS):
- All styling uses Tailwind utility classes inline in the TSX, using theme tokens (bg-background, text-foreground, bg-primary, text-primary-foreground, bg-muted, text-muted-foreground, bg-accent, text-accent-foreground, border-border, ring-ring).
- Do NOT write custom CSS class names (no .btn-primary / .nav-link / .hero-section / etc.) and do NOT edit src/index.css.
- If you need a shadcn component not pre-seeded, write its source into src/components/ui/<name>.tsx (canonical new-york + Tailwind v4 shape, import cn from "@/lib/utils"). No CLI at build time.
- Use min-h-dvh for full-height sections, never h-screen.

ROUTING & PAGE CONTRACT:
- src/routes/index.tsx MUST export a component named HomeRouteComponent: "export function HomeRouteComponent() { ... }".
- Prefer REAL multi-page routing when the brief has distinct sections (Home, Catalog, Contact, Product detail, etc.). Add one route file per page under src/routes/ (e.g. katalog.tsx, kontak.tsx) and register each in src/router.tsx via createRoute({ getParentRoute: () => rootRoute, path: "/katalog", component: ... }) then add it to rootRoute.addChildren([...]). Keep the existing index route and the path:"*" 404 catch-all.
- Navigate between pages with <Link to="/katalog"> from "@tanstack/react-router". Do NOT fake routing with useState tabs.
- Do NOT edit src/main.tsx or src/routes/__root.tsx (you may add a shared layout in __root.tsx if the brief calls for header/footer, but keep <Outlet />). You MAY edit src/router.tsx to register your extra routes — nothing else there.
- Import usePreviewReady from "@/lib/preview-ready".
- Import the business data using: import { site } from "@/content/site". Do NOT edit src/content/site.ts — it is fully populated and exports site as both named and default exports.

STATIC ONLY: no auth, no backend, no database, no payment gateway, no fake /api routes. Use WhatsApp/contact CTAs and real Indonesian business copy.
Do not add or remove dependencies — package.json is platform-owned.

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

  // Repair passes routinely rewrite src/routes/index.tsx and src/router.tsx
  // to fix a compile error and drop necessary wiring in the process —
  // re-heal both before the build runs.
  currentFiles = ensureRouterRouteWired(currentFiles);
  currentFiles = ensurePreviewReadyCalled(currentFiles);
  currentFiles = ensureStylesFileExists(currentFiles, schema);
  touchedFiles.add(AUTO_STYLE_PATH);

  // Last-resort stub fallback (same as the generate path): cap missing CSS so
  // a repaired site doesn't silently ship half-styled.
  const repairMissing = findMissingCssClasses(
    currentFiles,
    currentFiles.find((file) => file.path === "src/index.css")?.content ?? "",
  );
  if (repairMissing.length > 0) {
    const STUB_HARD_CAP = 100;
    devLog("generate", "css.fallback-stubs", {
      missingCount: repairMissing.length,
      path: "repair",
      projectId,
    });
    if (repairMissing.length > STUB_HARD_CAP) {
      throw new Error(
        `AI source generation failed: too many unstyled components (${repairMissing.length}).`,
      );
    }
    currentFiles = applyStylesCoverStubs(currentFiles).files;
  }

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
