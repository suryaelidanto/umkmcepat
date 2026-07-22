# Guard Fix + Runtime Self-Heal (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Force the generation agent to write `src/routes/index.tsx` (Stage A), then add an always-on headless runtime check that catches runtime crashes after a successful build and self-heals in one bounded pass (Stage B).

**Architecture:** Stage A = three enforcing layers (guard + gate + prompt) on the existing static gate/forced-rewrite loop — no new infra. Stage B = extend the existing Playwright thumbnail-capture script (`scripts/capture-project-thumbnail.cjs`) with a console-error-collect mode + a runtime-repair pass sibling of `repairGeneratedProjectFiles` + progress events via the existing `send("progress", ...)` SSE pattern + honest-fail UX. A shared `runRuntimeSelfHeal` helper avoids duplicating the hook across the two parallel generate paths (primary ~`:455-505`, retry-edit ~`:939-1005`).

**Tech Stack:** TypeScript, Bun, AI SDK `ToolLoopAgent`, Playwright (`playwright-core`, already a dependency for thumbnails), TanStack Router SSE streams.

**Spec:** `docs/superpowers/specs/2026-07-22-guard-and-runtime-self-heal-design.md`

## Global Constraints

- Static-frontend-only: no backend/db/auth/payments leaked into the runtime loop. (architecture.md)
- One bad project must not break another: headless runs per-build, isolated (own server process + browser context, torn down in `finally`). (architecture.md:65)
- Preview failures are first-class UI states: never silently ship a runtime-broken app. (architecture.md:84)
- The visible reply is never regenerated just to repair: the runtime-repair fixes *source*, then rebuilds (same as the existing build-error repair). (architecture.md:50-51)
- Bounded loop: 1 runtime-repair + 1 re-check max, then honest-fail. No infinite loop.
- Runtime capture must mirror the preview's iframe context: the headless load uses the same sandbox-safe origin/CSP as the real preview iframe (architecture.md:82), NOT a bare localhost load — or it surfaces false-positive runtime errors from a different origin.
- Bun only; `bun.lock` canonical. No new runtime dependencies (Playwright already present).
- Indonesian user-facing copy (progress labels); English dev comments/logs/errors.
- `bun run check` green before every commit. Never bypass a failing gate.
- Each stage ships independently: Stage A commits and is testable on its own; Stage B commits on top.
- Generated build execution may be disabled by policy (`isGeneratedBuildExecutionEnabled`); the runtime check only runs when the build actually executed — no build, no runtime check.

---

## File Structure

**Modified files (Stage A):**
- `src/lib/projects/custom-source-generator.ts` — tighten the `check_app` guard (`:89`); add `index.tsx`-edited assertion to `checkAgentSourceQuality` (`:~1741`); wire the new issue into `NO_MEANINGFUL_EDIT_ISSUES` (`:25`); make `index.tsx` step-1 in `runForcedRewritePass` prompt (`:337-348`) + the generate `buildAgentPrompt` SPEED RULES (`:~1863`).
- `src/lib/projects/custom-source-generator.test.ts` — tests for the tightened guard + the new gate assertion.

**Modified files (Stage B):**
- `scripts/capture-project-thumbnail.cjs` — add a `--mode console-errors` mode that collects `console.error`/`pageerror` instead of a screenshot. (Existing screenshot mode untouched.)
- `src/lib/projects/project-thumbnail.ts` — add `captureRuntimeErrors(artifactRef)` sibling of `captureProjectThumbnail` that calls the script in console-errors mode and returns `{ errors: string[]; ok: boolean }`.
- `src/lib/projects/runtime-self-heal.ts` — NEW: `runRuntimeSelfHeal({ artifactRef, projectId, schema, files, ... })` = capture → (if errors) runtime-repair pass → rebuild → re-capture → return result. Bounded 1+1.
- `src/lib/projects/custom-source-generator.ts` — add `repairRuntimeErrors({ runtimeErrors, files, ... })` sibling of `repairGeneratedProjectFiles` (same shape, `runtimeErrors: string[]` instead of `buildLog: string`).
- `src/routes/api.projects.$id.generate.ts` — hook `runRuntimeSelfHeal` into the success path of BOTH generate paths (primary ~`:500`, retry-edit ~`:1003`), streaming `send("progress", ...)` events. Guard with `isGeneratedBuildExecutionEnabled()`.
- `src/lib/projects/runtime-self-heal.test.ts` — NEW: tests for the bounded loop (clean → done; errors → 1 repair → clean; errors → 1 repair → still broken → honest fail).
- `docs/architecture.md` — record the runtime self-heal step + bounded loop.

**Interfaces (locked names across tasks):**
- `captureRuntimeErrors(artifactRef: string): Promise<{ errors: string[]; ok: boolean }>` — Task 4 produces.
- `repairRuntimeErrors({ runtimeErrors, files, schema, projectId, implementationSpec?, onOperation? }): Promise<CustomGeneratedSourceResult>` — Task 5 produces (same return type as `repairGeneratedProjectFiles`).
- `runRuntimeSelfHeal({ artifactRef, projectId, schema, files, implementationSpec?, onProgress?, abortSignal? }): Promise<RuntimeSelfHealResult>` — Task 6 produces. `RuntimeSelfHealResult = { ok: boolean; files: GeneratedProjectFile[]; artifactRef: string | null; runtimeErrors: string[]; repairUsed: boolean; usage?: {...} }`.

