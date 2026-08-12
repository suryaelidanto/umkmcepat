// src/lib/projects/batched-generator.ts
// Batched-generation writer: ONE streamed response emits all project files as
// parseable blocks (see batched-response.ts for the contract). The parser
// stages + validates; failures get up to 2 targeted repair rounds; budget
// exhausted → `needsFallback` and the caller (build-attempt-worker) runs the
// legacy ToolLoopAgent unchanged.
//
// Guarantees match the legacy path: path allow-list, TSX parse check,
// import allow-list (platform package policy), required file coverage, and
// a deterministic design lint. No tools — the model emits plain structured
// text; every byte is validated before landing.
import { streamText } from "ai";
import ts from "typescript";

import type { StepCharger } from "@/lib/projects/energy-step-charger";
import type { GeneratedSiteContractV1 } from "@/lib/projects/generated-site-contract";
import type {
  GeneratedSiteGoldExample,
  GeneratedSiteRecipeV1,
} from "@/lib/projects/generated-site-recipes";
import type { GeneratedProjectFile } from "@/lib/projects/generated-types";
import type { ImplementationSpec } from "@/lib/projects/implementation-spec";
import type { ProjectSiteSchema } from "@/lib/projects/site-schema";

import {
  getAiModel,
  getAiTelemetry,
  getNoReasoningCallOptions,
} from "@/lib/ai";
import {
  classifyAiError,
  recordAiCall,
  startAiCallTimer,
} from "@/lib/ai-call-record";
import { getGenerationModel } from "@/lib/ai-models";
import { devLog } from "@/lib/dev-log";
import {
  buildBatchedWriterPrompt,
  buildFormatRepairPrompt,
  buildTargetedRepairPrompt,
  buildTruncationResumePrompt,
} from "@/lib/projects/batched-prompt";
import {
  BatchedParseError,
  createBatchedResponseParser,
  type BatchedDiagnostic,
  type BatchedFile,
  type WriterDesignPlanV1,
} from "@/lib/projects/batched-response";
import { type ProjectBrief } from "@/lib/projects/brief";
import {
  BatchedAdmissionBlockedError,
  checkBatchedGenerateAdmission,
} from "@/lib/projects/brief-admission";
import { inspectGeneratedSiteSource } from "@/lib/projects/generated-site-gates";
export { buildBatchedWriterPrompt } from "@/lib/projects/batched-prompt";
import { isProtectedScaffoldPath } from "@/lib/projects/scaffold/protected-paths";
import { resolveShadcnDeps } from "@/lib/projects/scaffold/shadcn-components";
import { SHADCN_COMPONENT_BY_NAME } from "@/lib/projects/scaffold/shadcn-components";
import { compileShadcnTheme } from "@/lib/projects/scaffold/shadcn-theme";
import { createViteTanStackShadcnStarterFiles } from "@/lib/projects/scaffold/vite-tanstack-shadcn-starter";

// ---------------------------------------------------------------------------
// Constants shared with gates

/** Dependency allow-list source of truth: the scaffold's own package.json. */
function allowedPackageNamesFrom(
  starterFiles: GeneratedProjectFile[],
): Set<string> {
  const pkg = starterFiles.find((file) => file.path === "package.json");
  if (!pkg) {
    return new Set();
  }
  try {
    const parsed = JSON.parse(pkg.content) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    return new Set([
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
    ]);
  } catch {
    return new Set();
  }
}

