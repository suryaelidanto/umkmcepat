# Batched Generation Engine — Design

**Date:** 2026-08-04
**Status:** Draft
**Depends on:** `2026-08-04-ai-call-ledger-design.md` (telemetry), existing `build-attempt-worker`, `custom-source-generator`, `edit-attempt-worker`, `source-edit-agent`
**Read this if you have zero context:** self-contained. Explains what we replace, why, the exact response contract, recovery, edit path, build fixes, rollout flags, and how quality is measured.

## Problem

Measured production reality (from `AiCallRecord`-style analysis of UserCredit rows + generated timings):

- Successful first-generation attempts: **p50 331s, p90 726s** (39 samples).
- One instrumented case: implementation spec 18s, **agent codegen 9.5min**, build 61s.
- Main ToolLoopAgent: up to 30 steps, each step resending ~14,000–15,000 input tokens of accumulated conversation. 801 build-step charge rows ≈ 12.25M input tokens / 1.34M output.
- Build warm: 28–34s typical; split between `tsc -b` and `vite build` unknown (single timer).
- `.tsbuildinfo` files currently live under shared golden `node_modules/.tmp/` — cross-project cache collision, concurrency race.

Two plain truths:

1. The overwhelming chunk of user wait is **waiting for the model to take its next tool call**, not for thinking, not for building.
2. The fixes are: (a) fewer model round-trips, (b) a correctly-scoped build, (c) accurate telemetry — not a different AI ontology.

## Decision (what this spec is)

Replace the agent-loop path with a **structured streaming writer**: the model emits all files in a **single response** as parseable blocks; our parser writes and validates them. Keep the agent loop as the **fallback** for failed batched attempts.

Same product surface, same brief inputs, same quality gates. The change is internal: transport + orchestration, not capability.

This follows the pattern already used by external peers (Bolt: single completion emitting structured `<boltAction>` tags, parsed by the host, no tool-call loop), and Anthropic's guidance that simple workflows beat agent loops for well-defined tasks.

## Scope

- Initial generate (build queue, `runBuildAttempt`).
- Chat→rebuild (same route; treats itself as initial generate with fresh brief).
- Edit path (`source-edit-agent`) — shipped as Phase 2 after the A/B gate passes on generate.
- Build pipeline speed work (per-project caches, split timers, parallel upload, thumbnail decoupling, skip-on-unchanged-hash) — measured first.

Out of scope: model shopping per task (operator configures combos in 9Router), contract-v1 (staged engine; untouched by this spec).

## Architecture

```
brief + design directive
  → scaffoldManifest (auto-derived; zero drift)
  → messages: [ systemPrompt(scaffold, design, contract), user(brief) ]
  → streamText(model, { temperature })             ← ONE AI call
      grows: <file path="..."> ... </file> blocks streaming
  → StrictStreamingParser (state machine)
      per block → validate → stage map[path]=content
      emit UI events: "file-written", one per file
  → validate(all files):
      allow-list check, required files, TS parse, design lint
  → if fail: targeted repair prompt (implicated files only)
        retry #1: re-emit only bad files
        retry #2: re-emit only bad files with diagnostics
        if still fail: LEGACY fallback → existing ToolLoopAgent path
  → TypeScript + Vite build
  → deploy / preview
```

**Key property:** the model *responses* change; the *guarantees* (allow-list, typecheck, build) don't. Quality enforcement moves from turn-order (agent prompts) to validation after each response, which is faster and more reliable.

### Response contract

```
<file path="src/pages/home.tsx">
... full file content ...
</file>
<file path="src/pages/about.tsx">
... full file content ...
</file>
<propose path="/api/contact.ts">reason — only if absolutely needed</propose>
<done summary="Wrote 15 files covering hero, gallery, contact, pricing." />
```

Rules:

- `<file>` requires `path`. Path must start with `src/`, `public/`, or allowed scaffold prefix. Must be under the project allow-list. Must reference real dependencies only.
- File content is everything between the tags; raw text, not JSON-escaped. Trailing newline before `</file>` is optional and trimmed.
- The response is a **stream** of these blocks. Order matters only in that the model can batch per page/section.
- `<propose>` blocks go through validation and are auto-approved if valid; `build attempts` can't create new npm dependencies.
- `<done>` declares completion and carries a plain-language summary for UI/devlog.
- Unknown top-level tags → hard parse error. No tolerance — correctness over leniency at the boundary.

