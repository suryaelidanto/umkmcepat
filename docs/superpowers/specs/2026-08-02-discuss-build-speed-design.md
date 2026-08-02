# Discuss + Build Speed — Design

**Date:** 2026-08-02  
**Status:** Approved (brainstorm + multi-pass research freeze)  
**Study case:** project `cmsbquu2r00024lr8mwkxy74o` (Website Promosi Warnet)  
**Related:** `docs/superpowers/specs/2026-07-22-generation-speed-design.md` (shared node_modules / loop detector baseline — already largely shipped)

## Problem

End-to-end discuss → generate felt multi-minute to multi-ten-minute for reasons the codebase owns (queues, agent harness, extra AI repairs), not only model choice.

### Measured (Warnet generate)

| Phase | Wall clock (approx) |
|-------|---------------------|
| Discuss before Mulai build | ~3.5 min conversation |
| Implementation spec | ~18 s |
| **Agent codegen** | **~9.5 min** (dominant) |
| Quality + snapshot | seconds |
| Vite + repair 1/2 | ~61 s |
| Ready / deploy | seconds |
| **Build total** | **~11 min** |

Working projects with warm shared `node_modules` already show vite-only `[umkm:build] timings` of **~28–34 s** (`installSkipped: true`) or **~34–70 s** with cold install. **Install is not the 11-minute story; agent thrash is.**

### Discuss pain

1. Discuss jobs share BullMQ `project-attempt` with generate/edit → chat can wait behind a long build.
2. Invalid/missing workspace card triggers up to **3** semantic AI repairs (`DISCUSS_CARD_SEMANTIC_ATTEMPTS = 3` × ~45 s budget each).
3. App never sets AI SDK `reasoning: "none"`; thinking tax is whatever 9Router + child model default to.

## Goals

| Metric | Before | Target |
|--------|--------|--------|
| Generate wall (thrash-class brief) | ~11 min (~660 s) | **~1 min** warm (~60 s) |
| Agent codegen phase | ~9.5 min | **~20–40 s** |
| Vite (warm deps) | ~15–40 s | same order (always runs) |
| Cold golden install | ~20–30 s first time | **~0 s** after boot pre-warm |
| Discuss queue wait behind generate | minutes possible | **~0** |
| Card AI repairs after primary | up to 3 | **1 max**, then text-only |
| Healthy discuss turn | ~3–30 s | modest win; model-bound |

**Ratio:** thrash generate **~11 min → ~1 min ≈ 10×** is the primary product target for generate. Discuss 10× on a healthy single call is **not** the claim; discuss wins are queue isolation + repair cap.

## Non-goals

- Model A/B testing or 9Router combo redesign (operator-owned).
- Removing the generate agent or the post-vite repair×2 safety net.
- Preset / template-only UMKM product (copy-swap sites without agentic file writes).
- Interview “minimum 10 questions” backlog (deferred).
- Dummy discuss cards, invented brief fields, or synthetic business data.
- Multi-agent product rewrite (planner/worker/judge as a new product surface).
- Skipping vite or sharing a prebuilt dist across projects.

## Principles (research-aligned)

1. **Harness > model shopping** — Anthropic effective harnesses; OpenAI harness engineering; AI SDK loop control.
2. **Keep safety nets; fix the engine** so repair rarely runs (user requirement).
3. **One product generate** — agent still writes real files per brief; no dual “first paint product vs polish product.”
4. **Scaffold = existing shell only** — Vite + React + TanStack + Tailwind + shadcn starter; agent customizes per UMKM.
5. **Verify-in-loop** — Claude Code: give the agent a pass/fail check; Boris Cherny: verify loop multiplies quality.
6. **Stop when verified done** — not thrash forever; not empty early “done” (Anthropic failure modes).
7. **Separate latency classes** — BullMQ: chat vs long jobs → separate queues (or strong priority; we choose separate).

## Architecture

```text
Discuss path:
  User message
    → claim discuss turn
    → enqueue DISCUSS queue (not build queue)
    → streamText + presentWorkspaceCard
    → if card invalid/missing → ONE AI repair
    → if still fail → text-only assistant (no synthetic card/brief)
    → persist + finish turn

Generate path:
  Mulai build
    → claim op lease
    → enqueue BUILD queue (project-attempt)
    → implementation spec (keep; optional later simplify)
    → ToolLoopAgent on scaffold shell
         plan checklist from spec
         write/replace tools
         check_app discipline
         anti-thrash / stopWhen verified
    → vite (shared node_modules when warm)
    → if red → repair agent × up to 2 (KEEP)
    → dist + preview deploy
```

### Scaffold clarification

**Scaffold** already means the platform-owned starter tree (`createGeneratedViteTanStackStarterFiles`). It is **not** a catalog of UMKM templates. This design does **not** replace agentic generation with “pick Warnet template and change copy.”