---

### Task 1: Stage A — tighten the `check_app` guard to require `index.tsx`

**Files:**
- Modify: `src/lib/projects/custom-source-generator.ts:85-95` (the `check_app` guard inside `runCommand`).
- Test: `src/lib/projects/custom-source-generator.test.ts`.

**Interfaces:**
- Consumes: `agentEditedFiles: Set<string>` (already in scope in `runCommand`).
- Produces: the guard blocks `check_app` until `src/routes/index.tsx` is in `agentEditedFiles`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/projects/custom-source-generator.test.ts` (find an existing describe block for the guard or `check_app`; if none, add one). The test asserts: when the agent has written `src/content/site.ts` but NOT `src/routes/index.tsx`, calling `check_app` returns an error naming `index.tsx`.

```ts
import { generateCustomProjectFilesWithAgent } from "./custom-source-generator";
// (Reuse the existing test helpers for schema/projectId/implementationSpec — read the file first to get the real names.)

it("blocks check_app until src/routes/index.tsx is written, even if other files exist", async () => {
  // Drive the agent with a stub command sequence: write site.ts, then check_app before index.tsx.
  // The exact harness depends on existing test helpers — reuse them.
  // Assert: the check_app output contains an error mentioning "src/routes/index.tsx".
});
```

Read the existing test file first to reuse its real harness (mock model, command sequence, assertion style). Do NOT invent helpers. The test's intent is fixed: `check_app` before `index.tsx` is written → error naming `index.tsx`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/lib/projects/custom-source-generator.test.ts`
Expected: FAIL — the current guard (`agentEditedFiles.size === 0`) lets `check_app` through once `site.ts` is written.

- [ ] **Step 3: Tighten the guard**

In `src/lib/projects/custom-source-generator.ts`, replace the guard at `:89`:

```ts
    if (
      command.type === "check_app" &&
      !agentEditedFiles.has("src/routes/index.tsx")
    ) {
      return {
        type: command.type,
        error:
          "No home page written yet. You MUST call write_file on src/routes/index.tsx with your custom page layout BEFORE calling check_app.",
      };
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:changed -- src/lib/projects/custom-source-generator.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate + commit**

Run: `bun run check`
Expected: green. (Other tests that called `check_app` after writing only `site.ts` may now fail — fix them in this step by making them write `index.tsx` first, since that's the new contract. Do NOT weaken the guard to satisfy stale tests.)

```bash
git add -A
git commit -m "fix(gate): block check_app until src/routes/index.tsx is written

