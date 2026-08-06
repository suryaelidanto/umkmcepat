// src/lib/projects/batched-edit.ts
// Batched Edit (Phase 2 of the batched-generation engine):
//
// Instead of the legacy ToolLoopAgent exploring the source (read_file /
// search_files) and writing one file at a time, we select target file paths
// DETERMINISTICALLY from the edit instruction (path-stem nouns), then run ONE
// streamed response over the SAME <file> contract + parser + gates as Phase 1
// (see batched-generator.ts / batched-response.ts). Ambiguous instructions
// fall back to a "self-select files from this manifest" prompt — the writer
// gets the file tree + path stem sample and picks; still one call, no tool
// loop. Format-repair (one round) and targeted repairs (two rounds) mirror
// generate; budget exhausted → the attempt fails (no legacy fallback).
import type { BatchedFile } from "@/lib/projects/batched-response";
import type { StepCharger } from "@/lib/projects/energy-step-charger";
import type { GeneratedProjectFile } from "@/lib/projects/generated-types";

import { devLog } from "@/lib/dev-log";
import {
  collectBatchedGateIssues,
  collectBatchedPerFileIssues,
  runOneStreamedResponse,
  type BatchedGenerateEventSink,
} from "@/lib/projects/batched-generator";
import { isProtectedScaffoldPath } from "@/lib/projects/scaffold/protected-paths";

// ---------------------------------------------------------------------------
// Deterministic target selection
//
// Candidates are the rendered app surface only: src/routes (pages) and
// src/components (shared UI). Scaffold pieces (main.tsx, index.css, lib/)
// and the content layer are excluded — the writer treats them as fixed,
// same as the Phase 1 writer. platform-owned files stay protected by the
// parser's path allow-list, so even a misguided self-selection can't write
// them.
//
// Matching: lowercase the instruction, split on non-alphanumerics, then keep
// tokens that appear inside any candidate file's stem ("katalog" matches
// "src/routes/katalog.tsx"; "contact" matches "components/contact-form.tsx").
// Tokens shorter than 4 chars ("hero", "menu") are too noisy — skip them.
// If > 8 files match, treat as ambiguous rather than inlining a wall of
// source.

const EDITABLE_PREFIXES = ["src/routes/", "src/components/"];
const AMBIGUITY_CAP = 8;

function isEditable(path: string): boolean {
  return EDITABLE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function pathStem(path: string): string {
  return (
    path
      .split("/")
      .pop()
      ?.replace(/\.(tsx?|jsx?|css)$/, "") ?? path
  );
}

/**
 * Tokens that name the edit's surface, not the file. Indonesian / English
 * markup + meta words, strip from the corpus before matching so "halaman
 * katalog" still matches "katalog.tsx" but "ubah halaman katalog" doesn't
 * also match every other page via "halaman".
 */
const STOP_TOKENS = new Set([
  // Indonesian markup
  "halaman",
  "bagian",
  "tombol",
  "warna",
  "teks",
  "tulisan",
  "gambar",
  "jadi",
  "dengan",
  "untuk",
  "atau",
  "yang",
  "dari",
  "buat",
  "ubah",
  "ganti",
  "tambah",
  "hapus",
  "perbarui",
  "update",
  "lebih",
  "sedikit",
  "sangat",
  // English markup (annotations arrive in mixed language)
  "page",
  "section",
  "button",
  "color",
  "text",
  "image",
  "header",
  "footer",
  "make",
  "change",
  "update",
  "edit",
  "into",
  "with",
  "from",
  "this",
  "that",
  "when",
]);

function stemTokens(stem: string): string[] {
  return stem
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);
}

export function selectBatchedEditTargets(input: {
  annotationContext?: string;
  instruction: string;
  sourceFiles: GeneratedProjectFile[];
}): {
  needsSelfSelection: boolean;
  samplePaths: string[];
  targets: string[];
} {
  const candidates = input.sourceFiles
    .map((file) => file.path)
    .filter(isEditable);

  const corpus =
    `${input.instruction}\n${input.annotationContext ?? ""}`.toLowerCase();
  const tokens = new Set(
    corpus
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4 && !STOP_TOKENS.has(token)),
  );

  const targets: string[] = [];
  for (const path of candidates) {
    const stemParts = stemTokens(pathStem(path).toLowerCase());
    // A file is a target when any corpus token appears in (or contains) a
    // stem part. No substring match against the whole stem — "katalog-page"
    // still matches "katalog", but "two" or "pop" never match anything.
    const matched = stemParts.some((part) =>
      [...tokens].some((token) => part.includes(token) || token.includes(part)),
    );
    if (matched) {
      targets.push(path);
    }
  }

  const samplePaths = candidates.slice(0, 20);
  if (targets.length === 0 || targets.length > AMBIGUITY_CAP) {
    return { needsSelfSelection: true, samplePaths, targets: [] };
  }
  return { needsSelfSelection: false, samplePaths, targets };
}