### Shared node_modules vs “vite warm”

| Term | Meaning |
|------|---------|
| Shared / golden `node_modules` | One install, symlink into workspaces; often `installSkipped: true` today |
| Vite build | Always compiles **this** project’s generated source (~10–45 s typical) |
| Boot pre-warm | Ensure golden exists at process start so first user never pays cold install |

## Design sections

### 1. Queues

- **Discuss queue:** e.g. `project-discuss` — worker + concurrency dedicated to discuss.
- **Build queue:** keep `project-attempt` for `generate` | `edit` | `edit-build`.
- Discuss concurrency independent of `runtime.build_concurrency` (default discuss higher, e.g. 5; build stays admin-controlled).
- Fail-clean and abort registry remain jobId-scoped.

### 2. Discuss reliability path

1. Primary `streamText` + tool (unchanged intent).
2. Invalid/missing card → **exactly one** AI `repairDiscussCardWithTool` attempt (reduce semantic attempts from 3 to 1 after primary, or primary + 1 total repair).
3. Repair still fails → finalize with **chat text only** if any text exists; **do not** invent workspace card options or brief fields.
4. If no text and no card → existing clean error path for the user.
5. Metrics: `primaryMs`, `repairMs`, `textOnly: boolean`, optional queue wait.

### 3. Explicit no-reasoning preference

- AI SDK supports `reasoning: "none"` (disable if provider supports).
- App uses `createOpenAICompatible({ name: "9router", ... })` — optional `providerOptions["9router"].reasoningEffort` only if live mapping needs it.
- Wire on discuss primary, discuss repair, build spec, generate ToolLoopAgent (edit agent optional same PR or follow-up).
- **Best-effort:** if 9Router/model ignores the flag, plan still succeeds via harness work. Document in DEV/operator notes.

### 4. Generate harness (critical for ~10×)

Keep:

- `ToolLoopAgent` generate path.
- Post-vite `repairGeneratedProjectFiles` loop (up to 2) in `build-attempt-worker.ts`.
- Quality gates / stale-starter detection that prevent shipping empty shells as success.

Add / tighten:

1. **Plan checklist** — implementation spec (or short derived file list) is the checklist the agent must complete; not free wander.
2. **Anti-thrash** — extend loop detector beyond exact `(tool, args)`: failed `replace_in_file` storms, excessive same-path reads without write progress.
3. **Verify-in-loop** — after meaningful writes, prefer `check_app` (or equivalent) before more thrash; tool results must be legible pass/fail.
4. **Stop conditions** — combine step/energy/abort caps with “verified done” (agent-written home + quality ok). Avoid Anthropic’s “declare done too early” by requiring checklist + quality, not model prose alone.
5. **Write bias** — after failed replace, nudge once then prefer full `write_file` for large rewrites of the same path.
6. **Instructions** — SPEED / progress rules aligned with plan checklist; still free tool selection among allowed tools (no pin-only-write that burned reasoning budget historically).

Success metric for this section: **first vite green rate ↑**, **repairAttempts median → 0**, agent wall ≪ 9 min.

### 5. Observability

Generate log object (devLog and/or build log line):

```json
{
  "specMs": 0,
  "agentMs": 0,
  "viteMs": 0,
  "repairMs": 0,
  "repairAttempts": 0,
  "totalMs": 0,
  "installSkipped": true
}
```

Discuss:

```json
{
  "primaryMs": 0,
  "repairMs": 0,
  "textOnly": false
}
```

### 6. Pre-warm shared node_modules

On app/worker boot, fire-and-forget `ensureSharedNodeModules` for the golden signature so first generate after cold start usually skips install. Existing link + fallback-to-install behavior unchanged.

## Out of scope details (explicit)

| Item | Why |
|------|-----|
| Delete repair | User: keep nets; fix engine |
| Delete generate agent | Required for real per-file generation |
| Dual product “fast path without agent” | User rejected as main path |
| Multi-agent rewrite | Overkill for single-session UMKM generate |
| Interview 10 questions | Deferred backlog |

## Success criteria (ship gate)

1. Discuss job never shares wait list with generate.
2. Discuss: ≤1 card repair AI call after primary; then text-only without dummy data.
3. Generate timings visible for every attempt; thrash-class agentMs dramatically reduced vs Warnet baseline.
4. Repair code path still present; repair rate lower on healthy runs.
5. Hot AI calls pass `reasoning: "none"` (or documented equivalent).
6. Warm machine generate competitive with **~60 s** first ready when agent does not thrash.

## Confidence

- Direction / architecture: **~95%** (research + production timings).
- Hitting ~60 s always: **~70–80%** until Task 4 harness is proven with timings.
- `reasoning: "none"` alone: **not** the 10× bet.

## Implementation plan

See `docs/superpowers/plans/2026-08-02-discuss-build-speed.md`.
```