The guard only blocked check_app when zero files were written, so the agent
could write src/content/site.ts then check_app without ever writing the home
page. Require src/routes/index.tsx in agentEditedFiles before check_app."
```

---

### Task 2: Stage A — gate asserts `index.tsx` was edited

**Files:**
- Modify: `src/lib/projects/custom-source-generator.ts:25-29` (`NO_MEANINGFUL_EDIT_ISSUES`) and `:~1741` (`checkAgentSourceQuality`, the route-files block).
- Test: `src/lib/projects/custom-source-generator.test.ts`.

**Interfaces:**
- Consumes: `agentEditedFiles: Set<string>`, `files: GeneratedProjectFile[]`.
- Produces: gate pushes `"home route was not written by the agent"` when `index.tsx` is absent from `agentEditedFiles`; that issue is in `NO_MEANINGFUL_EDIT_ISSUES` so the forced-rewrite path trips.

- [ ] **Step 1: Write the failing test**

In `src/lib/projects/custom-source-generator.test.ts`, add (reusing the real `checkAgentSourceQuality` + `createViteTanStackShadcnStarterFiles` imports already used there):

```ts
it("fails the gate when the agent did not edit src/routes/index.tsx", () => {
  const files = createViteTanStackShadcnStarterFiles("p1", schema);
  // Agent edited site.ts only — NOT index.tsx.
  const edited = new Set<string>(["src/content/site.ts"]);
  const quality = checkAgentSourceQuality(files, edited);
  expect(quality.ok).toBe(false);
  expect(quality.issues).toContain("home route was not written by the agent");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/lib/projects/custom-source-generator.test.ts`
Expected: FAIL — no such issue is pushed today.

- [ ] **Step 3: Add the assertion + wire the issue**

In `src/lib/projects/custom-source-generator.ts`, add `"home route was not written by the agent"` to the `NO_MEANINGFUL_EDIT_ISSUES` array (`:25-29`).

In `checkAgentSourceQuality`, after the existing `src/routes/` presence check (`:1741-1743`), add:

```ts
  if (!agentEditedFiles.has("src/routes/index.tsx")) {
    issues.push("home route was not written by the agent");
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:changed -- src/lib/projects/custom-source-generator.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate + commit**

Run: `bun run check`
Expected: green. (Happy-path tests that assert `quality.ok === true` must write `index.tsx` into `agentEditedFiles` — fix any that don't, since that's the new contract.)

```bash
git add -A
git commit -m "fix(gate): assert src/routes/index.tsx was edited by the agent

Active assertion (not just the stale-marker) so the forced-rewrite path trips
when the agent skips the home page even if it wrote other files."
```

---

### Task 3: Stage A — make `index.tsx` step-1 in the rewrite + generate prompts

**Files:**
- Modify: `src/lib/projects/custom-source-generator.ts:337-348` (`runForcedRewritePass` prompt) and `:~1863` (`buildAgentPrompt` SPEED RULES).
- Test: `src/lib/projects/custom-source-generator.test.ts` (the existing prompt-coherence assertions).

**Interfaces:**
- Consumes: none new.
- Produces: prompts that name `index.tsx` as the non-negotiable first write.

- [ ] **Step 1: Write the failing test**

In `src/lib/projects/custom-source-generator.test.ts`, add positive assertions to the existing prompt-coherence test (find it; it already checks `buildGeneratedAppAgentInstructions` content). Add:

```ts
it("prompts name index.tsx as the first required write", () => {
  const instructions = buildGeneratedAppAgentInstructions(schema, undefined, "generate");
  expect(instructions).toContain("src/routes/index.tsx");
  // SPEED RULES first step names index.tsx
  expect(instructions).toMatch(/FIRST STEP.*src\/routes\/index\.tsx/);
});
```

And for the rewrite prompt, add a test that `runForcedRewritePass`'s prompt (read via the function's source or a snapshot — read the existing test style for how prompts are asserted) names `index.tsx` as step 1. If the rewrite prompt isn't directly exported, assert via the generate-instructions `rewrite` mode containing it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/lib/projects/custom-source-generator.test.ts`
Expected: FAIL — `index.tsx` isn't named as "FIRST STEP" today.

- [ ] **Step 3: Make `index.tsx` step-1 in both prompts**

In `buildAgentPrompt` SPEED RULES (`:~1863`), make step 1 explicitly:

```ts
1. FIRST STEP: write_file src/routes/index.tsx with the full home page using shadcn components + Tailwind utilities. The build fails without this file — do not skip it.
```

In `runForcedRewritePass` prompt (`:337-348`), reorder so `index.tsx` is the first, non-negotiable write:

```ts
      prompt: `FORCED REWRITE — previous pass produced no meaningful file edits.

STEP 1 (required): write_file src/routes/index.tsx — the full home page. The build fails without it.
STEP 2: write_file src/content/site.ts and src/index.css (if you add classNames) as needed.
Do NOT call read_skill. Prefer write over endless reads.
Then call check_app once.

Static only: no auth/DB/payment gateway/fake /api. Use WA/contact CTA and real Indonesian business copy.
${missingCssNote}

Build intent:
${appSpec}`,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:changed -- src/lib/projects/custom-source-generator.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate + commit**

Run: `bun run check`
Expected: green.

```bash
git add -A
git commit -m "fix(agent): make src/routes/index.tsx the first required write in prompts

Listed equally with site.ts/index.css, the agent deprioritized the home page.
Name it as the non-negotiable FIRST STEP in both the generate SPEED RULES and
the forced-rewrite prompt."
```

---

### Task 4: Stage B — console-error capture mode in the Playwright script

**Files:**
- Modify: `scripts/capture-project-thumbnail.cjs` (add `--mode console-errors`).
- Create: `src/lib/projects/runtime-capture.ts` — TS wrapper `captureRuntimeErrors(artifactRef)`.
- Test: `src/lib/projects/runtime-capture.test.ts`.

**Interfaces:**
- Consumes: `readProjectDistArtifact(artifactRef)`, `startArtifactServer` (already in `project-thumbnail.ts` — export or reuse; if not exported, factor a shared helper).
- Produces: `captureRuntimeErrors(artifactRef: string): Promise<{ errors: string[]; ok: boolean }>`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/projects/runtime-capture.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { captureRuntimeErrors } from "./runtime-capture";

describe("captureRuntimeErrors", () => {
  it("returns ok:true with no errors for a dist that renders cleanly", async () => {
    // Build a minimal clean dist artifact (index.html + a script that does not throw)
    // using the existing test artifact helpers in project-thumbnail.test.ts — read that
    // file first to reuse its dist-fixture builder.
    const result = await captureRuntimeErrors(artifactRef);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("collects console.error + pageerror from a dist that throws on load", async () => {
    // Dist whose script calls an undefined function on load.
    const result = await captureRuntimeErrors(artifactRef);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes("is not defined"))).toBe(true);
  });
});
```

Reuse the real dist-fixture helpers from `project-thumbnail.test.ts` (read it first). If the script can't run headless in CI (no browser), gate the test behind `RUNTIME_CAPTURE_TESTS=1` env or skip on CI — match how `project-thumbnail.test.ts` handles browser availability (read its skip condition first).

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/lib/projects/runtime-capture.test.ts`
Expected: FAIL — `captureRuntimeErrors` doesn't exist.

- [ ] **Step 3: Add the console-errors mode to the capture script**

In `scripts/capture-project-thumbnail.cjs`, read the current argv parsing (lines ~1-30). Add a `mode` argv (position 5 or a `--mode` flag — match the existing style). When `mode === "console-errors"`:
- Skip the screenshot.
- Attach `page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); })` and `page.on("pageerror", (err) => errors.push(err.message); })`.
- Still `page.goto(url, { waitUntil: "domcontentloaded" })` + wait for the `umkmcepat-preview-ready` postMessage (architecture.md:85) + a short settle (~500ms), mirroring the existing `waitForTimeout` (line 58).
- On finish, `process.stdout.write(JSON.stringify({ errors, ok: errors.length === 0 }))` and exit 0. (The thumbnail mode keeps its screenshot+stdout behavior untouched.)

Keep the existing screenshot mode byte-identical. The sandbox context: the script already loads via `startArtifactServer`'s origin + the generated app's `base: './'` — verify that origin mirrors the preview iframe's sandbox-safe context (architecture.md:82). If the existing thumbnail capture already loads correctly (it produces valid thumbnails), the same load path is fine for console-error collection.

- [ ] **Step 4: Write the TS wrapper**

Create `src/lib/projects/runtime-capture.ts`:

```ts
import { readProjectDistArtifact } from "@/lib/projects/runtime-artifacts";
import { startArtifactServer } from "@/lib/projects/project-thumbnail"; // export this if not exported (see Consumes)
import { spawn } from "node:child_process";
import path from "node:path";