// ---------------------------------------------------------------------------
// Prompt

export function buildBatchedEditPrompt(input: {
  annotationContext?: string;
  instruction: string;
  needsSelfSelection: boolean;
  sourceFiles: GeneratedProjectFile[];
  targets: string[];
}): { system: string; user: string } {
  const { sourceFiles, targets, instruction, annotationContext } = input;
  const byPath = new Map(sourceFiles.map((file) => [file.path, file]));

  const targetList =
    targets.length > 0
      ? targets
      : // Self-selection mode: give the full editable surface so the model can
        // pick the right files itself without a discovery loop.
        input.sourceFiles
          .map((file) => file.path)
          .filter(isEditable)
          .slice(0, 20);

  const targetBlocks = targetList
    .map((path) => {
      const file = byPath.get(path);
      const content = file?.content ?? "(file kosong — tulis dari awal)";
      return `<file path="${path}">\n${content}\n</file>`;
    })
    .join("\n\n");

  const selfSelectDirective = input.needsSelfSelection
    ? `

SELF-SELECTION (the deterministic router found no single obvious file):
Choose the file(s) from the TARGET LIST that actually satisfy the edit. You may
also write to a file NOT on the list when the edit genuinely belongs there
(e.g. a new route for an asked-for page), but never touch outside the editable
surface (src/routes/, src/components/). Emit <file> blocks ONLY for files you
actually changed.`
    : "";

  const annotationBlock = annotationContext?.trim()
    ? `

ANNOTATION CONTEXT (owner clicked the preview; selectorPath/tag/text point at
the rendered element):
${annotationContext.trim()}`
    : "";

  const system = `You are the batched edit writer for UMKM Cepat generated apps. ONE structured response edits ONLY the listed files — no tool calls, no markdown fences, no prose between blocks.

RESPONSE CONTRACT (strict — hard parse errors on any deviation):

<file path="src/...">
...full raw file content (NOT JSON-escaped)...
</file>
<done summary="One-sentence Indonesian recap of what changed." />

Rules:
- Emit <file> blocks ONLY for the listed files you actually changed. Unchanged targets must NOT be re-emitted.
- Path allow-list: only under src/ (never src/content/site.ts, src/index.css, src/main.tsx, src/routes/__root.tsx — platform-owned) and public/.
- Only import dependencies the project's package.json already declares.
- Close every file with </file>. End with exactly one <done summary="..." />.
- Tailwind CSS v4 utilities only; no custom class names, no custom CSS files. Use min-h-dvh, never h-screen.
- src/routes/index.tsx (if touched) MUST keep exporting HomeRouteComponent.
- Import business data via: import { site } from "@/content/site". Do NOT edit src/content/site.ts.
- Navigate with <Link to="/..."> from "@tanstack/react-router", never useState tabs. In-page anchors use <Link to="/" hash="sectionId">.
- User-facing copy stays in Indonesian.${selfSelectDirective}${annotationBlock}

TARGET LIST (files you may rewrite):
${targetList.map((path) => `- ${path}`).join("\n")}

CURRENT CONTENT OF TARGETS:
${targetBlocks}`;

  const user = `Apply this edit to the target file(s) now. Emit the changed <file> blocks, then <done>.

Edit instruction:
${instruction}`;

  return { system, user };
}

// ---------------------------------------------------------------------------
// Runner

export type BatchedEditResult =
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

/**
 * Local import allow-list. Same source-of-truth as Phase 1 (the surface's
 * own package.json) but we can't reuse
 * `allowedPackageNamesFrom` directly without a scaffold re-build — the edit
 * surface is the LIVE sourceFiles, not a fresh starter.
 */
