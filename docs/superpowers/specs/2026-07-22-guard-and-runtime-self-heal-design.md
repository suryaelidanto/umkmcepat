# Guard Fix + Runtime Self-Heal (MVP) — Design

**Date:** 2026-07-22
**Status:** Approved (brainstormed 2026-07-22)
**Supersedes / extends:** builds on the locked-stack migration (plan `2026-07-22-locked-stack-shadcn.md`, shipped).

## Problem

Two connected failures in the generated-project engine:

1. **The AI skips the home page.** The source-generation agent writes the easy decoration files (`src/content/site.ts`, `src/index.css`) but not `src/routes/index.tsx` — the actual visible page. It then calls `check_app`, which passes because a `check_app` guard only blocks when *zero* files are written (any file unblocks it). The verify-before-ship gate (Task 5) catches the stale starter marker and fails the build — correctly — but the forced-rewrite pass repeats the same skip. Build fails: `home route is still the starter placeholder`.

2. **No runtime evidence in the loop.** The gate is static (reads files). The build-error repair loop (`repairGeneratedProjectFiles`) catches *compile-time* failures (`tsc`/vite errors) by feeding the build log back to the agent. But nothing *runs the built app*. A generated site that compiles and passes the static gate can still crash at runtime (undefined function on click, React crash on render, blank screen) — the user sees a dead site; the agent never knows. This is the gap the highest-ROI SOTA builders (Replit/Lovable/Bolt) close with a runtime self-heal loop.

## Goal

Make the engine reliably produce *runtime-working* static frontends:
- Force the AI to write the home page (not skip it) — unblocks builds today.
- After a successful build, run the built dist headless once, catch runtime crashes the build can't see, feed back in one bounded repair pass.

## Scope

**In scope:**
- Stage A — guard fix + defense-in-depth (force `src/routes/index.tsx` to be written).
- Stage B — minimal runtime self-heal: headless console-error capture, one bounded runtime-repair pass, progress events, honest failure UX.

**Out of scope (Stage C — later spec):**
- Click-through / interactive runtime testing (requires a per-site click strategy — hard, deferred).
- Screenshot → vision-model diff against the brief.
- Multi-pass convergence beyond 1 repair + 1 re-check.
- Headless-run performance optimization (one run per build is acceptable for the ~10-UMKM pilot scale).

## Architecture

### Stage A — Force the home page (static layer)

Three enforcing layers, same invariant ("the page must be written"):

1. **Tighten the `check_app` guard.** `custom-source-generator.ts:89` currently blocks `check_app` only when `agentEditedFiles.size === 0`. Change: block `check_app` until `src/routes/index.tsx` is in `agentEditedFiles`. The error message already names `index.tsx`; the condition finally matches. The AI cannot run the checker until it writes the page.

2. **Gate asserts `index.tsx` was edited.** `checkAgentSourceQuality` (~line 1741) today passively detects the stale *marker* (agent left the starter). Add an active assertion: `src/routes/index.tsx ∈ agentEditedFiles`, else push issue `"home route was not written by the agent"`, wired into `NO_MEANINGFUL_EDIT_ISSUES` so it trips the existing forced-rewrite path (Anthropic evaluator-optimizer pattern). Belt to the guard's suspenders.

3. **Rewrite/generate prompt makes `index.tsx` step 1.** `runForcedRewritePass` prompt (~line 337) and the generate `buildAgentPrompt` SPEED RULES currently list `index.tsx` *equally* with `site.ts`/`index.css`, so the AI deprioritizes it. Make it the explicit non-negotiable first write: "STEP 1: write src/routes/index.tsx — the build fails without it."

No new infra. Reuses the existing gate → forced-rewrite → re-check loop.

### Stage B — Runtime self-heal (runtime layer)

Flow (success path only — the compile-error path stays as-is via `repairGeneratedProjectFiles`):

```
build succeeds → materialize dist → run headless once (load, collect console errors ~2-3s, no clicks)
  → clean?  → done (ship)
  → errors? → runtime-repair pass (feed errors to agent, 1 bounded) → rebuild → re-run headless once
     → clean?  → done
     → still broken? → fail honestly (preserve reply, record runtime-not-healthy state, surface actionable panel) — NO second repair; the loop is bounded at 1 repair + 1 re-check.
```

Pieces (all reusing existing infra):