export type RuntimeCaptureResult = { errors: string[]; ok: boolean };

export async function captureRuntimeErrors(
  artifactRef: string,
): Promise<RuntimeCaptureResult> {
  const files = await readProjectDistArtifact(artifactRef);
  const server = await startArtifactServer(files);
  try {
    return await runConsoleErrorCapture(server.origin);
  } finally {
    await server.server.close();
  }
}

function runConsoleErrorCapture(origin: string): Promise<RuntimeCaptureResult> {
  // Mirror captureWithNode in project-thumbnail.ts, but pass mode "console-errors"
  // and parse stdout as JSON { errors, ok }. Reuse the same script path + timeout
  // (PROJECT_THUMBNAIL_TIMEOUT_MS or a new PROJECT_RUNTIME_CAPTURE_TIMEOUT_MS default 15_000).
}
```

If `startArtifactServer` isn't exported from `project-thumbnail.ts`, export it (it's already used internally — making it shared is a one-line `export`). If it can't be cleanly exported, factor the server start into a small shared helper in the same file. Match the existing `captureWithNode` shape (spawn the `.cjs` script, collect stdout, timeout, terminate process tree).

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun run test:changed -- src/lib/projects/runtime-capture.test.ts`
Expected: PASS (or skip if no browser in CI — the skip must be explicit, not a silent pass).

- [ ] **Step 6: Run the full gate + commit**

Run: `bun run check`
Expected: green.

```bash
git add -A
git commit -m "feat(runtime): console-error capture mode for built dist

Extend the Playwright thumbnail capture script with a console-errors mode that
collects console.error + pageerror on load. New captureRuntimeErrors(artifactRef)
returns { errors, ok }. Reuses the thumbnail artifact-server + browser launch."
```

---

### Task 5: Stage B — `repairRuntimeErrors` pass (sibling of `repairGeneratedProjectFiles`)

**Files:**
- Modify: `src/lib/projects/custom-source-generator.ts` — add `repairRuntimeErrors` next to `repairGeneratedProjectFiles` (`:1992+`).
- Test: `src/lib/projects/custom-source-generator.test.ts`.

**Interfaces:**
- Consumes: `buildGeneratedAppAgentInstructions(schema, implementationSpec, "repair")` (existing — the repair mode already exists), `createAgentTools(runCommand)`, `getAiModel`, `getAgentMaxSteps("repair")`, `withAiTimeout`.
- Produces: `repairRuntimeErrors({ runtimeErrors, files, schema, projectId, implementationSpec?, onOperation? }): Promise<CustomGeneratedSourceResult>` — same return type as `repairGeneratedProjectFiles`.

- [ ] **Step 1: Write the failing test**

In `src/lib/projects/custom-source-generator.test.ts`, add a test that `repairRuntimeErrors` is callable and returns the `CustomGeneratedSourceResult` shape, using a mocked `getAiModel` (reuse the existing mock harness used by `repairGeneratedProjectFiles` tests — read the file first). Assert the prompt contains the runtime errors string.

```ts
it("repairRuntimeErrors feeds runtime errors into the agent and returns files", async () => {
  const result = await repairRuntimeErrors({
    files: starterFiles,
    runtimeErrors: ["ReferenceError: handleSubmit is not defined"],
    schema,
    projectId: "p1",
  });
  expect(result.files).toBeDefined();
  expect(result.usage).toBeDefined();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/lib/projects/custom-source-generator.test.ts`
Expected: FAIL — `repairRuntimeErrors` not exported.

- [ ] **Step 3: Implement `repairRuntimeErrors`**

In `src/lib/projects/custom-source-generator.ts`, copy the shape of `repairGeneratedProjectFiles` (`:1992+`) but replace the `buildLog` plumbing with `runtimeErrors`:

