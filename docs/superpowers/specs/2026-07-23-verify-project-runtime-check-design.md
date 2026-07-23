# Design: `/verify-project` — Runtime-Healthy Regression Check

**Date:** 2026-07-23
**Status:** Approved (brainstormed 2026-07-23)
**Supersedes / extends:** ships the unshipped Stage B of `2026-07-22-guard-and-runtime-self-heal-design.md`, packaged as a standalone on-demand regression skill instead of an inline generate-flow hook.

## Background & Problem Statement

Two specs already converged on the same gap:

1. **`2026-07-21-discuss-mode-reliability-design.md`** explicitly deferred "Browser E2E (post-merge candidate)" as a follow-up — a real discuss session confirming progressive text + card render + degradation. Never shipped.
2. **`2026-07-22-guard-and-runtime-self-heal-design.md`** designed Stage B — a headless console-error capture mode on the thumbnail path, feeding a bounded runtime-repair pass. Stage A shipped (force-home-page guard, commits `9f1581a`/`ed3bb78`/`96b17ff`). **Stage B was never implemented** — no `runtime-capture.ts`, no console/error listeners, plan tasks 4-8 have no corresponding source.

The user's pain: "I have a hard time iterating on discuss mode and build mode." Every refactor risks shipping a site that **compiles fine but crashes at runtime** (undefined function on click, React render error, blank screen) — the silent-runtime-bug class. Today nothing catches that before merge; the pilot user sees a dead site.

The user's wish: "is there any AI to actually check so no need to me as a human to review until it's great." That is the deferred Stage C vision-model judge. This spec delivers the prerequisite first: a deterministic layer that catches **broken**, so the later judge only has to catch **ugly**.

### Research basis (firecrawl, 2026-07-23)

Sourced from Arthur AI (LLM testing best-practices), AgentRR + sakurasky (deterministic record-replay for agent systems), Autonoma (e2e strategy for AI-generated code):

- **Layered testing (Arthur AI, industry consensus):** deterministic checks → semantic similarity → LLM-judge → human review. *Never start with the judge.* This spec = the deterministic layer; the judge is explicitly v2.
- **Record-replay (AgentRR):** for the app's own LLM, the canonical flake-killer is record-once/replay-verbatim, not hand-stubs (which lie) or real-AI-in-loop (which flakes on model drift). v1.1 adopts this for discuss/source-gen.
- **Test the execution path, not the final answer (Arthur, on agents):** assert on tool-selection / multi-step / recovery / loop-prevention / permission-boundaries — which maps 1:1 to the five agent-loop guardrail gaps from the 2026-07-22 guardrails audit. Those assertions land in v1.1 where the agent loop actually runs.
- **E2E scope filter (Autonoma):** only the real cross-stack flow belongs in e2e; pure logic stays in unit. v1 is the runtime-healthy slice of that flow.

## Scope

**In scope (v1 — this spec):**
- A standalone runtime-healthy check that loads the built **dist** for a project, waits for the `generated-app-preview-ready` postMessage, collects `pageerror` + `console` errors, asserts the expected content rendered.
- `/verify-project` skill: runs the check → collects `{ ok, consoleErrors, contentFound, screenshot }` → the reviewing agent (me, interactively) reads failures + screenshot → reports. Free, not unattended.
- A CI-runnable Playwright test wrapping the same check.
- Export `startArtifactServer` (currently private) for reuse.

**Out of scope (v1.1 — later spec):**
- The discuss → workspace-card → build flow (record-replay proxy for the discuss/source-gen LLM). Adds the flakiest, most async part; v1.1 once the runtime core is proven.
- The five agent-loop guardrail gaps as assertions (build-subprocess-ignore-abort, no aggregate token budget, near-dup loop evasion, repair-pass-not-abortable, no per-step timeout). These belong with v1.1 because they test the agent loop, which doesn't run in the v1 slice.

**Out of scope (v2 — later spec, Stage C):**
- Vision-model judge reading the final screenshot, scoring "great" vs brief. Paid tokens, unattended. Deferred until the deterministic layer is green and the user wants to stop reviewing.
- Sandbox-fidelity: loading dist from plain `127.0.0.1` vs the real preview iframe's `sandbox allow-scripts` null-origin context (`runtime-proxy.ts:138-153`, `architecture.md:82-83`). v1 catches runtime crashes that fire regardless of origin; sandbox-specific fidelity is v2.

