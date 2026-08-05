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
import { loadArchetypeGuide } from "@/lib/projects/archetypes";
import {
  BatchedParseError,
  createBatchedResponseParser,
  type BatchedDiagnostic,
  type BatchedFile,
} from "@/lib/projects/batched-response";
import { briefToBuildPrompt, type ProjectBrief } from "@/lib/projects/brief";
import {
  BatchedAdmissionBlockedError,
  checkBatchedGenerateAdmission,
} from "@/lib/projects/brief-admission";
import { buildGeneratedAppBuildSpec } from "@/lib/projects/custom-source-generator";
import { deriveScaffoldManifest } from "@/lib/projects/scaffold/manifest";
import { isProtectedScaffoldPath } from "@/lib/projects/scaffold/protected-paths";
import { resolveShadcnDeps } from "@/lib/projects/scaffold/shadcn-components";
import { SHADCN_COMPONENT_BY_NAME } from "@/lib/projects/scaffold/shadcn-components";
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

// ---------------------------------------------------------------------------
// Public types

export type BatchedGenerateResult =
  | {
      ok: true;
      files: GeneratedProjectFile[];
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

export function buildBatchedWriterPrompt(input: {
  brief: ProjectBrief;
  implementationSpec?: ImplementationSpec;
  projectId: string;
  schema: ProjectSiteSchema;
}): { system: string; user: string } {
  const { brief, implementationSpec, projectId, schema } = input;
  const starterFiles = createViteTanStackShadcnStarterFiles(projectId, schema);
  const manifest = deriveScaffoldManifest(starterFiles);
  const appSpec = buildGeneratedAppBuildSpec({
    conversationBrief: briefToBuildPrompt(brief),
    implementationSpec,
    schema,
  });

  const system = `You are a frontend coding writer for UMKM Cepat generated apps. Emit the whole project in ONE structured response — no tool calls, no markdown fences, no prose between blocks beyond short notes.

Business: ${implementationSpec?.businessName || schema.businessName} — ${implementationSpec?.appKind || "landing"} — ${(implementationSpec?.features || [schema.offer, schema.audience]).join(", ")}

RESPONSE CONTRACT (strict — hard parse errors on any deviation):

<file path="src/...">
...full raw file content (NOT JSON-escaped)...
</file>
<file path="src/...">
...another file...
</file>
<propose path="src/components/ui/<name>.tsx">short reason — only if absolutely needed</propose>
<done summary="One-sentence Indonesian recap of what was written — pages, sections, design moves." />

Rules:
- Emit <file> blocks for every file the app needs. Order doesn't matter, but write the index route FIRST so partial streams still land the home page.
- Path allow-list: only under src/ (never src/content/site.ts, src/index.css, src/main.tsx, src/routes/__root.tsx — platform-owned, exactly as seeded) and public/. Never package.json, vite.config.ts, tsconfig*.json, eslint.config.js, index.html.
- Only import dependencies listed in package.json (scaffold block below).
- Close every file with </file>. No nested <file>. No unknown tags. No self-closing <file/>.
- Content is raw text between the tags: do NOT wrap in markdown fences and do NOT JSON-escape quotes or newlines.
- After all files are out, end with exactly one <done summary="..." />. Nothing after.
- Use <propose> only for shadcn components you genuinely need beyond the pre-seeded ones; the platform copies the registry source for known components automatically (no hand-written ui/ component sources — those are platform-owned).

SPEED RULES (you have one response — write immediately and completely):
1. FIRST emitted file MUST be src/routes/index.tsx with the FULL custom home page (complete TSX). Not a stub.
2. Treat the implementation brief / pages list as your checklist — write every needed file in this single response; no deferral.
3. Write extra routes under src/routes/ when the brief has distinct pages and register them by rewriting src/router.tsx yourself (same shape as the scaffold block below).
4. Compose shadcn components; do not hand-roll ui primitives.
5. Emit FULL file content every time — never "..." or partial code. Every file must be complete and self-consistent.
6. STOP after <done>: do not keep editing.

STACK (locked — do not change tooling):
- Vite + React 19 + TypeScript + TanStack Router (hash history, static).
- Tailwind CSS v4 (utility classes inline; src/index.css pre-wires theme vars — do not edit it).
- shadcn/ui components in src/components/ui/ are platform-owned — do not edit them; compose them. Pre-seeded now: ${manifest.preSeededComponents.join(", ")}. ${manifest.availableComponents.length} more available via <propose>.
- package.json is platform-owned — do not add or remove dependencies.

STYLING (shadcn + Tailwind only — no custom CSS):
- All styling uses Tailwind utility classes inline in the TSX, using theme tokens (bg-background, text-foreground, bg-primary, text-primary-foreground, bg-muted, text-muted-foreground, bg-accent, text-accent-foreground, border-border, ring-ring).
- Do NOT write custom CSS class names (no .btn-primary / .nav-link / .hero-section / etc.) and do NOT edit src/index.css.
- Only ${manifest.preSeededComponents.join(" + ")} are pre-seeded. For any other shadcn component, emit <propose path="src/components/ui/<name>.tsx">why</propose> — the platform writes the canonical new-york + Tailwind v4 source + transitive deps automatically.
- Use min-h-dvh for full-height sections, never h-screen.

ROUTING & PAGE CONTRACT:
- src/routes/index.tsx MUST export a component named HomeRouteComponent: "export function HomeRouteComponent() { ... }".
- Prefer REAL multi-page routing when the brief has distinct sections (Home, Catalog, Contact, Product detail, etc.). Add one route file per page under src/routes/ (e.g. katalog.tsx, kontak.tsx) and register each in when you rewrite src/router.tsx: import your route components, createRoute({ getParentRoute: () => rootRoute, path: "/katalog", component: ... }), then add it to rootRoute.addChildren([...]). Keep the existing index route and the path:"*" 404 catch-all.
- MULTI-PAGE CONSISTENCY: shared chrome (nav, footer, brand colors, fonts) belongs in __root.tsx layout — but remember __root.tsx is platform-owned, so when the brief calls for header/footer, build a layout component under src/components/ and wrap each page in it. Same palette tokens + type scale on every page — no one-off colors per route.
- Navigate between pages with <Link to="/katalog"> from "@tanstack/react-router". Do NOT fake routing with useState tabs.
- In-page section links (anchor scroll within one page) MUST use <Link to="/" hash="sectionId"> from "@tanstack/react-router", targeting a <section id="sectionId">. NEVER use raw <a href="#sectionId"> — with hash history the URL hash is the route path, so "#sectionId" resolves to no route and triggers the 404 catch-all — the anchor glitches (first click re-renders + scrolls to top) and only works on a second click. <Link to="/" hash="..."> produces #/sectionId and uses TanStack's native hash-scroll.
- Add scroll-mt-<size> (e.g. scroll-mt-24) to each id-target section so a fixed/sticky header does not cover it.
- Import usePreviewReady from "@/lib/preview-ready" and call usePreviewReady() in HomeRouteComponent so the preview iframe unlocks.
- Import the business data using: import { site } from "@/content/site". Do NOT edit src/content/site.ts — it is fully populated and exports site as both named and default exports.

STATIC ONLY: no auth, no backend, no database, no payment gateway, no fake /api routes. Use WhatsApp/contact CTAs and real Indonesian business copy.
Do not add or remove dependencies — package.json is platform-owned.

MISSING IMAGES: use <img src="/placeholder.svg" alt="<short description>" /> for landscape/wide image slots, and <img src="/placeholder-vertical.svg" alt="<short description>" /> for portrait/tall slots, only when an image slot is structurally necessary and no owner image exists. Alt text is supplied at use site. Never use remote placeholder URLs. For typographic layouts, prefer omitting the image slot instead of adding a gratuitous placeholder.

${DESIGN_DIRECTIVE}

SCAFFOLD MANIFEST (the exact starter your files extend — do not rewrite these; src/router.tsx is the ONE exception — it is writer-owned, so DO rewrite it to register new routes per SPEED RULE 3):

File tree:
${manifest.fileTree.map((path) => `- ${path}`).join("\n")}

Router registration contract (src/main.tsx):
${manifest.contract.routerRegistration}

Root layout contract (src/routes/__root.tsx, platform-owned):
${manifest.contract.rootLayout}

Index route shape (src/routes/index.tsx must export):
${manifest.contract.indexRouteShape}

Pre-seeded shadcn components: ${manifest.preSeededComponents.join(", ")}
Available via <propose>: ${manifest.availableComponents.join(", ")}
Theme tokens already defined in src/index.css: ${manifest.themeTokens.join(", ")}`;

  const user = `Build the full project from this brief/streamer answer summary. Emit every <file> block now, then <done>.

${appSpec}

Brief:
${briefToBuildPrompt(brief)}
${loadArchetypeGuide(implementationSpec?.archetype ?? "")}`;

  return { system, user };
}

function buildFormatRepairPrompt(input: {
  errorOffset: number;
  errorMessage: string;
}): { system: string; user: string } {
  return {
    system: `You emit ONLY the strict response contract for generated apps:

<file path="src/...">full raw content</file>
<propose path="src/components/ui/<name>.tsx">reason</propose>
<done summary="..." />

Nothing else. No markdown fences. No prose. Unknown tags are a hard parse error.`,
    user: `Your previous response had a malformed structured block at byte offset ${input.errorOffset}: ${input.errorMessage}

Re-emit the COMPLETE response for the SAME task — every <file> block rewrite needed, then one <done summary="..." />. Follow the contract exactly.`,
  };
}

function buildTargetedRepairPrompt(input: {
  diagnostics: string[];
  implicatedPaths: string[];
  starterFiles: GeneratedProjectFile[];
  staged: Map<string, { content: string; path: string }>;
}): { system: string; user: string } {
  const currentBlocks = input.implicatedPaths
    .map((path) => {
      const staged = input.staged.get(path);
      if (!staged) {
        return `<file path="${path}">\n(file was never staged — re-emit it in full)\n</file>`;
      }
      return `<file path="${path}">\n${staged.content}\n</file>`;
    })
    .join("\n\n");
  return {
    system: `You emit ONLY targeted <file> blocks for the files listed in the user turn, then exactly one <done summary="..." />.

Contract recap:
- <file path="src/...">full raw content (not JSON-escaped, no markdown fences)</file>
- Path allow-list: only under src/ (never src/content/site.ts, src/index.css, src/main.tsx, src/routes/__root.tsx) and public/.
- Only import dependencies the project's package.json already declares.
- Close every file with </file>. End with exactly one <done summary="..." />.`,
    user: `Diagnostics from the validation gates (fix these — re-emit ONLY the listed files, in full):

${input.diagnostics.map((line) => `- ${line}`).join("\n")}

Files to re-emit (current staged state, exactly as your previous response produced):

${currentBlocks}`,
  };
}

// ---------------------------------------------------------------------------
// Validation gates

export function collectBatchedPerFileIssues(input: {
  allowedPackages: ReadonlySet<string>;
  file: { content: string; path: string };
}): string[] {
  const issues: string[] = [];
  const { file } = input;

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
  phase: "writer" | "format-repair" | "repair";
  projectId: string;
  attemptId?: string;
  buildId?: string | null;
  retryCount: number;
  stepCharger?: StepCharger;
  system: string;
  /** Ledger task. Phase 1 generate uses build-step/build-repair; Phase 2 edit uses "edit" for every leg. */
  task?: "build-step" | "edit";
  user: string;
}): Promise<BatchedStreamCallResult> {
  const requestedModel = getGenerationModel();
  const stopTimer = startAiCallTimer({ withTtft: true });
  const parser = createBatchedResponseParser();
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

  // Stage = batched files overlaying the starter.
  const staged = new Map<string, { content: string; path: string }>();
  const proposals: { path: string; reason: string }[] = [];
  let lastDiagnostics: string[] = [];
  let repairRounds = 0;

  // -- Pass 1: writer -------------------------------------------------------
  const writerPrompt = buildBatchedWriterPrompt({
    brief: input.brief,
    implementationSpec: input.implementationSpec,
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
    stepCharger: input.stepCharger,
    system: writerPrompt.system,
    user: writerPrompt.user,
  });

  // -- Format repair: parser hard error on the writer pass -> 1 retry. -----
  if (writerCall.parseError) {
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
    indexCssForGate,
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
    const requiredMissing = REQUIRED_STAGE_PATHS.filter(
      (path) => !staged.has(path),
    );
    const repairScope = new Set<string>([
      ...implicatedPaths,
      ...requiredMissing,
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
    lastDiagnostics = gateStage({
      allowedPackages,
      indexCssForGate,
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

  // -- Merge: starter + proposals (registry-copied) + staged. ---------------
  const files = mergeFinalFiles(starterFiles, staged, proposals);
  return {
    ok: true,
    files,
    repairRounds,
    summary: writerCall.response.doneSummary ?? "Ringkasan tidak tersedia.",
    writtenPaths: [...staged.keys()].sort(),
  };
}

function gateStage(input: {
  allowedPackages: ReadonlySet<string>;
  indexCssForGate: string;
  staged: Map<string, { content: string; path: string }>;
  starterFiles: GeneratedProjectFile[];
}): string[] {
  const stagedFiles: GeneratedProjectFile[] = [...input.staged.values()];
  const issues: string[] = [];
  for (const path of input.staged.keys()) {
    if (isProtectedScaffoldPath(path)) {
      issues.push(
        `${path}: protected scaffold file — never rewrite platform-owned source. Do NOT emit this file.`,
      );
    }
  }
  for (const file of stagedFiles) {
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

// DESIGN_DIRECTIVE reuse — kept verbatim so the batched prompt carries
// the exact same taste rules as the legacy agent loop. Import from the shared
// local copy in custom-source-generator is not exported; duplicate is
// intentional for now. ponytail: extract to src/lib/projects/design-directive.ts
// when a third builder appears.
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
- Section navigation: use <Link to="/" hash="id"> for in-page anchors (never raw href="#id" — hash history turns it into a route and 404s). For smooth in-page scroll set scroll-behavior:smooth on the root and add scroll-mt-* on each id-target section to clear any fixed header.

CONTENT:
- Real, specific Indonesian copy ("Sewa PS Rp 5.000/jam", not "Harga terjangkau"). No "Lorem ipsum" / "Coming soon".
- Use design tokens from src/index.css (--background/--foreground/--muted/--accent) as the single source of truth.`;