```ts
export async function repairRuntimeErrors({
  files,
  runtimeErrors,
  onOperation,
  projectId,
  schema,
  implementationSpec,
}: {
  files: GeneratedProjectFile[];
  runtimeErrors: string[];
  onOperation?: (operation: GeneratedAppAgentOperation) => void;
  projectId: string;
  schema: ProjectSiteSchema;
  implementationSpec?: ImplementationSpec;
}): Promise<CustomGeneratedSourceResult> {
  // Mirror repairGeneratedProjectFiles structure (operationTrace, runCommand via
  // runGeneratedAppAgentTools, ToolLoopAgent with repair-step budget, withAiTimeout,
  // ensureRouterRouteWired + ensurePreviewReadyCalled + ensureStylesFileExists).
  // Only the prompt differs:
  const errorsBlock = runtimeErrors.length
    ? `\nThe built app threw these RUNTIME errors when loaded in a headless browser:\n${runtimeErrors.map((e) => `- ${e}`).join("\n")}\nFix the source so the app loads without these errors. Edit the file(s) that cause each error.`
    : "";
  // prompt: `RUNTIME REPAIR — the built app crashes on load.\n${errorsBlock}\n\nBuild intent:\n${appSpec}`
  // Return the same CustomGeneratedSourceResult shape.
}
```

Reuse `buildGeneratedAppBuildSpec` for the `appSpec` (same as the generate path). Do NOT duplicate the agent/tool/timeout setup — if `repairGeneratedProjectFiles`'s setup is extractable, extract a shared `runRepairAgent` helper to avoid verbatim duplication (DRY); otherwise mirror it and leave a `ponytail:` comment naming the duplication as the ceiling.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:changed -- src/lib/projects/custom-source-generator.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate + commit**

Run: `bun run check`
Expected: green.

```bash
git add -A
git commit -m "feat(agent): repairRuntimeErrors pass for runtime crash feedback

Sibling of repairGeneratedProjectFiles that takes runtimeErrors: string[]
instead of a buildLog. Same ToolLoopAgent + bounded repair steps; feeds the
runtime crash strings back into the agent to fix the source."
```

---

### Task 6: Stage B — `runRuntimeSelfHeal` orchestrator (bounded 1+1)

**Files:**
- Create: `src/lib/projects/runtime-self-heal.ts`.
- Test: `src/lib/projects/runtime-self-heal.test.ts`.

**Interfaces:**
- Consumes: `captureRuntimeErrors(artifactRef)` (Task 4), `repairRuntimeErrors(...)` (Task 5), `buildGeneratedProject(files, { workspaceKey })` (existing), `writeProjectDistArtifact({ artifactId, files })` (existing).
- Produces: `runRuntimeSelfHeal({ artifactRef, projectId, schema, files, implementationSpec?, onProgress?, abortSignal? }): Promise<RuntimeSelfHealResult>` where `RuntimeSelfHealResult = { ok: boolean; files: GeneratedProjectFile[]; artifactRef: string | null; runtimeErrors: string[]; repairUsed: boolean; usage?: { inputTokens: number; outputTokens: number } }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/projects/runtime-self-heal.test.ts`. Inject the capture + repair + build deps so the test doesn't need a real browser:

```ts
import { describe, expect, it, vi } from "vitest";
import { runRuntimeSelfHeal } from "./runtime-self-heal";

describe("runRuntimeSelfHeal", () => {
  it("returns ok when the first capture is clean (no repair)", async () => {
    const capture = vi.fn().mockResolvedValue({ errors: [], ok: true });
    const result = await runRuntimeSelfHeal({ artifactRef: "a1", projectId: "p1", schema, files: [], deps: { captureRuntimeErrors: capture, repairRuntimeErrors: vi.fn(), buildGeneratedProject: vi.fn(), writeProjectDistArtifact: vi.fn() } });
    expect(result.ok).toBe(true);
    expect(result.repairUsed).toBe(false);
  });

  it("runs 1 repair + rebuild + re-capture when the first capture has errors, then ok", async () => {
    const capture = vi.fn()
      .mockResolvedValueOnce({ errors: ["ReferenceError: x is not defined"], ok: false })
      .mockResolvedValueOnce({ errors: [], ok: true });
    const repair = vi.fn().mockResolvedValue({ files: [/* fixed */], usage: { inputTokens: 10, outputTokens: 5 } });
    const build = vi.fn().mockResolvedValue({ ok: true, distFiles: [], log: "" });
    const writeArtifact = vi.fn().mockResolvedValue("project-artifact:local:dist:new");
    const result = await runRuntimeSelfHeal({ artifactRef: "a1", projectId: "p1", schema, files: [], deps: { captureRuntimeErrors: capture, repairRuntimeErrors: repair, buildGeneratedProject: build, writeProjectDistArtifact: writeArtifact } });
    expect(result.ok).toBe(true);
    expect(result.repairUsed).toBe(true);
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("honest-fails when errors persist after 1 repair + 1 re-capture", async () => {
    const capture = vi.fn().mockResolvedValue({ errors: ["still broken"], ok: false });
    const repair = vi.fn().mockResolvedValue({ files: [], usage: { inputTokens: 0, outputTokens: 0 } });
    const build = vi.fn().mockResolvedValue({ ok: true, distFiles: [], log: "" });
    const result = await runRuntimeSelfHeal({ artifactRef: "a1", projectId: "p1", schema, files: [], deps: { captureRuntimeErrors: capture, repairRuntimeErrors: repair, buildGeneratedProject: build, writeProjectDistArtifact: vi.fn() } });
    expect(result.ok).toBe(false);
    expect(result.runtimeErrors.length).toBeGreaterThan(0);
    expect(repair).toHaveBeenCalledTimes(1); // bounded — no second repair
  });
});
```