### Scaffold manifest — zero prompt drift

Auto-derived from `createGeneratedViteTanStackStarterFiles` (the source of truth):

```text
file tree + for each "contract file" (router registration, layout, key component slots)
its full content or the contract part
+ available utility/component names
```

No human maintains this manifest. A drift unit test asserts: `deriveScaffoldManifest(starterFiles) === expected snapshot`, so any scaffold change breaks the test and forces a conscious decision. This is how we avoid the "update the prompt when the scaffold changes" trap.

### Validation gates (in order, fail-fast)

For each staged file immediately on parse:

1. Path ∈ allow-list (no new top-level, no absolute imports outside scaffold).
2. Content parses as TS/TSX (`ts.transpileModule` — cheap) or valid asset/JSON.
3. Allow-listed dependency imports only.

Across the stage after `<done>`:

4. Required files present (e.g. router registration, root layout, index route).
5. Design-linter: no external placeholder URLs, no banned hex classes, theme tokens present. (Deterministic; differs from AI's self-judgment.)
6. Final TypeScript compile on the full project (existing).
7. Final Vite build (existing).

Any validation failure: targeted repair on *those* files, with the diagnostics for *those* files. Never re-emit the whole project.

### Fallback: the agent loop stays

Two failure paths trigger the existing ToolLoopAgent with the same brief:

- The batched response fails validation twice.
- The model emits malformed/no `<file>` blocks after the parser-repair retry.

The legacy path is unchanged code under a different entry condition. If the new engine is buggy at scale, flipping `batched_rollout: off` re-enables legacy for ALL attempts with no data migration.

## Recovery, durability, refresh safety

| Event | Handling |
|---|---|
| Browser refresh / disconnect | Nothing breaks — SSE is an observer over Redis/BullMQ. Job continues server-side. User re-tails from the DB on next load. |
| Server process dies | BullMQ lease (15min) expires; `project-attempt` worker marks attempt failed via `isStaleBuildAttempt` mechanism; user retries cleanly. No zombie state. |
| Mid-stream crash | Per-file write-through: each staged file persists to `Project.sourceFiles` via the progressive saver (`createProgressiveSaver`, same hook as the legacy agent loop) as its `</file>` closes. On crash, the BullMQ lease expires and a fresh attempt resumes against the persisted partial stage instead of losing it. **Resume-missing-files continuation prompt deferred** (2026-08-05): the wire-up cost exceeds the win for a single-shot writer whose full retry costs one response; the fresh attempt regenerates any missing files. Revisit only if batch corpora exceed ~30 files per attempt. |
| Model abort / HTTP error | Transport retry ×2 with exponential backoff; then targeted format-repair ×1; then legacy fallback. |
| Validation parse error (bad tag) | Format-repair prompt: "Your previous response had malformed blocks at byte offsets X,Y — re-emit only those." Max 1 retry of this kind. |
| Validation gate fail | Targeted repair prompt with only implicated files + rule text. Max 2 of these. |
| BullMQ job fail | attempts: 1, existing behavior. Users can retry themselves. |

All of it writes `AiCallRecord` rows with `task="build-step"`, `phase="writer|repair|format-repair|fallback"`, `retryCount`, and the per-call TTFT/latency so debugging is exact.

## Edit path (Phase 2)

Edit = batched target-file repair:

1. From instruction + annotation (UI supplies DOM context), deterministic file-target selection: fetch the specific file(s) by path, path match, instruction keywords match. If ambiguous: model-ask `which files are relevant?` using the file tree only.
2. Inline those files + scaffold manifest in the prompt.
3. Model emits `<file>` blocks for *only* the ones being changed.
4. Same validation gates; same repair loop; same legacy-loop fallback.

`read-first` replaces the discuss-style tool-loop **only if** the deterministic route can't identify files unambiguously. Targeted edit doesn't explore. Exploration is a product problem for discoverability, not generation.

## Build speed work (measured, then shipped)

Instrument first, then in order:

1. **Split the timer**: `tscMs` vs `viteMs`. Patch `generated-source.ts` to capture both.
2. **Per-project caches**: move `tsBuildInfoFile` and Vite's `cacheDir` under `<workspace>/.cache/generated-app/` — workspace-local so concurrent builds don't block each other on the golden `node_modules`.
3. **Parallel artifact upload**: per-file uploads in bounded parallel on a reused S3 client. Manifest goes last.
4. **Skip-build-on-unchanged-hash**: hash sourceFiles; if it matches the workspace's existing hash, return early from `buildGeneratedProject`.
5. **Thumbnail decoupling**: mark `done` after deployment commit, then spawn thumbnail best-effort. UI's existing fallback gradient handles absent thumbs.
6. **Concurrency benchmark**: vary build concurrency (1,2,3) and pick the best p50/p95. Don't guess.

## Rollout

Setting: `generation.batched_rollout` — values: `off`, `internal`, `pilot`, `all`.

- `off` — always legacy (current behavior).
- `internal` — projects whose owner accounts are flagged internal-only (pinned test briefs).
- `pilot` — percent rollout (e.g. 10%) chosen deterministically per project id.
- `all` — default on.

Flag is admin-readable in the settings page (`generation.batched_rollout`).

Two phases inside this spec:

- **Phase 1**: Generate (`runBuildAttempt`) only, A/B on. Confirm first-green-rate ≥ legacy, wall-time p50 improvement ≥ 5×.
- **Phase 2**: Edit path, only if Phase 1 proves out.

## Metrics / A/B harness

The appeal, in one table:

| Metric | Legacy p50 | Target p50 |
|---|---|---|
| First-generation wall clock | 331s | ≤ 90s |
| Spec | 18s | 18s (unchanged) |
| Agent/write phase | 9.5min | 30–60s |
| Build | ~30s | ~10–20s |
| First-green rate, generate | measured | ≥ legacy |
| Quality-gate pass rate | measured | ≥ legacy |
| Repair rate | measured | ≤ legacy |
| Energy per project run | ~197k | measured |

The A/B harness runs both engines on a fixed brief corpus and records the metrics to `AiCallRecord`. Ship decision is data-driven, not aesthetic.

## Exact telemetry expectations

Every new AI call populates `AiCallRecord`:

- `task="build-spec"` one row per spec attempt.
- `task="build-step"`, `phase="writer"` one row per batched generate response (there's usually one).
- `task="build-repair"` per repair round.
- `task="build-step"`, `phase="fallback"` if legacy kicks in.

`retryCount`, `modelServed`, `ttftMs`, gates. `hedged: false` — build never hedges.

Why this exists: the old logs claimed Warnet took 9.5min for agent codegen; we couldn't confirm without instrumentation. This spec makes that confirmation trivial.

## What we are NOT doing

- No new opaque agent "planner/worker/judge" sub-agents.
- No contract-v1 rewrite. The contract-v1 spec stays; it's orthogonal.
- No dev-server-like live preview (would trivialize the build cost but changes the UX requirements; that's another conversation).
- No user-visible prompt-engine UI for the response contract — internal only.

## Risks (named, with answers)

| Risk | Answer |
|---|---|
| Model emits malformed structure | Strict parser + format-repair retry + fallback. Gates enforce "never ship unparseable." |
| Model can't handle 20 files in one shot | Prompt scaling mitigations: batch by page group. Validators + repair loop keep it bounded. A/B decides. |
| One bad file ruins whole generate | Targeted repair with diagnostics from validation. |
| Streaming response gets cut off mid-way | Per-file write-through (persisted stage survives the crash; see Recovery). The fresh attempt regenerates missing files; the targeted resume-missing-files continuation prompt is deferred as disproportionate (see Recovery row). |
| `batched_rollout=all` ships a bad engine | Instant rollback via flag; DB state untouched. Tests + staging flag catch it first. |

## Success criteria ("ship gate")

1. Phase 1 deployed behind `internal` flag passes dev smoke (a real generate through the new engine).
2. A/B harness has measured both engines on ≥ 8 real briefs.
3. Phase 1 hits: wall-time p50 ≤ 90s, first-green-rate ≥ legacy, repair-rate ≤ legacy.
4. Edit path batched (Phase 2) follows same gate.
5. Build pipeline timings (Task 1 of build work) show tsc/vite split and are logged to `AiCallRecord`.
6. Rollback: flip `batched_rollback: off` in admin and the legacy engine runs clean on the same inputs.