function allowedPackagesFromLive(
  sourceFiles: GeneratedProjectFile[],
): Set<string> {
  const pkg = sourceFiles.find((file) => file.path === "package.json");
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

export async function runBatchedEdit(input: {
  abortSignal?: AbortSignal;
  annotationContext?: string;
  attemptId?: string;
  instruction: string;
  onEvent?: BatchedGenerateEventSink;
  onFileStaged?: (file: BatchedFile) => void;
  projectId?: string;
  sourceFiles: GeneratedProjectFile[];
  stepCharger?: StepCharger;
}): Promise<BatchedEditResult> {
  const selection = selectBatchedEditTargets({
    annotationContext: input.annotationContext,
    instruction: input.instruction,
    sourceFiles: input.sourceFiles,
  });

  const prompt = buildBatchedEditPrompt({
    annotationContext: input.annotationContext,
    instruction: input.instruction,
    needsSelfSelection: selection.needsSelfSelection,
    sourceFiles: input.sourceFiles,
    targets: selection.targets,
  });

  const allowedPackages = allowedPackagesFromLive(input.sourceFiles);
  const indexCssForGate =
    input.sourceFiles.find((file) => file.path === "src/index.css")?.content ??
    "";
  // The role-based required-file gate from Phase 1 ("must emit index.tsx")
  // doesn't apply — an edit legitimately never touches the home route. The
  // per-file parse/import gates plus design lint still run.
  const baseByPath = new Map(
    input.sourceFiles.map((file) => [file.path, file]),
  );

  input.onEvent?.("progress", {
    detail: "Satu respons AI menerapkan revisi (batched edit).",
    label: "AI merevisi website",
  });

  // Stage = batched overlay on the LIVE surface.
  const staged = new Map<string, { content: string; path: string }>();
  let lastDiagnostics: string[] = [];
  let repairRounds = 0;

  // -- Pass 1: writer -------------------------------------------------------
  let writerCall = await runOneStreamedResponse({
    abortSignal: input.abortSignal,
    attemptId: input.attemptId,
    onEvent: input.onEvent,
    onFileStaged: input.onFileStaged,
    phase: "writer",
    projectId: input.projectId ?? "",
    retryCount: 0,
    stepCharger: input.stepCharger,
    system: prompt.system,
    task: "edit",
    user: prompt.user,
  });
  // Complete blocks staged before a hard parser error survive the retry —
  // format-repair re-emits the same paths and the duplicate-file diagnostic
  // resolves last-wins.
  const partialFromParseError = new Map<
    string,
    { content: string; path: string }
  >();
  if (writerCall.parseError) {
    for (const [path, file] of writerCall.response.files) {
      partialFromParseError.set(path, file);
    }
  }

  // -- Format repair (1 round) on a hard parse error. -----------------------
  if (writerCall.parseError) {
    input.onEvent?.("progress", {
      detail: "Respons AI tidak mengikuti kontrak — minta perbaikan format.",
      label: "AI memperbaiki format respons",
    });
    writerCall = await runOneStreamedResponse({
      abortSignal: input.abortSignal,
      attemptId: input.attemptId,
      onEvent: input.onEvent,
      onFileStaged: input.onFileStaged,
      phase: "format-repair",
      projectId: input.projectId ?? "",
      retryCount: 1,
      stepCharger: input.stepCharger,
      system: `You emit ONLY the strict response contract for generated-app edits:

<file path="src/...">full raw content</file>
<done summary="..." />

Nothing else. No markdown fences. No prose. Unknown tags are a hard parse error.`,
      task: "edit",
      user: `Your previous response had a malformed structured block at byte offset ${writerCall.parseError.offset}: ${writerCall.parseError.message}

Re-emit the COMPLETE response for the SAME edit — every changed <file> block, then one <done summary="..." />.`,
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

  for (const [path, file] of partialFromParseError) {
    staged.set(path, file);
  }
  for (const [path, file] of writerCall.response.files) {
    staged.set(path, file);
  }
  if (staged.size === 0) {
    return {
      needsFallback: true,
      ok: false,
      reason: "Batched edit emitted no files after format repair.",
      repairRounds: 0,
    };
  }
  lastDiagnostics = gateEditStage({
    allowedPackages,
    baseByPath,
    indexCssForGate,
    staged,
  });
  // Fast-fail mid-stream left the broken block out of the stage (parser
  // last-wins only on complete close tags) — still surface it so the repair
  // loop re-emits that path.
  if (
    writerCall.syntaxIssue &&
    !lastDiagnostics.includes(writerCall.syntaxIssue)
  ) {
    lastDiagnostics = [writerCall.syntaxIssue, ...lastDiagnostics];
  }

  // -- Targeted repairs: up to 2 rounds. ------------------------------------
  while (lastDiagnostics.length > 0 && repairRounds < 2) {
    repairRounds += 1;
    const implicatedPaths = extractImplikatedPathsForEdit(
      lastDiagnostics,
      staged,
    );
    input.onEvent?.("progress", {
      detail: `${lastDiagnostics.length} temuan validasi — perbaikan tertarget putaran ${repairRounds}/2.`,
      label: "AI memperbaiki file",
    });

    const currentBlocks = implicatedPaths
      .map((path) => {
        const file = staged.get(path) ?? baseByPath.get(path);
        const content = file?.content ?? "(never staged — re-emit it in full)";
        return `<file path="${path}">\n${content}\n</file>`;
      })
      .join("\n\n");

    const repairCall = await runOneStreamedResponse({
      abortSignal: input.abortSignal,
      attemptId: input.attemptId,
      onEvent: input.onEvent,
      onFileStaged: input.onFileStaged,
      phase: "repair",
      projectId: input.projectId ?? "",
      retryCount: repairRounds,
      stepCharger: input.stepCharger,
      system: `You emit ONLY targeted <file> blocks for the files listed in the user turn, then exactly one <done summary="..." />.

Contract recap:
- <file path="src/...">full raw content (not JSON-escaped, no markdown fences)</file>
- Path allow-list: only under src/ (never src/content/site.ts, src/index.css, src/main.tsx, src/routes/__root.tsx) and public/.
- Only import dependencies the project's package.json already declares.
- Close every file with </file>. End with exactly one <done summary="..." />.`,
      task: "edit",
      user: `Diagnostics from the validation gates (fix these — re-emit ONLY the listed files, in full):

${lastDiagnostics.map((line) => `- ${line}`).join("\n")}

Files to re-emit (current staged state):

${currentBlocks}`,
    });

    if (repairCall.parseError || repairCall.response.files.size === 0) {
      devLog("edit", "batched.repair-malformed", {
        projectId: input.projectId,
        repairRounds,
      });
      // Keep the fast-fail diagnostic alive so the next round re-asks for
      // the same broken path instead of exiting with a clean stage.
      lastDiagnostics = [
        repairCall.syntaxIssue ??
          "Repair response was malformed and returned no files.",
        ...lastDiagnostics,
      ];
      continue;
    }
    // Scope enforcement: a repair response may ONLY rewrite files inside
    // the current edit surface (implicated, already-staged, or selected
    // targets). Anything else drops + becomes a diagnostic so the next
    // round re-prompts; it never silently merges.
    const repairScope = new Set<string>([
      ...implicatedPaths,
      ...staged.keys(),
      ...selection.targets,
    ]);
    for (const [path, file] of repairCall.response.files) {
      if (repairScope.has(path)) {
        staged.set(path, file);
      } else {
        devLog("edit", "batched.repair-out-of-scope", {
          path,
          projectId: input.projectId,
          repairRounds,
        });
      }
    }
    lastDiagnostics = gateEditStage({
      allowedPackages,
      baseByPath,
      indexCssForGate,
      staged,
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

  // -- Merge: live surface + staged overlay. ---------------------------------
  const merged = new Map<string, GeneratedProjectFile>();
  for (const file of input.sourceFiles) {
    merged.set(file.path, file);
  }
  for (const [path, file] of staged) {
    if (isProtectedScaffoldPath(path)) {
      continue;
    }
    merged.set(path, { content: file.content, path });
  }

  return {
    ok: true,
    files: [...merged.values()],
    repairRounds,
    summary:
      writerCall.response.doneSummary ?? "Ringkasan edit tidak tersedia.",
    writtenPaths: [...staged.keys()].sort(),
  };
}

function gateEditStage(input: {
  allowedPackages: ReadonlySet<string>;
  baseByPath: Map<string, GeneratedProjectFile>;
  indexCssForGate: string;
  staged: Map<string, { content: string; path: string }>;
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
  // Design-lint + required-shape gates run ONLY over the merged project so a
  // missing-index on an untouched home route doesn't fail a katalog edit.
  // We synthesize the merged view just for the gate.
  const merged = new Map<string, GeneratedProjectFile>(input.baseByPath);
  for (const [path, file] of input.staged) {
    merged.set(path, { content: file.content, path });
  }
  issues.push(
    ...collectBatchedGateIssues([...merged.values()], {
      indexCss: input.indexCssForGate,
    }),
  );
  return issues;
}

function extractImplikatedPathsForEdit(
  diagnostics: string[],
  staged: Map<string, { content: string; path: string }>,
): string[] {
  const implicated = new Set<string>();
  for (const line of diagnostics) {
    const match = line.match(/^(src\/[^\s:]+|public\/[^\s:]+):/);
    if (match) {
      // Include even when never staged (a fast-failed block): the repair
      // must re-emit it from scratch — staged or not.
      implicated.add(match[1]);
    }
  }
  if (implicated.size === 0) {
    return [...staged.keys()];
  }
  return [...implicated];
}
