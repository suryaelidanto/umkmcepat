# Batched Generation Engine — Implementation Plan

**Date:** 2026-08-04
**Status:** Draft
**Spec:** `docs/superpowers/specs/2026-08-04-batched-generation-design.md`
**Depends on:** `AiCallRecord` spec landing first (telemetry hooks).

## Tasks

### Phase 0 — Instrumentation + A/B harness (no behavior change)

Status: done in 8d77380 (timers), 063508a (caches), 6e726c3 (A/B harness).

1. **AiCallRecord plumbing done** (see its spec/plan; here we assume it's merged).
2. **Timer split** — in `src/lib/projects/generated-source.ts`, add `tscMs`/`viteMs` around the existing `bun run build` and emit both in the existing `[umkm:build] timings` line without changing the command itself.
3. **Per-project caches** — move `tsBuildInfoFile` + Vite `cacheDir` out of golden `node_modules`. Edit `createGeneratedViteTanStackStarterFiles` to emit per-workspace paths under `.cache/generated-app/`, preserve those paths in `syncWorkspaceFiles`.
4. **A/B harness** — `scripts/ab-build-engine.ts`: takes a list of briefs, runs each through legacy and batched (behind a flag), records wall-clock, energy, repair count, gate pass into `AiCallRecord` + a JSON summary line per run. Manual runner, no scheduling.

### Phase 1 — Generate (batched)

5. **Parser** — `src/lib/projects/batched-response.ts`. Strict state machine for `<file>` blocks, allow-list, propose, done. Returns staged files or detailed per-file diagnostic. Tests for: well-formed, missing `path`, malformed closing, truncated tail, multiple proposals, extra unknown tags, large 35k-token response, unicode in content.
6. **Scaffold manifest** — `src/lib/projects/scaffold/manifest.ts` + `manifest.test.ts`. Derives file tree + contract sections from `createGeneratedViteTanStackStarterFiles`. Drift assertion: snapshot test.
7. **Admission gate** — reuses `discuss-readiness.ts` blockers; adds a deterministic brief-completeness schema (zod) on the fields the writer needs (hero copy, WhatsApp, etc.). Fails clean with Indonesian error.
8. **Prompt builder** — `src/lib/projects/batched-generator.ts`. Composes the single system+user prompt from: scaffold manifest, design specification (from existing inputs), brief. Takes tool-call none; requests plain structured text. Uses `reasoning: "none"` where supported.
9. **Writer + stage** — `runBatchedGenerate` streams the response through parser, emits UI events (same event names as today), stages files, validates gates as described, does repair-loop within the retry budget, then calls existing build+deploy (unchanged after this point).
10. **Fallback wiring** — on final failure, call the existing `runBuildAttempt` agent-loop path, flagged as `phase: "fallback"` in telemetry.
11. **Admin toggle** — adds `generation.batched_rollout` setting with `off|internal|pilot|all` per spec. Internal = project owners in an internal list, pilot = deterministic percent from project id hash.
12. **Tests** — unit for parser, manifest; integration on a real test brief comparing legacy vs batched output (schema-different, quality-acceptable); smoke flow.
13. **Docs** — DEV.md gets the new telemetry field names, the rollout flag name, and the fallback path. AGENTS.md reference in DEV.md stays clean.

### Phase 2 — Build speed (independent behavior change)

Status: not started (deferred). Do after Phase 1+3 are stable in production; each item gated by measurement.

14. **Ss3 parallel upload + client reuse** in `runtime-artifacts.ts` + `s3-client.ts`.
15. **Skip-build-on-unchanged-hash** in `generated-source.ts` before invoking Bun.
16. **Thumbnail detached** — in `build-attempt-worker.ts`, mark `done` after deployment commit; thumbnail in `Promise.allSettled`-style background continuation, already partially handled.
17. **Build-concurrency experiment** — script runs the same workspace prep at concurrency 1,2,3 and records p50/p95. Recommended default goes into env/setting.

### Phase 3 — Edit path (after generate gate passes)

Status: done in 473f096, 5361bce, dad0acc, 7425843, b47a9de + fixes 8ffbfb5, 032f1c0.

18. **Deterministic target-finder** in the edit worker: from instruction → candidate files (`selectBatchedEditTargets` in `batched-edit-targets.ts`). Ambiguity is resolved inside the same single prompt (self-selection directive), not a separate exploratory loop.
19. **Batched edit call** — inlined candidate files in prompt; model emits targeted `<file>`s (`runBatchedEdit`).
20. **Same validation/fix/fallback** as Phase 1 — gates + targeted repair (≤2) + legacy `source-edit-agent.ts` fallback.
21. Same A/B methodology; same flag family — rides `generation.batched_rollout`.

### Quality gates at every step

- `bun run check` before any commit.
- Focused tests for the files we touched.
- A/B harness results committed as JSON output under `docs/superpowers/batched-ab-results/` so future agents see the numbers that decided the rollout.

## Out of scope here

- No discuss hedging (separate spec).
- No contract-v1 work.
- No changes to pricing.
- No changes to `UserCredit` semantics.