Accept deps as an injected object so the loop is testable without a browser. The production caller (Task 7) wires the real deps.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/lib/projects/runtime-self-heal.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `runRuntimeSelfHeal`**

Create `src/lib/projects/runtime-self-heal.ts`:

```ts
import { buildGeneratedProject } from "@/lib/projects/generated-source";
import { repairRuntimeErrors } from "@/lib/projects/custom-source-generator";
import { captureRuntimeErrors } from "@/lib/projects/runtime-capture";
import { writeProjectDistArtifact } from "@/lib/projects/runtime-artifacts";
import type { GeneratedProjectFile } from "@/lib/projects/generated-types";
import type { ImplementationSpec } from "@/lib/projects/implementation-spec";
import type { ProjectSiteSchema } from "@/lib/projects/site-schema";

export type RuntimeSelfHealResult = {
  ok: boolean;
  files: GeneratedProjectFile[];
  artifactRef: string | null;
  runtimeErrors: string[];
  repairUsed: boolean;
  usage?: { inputTokens: number; outputTokens: number };
};

export type RuntimeSelfHealDeps = {
  captureRuntimeErrors: typeof captureRuntimeErrors;
  repairRuntimeErrors: typeof repairRuntimeErrors;
  buildGeneratedProject: typeof buildGeneratedProject;
  writeProjectDistArtifact: typeof writeProjectDistArtifact;
};

export type ProgressEvent = { label: string; detail?: string };

export async function runRuntimeSelfHeal({
  artifactRef,
  projectId,
  schema,
  files,
  implementationSpec,
  onProgress,
  abortSignal,
  deps,
}: {
  artifactRef: string;
  projectId: string;
  schema: ProjectSiteSchema;
  files: GeneratedProjectFile[];
  implementationSpec?: ImplementationSpec;
  onProgress?: (event: ProgressEvent) => void;
  abortSignal?: AbortSignal;
  deps: RuntimeSelfHealDeps;
}): Promise<RuntimeSelfHealResult> {
  onProgress?.({ label: "Menjalankan tampilan", detail: "Memeriksa error runtime." });
  const first = await deps.captureRuntimeErrors(artifactRef);
  if (first.ok) {
    onProgress?.({ label: "Tampilan sehat" });
    return { ok: true, files, artifactRef, runtimeErrors: [], repairUsed: false };
  }

  onProgress?.({ label: "AI memperbaiki error runtime", detail: `${first.errors.length} error ditemukan.` });
  let currentFiles = files;
  let usage: RuntimeSelfHealResult["usage"];
  let repairUsed = false;

  const repair = await deps.repairRuntimeErrors({
    files: currentFiles,
    runtimeErrors: first.errors,
    schema,
    projectId,
    implementationSpec,
  });
  repairUsed = true;
  usage = repair.usage;
  currentFiles = repair.files;

  const rebuild = await deps.buildGeneratedProject(currentFiles, { workspaceKey: projectId });
  if (!rebuild.ok) {
    onProgress?.({ label: "Perbaikan runtime gagal dibangun" });
    return { ok: false, files: currentFiles, artifactRef, runtimeErrors: first.errors, repairUsed, usage };
  }

  const newArtifactRef = await deps.writeProjectDistArtifact({ artifactId: `${projectId}-runtime-${Date.now()}`, files: rebuild.distFiles }).catch(() => null);
  if (!newArtifactRef) {
    return { ok: false, files: currentFiles, artifactRef, runtimeErrors: first.errors, repairUsed, usage };
  }

  onProgress?.({ label: "Menjalankan ulang tampilan", detail: "Memeriksa error runtime." });
  const second = await deps.captureRuntimeErrors(newArtifactRef);
  if (second.ok) {
    onProgress?.({ label: "Tampilan sehat" });
    return { ok: true, files: currentFiles, artifactRef: newArtifactRef, runtimeErrors: [], repairUsed, usage };
  }

  // Bounded honest-fail: 1 repair + 1 re-check only.
  onProgress?.({ label: "Tampilan masih bermasalah", detail: second.errors.slice(0, 3).join("; ") });
  return { ok: false, files: currentFiles, artifactRef: newArtifactRef, runtimeErrors: second.errors, repairUsed, usage };
}
```

Note: `Date.now()` is used inside an async function body (not module scope) — fine here. If the repo forbids `Date.now()` in non-test code, pass a timestamp via the caller; check the codebase convention first. `artifactId` shape must match what `writeProjectDistArtifact` expects (cuid-ish) — if it requires a real cuid, use the project's existing cuid generator instead of the timestamp string.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:changed -- src/lib/projects/runtime-self-heal.test.ts`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Run the full gate + commit**