1. **Headless runtime capture** — extend the headless-browser capture already used for thumbnails (`project-thumbnail.ts`, architecture.md:89) with a "console-error collect" mode: load the preview URL, attach `console` + `error` (uncaught) listeners, wait for render + the `umkmcepat-preview-ready` postMessage (architecture.md:85), collect `{errors: string[], ok: boolean}` over ~2-3s. No click-through (Stage C). New mode on existing infra — not a new service, no new process pool.

2. **Runtime-repair pass** — a sibling of `repairGeneratedProjectFiles` (which already takes a `buildLog: string` and feeds it to the agent). New function takes `runtimeErrors: string[]` and re-prompts the agent: "the built app threw these runtime errors: [...]. Fix them." Same `ToolLoopAgent`, bounded steps (reuse repair step config), same timeout discipline. 1 pass max.

3. **Generate-flow wiring** — after the existing build + artifact write (where `repairGeneratedProjectFiles` is called on build *failure*, `api.projects.$id.generate.ts:466,966`), add the runtime check *only on the success path*. On runtime errors → runtime-repair pass → rebuild → re-run headless once.

4. **Progress events** — stream SSE events into the workspace timeline, same pattern as build steps (architecture.md:55): `runtime.check.start`, `runtime.check.errors` (with count), `runtime.repair.start`, `runtime.repair.done`, `runtime.healthy`. Client renders these as visible steps, not a generic spinner. Reuses the existing event-timeline.

5. **Failure UX** — if still broken after the bounded loop, surface an actionable preview panel (architecture.md:84: "preview failures are first-class UI states") with the runtime errors + a manual retry, same shape as the missing-card state (architecture.md:51: preserve real reply, record missing state, offer manual retry). Never silently ship a runtime-broken app.

## Alternatives considered

- **Dedicated `RuntimeSelfHeal` service, separate from thumbnails.** Cleaner separation but builds a new process pool/lifecycle harness when thumbnail capture already does ~80%. YAGNI at pilot scale. Rejected for the MVP.
- **Static runtime analysis (no real browser).** AST-scan for undefined refs / React crash patterns. This is what the gate already is — can't reliably catch the `handleSubmit is not defined`-at-click-time class. Rejected; it's the existing static layer rebranded.

## Key risks

- **Route timeout budget.** The generate route's outer deadline must cover: build + 1 headless run + (conditional) 1 runtime-repair + rebuild + 1 headless re-run. If the existing timeout is too tight, Stage B needs a budget bump. **Verify in the implementation plan, do not guess.**
- **Headless-run cost/latency.** One headless launch per successful build (~1-3s). Acceptable at pilot scale; revisit if scale grows. Always-on was chosen deliberately — the silent-runtime-bug class is the whole value, and gating it on "static flagged something" would miss the point.
- **Non-deterministic runtime errors.** Some runtime errors are environment-dependent (iframe sandbox, null origin). The headless capture must run in a context equivalent to the real preview iframe (architecture.md:82 sandbox-safe CORS) or it will surface false positives. **The capture must mirror the preview's iframe origin/CSP, not a bare localhost load.**
- **Agent can't fix some runtime errors.** A runtime error from a shadcn/Radix misuse may need source the agent struggles with. The bounded loop + honest-failure UX handles this: 1 attempt, then fail with the errors visible. Better than silent shipping.

## Invariants preserved (architecture.md)

- Static-frontend-only (no backend/db/auth/payments).
- One bad project must not break another (headless runs per-build, isolated).
- Preview failures are first-class UI states (no silent broken ship).
- The visible reply is never regenerated just to repair — the runtime-repair fixes *source*, then rebuilds (same as the existing build-error repair).

## Implementation order (dopamine-first, proper)

1. **Stage A**, committed independently. User test-generates a project: sees the AI write the page first + build succeed + render a real shadcn page (not the placeholder). Dopamine checkpoint.
2. **Stage B**, committed on top. User test-generates again: sees the runtime-check timeline events, sees a runtime-broken case self-heal (or fail honestly with a clear panel).

Each stage: implementer subagent → review-package → task reviewer → fix loop if needed → gate green → commit. User tries between stages.

## Success criteria

- Stage A: a generated project's `src/routes/index.tsx` is written by the agent (in `agentEditedFiles`) and the build succeeds without the `home route is still the starter placeholder` failure.
- Stage B: after a successful build, a runtime error (e.g. an undefined function called on render) is caught by the headless capture, fed to the agent, repaired, and the re-built app runs clean — visible as progress events in the workspace timeline. If unfixable, an actionable error panel shows instead of a dead site.