## Proposed Solution

### Part 1: Export the artifact server (one-line enabler)

`src/lib/projects/project-thumbnail.ts:362` — `startArtifactServer(files)` is currently private (no `export`). Export it. The plan at `2026-07-22-guard-and-runtime-self-heal.md:346` already flagged this need. Zero behavior change; `captureProjectThumbnail` keeps using it internally.

### Part 2: Runtime-health capture script (sibling of the thumbnail script)

New `scripts/verify-project-runtime.cjs` — mirrors `scripts/capture-project-thumbnail.cjs` structure (CommonJS, `playwright-core`, argv-driven) but instead of screenshotting it:

1. Launches chromium headless, aborts cross-origin requests (same as thumbnail script).
2. `page.goto(origin, { waitUntil: "domcontentloaded" })`.
3. Attaches `page.on("console")` + `page.on("pageerror")` → collects `{ type, text }[]`.
4. Waits for the `generated-app-preview-ready` postMessage (`generated-source.ts:1297` emits it; **not** `umkmcepat-preview-ready` — that's only a receiver-side alias in `WorkspacePrimitives.tsx:439-442`; listening for the wrong name hangs).
5. After ready (or a bounded timeout), asserts concrete rendered content: the root element `#root` is non-empty **and** contains at least one visible text node (`document.querySelector('#root')?.innerText.trim().length > 0`). A blank/empty root is the "compiled fine, rendered nothing" failure — the exact class this check exists to catch.
6. Writes a structured JSON result to stdout: `{ ok, consoleErrors[], pageErrors[], contentFound, readyReceived }`, plus a screenshot to a sidecar file on failure.

**No click-through** (Stage C territory). One load, one render, collect. Bounded ~3-5s.

### Part 3: TS orchestrator

New `src/lib/projects/verify-project.ts` — `verifyProjectRuntime(artifactRef): Promise<VerifyResult>`. Reuses `readProjectDistArtifact` (`project-thumbnail.ts:166`) + the now-exported `startArtifactServer`, spawns `scripts/verify-project-runtime.cjs`, parses stdout. Pure orchestrator, no DB/auth imports (mirrors the thumbnail module's isolation).

### Part 4: `/verify-project` skill

New `.claude/skills/verify-project/SKILL.md`. Flow:
1. Resolve the target project's dist `artifactRef` (latest successful build).
2. Call `verifyProjectRuntime(artifactRef)`.
3. If `ok === false` — read `consoleErrors` / `pageErrors` + the failure screenshot, diagnose root cause, report to user with the broken line / failing render.
4. If `ok === true` — report green, show the screenshot so the user sees the rendered site.

This is the v1 stand-in for the paid LLM-judge: the **reviewing agent reads the deterministic check's output**, free, not unattended. Matches the user's proposed `/test`-style workflow but named for the flow it drives (mirrors `push-dev`, `fix-ci`).

### Part 5: CI-runnable test

New `tests/e2e/verify-project.runtime.spec.ts` — Playwright test wrapping `verifyProjectRuntime` against a fixture dist (a known-good generated project committed under `tests/e2e/fixtures/`). Runs in `bun run verify` / CI without booting the app or supervisor. This is the "apex of the mock pyramid" the 2026-07-22 testing audit flagged as missing — a real dist load, not a mocked one.

## Alternatives considered

- **Inline Stage B as originally specified (console-error capture wired into the generate flow).** Rejected for v1: couples the check to the generate route's timeout budget, only runs on fresh generates (not regression), and the user explicitly wants an on-demand `/verify-project` invocation. The standalone shape subsumes the inline one — the inline hook can later call `verifyProjectRuntime` directly.
- **Hit the real preview route `/api/projects/$id/preview/`.** Rejected for v1: needs full app boot + auth + the runtime supervisor (`api.projects.$id.preview.$.ts:29-128`, `runtime-proxy.ts:28-54`). The artifactRef pattern loads the same dist files from local storage via a throwaway `127.0.0.1` server — same bytes, no boot. v2 can graduate to the real route for sandbox-fidelity.
- **Hand-stub the LLM + drive discuss→build→preview in v1.** Rejected: hand-stubs lie (you write the happy path; real model does weirder things), and discuss is the flakiest slice. v1.1 uses record-replay (AgentRR) instead — captures what the model *actually did*, replays verbatim, zero flake.
- **Start with the vision judge (Stage C).** Rejected: Arthur AI consensus is never lead with the judge. Judge on a broken-but-compiled site scores "looks fine" — useless. Deterministic layer first.

## Key risks

- **Plain-localhost origin ≠ preview iframe sandbox.** Loading dist from `127.0.0.1` (no `sandbox allow-scripts` CSP, no null-origin) may surface false positives/negatives for sandbox-specific errors vs the real preview iframe (`runtime-proxy.ts:138-153`). v1 catches the **runtime-crash class** (undefined function, React render error) which fires regardless of origin; sandbox-fidelity is v2. The `2026-07-22-guard-and-runtime-self-heal` spec flagged this same risk at `:80`.
- **`generated-app-preview-ready` vs `umkmcepat-preview-ready` naming.** The emitted type is the former (`generated-source.ts:1297`); the latter is only a receiver-side alias. Listening for the wrong name hangs the test. Mitigated by asserting on both + a bounded timeout.
- **Fixture dist drift.** The committed fixture dist must stay representative of real generated output. If the generator's output shape shifts, the fixture needs refresh. Mitigated by sourcing the fixture from a real generated project at spec time, not hand-authoring it.
- **`playwright-core` vs `@playwright/test`.** The repo has `playwright-core` (browser engine) but **not** `@playwright/test` (the runner) — the 2026-07-22 testing audit flagged this. The CI test in Part 5 needs `@playwright/test` installed. Verify in the implementation plan, do not guess.

## Invariants preserved (architecture.md)

- Static-frontend-only — the dist load touches no backend/db/auth.
- One bad project must not break another — `verifyProjectRuntime` loads one project's dist in an ephemeral server, torn down in `finally` (mirrors `runThumbnailCapture`).
- Preview failures are first-class — `/verify-project` reports failures with the screenshot + errors, never silently green.
- The visible reply is never regenerated to "repair" — v1 is read-only verification; it fixes nothing, just reports.

## Implementation order (dopamine-first)

1. **Part 1 (export `startArtifactServer`)** — one-line, committed independently. Unblocks Part 2-3.
2. **Part 2-3 (capture script + orchestrator)** — committed together. Run against a real project's dist manually: see the first `{ ok: true, contentFound: true }` land. Dopamine checkpoint.
3. **Part 4 (`/verify-project` skill)** — committed. User invokes `/verify-project`, sees green + screenshot, or a diagnosed failure. Second dopamine checkpoint.
4. **Part 5 (CI test + fixture)** — committed. `bun run verify` now exercises the runtime-healthy slice. Closes the testing-audit apex gap.

Each part: implementer subagent → review-package → gate green → commit. User tries between parts.

## Success criteria

- A generated project's built dist, loaded headless, emits `generated-app-preview-ready` and the check collects zero `pageerror`/`console` errors + finds expected rendered content → `ok: true`.
- A dist with an injected runtime error (e.g. a thrown function on render) → `ok: false` with the error text + screenshot captured, reported by `/verify-project`.
- `bun run verify` (or the CI test) runs the check against the fixture dist without booting the app or supervisor, green on known-good.
- `startArtifactServer` exported, thumbnail path behavior unchanged (its tests still green).

## Files touched

- **Edit:** `src/lib/projects/project-thumbnail.ts` (export `startArtifactServer` — Part 1)
- **New:** `scripts/verify-project-runtime.cjs` (Part 2 — sibling of `capture-project-thumbnail.cjs`)
- **New:** `src/lib/projects/verify-project.ts` (Part 3 — orchestrator)
- **New:** `.claude/skills/verify-project/SKILL.md` (Part 4 — the skill)
- **New:** `tests/e2e/verify-project.runtime.spec.ts` (Part 5 — CI test)
- **New:** `tests/e2e/fixtures/<known-good-dist>/` (Part 5 — fixture)

## Verification

1. **Export guard:** thumbnail tests unchanged-green; `bun run check` (typecheck/lint/Knip) catches the export.
2. **Runtime check:** manual run of `verifyProjectRuntime(artifactRef)` on a real project's dist → `{ ok: true }`; on an injected-runtime-error dist → `{ ok: false, pageErrors: [...] }`.
3. **Skill:** `/verify-project` on a known-good project → green + screenshot; on a broken project → diagnosed failure report.
4. **CI test:** `tests/e2e/verify-project.runtime.spec.ts` green in `bun run verify` against the fixture dist, no app/supervisor boot.