Run: `bun run check`
Expected: green.

```bash
git add -A
git commit -m "feat(runtime): runRuntimeSelfHeal bounded 1+1 orchestrator

capture -> (errors?) -> 1 repair -> rebuild -> re-capture -> ok | honest-fail.
Bounded: no second repair. Injects deps so the loop is testable without a
browser. Streams progress events to the caller (SSE in the route)."
```

---

### Task 7: Stage B — wire `runRuntimeSelfHeal` into the generate route (both paths) + progress events

**Files:**
- Modify: `src/routes/api.projects.$id.generate.ts` — hook `runRuntimeSelfHeal` into the success path of BOTH generate paths (primary ~`:500-505`, retry-edit ~`:1000-1005`), guarded by `isGeneratedBuildExecutionEnabled()`, streaming `send("progress", ...)`.
- Test: extend `src/routes/api.projects.$id.generate.test.ts` (or the existing generate test) to assert the runtime-check progress events fire on a successful build.

**Interfaces:**
- Consumes: `runRuntimeSelfHeal(...)` (Task 6), `send("progress", ...)` (existing, `:288`), `isGeneratedBuildExecutionEnabled()` (existing).
- Produces: on a successful build, the runtime self-heal runs and emits `progress` events; its result drives the final build status + artifact ref.

- [ ] **Step 1: Write the failing test**

In the generate-route test file, add a test that a successful build triggers a runtime-check progress event. Reuse the existing test harness (mocked build, captured SSE events). Assert the SSE stream contains an event with label `Menjalankan tampilan` (or `Tampilan sehat`).

```ts
it("runs the runtime self-heal after a successful build and streams progress", async () => {
  // Reuse the existing generate-route SSE test harness.
  // Mock buildGeneratedProject to return ok:true.
  // Mock captureRuntimeErrors (via the deps injection or env) to return ok:true.
  // Assert the SSE events include a progress event with label "Menjalankan tampilan".
});
```

If the route doesn't support deps injection for the runtime capture, inject via a module-level seam (e.g. `getRuntimeSelfHealDeps()` exported + overridable in tests, matching any existing test-seam pattern in the route — read the file first). Do NOT add a new env-var seam if an existing one fits.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/routes/api.projects.$id.generate.test.ts`
Expected: FAIL — no runtime-check events today.

- [ ] **Step 3: Wire the hook into both success paths**

In `src/routes/api.projects.$id.generate.ts`, after `finalBuildResult.ok` is true AND the dist artifact is written (find the artifact-write site on each path — primary ~`:500-505`, retry-edit ~`:1000-1005`; the primary path writes the artifact after the build loop, the retry-edit path after its build), add (guard with `isGeneratedBuildExecutionEnabled()`):

```ts
if (isGeneratedBuildExecutionEnabled() && finalBuildResult.ok) {
  // artifactRef is the dist artifact just written.
  const selfHeal = await runRuntimeSelfHeal({
    artifactRef: <distArtifactRef>,
    projectId,
    schema: retrySchema /* or the path's schema */,
    files: sourceFiles,
    implementationSpec,
    onProgress: (e) => send("progress", e),
    abortSignal: localAbortController.signal,
    deps: { captureRuntimeErrors, repairRuntimeErrors, buildGeneratedProject, writeProjectDistArtifact },
  });
  if (!selfHeal.ok) {
    // Honest-fail: record the runtime-not-healthy state, keep the real reply,
    // surface an actionable panel. Mirror the missing-card state pattern.
    // Set the build/runtime status so the client shows the error panel
    // (reuse the existing build-failure status path but with runtimeErrors).
    send("progress", { label: "Tampilan masih bermasalah", detail: selfHeal.runtimeErrors.slice(0, 3).join("; ") });
    // Fall through to the failure-status handling, preserving sourceFiles + reply.
  } else if (selfHeal.repairUsed) {
    // The repair changed sourceFiles + artifactRef — persist the new snapshot + artifact.
    sourceFiles = selfHeal.files;
    <distArtifactRef> = selfHeal.artifactRef ?? <distArtifactRef>;
  }
}
```

Find the exact `distArtifactRef` variable name on each path by reading the artifact-write call on that path. Both paths must get the hook (DRY: if the two paths share enough structure, extract a shared `runGenerateBuildAndSelfHeal` helper; if they diverge too much, duplicate the hook with a `ponytail:` comment naming the duplication ceiling — judge by reading both paths).

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:changed -- src/routes/api.projects.$id.generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate + commit**

Run: `bun run check`
Expected: green.

```bash
git add -A
git commit -m "feat(generate): run runtime self-heal on successful build + progress events

After a successful build, run the bounded runtime self-heal (capture -> repair
-> rebuild -> re-capture) and stream progress events. Honest-fail surfaces an
actionable state instead of shipping a runtime-broken app. Wired into both
generate paths, guarded by build-execution-enabled."
```

---

### Task 8: Stage B — failure UX + docs