const IMPORT_SPECIFIER_PATTERN =
  /\b(?:import|export)[\s\S]*?\bfrom\s+["']([^"']+)["']|\bimport\s*[\(\s]["']([^"']+)["']/g;

/** External placeholder/image hosts the design lint rejects. */
const BANNED_URL_PATTERN =
  /https?:\/\/(?:www\.)?(?:placehold\.co|via\.placeholder\.com|picsum\.photos|unsplash\.com|images\.unsplash\.com|dummyimage\.com|loremflickr\.com|placekitten\.com|lorem\.picsum)/i;

const REQUIRED_STAGE_PATHS = ["src/routes/index.tsx"] as const;

/** Starter-scaffold boilerplate the writer must replace. Matches the default
 * CTAs and feature-card copy from the TanStack starter — any hit means the AI
 * shipped scaffold rot instead of rewriting the home page from site.ts. */
const STARTER_BOILERPLATE_PATTERN =
  /Read the Blog|View on GitHub|href="\/blog"|href="https:\/\/github\.com"|MDX Ready|Fast\s+\+\s+Beautiful|Beautiful\s+\+\s+MDX/i;

/** Fields the gate enforces rendering for, in priority order. Only those the
 * staged site.ts actually populated are checked — empty fields are skipped so
 * a minimal 2-field brief is not penalized. */
const RENDER_REQUIRED_SITE_FIELDS = [
  "headline",
  "subheadline",
  "primaryCta",
  "offer",
  "trustPoints",
  "sections",
  "products",
  "testimonials",
  "faq",
  "currentPromo",
  "socialLinks",
] as const;

/** Regex-scan site.ts for which fields hold real data. Avoids eval — a
 * malformed site object never crashes the gate. Handles both single-line
 * and multi-line site.ts emissions. A field counts as populated when its
 * value is a non-empty string, a non-empty array, or a non-empty object. */
function detectPopulatedSiteFields(siteTsContent: string): readonly string[] {
  const populated: string[] = [];
  // Match each top-level key: 'field': value  or  field: value. Value is one
  // of: quoted string, bracketed array, braced object, or bare scalar. Stops
  // at the next comma or closing brace. Nested brackets/braces are not
  // balanced — the schema's rich fields are arrays of flat objects, so a
  // first-bracket cut is sufficient. ponytail: upgrade to a real TS parse if
  // site.ts grows deeply nested content.
  const fieldRe =
    /"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*:\s*("[^"]*"|'[^']*'|\[[^\]]*\]|\{[^}]*\}|[^,}\n]*)/g;
  let m: RegExpExecArray | null;
  while ((m = fieldRe.exec(siteTsContent)) !== null) {
    const field = m[1];
    const rawValue = m[2].trim();
    if (isPopulatedValue(rawValue)) {
      populated.push(field);
    }
  }
  return populated.filter((f) =>
    RENDER_REQUIRED_SITE_FIELDS.includes(
      f as (typeof RENDER_REQUIRED_SITE_FIELDS)[number],
    ),
  );
}

function isPopulatedValue(raw: string): boolean {
  // String: non-empty after stripping quotes.
  if (/^["'`]/.test(raw)) {
    return raw.replace(/^["'`]|["'`]$/g, "").trim().length > 0;
  }
  // Array: at least one non-bracket, non-whitespace char inside.
  if (raw.startsWith("[")) {
    return /\[\s*[^\s\]]/.test(raw);
  }
  // Object: at least one non-brace, non-whitespace char inside.
  if (raw.startsWith("{")) {
    return /\{\s*[^\s\}]/.test(raw);
  }
  // Bare identifier/number: treat as populated (e.g. version: 1).
  return raw.length > 0 && raw !== "undefined" && raw !== "null";
}

/** Parse index.tsx with the TypeScript compiler and return the set of site.*
 * fields that appear inside JSX expression containers ({...}) or as JSX
 * children — i.e. actually rendered, not just mentioned in a comment or
 * assigned to an unused variable. This is the semantic check the old
 * presence-regex gate could not do. */
function renderedSiteFieldsInIndex(indexContent: string): Set<string> {
  const rendered = new Set<string>();
  const sourceFile = ts.createSourceFile(
    "index.tsx",
    indexContent,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );
  const visit = (node: ts.Node) => {
    // site.<field> inside a JSX expression container {site.headline} counts
    // as rendered. Also site.<field>.map(...) inside JSX renders.
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "site" &&
      ts.isIdentifier(node.name)
    ) {
      if (isInsideJsx(node)) {
        rendered.add(node.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return rendered;
}

/** Walk up parents: true when the site.<field> access is inside a JSX
 * expression container ({...}) or is a JSX child. Comments, unused variable
 * initializers, and console.log args do not count. */
function isInsideJsx(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isJsxExpression(current) ||
      ts.isJsxElement(current) ||
      ts.isJsxSelfClosingElement(current) ||
      ts.isJsxFragment(current) ||
      ts.isJsxText(current)
    ) {
      return true;
    }
    // Stop at function/block boundaries — an access inside a non-JSX arrow
    // fn body that is never called from JSX is not rendered.
    if (ts.isFunctionDeclaration(current) || ts.isBlock(current)) {
      return false;
    }
    current = current.parent;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public types

export type BatchedGenerateResult =
  | {
      ok: true;
      files: GeneratedProjectFile[];
      designPlan: WriterDesignPlanV1 | null;
      repairRounds: number;
      summary: string;
      writtenPaths: string[];
    }
  | {
      needsFallback: true;
      ok: false;
      reason: string;
      repairRounds: number;
      files?: never;
    };

export type BatchedGenerateEventSink = (
  type: "progress" | "operation",
  data: Record<string, unknown>,
) => void;

// ---------------------------------------------------------------------------
// Prompt builder

// ---------------------------------------------------------------------------
// Validation gates

export function collectBatchedPerFileIssues(input: {
  allowedPackages: ReadonlySet<string>;
  file: { content: string; path: string };
}): string[] {
  const issues: string[] = [];
  const { file } = input;

  // JSX must never appear in a .ts file — content files are data-only modules
  // (ts.transpileModule flags this too, but with a confusing --jsx option
  // message). Flag it directly so the writer repair gets a clear instruction.
  if (
    /\.ts$/.test(file.path) &&
    /<[A-Za-z][^>]*>|<\/[A-Za-z]/.test(file.content)
  ) {
    issues.push(
      `${file.path}: contains JSX markup but is a .ts file — content files are data-only modules. Move JSX into a .tsx file under src/components/ or src/routes/.`,
    );
  }

  if (/\.(ts|tsx)$/.test(file.path)) {
    const transpiled = ts.transpileModule(file.content, {
      compilerOptions: {
        jsx: file.path.endsWith(".tsx") ? ts.JsxEmit.ReactJSX : undefined,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2023,
      },
      fileName: file.path,
      reportDiagnostics: true,
    });
    const syntactic = (transpiled.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    );
    for (const diagnostic of syntactic.slice(0, 3)) {
      issues.push(
        `${file.path}: TSX parse error — ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
      );
    }
  }

  if (/\.[mc]?[tj]sx?$/.test(file.path)) {
    for (const match of file.content.matchAll(IMPORT_SPECIFIER_PATTERN)) {
      const specifier = match[1] ?? match[2];
      if (!specifier) {
        continue;
      }
      if (
        specifier.startsWith("@/") ||
        specifier.startsWith(".") ||
        specifier.startsWith("/") ||
        specifier.startsWith("node:") ||
        /^(https?:|file:)/.test(specifier)
      ) {
        continue;
      }
      const packageName = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0];
      if (input.allowedPackages.has(packageName)) {
        continue;
      }
      issues.push(
        `${file.path}: imports undeclared package "${packageName}". Only scaffold package.json dependencies are allowed.`,
      );
    }
  }

  return issues;
}

export function collectBatchedGateIssues(
  stagedFiles: GeneratedProjectFile[],
  context: { indexCss: string },
): string[] {
  const issues: string[] = [];
  const paths = new Set(stagedFiles.map((file) => file.path));

  for (const required of REQUIRED_STAGE_PATHS) {
    if (!paths.has(required)) {
      issues.push(
        `Missing required file: ${required} — the home route must exist.`,
      );
    }
  }

  const indexFile = stagedFiles.find((f) => f.path === "src/routes/index.tsx");
  if (
    indexFile &&
    !/export\s+function\s+HomeRouteComponent\b/.test(indexFile.content)
  ) {
    issues.push(
      'src/routes/index.tsx must export a function named HomeRouteComponent ("export function HomeRouteComponent() { ... }").',
    );
  }

  if (indexFile && !/usePreviewReady\s*\(/.test(indexFile.content)) {
    issues.push(
      "src/routes/index.tsx must call usePreviewReady() inside HomeRouteComponent so the preview iframe unlocks.",
    );
  }

  if (
    indexFile &&
    /welcome\s+to\s+the\s+home\s+page|>Home<\/h1>|>Welcome<\/h1>|Home page content goes here|Your new project is ready/i.test(
      indexFile.content,
    )
  ) {
    issues.push(
      "src/routes/index.tsx is still a generic stub — build the real home page from the brief content (site.ts, sections, menu, contact).",
    );
  }

  if (indexFile && !/site\./.test(indexFile.content)) {
    issues.push(
      "src/routes/index.tsx does not reference site.* — the home page must render from src/content/site.ts (site.headline, site.businessName, site.offer) so brief content appears.",
    );
  }

  // Starter-boilerplate ban: reject the scaffold's default CTAs/copy that
  // ship when the AI ignores site.ts. These literals only appear in the
  // untouched starter, so any match means the writer did not rewrite the
  // home page from the brief.
  if (indexFile && STARTER_BOILERPLATE_PATTERN.test(indexFile.content)) {
    issues.push(
      'src/routes/index.tsx ships starter boilerplate ("Read the Blog", "View on GitHub", "⚡ Fast", "🎨 Beautiful", "📝 MDX Ready", or /blog + github.com hrefs) — rewrite the home page from site.* content. The gate rejects scaffold rot.',
    );
  }

  // site.ts schema-drift detector: only read fields that exist on the site
  // object. Invented fields (site.phone, site.tagline, site.name,
  // site.address) fail tsc after the AI pass and burn repairs.
  const SITE_KNOWN_FIELDS = new Set([
    "businessName",
    "eyebrow",
    "headline",
    "subheadline",
    "primaryCta",
    "secondaryCta",
    "audience",
    "offer",
    "theme",
    "trustPoints",
    "sections",
    "version",
    // Rich fields — optional but valid when the brief populated them.
    "tagline",
    "usp",
    "products",
    "testimonials",
    "faq",
    "socialLinks",
    "currentPromo",
    "hours",
    "paymentMethods",
    "priceRange",
    "address",
    "deliveryArea",
  ]);
  for (const file of stagedFiles) {
    if (!file.path.endsWith(".tsx")) {
      continue;
    }
    for (const match of file.content.matchAll(
      /site\.([a-zA-Z_][a-zA-Z0-9_]*)/g,
    )) {
      const field = match[1];
      if (field === "map" || field === "filter" || field === "length") {
        continue;
      }
      if (!SITE_KNOWN_FIELDS.has(field)) {
        issues.push(
          `${file.path}: site.${field} does not exist on src/content/site.ts — use the actual fields (businessName, headline, offer, trustPoints, sections, products, testimonials, faq, ...).`,
        );
      }
    }
  }

  // Render-completeness gate (data-driven): parse the staged site.ts to learn
  // which fields the brief populated, then assert each populated field is
  // actually RENDERED in index.tsx — not just mentioned in a comment or
  // unused variable. This is the check that catches the failure mode where
  // the writer references site.headline once but ships starter cards for
  // everything else. Reads site.ts with a regex (not eval) so a malformed
  // site object never crashes the gate.
  if (indexFile) {
    const siteFile = stagedFiles.find((f) => f.path === "src/content/site.ts");
    const populatedFields = siteFile
      ? detectPopulatedSiteFields(siteFile.content)
      : [];
    const unrendered = renderedSiteFieldsInIndex(indexFile.content);
    for (const field of populatedFields) {
      if (!unrendered.has(field)) {
        issues.push(
          `src/routes/index.tsx does not render site.${field} — site.ts has data for this field but it never appears inside JSX. Render it as a visible element, not a comment or unused variable.`,
        );
      }
    }
  }

  // The scaffold uses manual routing (createRoute in src/router.tsx), not
  // TanStack file-route boilerplate. createFileRoute is a type-only helper in
  // this router version — calling it with a path string fails the tsc build
  // gate ("Argument of type '\"/\"' is not assignable to parameter of type
  // 'undefined'") and the Route export never reaches the router tree.
  for (const file of stagedFiles) {
    if (
      /^src\/routes\/.+\.tsx$/.test(file.path) &&
      /\bcreateFileRoute\b/.test(file.content)
    ) {
      issues.push(
        `${file.path}: uses createFileRoute — the scaffold routes manually via createRoute in src/router.tsx. Export plain components and register them there.`,
      );
    }
  }

  for (const file of stagedFiles) {
    if (!/\.(tsx?|css|html|svg)$/.test(file.path)) {
      continue;
    }
    if (BANNED_URL_PATTERN.test(file.content)) {
      issues.push(
        `${file.path}: external placeholder/image URL — use local /placeholder.svg or /placeholder-vertical.svg instead.`,
      );
    }
  }

  for (const token of ["--background", "--foreground", "--accent"]) {
    if (!context.indexCss.includes(`${token}:`)) {
      issues.push(
        `src/index.css is missing theme token ${token} — keep the starter CSS untouched.`,
      );
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Runner

/**
 * Normalized result of one streamed response (writer / format-repair /
 * targeted repair). Exported so the batched edit runner (Phase 2) shares the
 * same call chassis — parser, per-file events, telemetry, write-through.
 */
export type BatchedStreamCallResult = {
  errorClass?: string;
  finishedText: boolean; // saw a <done/>
  parseError?: BatchedParseError;
  response: {
    designPlan: WriterDesignPlanV1 | null;
    diagnostics: BatchedDiagnostic[];
    doneSummary: string | null;
    files: Map<string, { content: string; path: string }>;
    proposals: { path: string; reason: string }[];
  };
  usage?: { inputTokens?: number; outputTokens?: number };
  modelServed?: string;
  requestMs: number;
  /** Set when the stream fast-failed on a structurally broken .tsx block. */
  syntaxIssue?: string;
};

/** Syntax error in one emitted <file/> block, thrown to fast-fail the stream. */
export class WriterTsxSyntaxError extends Error {
  readonly path: string;
  constructor(input: { message: string; path: string }) {
    super(input.message);
    this.name = "WriterTsxSyntaxError";
    this.path = input.path;
  }
}

function firstTsxSyntaxError(
  file: BatchedFile,
): { message: string; path: string } | null {
  if (!/\.tsx$/.test(file.path)) {
    return null;
  }
  const transpiled = ts.transpileModule(file.content, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2023,
    },
    fileName: file.path,
    reportDiagnostics: true,
  });
  const first = (transpiled.diagnostics ?? []).find(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (!first) {
    return null;
  }
  return {
    message: `${file.path}: TSX parse error — ${ts.flattenDiagnosticMessageText(first.messageText, " ")}`,
    path: file.path,
  };
}

/**
 * Semantic gate a staged <file> block must pass before the batched-edit
 * worker may persist it to `project.sourceFiles`. Mirrors the merge-time
 * rules the runners apply: protected scaffold paths never land, and a
 * structurally-broken TSX block never lands mid-stream (targeted repair
 * re-emits it). ponytail: extend with a caller-supplied scope set if/when a
 * caller tracks writer targets or repair implicated paths at persist time.
 */
export function isBatchedFilePersistable(file: BatchedFile): boolean {
  if (isProtectedScaffoldPath(file.path)) {
    return false;
  }
  return firstTsxSyntaxError(file) === null;
}

/** Snapshot of parser-stage into the plain map shape results carry. */
function parserStagedMap(
  parser: ReturnType<typeof createBatchedResponseParser>,
): Map<string, { content: string; path: string }> {
  const map = new Map<string, { content: string; path: string }>();
  for (const path of parser.stagedPaths) {
    const file = parser.stagedFile(path);
    if (file) {
      map.set(path, file);
    }
  }
  return map;
}

export async function runOneStreamedResponse(args: {
  abortSignal?: AbortSignal;
  onEvent?: BatchedGenerateEventSink;
  /**
   * Durable write-through: full staged content as each block closes. The
   * callback receives each complete block as-is; the CALLER is responsible
   * for running `isBatchedFilePersistable` (protected-path / TSX / scope
   * gate) before persisting — see edit-attempt-worker's persistBatchedStage.
   */
  onFileStaged?: (file: BatchedFile) => void;
  onFileWritten?: (path: string) => void;
  phase: "writer" | "format-repair" | "repair" | "visual-repair";
  projectId: string;
  attemptId?: string;
  buildId?: string | null;
  retryCount: number;
  requireDesignPlan?: boolean;
  stepCharger?: StepCharger;
  system: string;
  /** Ledger task. Phase 1 generate uses build-step/build-repair; Phase 2 edit uses "edit" for every leg. */
  task?: "build-step" | "edit";
  user: string;
}): Promise<BatchedStreamCallResult> {
  const requestedModel = getGenerationModel();
  const stopTimer = startAiCallTimer({ withTtft: true });
  const parser = createBatchedResponseParser({
    requireDesignPlan: args.requireDesignPlan,
  });
  let modelServed: string | undefined;
  let usage: { inputTokens?: number; outputTokens?: number } | undefined;
  const writtenThisCall = new Set<string>();
  // Declared OUTSIDE the try so the WriterTsxSyntaxError catch below can
  // still resolve partial usage/modelServed. Kept as `| undefined` even
  // though the catch is only reachable when streamText already assigned —
  // TS can't prove that across the try/catch boundary.
  let result: ReturnType<typeof streamText> | undefined;

  try {
    result = streamText({
      model: getAiModel(requestedModel),
      maxOutputTokens: 24_000,
      maxRetries: 2,
      ...getNoReasoningCallOptions(),
      system: args.system,
      messages: [{ role: "user", content: args.user }],
      temperature: 0.35,
      ...(args.abortSignal ? { abortSignal: args.abortSignal } : {}),
      telemetry: getAiTelemetry("batched-generation-writer", {
        phase: args.phase,
        projectId: args.projectId,
      }),
    });

    let sawDone = false;
    let lastFileCount = 0;
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        stopTimer.firstChunk();
        parser.push(part.text);
        // Emit per-file progress as each block closes — the parser stages
        // files incrementally, so a size bump means a file just finished.
        if (parser.stagedPaths.length > lastFileCount) {
          for (const path of parser.stagedPaths) {
            if (!writtenThisCall.has(path)) {
              writtenThisCall.add(path);
              const stagedFile = parser.stagedFile(path);
              if (stagedFile) {
                args.onFileStaged?.(stagedFile);
                // Cheap per-file TSX gate at stage time: the tail of the
                // response can't fix an already-broken block, but it CAN
                // re-emit the same path (duplicate-diagnostic, last-wins) —
                // so bail immediately and let the caller's targeted repair
                // handle it instead of burning the rest of the stream.
                const tsxError = firstTsxSyntaxError(stagedFile);
                if (tsxError) {
                  throw new WriterTsxSyntaxError(tsxError);
                }
              }
              args.onFileWritten?.(path);
              args.onEvent?.("operation", {
                detail: "File ditulis writer batched.",
                path,
                state: "succeeded",
                title: "Menulis file",
                type: "write_file",
              });
            }
          }
          lastFileCount = parser.stagedPaths.length;
        }
      } else if (part.type === "error") {
        throw part.error instanceof Error
          ? part.error
          : new Error(String(part.error));
      }
    }

    const parsed = parser.finalize();
    usage = await Promise.resolve(result.usage).catch(() => undefined);
    modelServed = (
      await Promise.resolve(result.response).catch(() => undefined)
    )?.modelId;
    sawDone = parsed.done !== null;

    const { requestMs, ttftMs } = stopTimer();
    const ledgerTask =
      args.task ?? (args.phase === "writer" ? "build-step" : "build-repair");
    recordAiCall({
      attemptId: args.attemptId,
      buildId: args.buildId ?? undefined,
      inputTokens: usage?.inputTokens ?? undefined,
      modelRequested: requestedModel,
      modelServed,
      outputTokens: usage?.outputTokens ?? undefined,
      phase: args.phase,
      projectId: args.projectId,
      requestMs,
      retryCount: args.retryCount,
      status: "ok",
      task: ledgerTask,
      ttftMs,
    });
    if (usage?.inputTokens || usage?.outputTokens) {
      await args.stepCharger?.onStepFinish({
        response: { modelId: modelServed },
        usage,
      });
    }

    return {
      finishedText: sawDone,
      requestMs,
      response: {
        designPlan: parsed.designPlan,
        diagnostics: parsed.diagnostics,
        doneSummary: parsed.done?.summary ?? null,
        files: parsed.files,
        proposals: parsed.proposals,
      },
      ...(modelServed ? { modelServed } : {}),
      ...(usage ? { usage } : {}),
    };
  } catch (error) {
    // Fast-fail on a structurally-broken TSX block mid-stream (see above):
    // the remainder of the response can't repair it, so hand the caller a
    // partial-snapshot result instead of a thrown transport error. Tokens up
    // to the throw are still real usage — charge them via the same step
    // charger the success path uses, and tag the ledger row status=error.
    if (error instanceof WriterTsxSyntaxError) {
      const { requestMs, ttftMs } = stopTimer();
      const ledgerTask =
        args.task ?? (args.phase === "writer" ? "build-step" : "build-repair");
      // Best-effort: usage/model may already be resolvable even though the
      // text loop bailed early. Never let a usage-resolution failure mask the
      // syntax signal — the caller still gets the partial snapshot.
      const partialUsage = result
        ? await Promise.resolve(result.usage).catch(() => undefined)
        : undefined;
      const partialModel = result
        ? (await Promise.resolve(result.response).catch(() => undefined))
            ?.modelId
        : undefined;
      recordAiCall({
        attemptId: args.attemptId,
        buildId: args.buildId ?? undefined,
        inputTokens: partialUsage?.inputTokens ?? undefined,
        modelRequested: requestedModel,
        modelServed: partialModel,
        outputTokens: partialUsage?.outputTokens ?? undefined,
        phase: args.phase,
        projectId: args.projectId,
        requestMs,
        retryCount: args.retryCount,
        status: "error",
        task: ledgerTask,
        ttftMs,
      });
      if (
        args.stepCharger &&
        (partialUsage?.inputTokens || partialUsage?.outputTokens)
      ) {
        await args.stepCharger.onStepFinish({
          response: { modelId: partialModel },
          usage: partialUsage ?? {},
        });
      }
      return {
        finishedText: false,
        requestMs,
        response: {
          designPlan: null,
          diagnostics: [],
          doneSummary: null,
          files: parserStagedMap(parser),
          proposals: [],
        },
        syntaxIssue: error.message,
      };
    }
    const { requestMs, ttftMs } = stopTimer();
    const errorClass = classifyAiError(error);
    const ledgerTask =
      args.task ?? (args.phase === "writer" ? "build-step" : "build-repair");
    recordAiCall({
      attemptId: args.attemptId,
      buildId: args.buildId ?? undefined,
      errorClass,
      modelRequested: requestedModel,
      phase: args.phase,
      projectId: args.projectId,
      requestMs,
      retryCount: args.retryCount,
      status: "error",
      task: ledgerTask,
      ttftMs,
    });
    if (error instanceof BatchedParseError) {
      return {
        errorClass,
        finishedText: false,
        parseError: error,
        requestMs,
        response: {
          designPlan: null,
          diagnostics: [],
          doneSummary: null,
          // Keep whatever the parser staged before the hard error — a
          // truncated tail must not wipe complete earlier blocks; the
          // format-repair retry overlays them via duplicate-file last-wins.
          files: parserStagedMap(parser),
          proposals: [],
        },
      };
    }
    throw error;
  }
}

// NOTE: per-file progress events ride parser.stagedPaths — a read-only view
// the parser maintains while streaming, so UI updates land as each </file>
// closes rather than in a burst at <done>.

export async function runBatchedGenerate(input: {
  abortSignal?: AbortSignal;
  attemptId?: string;
  brief: ProjectBrief;
  buildId?: string | null;
  implementationSpec?: ImplementationSpec;
  contract?: GeneratedSiteContractV1;
  recipe?: GeneratedSiteRecipeV1;
  example?: GeneratedSiteGoldExample;
  onEvent?: BatchedGenerateEventSink;
  onFileStaged?: (file: BatchedFile) => void;
  projectId: string;
  schema: ProjectSiteSchema;
  stepCharger?: StepCharger;
  userId: string;
}): Promise<BatchedGenerateResult> {
  const admission = checkBatchedGenerateAdmission({ brief: input.brief });
  if (!admission.ok) {
    devLog("generate", "batched.admission-blocked", {
      blockers: admission.blockers,
      projectId: input.projectId,
    });
    throw new BatchedAdmissionBlockedError({
      blockers: admission.blockers,
      reason: admission.reason,
    });
  }

  const starterFiles = createViteTanStackShadcnStarterFiles(
    input.projectId,
    input.schema,
  );
  const allowedPackages = allowedPackageNamesFrom(starterFiles);
  const starterByPath = new Map(starterFiles.map((f) => [f.path, f]));
  const indexCssForGate = starterByPath.get("src/index.css")?.content ?? "";

  input.onEvent?.("progress", {
    detail: "Satu respons AI menulis semua file (batched).",
    label: "AI menulis website",
  });

  // Stage = scaffold starter files as the base, overlaid by batched AI
  // files. Pre-seeding the scaffold files (site.ts, index.css, preview-ready,
  // __root.tsx, main.tsx) into staged is required for the completeness gate —
  // it reads site.ts to learn which fields are populated, and those files are
  // platform-owned (the AI never emits them), so they must already be present
  // when the gate runs.
  const staged = new Map<string, { content: string; path: string }>();
  for (const file of starterFiles) {
    staged.set(file.path, { content: file.content, path: file.path });
  }
  const proposals: { path: string; reason: string }[] = [];
  let lastDiagnostics: string[] = [];
  let repairRounds = 0;

  // -- Pass 1: writer -------------------------------------------------------
  const writerPrompt = buildBatchedWriterPrompt({
    brief: input.brief,
    implementationSpec: input.implementationSpec,
    contract: input.contract,
    recipe: input.recipe,
    example: input.example,
    projectId: input.projectId,
    schema: input.schema,
  });

  let writerCall = await runOneStreamedResponse({
    abortSignal: input.abortSignal,
    attemptId: input.attemptId,
    buildId: input.buildId,
    onEvent: input.onEvent,
    onFileStaged: input.onFileStaged,
    phase: "writer",
    projectId: input.projectId,
    retryCount: 0,
    requireDesignPlan: Boolean(input.contract),
    stepCharger: input.stepCharger,
    system: writerPrompt.system,
    user: writerPrompt.user,
  });

  // -- Format repair: parser hard error on the writer pass -> 1 retry. -----
  // Hardening for truncation (cmspc6zv: Stream ended mid-<file> for ProductSection.tsx):
  // the batched writer hits maxOutputTokens (24k) or transient network cut and the
  // stream ends inside a <file> block. A single "re-emit everything" retry also
  // truncates at the same token budget. Instead preserve already-staged files
  // and resume only the truncated file + remaining files.
  const isTruncationError = (error: BatchedParseError) =>
    error.code === "truncated-file" ||
    error.code === "truncated-tag" ||
    error.code === "truncated-propose";
  const truncatedStaged = new Map<string, { content: string; path: string }>();
  let firstParseError: BatchedParseError | null = null;
  if (writerCall.parseError) {
    firstParseError = writerCall.parseError;
    if (isTruncationError(writerCall.parseError)) {
      for (const [path, file] of writerCall.response.files) {
        truncatedStaged.set(path, file);
      }
    }
    const repairPrompt = buildFormatRepairPrompt({
      errorMessage: writerCall.parseError.message,
      errorOffset: writerCall.parseError.offset,
    });
    input.onEvent?.("progress", {
      detail: "Respons AI tidak mengikuti kontrak — minta perbaikan format.",
      label: "AI memperbaiki format respons",
    });
    writerCall = await runOneStreamedResponse({
      abortSignal: input.abortSignal,
      attemptId: input.attemptId,
      buildId: input.buildId,
      onEvent: input.onEvent,
      onFileStaged: input.onFileStaged,
      phase: "format-repair",
      projectId: input.projectId,
      retryCount: 1,
      stepCharger: input.stepCharger,
      system: repairPrompt.system,
      user: repairPrompt.user,
    });
    if (writerCall.parseError) {
      if (isTruncationError(writerCall.parseError)) {
        for (const [path, file] of writerCall.response.files) {
          truncatedStaged.set(path, file);
        }
      }
      // Both writer + format-repair truncated -> try one truncation-resume that
      // avoids re-emitting already-staged files, cutting token load in half.
      if (
        firstParseError &&
        isTruncationError(firstParseError) &&
        isTruncationError(writerCall.parseError)
      ) {
        const resumePrompt = buildTruncationResumePrompt({
          errorMessage: writerCall.parseError.message,
          errorOffset: writerCall.parseError.offset,
          stagedPaths: [...truncatedStaged.keys()].sort(),
          truncatedPath: writerCall.parseError.path ?? firstParseError.path,
        });
        input.onEvent?.("progress", {
          detail: "Respons terpotong — melanjutkan file yang terpotong.",
          label: "AI melanjutkan file",
        });
        const resumeCall = await runOneStreamedResponse({
          abortSignal: input.abortSignal,
          attemptId: input.attemptId,
          buildId: input.buildId,
          onEvent: input.onEvent,
          onFileStaged: input.onFileStaged,
          phase: "format-repair",
          projectId: input.projectId,
          retryCount: 2,
          stepCharger: input.stepCharger,
          system: resumePrompt.system,
          user: resumePrompt.user,
        });
        if (!resumeCall.parseError) {
          for (const [path, file] of truncatedStaged) {
            if (!resumeCall.response.files.has(path)) {
              resumeCall.response.files.set(path, file);
            }
          }
          // Also merge any proposals carried by the truncated attempts
          // (rare, but keep them for mergeFinalFiles).
          for (const p of truncatedStaged.keys()) {
            void p;
          }
          writerCall = resumeCall;
        } else {
          for (const [path, file] of resumeCall.response.files) {
            truncatedStaged.set(path, file);
          }
          writerCall = resumeCall;
        }
      }
    } else if (truncatedStaged.size > 0) {
      // Format-repair succeeded but first writer had staged files before truncation
      // (e.g. index.tsx closed before ProductSection truncated). Merge them so
      // the final stage is not missing already-persisted files.
      for (const [path, file] of truncatedStaged) {
        if (!writerCall.response.files.has(path)) {
          writerCall.response.files.set(path, file);
        }
      }
    }
  }

  if (writerCall.parseError) {
    return {
      needsFallback: true,
      ok: false,
      reason: `Structured response unparseable after format repair: ${writerCall.parseError.message}`,
      repairRounds: 0,
    };
  }

  for (const [path, file] of writerCall.response.files) {
    staged.set(path, file);
  }
  proposals.push(...writerCall.response.proposals);
  lastDiagnostics = gateStage({
    allowedPackages,
    contract: input.contract,
    designPlan: writerCall.response.designPlan,
    indexCssForGate,
    schema: input.schema,
    staged,
    starterFiles,
  });

  // -- Targeted repairs: up to 2 rounds. ------------------------------------
  while (lastDiagnostics.length > 0 && repairRounds < 2) {
    repairRounds += 1;
    const implicatedPaths = extractImplicatedPaths(lastDiagnostics, staged);
    input.onEvent?.("progress", {
      detail: `${lastDiagnostics.length} temuan validasi — perbaikan tertarget putaran ${repairRounds}/2.`,
      label: "AI memperbaiki file",
    });

    const repairPrompt = buildTargetedRepairPrompt({
      diagnostics: lastDiagnostics,
      implicatedPaths,
      staged,
      starterFiles,
    });
    const repairCall = await runOneStreamedResponse({
      abortSignal: input.abortSignal,
      attemptId: input.attemptId,
      buildId: input.buildId,
      onEvent: input.onEvent,
      onFileStaged: input.onFileStaged,
      phase: "repair",
      projectId: input.projectId,
      retryCount: repairRounds,
      stepCharger: input.stepCharger,
      system: repairPrompt.system,
      user: repairPrompt.user,
    });

    if (repairCall.parseError || repairCall.response.files.size === 0) {
      devLog("generate", "batched.repair-malformed", {
        projectId: input.projectId,
        repairRounds,
      });
      return {
        needsFallback: true,
        ok: false,
        reason: `Repair round ${repairRounds} returned no parseable files.`,
        repairRounds,
      };
    }
    // Scope enforcement: a repair response may ONLY rewrite the files it was
    // asked to fix (implicated paths) or supply a still-missing required file.
    // Anything else is dropped and surfaced as a diagnostic for the next
    // round — never silently merged into the stage.
    // Renamed-sibling allowance: when a .ts content file is flagged for JSX,
    // the natural fix is renaming it to .tsx. Allow the .tsx sibling of any
    // implicated .ts path so that legit rename fixes are not dropped as
    // out-of-scope (which previously forced the slow legacy fallback).
    const requiredMissing = REQUIRED_STAGE_PATHS.filter(
      (path) => !staged.has(path),
    );
    const repairScope = new Set<string>([
      ...implicatedPaths,
      ...requiredMissing,
      ...implicatedPaths
        .filter((path) => path.endsWith(".ts") && !path.endsWith(".d.ts"))
        .map((path) => path.replace(/\.ts$/, ".tsx")),
    ]);
    for (const [path, file] of repairCall.response.files) {
      if (repairScope.has(path)) {
        staged.set(path, file);
      } else {
        devLog("generate", "batched.repair-out-of-scope", {
          path,
          projectId: input.projectId,
          repairRounds,
        });
      }
    }
    // Renamed-sibling cleanup: when a repair renames src/content/menu.ts to
    // menu.tsx, drop the stale .ts entry — otherwise the gate keeps flagging
    // the old JSX-bearing file and the build falls back to the legacy loop.
    for (const stagedPath of [...staged.keys()]) {
      if (
        stagedPath.endsWith(".ts") &&
        !stagedPath.endsWith(".d.ts") &&
        staged.has(stagedPath.replace(/\.ts$/, ".tsx"))
      ) {
        staged.delete(stagedPath);
      }
    }
    lastDiagnostics = gateStage({
      allowedPackages,
      contract: input.contract,
      designPlan: writerCall.response.designPlan,
      indexCssForGate,
      schema: input.schema,
      staged,
      starterFiles,
    });
    for (const path of repairCall.response.files.keys()) {
      if (!repairScope.has(path)) {
        lastDiagnostics.push(
          `${path}: repair response emitted a file outside the requested scope — ignoring. Re-emit ONLY the files listed in the repair prompt.`,
        );
      }
    }
  }

  if (lastDiagnostics.length > 0) {
    return {
      needsFallback: true,
      ok: false,
      reason: `Validation gates still failing after ${repairRounds} repairs: ${lastDiagnostics.slice(0, 3).join(" | ")}`,
      repairRounds,
    };
  }

  // Deterministic fix for AI hallucinated preview-ready import.
  // The scaffold provides src/lib/preview-ready.ts with `usePreviewReady`,
  // but cheap models emit variants like `../hooks/usePreviewReady`,
  // `../lib/usePreviewReady` or `../preview` (wrong dir / filename) which
  // then fails tsc as TS2307. Normalize any preview-related import that
  // co-occurs with usePreviewReady usage to the canonical alias.
  for (const [path, file] of staged) {
    if (path.endsWith(".tsx") || path.endsWith(".ts")) {
      let content = file.content;
      const before = content;
      // Primary: any specifier containing usePreviewReady -> canonical
      content = content.replace(
        /from\s+["'][^"']*usePreviewReady[^"']*["']/g,
        'from "@/lib/preview-ready"',
      );
      // Secondary: bare preview import (e.g. '../preview', '../lib/preview')
      // when the file actually calls usePreviewReady() — also hallucinated.
      if (
        content.includes("usePreviewReady") &&
        /from\s+["'][^"']*\/preview["']/.test(content)
      ) {
        content = content.replace(
          /from\s+["'][^"']*\/preview["']/g,
          'from "@/lib/preview-ready"',
        );
      }
      // Tertiary: bare '../hooks' or '../hooks/usePreviewReady' import when
      // the file calls usePreviewReady() — the scaffold has no hooks dir; the
      // AI invented it. Rewrite to the canonical alias.
      if (
        content.includes("usePreviewReady") &&
        /from\s+["'][^"']*hooks[^"']*["']/.test(content)
      ) {
        content = content.replace(
          /from\s+["'][^"']*hooks[^"']*["']/g,
          'from "@/lib/preview-ready"',
        );
      }
      // Tertiary: shadcn casing — AI emits "@/components/ui/Button" (capital)
      // but file is lowercase "button.tsx" on case-sensitive Linux. Normalize.
      content = content.replace(
        /from\s+["']@\/components\/ui\/([^"']+)["']/g,
        (_m, name) => `from "@/components/ui/${name.toLowerCase()}"`,
      );
      // Quaternary: "~/..." path alias — the scaffold uses "@/", not "~/".
      // Some models emit "~/lib/..." or "~/components/..." which fails the
      // package allow-list gate ("~" is not a declared package). Rewrite to
      // the canonical "@/" alias.
      content = content.replace(
        /from\s+["']~\/([^"']+)["']/g,
        (_m, rest) => `from "@/${rest}"`,
      );
      // Quinary: site.* nested field-name normalization. The AI often uses
      // wrong property names in .map() callbacks on site.* arrays. Rewrite
      // the common mismatches by scanning for the callback param name and
      // fixing its property accesses. This is a targeted string rewrite, not
      // a full AST walk — it handles the <80% case (map callbacks) that tsc
      // would otherwise fail on. ponytail: upgrade to a real tsc type-check
      // gate if the AI invents new wrong names outside this set.
      const collectionFields: Array<{
        collection: string;
        rewrites: Array<[string, string]>;
      }> = [
        {
          collection: "products",
          rewrites: [
            ["price", "priceRange"],
            ["cost", "priceRange"],
            ["amount", "priceRange"],
            ["title", "name"],
            ["model", "name"],
            ["id", "name"],
          ],
        },
        {
          collection: "testimonials",
          rewrites: [
            ["content", "quote"],
            ["comment", "quote"],
            ["text", "quote"],
            ["name", "author"],
            ["role", "author"],
          ],
        },
        {
          collection: "faq",
          rewrites: [
            ["question", "q"],
            ["answer", "a"],
          ],
        },
        {
          collection: "sections",
          rewrites: [
            ["content", "body"],
            ["description", "body"],
            ["text", "body"],
          ],
        },
        {
          collection: "socialLinks",
          rewrites: [
            ["name", "handle"],
            ["link", "handle"],
            ["label", "handle"],
            ["url", "handle"],
          ],
        },
      ];
      for (const { collection, rewrites } of collectionFields) {
        // Match .map((param) or .map((param, index) — capture param name.
        const mapMatch = content.match(
          new RegExp(
            `\\bsite\\.${collection}\\.map\\(\\((\\w+)(?:,\\s*\\w+)?\\)`,
          ),
        );
        if (mapMatch) {
          const param = mapMatch[1];
          for (const [wrong, right] of rewrites) {
            content = content.replace(
              new RegExp(`\\b${param}\\.${wrong}\\b`, "g"),
              `${param}.${right}`,
            );
          }
        }
      }
      // currentPromo is a string, not an object — strip object property
      // accesses so it renders the string itself.
      content = content.replace(
        /site\.currentPromo\.(?:title|description|code|text|label|body|content|name)\b/g,
        "site.currentPromo",
      );
      if (content !== before) {
        staged.set(path, { ...file, content });
      }
    }
  }

  // -- Merge: starter + proposals (registry-copied) + staged. ---------------
  const files = mergeFinalFiles(starterFiles, staged, proposals);
  return {
    ok: true,
    files,
    designPlan: writerCall.response.designPlan,
    repairRounds,
    summary: writerCall.response.doneSummary ?? "Ringkasan tidak tersedia.",
    writtenPaths: [...staged.keys()].sort(),
  };
}

function gateStage(input: {
  allowedPackages: ReadonlySet<string>;
  contract?: GeneratedSiteContractV1;
  designPlan?: WriterDesignPlanV1 | null;
  indexCssForGate: string;
  schema: ProjectSiteSchema;
  staged: Map<string, { content: string; path: string }>;
  starterFiles: GeneratedProjectFile[];
}): string[] {
  const stagedFiles: GeneratedProjectFile[] = [...input.staged.values()];
  const starterPaths = new Set(input.starterFiles.map((f) => f.path));
  const issues: string[] = [];
  // Flag protected scaffold paths the AI tried to overwrite — but NOT the
  // pre-seeded starter files (those are the legitimate base layer).
  for (const path of input.staged.keys()) {
    if (isProtectedScaffoldPath(path) && !starterPaths.has(path)) {
      issues.push(
        `${path}: protected scaffold file — never rewrite platform-owned source. Do NOT emit this file.`,
      );
    }
  }
  // Per-file checks (TSX parse, import allow-list) run ONLY on AI-emitted
  // files — the starter files are platform-owned and already validated.
  for (const file of stagedFiles) {
    if (starterPaths.has(file.path)) {
      continue;
    }
    issues.push(
      ...collectBatchedPerFileIssues({
        allowedPackages: input.allowedPackages,
        file,
      }),
    );
  }
  issues.push(
    ...collectBatchedGateIssues(stagedFiles, {
      indexCss: input.indexCssForGate,
    }),
  );
  if (input.contract && input.designPlan) {
    const starterIndexSource =
      input.starterFiles.find((file) => file.path === "src/routes/index.tsx")
        ?.content ?? "";
    const report = inspectGeneratedSiteSource({
      contract: input.contract,
      designPlan: input.designPlan,
      files: stagedFiles,
      starterIndexSource,
      themeChecks: compileShadcnTheme(input.schema).checks,
    });
    issues.push(
      ...report.findings.map(
        (finding) =>
          `${finding.path ?? "src/routes/index.tsx"}: [${finding.code}] ${finding.message}`,
      ),
    );
  }
  return issues;
}

/** Call out the files diagnostic lines blame; fall back to every staged file. */
function extractImplicatedPaths(
  diagnostics: string[],
  staged: Map<string, { content: string; path: string }>,
): string[] {
  const stagedPaths = new Set(staged.keys());
  const implicated = new Set<string>();
  for (const line of diagnostics) {
    const match = line.match(/^(src\/[^\s:]+|public\/[^\s:]+):/);
    if (match && stagedPaths.has(match[1])) {
      implicated.add(match[1]);
    }
  }
  for (const required of REQUIRED_STAGE_PATHS) {
    if (diagnostics.some((line) => line.includes(required))) {
      implicated.add(required);
    }
  }
  if (implicated.size === 0) {
    return [...stagedPaths];
  }
  return [...implicated];
}

function mergeFinalFiles(
  starterFiles: GeneratedProjectFile[],
  staged: Map<string, { content: string; path: string }>,
  proposals: { path: string; reason: string }[],
): GeneratedProjectFile[] {
  const byPath = new Map<string, GeneratedProjectFile>();
  for (const file of starterFiles) {
    byPath.set(file.path, file);
  }

  // Propose-blocks auto-approve only when the basename is a known shadcn
  // registry component at the canonical path; never trust proposed content
  // for anything else — we materialize the platform-owned source ourselves.
  for (const proposal of proposals) {
    const basename = proposal.path.match(/([^/]+)\.tsx$/)?.[1];
    if (!basename) {
      continue;
    }
    const canonical = SHADCN_COMPONENT_BY_NAME.get(basename);
    if (!canonical || byPath.has(canonical.path)) {
      continue;
    }
    const toAdd = [
      canonical,
      ...resolveShadcnDeps(canonical, [...byPath.values()]),
    ];
    for (const file of toAdd) {
      byPath.set(file.path, file);
    }
  }

  for (const [path, file] of staged) {
    if (isProtectedScaffoldPath(path)) {
      // Never land platform-owned source — the repair loop surfaces the
      // diagnostic; merge just drops the staged overlay for these paths.
      continue;
    }
    byPath.set(path, { content: file.content, path });
  }
  return [...byPath.values()];
}