**Files:**
- Modify: `src/components/projects/WorkspacePrimitives.tsx` (or wherever the build-failure/error panel renders — find the existing build-error panel first) — render the runtime-errors state as an actionable panel with the errors + manual retry, mirroring the existing build-failure panel.
- Modify: `docs/architecture.md` — record the runtime self-heal step + bounded loop + honest-fail state.

**Interfaces:**
- Consumes: the runtime self-heal result/status from the generate SSE stream (Task 7).
- Produces: a visible runtime-errors panel when `selfHeal.ok === false`.

- [ ] **Step 1: Find the existing build-failure/error panel**

Read `src/components/projects/` for the panel that renders build errors / "Tampilan website belum berhasil dimulai" (architecture.md:84). Reuse its shape — do NOT invent a new panel.

- [ ] **Step 2: Add the runtime-errors state to that panel**

When the generate stream emits the runtime-not-healthy status (from Task 7's honest-fail), render the existing error panel with: title "Tampilan website bermasalah saat dijalankan", the runtime errors (first 3-5), and the existing manual-retry button. Mirror the missing-card state pattern (architecture.md:51). No new visual language.

- [ ] **Step 3: Update `docs/architecture.md`**

In the generated-project section, add a short subsection: after a successful build, a bounded runtime self-heal runs (capture console errors → 1 repair → rebuild → re-capture → ok | honest-fail). Bounded 1+1. Reuses the thumbnail headless capture + the `repairGeneratedProjectFiles` shape + the build-step progress events. Honest-fail surfaces an actionable preview panel; never silently ships a runtime-broken app. Click-through / vision diff are future (Stage C).

- [ ] **Step 4: Run the full gate + commit**

Run: `bun run check`
Expected: green.

```bash
git add -A
git commit -m "feat(workspace): runtime-errors failure panel + docs

Render the bounded runtime self-heal's honest-fail as an actionable preview
panel with the runtime errors + manual retry, mirroring the build-failure
panel. Record the runtime self-heal step + bounded loop in architecture.md."
```

---

## Self-Review (completed by plan author)

**1. Spec coverage:**
- Stage A guard fix → Task 1. ✓
- Stage A gate assertion → Task 2. ✓
- Stage A prompt step-1 → Task 3. ✓
- Stage B console-error capture → Task 4. ✓
- Stage B runtime-repair pass → Task 5. ✓
- Stage B orchestrator (bounded 1+1) → Task 6. ✓
- Stage B generate-route wiring + progress events → Task 7. ✓
- Stage B failure UX + docs → Task 8. ✓
- "Always run once after successful build" (spec) → Task 7 hooks the success path, Task 4 capture runs once (re-capture once after repair). ✓
- "Bounded 1 repair + 1 re-check" (spec) → Task 6 `repairUsed` + no second repair. ✓
- "Progress events" (spec) → Task 7 `send("progress", ...)`. ✓
- "Honest-fail / first-class UI state" (spec) → Task 8 panel + Task 6 honest-fail return. ✓
- "Headless mirrors preview iframe context" (spec risk) → Task 4 Step 3 note: reuse the thumbnail artifact-server origin (already produces valid thumbnails, so the load path is preview-equivalent). Flagged for implementer verification. ✓
- "Route timeout budget" (spec risk) → flagged in Global Constraints + Task 7 implementer must verify the route's outer deadline covers build + 2 captures + 1 repair + 1 rebuild; if not, bump the timeout (the spec explicitly deferred this to the plan — Task 7 owns it). ✓
- "Visible reply never regenerated just to repair" (spec invariant) → Task 5 `repairRuntimeErrors` fixes source, Task 6 rebuilds; the user-facing chat reply is untouched. ✓

**2. Placeholder scan:** No "TBD"/"implement later". Where the plan says "reuse the existing test harness / read the file first to get the real names," that's a deliberate instruction to the implementer (the helpers exist and vary) — not a placeholder in the plan's own code. The one `ponytail:` duplication ceiling (Task 5 Step 3 + Task 7 Step 3) is explicitly named, not hidden.

**3. Type consistency:** `captureRuntimeErrors(artifactRef) → { errors: string[]; ok: boolean }` (Task 4) used in Task 6's `RuntimeSelfHealDeps`. `repairRuntimeErrors({ runtimeErrors, files, schema, projectId, implementationSpec?, onOperation? }) → CustomGeneratedSourceResult` (Task 5) used in Task 6. `runRuntimeSelfHeal(...) → RuntimeSelfHealResult` (Task 6) used in Task 7. `ProgressEvent = { label: string; detail?: string }` matches the existing `send("progress", { label, detail })` shape at generate route `:461-463`. Names consistent across tasks.

**4. Known risks the implementer must handle (flagged in-task, not deferred):**
- Task 4: browser availability in CI (gate the test or skip explicitly — match `project-thumbnail.test.ts`).
- Task 4: `startArtifactServer` export — export it if not already (one-line change).
- Task 6: `Date.now()` / `artifactId` shape — match the repo's cuid convention if `writeProjectDistArtifact` requires a real cuid.
- Task 7: route timeout budget — verify it covers the loop; bump if needed. The two generate paths may need a shared helper or a `ponytail:`-marked duplication.
- Task 7: deps-injection seam for testing — match an existing test-seam pattern; do NOT add a new env seam if an existing one fits.
