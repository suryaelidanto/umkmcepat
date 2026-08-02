# Discuss + Build Speed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ~10× faster generate wall (~11 min thrash case → ~1 min warm) and snappier discuss, without removing the generate agent or repair safety nets, and without a preset-template product.

**Architecture:** Separate discuss vs build BullMQ queues; cap discuss card AI repair at one then text-only; tighten generate ToolLoopAgent harness (plan checklist, anti-thrash, verify-in-loop, verified stop); pre-warm shared `node_modules`; pass AI SDK `reasoning: "none"`; keep post-vite repair×2; emit phase timings.

**Tech stack:** BullMQ, Vercel AI SDK (`streamText`, `generateText`, `ToolLoopAgent`), existing scaffold + `shared-node-modules`, Prisma progress events, Bun + Vitest.

**Spec:** `docs/superpowers/specs/2026-08-02-discuss-build-speed-design.md`

## Global constraints

- No model A/B or 9Router combo redesign in app code.
- Keep generate agent and repair×2 code paths (do not delete).
- No dummy discuss cards or invented brief fields.
- Scaffold remains shell only; agent still customizes per UMKM.
- Interview ≥10 questions out of scope.
- User-facing product copy Indonesian; developer docs/code/logs English.
- Docs updated in the same change when behavior/setup changes.
- Surgical diffs; match surrounding style; no drive-by refactors.
- Pre-commit / CI gates: do not bypass. Prefer focused tests during iteration; `bun run check` before handoff without push.
- Never commit secrets or print env values.

## File map

| Area | Primary files |
|------|----------------|
| Queues | `src/lib/projects/attempt-queue.ts`, boot path that calls `startAttemptQueueWorker` |
| Discuss | `src/lib/projects/discuss-turn-worker.ts`, `src/lib/projects/discuss-turn-shared.ts`, `src/lib/ai-timeouts.ts` |
| Enqueue sites (route only if needed) | `src/routes/api.projects.preview.ts`, generate/edit routes (kind routing inside queue helper preferred) |
| Reasoning | `src/lib/ai.ts` + call sites below |
| Harness | `src/lib/projects/agent-loop-detector.ts`, `src/lib/projects/custom-source-generator.ts` |
| Build worker | `src/lib/projects/build-attempt-worker.ts` (timings; keep repair loop) |
| Shared NM | `src/lib/projects/shared-node-modules.ts` + boot |
| Tests | existing `*.test.ts` next to modules; extend rather than invent frameworks |
| Docs | this plan + design spec; `DEV.md` only if operator-facing queue names change |

### AI call sites to wire `reasoning: "none"` (Task 3)

- `src/lib/projects/discuss-turn-worker.ts` — `streamText`
- `src/lib/projects/discuss-turn-shared.ts` — repair `generateText`
- `src/lib/projects/build-attempt-worker.ts` — spec `generateText`
- `src/lib/projects/custom-source-generator.ts` — `ToolLoopAgent`
- Optional same PR: `src/lib/projects/source-edit-agent.ts`

---

### Task 1: Separate discuss vs build queues

**Files:**
- Modify: `src/lib/projects/attempt-queue.ts`
- Modify: boot/register that starts the attempt worker (search `startAttemptQueueWorker`)
- Test: add/extend tests co-located with attempt-queue if present; otherwise new `attempt-queue.discuss-split.test.ts`

**Interfaces:**
- Consumes: existing `AttemptJob` union (`discuss` | `generate` | `edit` | `edit-build`)
- Produces: discuss jobs on discuss queue name; others on `ATTEMPT_QUEUE_NAME` (`project-attempt`)

- [ ] **Step 1: Document constants**

```ts
export const ATTEMPT_QUEUE_NAME = "project-attempt";
export const DISCUSS_QUEUE_NAME = "project-discuss";
export const DEFAULT_DISCUSS_CONCURRENCY = 5;
```

- [ ] **Step 2: Dual Queue + Worker**

  - Build worker: concurrency = `getBuildConcurrencyLimit()` (existing).
  - Discuss worker: concurrency = `DEFAULT_DISCUSS_CONCURRENCY` (or settings key later — YAGNI: constant first).
  - Both workers share fail-clean / abort patterns; discuss branch already imports `runQueuedDiscussTurn`.

- [ ] **Step 3: Route enqueue**

```ts
export async function enqueueAttemptJob(job: AttemptJob): Promise<void> {
  const jobId = jobIdFor(job);
  const queue = job.kind === "discuss" ? getDiscussQueue() : getQueue();
  await queue.add(job.kind, job, { jobId });
  // devLog kind + queue name
}
```

- [ ] **Step 4: Tests**

  - Mock or spy queue `.add` / factory: discuss → `project-discuss`; generate → `project-attempt`.
  - Expected: PASS with correct queue name per kind.

- [ ] **Step 5: Manual / integration note**

  - Start a generate, send discuss on another project; discuss must not sit behind generate lockDuration.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/attempt-queue.ts src/lib/projects/attempt-queue*.test.ts
git commit -m "feat(queue): isolate discuss jobs from build queue"
```

**Done when:** Discuss and generate never share the same BullMQ wait list.

---

### Task 2: Discuss path — one AI repair, then text-only

**Files:**
- Modify: `src/lib/ai-timeouts.ts` (`DISCUSS_CARD_SEMANTIC_ATTEMPTS` or repair loop bound)
- Modify: `src/lib/projects/discuss-turn-shared.ts` (`repairDiscussCardWithTool`)
- Modify: `src/lib/projects/discuss-turn-worker.ts` (both repair call sites ~tool-only and primary-tool-failed)
- Test: `src/lib/projects/discuss-turn-worker.test.ts` and/or `discuss-turn-shared` tests

**Behavior contract:**

1. Primary call runs as today.
2. If card missing/invalid → call repair **once** (AI).
3. If repair fails and `chatText` non-empty → persist assistant **text only**; no synthetic `workspaceCard`; no invented brief fields; turn can still `succeeded` with degraded UX.
4. If repair fails and no text → existing failed/error messaging.
5. Never invent option labels or business data.

- [ ] **Step 1: Failing tests for repair-once and text-only**

  - Mock model: primary no tool → repair fails → expect text-only persist path / no fake card type question.
  - Mock: primary no tool → repair succeeds once → card present; second repair not invoked.

- [ ] **Step 2: Cap semantic attempts**

  - Set effective repair attempts after primary to **1** (e.g. `DISCUSS_CARD_SEMANTIC_ATTEMPTS = 1` if that loop is only for repair, or pass `maxAttempts: 1` into repair helper — prefer explicit param to avoid breaking unrelated deadline math without re-reading callers).

- [ ] **Step 3: Implement text-only branch in worker**

  - When repair returns null/none and `fullText`/`chatText` present: publish finish with text; persist messages without tool card; finalize succeeded; log `discuss:text-only-fallback`.

- [ ] **Step 4: Run focused tests**

```bash
bun test src/lib/projects/discuss-turn-worker.test.ts src/lib/projects/discuss-turn-shared.ts
```

  Expected: PASS (adjust paths to actual test files).

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(discuss): one card repair then text-only, no dummy cards"
```

**Done when:** Max one post-primary card repair AI call; total fail → text-only without dummy data.

---

### Task 3: Explicit `reasoning: "none"`

**Files:**
- Modify: `src/lib/ai.ts`
- Modify: call sites listed in File map
- Test: `src/lib/ai.test.ts` (create if missing) for helper shape only

- [ ] **Step 1: Helper**

```ts
/** Best-effort: AI SDK portable flag; 9Router must forward for effect. */
export function getNoReasoningCallOptions() {
  return {
    reasoning: "none" as const,
  };
}
```

  Optional follow-up if live logs show need:

```ts
providerOptions: {
  "9router": { reasoningEffort: "none" },
}
```

  Only add if openai-compatible mapping is confirmed; do not guess secrets.

- [ ] **Step 2: Spread into streamText / generateText / ToolLoopAgent options**

  - Match each call’s option bag style; TypeScript must accept `reasoning` on current `ai` package (already in installed types).

- [ ] **Step 3: Unit test**

  - `expect(getNoReasoningCallOptions()).toEqual({ reasoning: "none" })`.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(ai): pass reasoning none on discuss and generate calls"
```

**Done when:** Hot paths include `reasoning: "none"`. Document best-effort in design (already) / DEV if operators need it.

---

### Task 4: Generate harness — plan, thrash, verify, stop

**Files:**
- Modify: `src/lib/projects/agent-loop-detector.ts` (+ tests)
- Modify: `src/lib/projects/custom-source-generator.ts` (+ existing tests)
- Do **not** remove repair loop in `build-attempt-worker.ts`

**Requirements (from design amendment):**

1. **Plan checklist** — feed implementation spec / derived file goals into agent instructions so work is checklist-driven.
2. **Anti-thrash** — extend detector: consecutive failed `replace_in_file`, repeated reads of same path without intervening successful write.
3. **Verify-in-loop** — after meaningful write/replace, bias toward `check_app` before more thrash; keep existing home-before-check guards.
4. **Stop when verified** — step/energy/abort remain; add/use quality+home signals so stop is not “model said done” with empty shell; keep stale-starter protection.
5. **Write bias** — failed replace → nudge → prefer `write_file` for large same-path rewrites.
6. **Keep** `toolChoice: "required"`, maxSteps from `getAgentMaxSteps("generate")`, repair after vite.

- [ ] **Step 1: Loop detector tests (fail first)**

  - Exact-repeat still works (existing).
  - N failed replaces on same path → hardCap or strong nudge.
  - Read-storm without write → nudge/hardCap.

- [ ] **Step 2: Implement detector extensions**

  - Keep API simple (`track(tool, args)` + optional result status if needed for replace failures).

- [ ] **Step 3: Wire detector + instructions in custom-source-generator**

  - Pass replace failure into track.
  - Instruction block: plan checklist, verify after writes, stop when checklist+check green, no thrash.

- [ ] **Step 4: Custom stopWhen if needed**

  - AI SDK allows combining `isStepCount` with custom predicates; only add if quality-ok can be observed mid-loop without breaking energy charger.

- [ ] **Step 5: Run tests**

```bash
bun test src/lib/projects/agent-loop-detector.test.ts src/lib/projects/custom-source-generator.test.ts
```

- [ ] **Step 6: Commit**

```bash
git commit -m "fix(generate): harness anti-thrash and verified stop"
```

**Done when:** Simulated thrash stops earlier; repair path still exists; no template product.

---

### Task 5: Phase timings

**Files:**
- Modify: `src/lib/projects/build-attempt-worker.ts`
- Modify: `src/lib/projects/discuss-turn-worker.ts`

- [ ] **Step 1: Generate timings**

  - `const t0 = Date.now()` at start of first_generate path.
  - Around spec / agent / vite / each repair: deltas.
  - `devLog("generate", "timings", { ... })` and optionally append one line to build log.

- [ ] **Step 2: Discuss timings**

  - primary stream duration; repair duration; `textOnly`.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(generate): emit phase timings for discuss and build"
```

**Done when:** One generate leaves a comparable timings object to the Warnet audit.

---

### Task 6: Pre-warm shared node_modules on boot

**Files:**
- Modify: `src/lib/projects/shared-node-modules.ts` (export prewarm if needed)
- Modify: `startAttemptQueueWorker` or app register after infra ready

- [ ] **Step 1: Identify golden signature source** (same as `generated-source` / ensureShared call site).

- [ ] **Step 2: Fire-and-forget prewarm**

```ts
void ensureSharedNodeModules(...).catch((err) => {
  devLog("shared-node-modules", "prewarm-failed", {
    error: err instanceof Error ? err.message : "unknown",
  });
});
```

  - Never block boot fatally if prewarm fails (build path still installs/falls back).

- [ ] **Step 3: Tests** — existing shared-nm tests still pass; no double-install race (mutex/signature already).

- [ ] **Step 4: Commit**

```bash
git commit -m "perf(build): prewarm shared node_modules on worker boot"
```

**Done when:** Cold process first generate usually `installSkipped: true`.

---

### Task 7: Docs + verification gate

**Files:**
- Already created: design + this plan (update if implementation diverges).
- Modify: `DEV.md` only if queue names / prewarm need operator docs.
- Optional: one line in `CHANGELOG.md` if project convention requires user-facing note.

- [ ] **Step 1: Align DEV.md Attempt queue section** with discuss vs build queues.

- [ ] **Step 2: Run focused tests for all touched modules.**

- [ ] **Step 3: `bun run check`** before handoff without push.

- [ ] **Step 4: Manual smoke**

  1. Discuss while another project generates → discuss completes.
  2. Force bad card path in test → one repair then text-only.
  3. Generate a simple UMKM brief → timings log; note agentMs / repairAttempts.
  4. Confirm repair still runs if vite forced red (optional controlled test).

- [ ] **Step 5: Final commit if docs-only delta remains.**

**Done when:** Spec/plan/DEV consistent; check green; smoke notes recorded in PR or handoff.

---

## Order

1 → 2 → 3 (parallelizable with 2 after 1) → 4 → 5 → 6 → 7  

Thin slice for early UX: Tasks 1–3. **Task 4 is required for ~10× generate.**

## Out of scope (do not implement in this plan)

- Removing repair or generate agent  
- Preset UMKM templates as product  
- Model combo changes  
- Interview 10-question minimum  
- Dummy discuss fallbacks  
- Multi-agent product architecture  

## Success criteria (copy from design)

1. Discuss never blocked by generate on the same wait list.  
2. Discuss ≤1 card repair AI call; then text-only without dummy data.  
3. Generate timings show agent ≪ 9 min on thrash-prone briefs.  
4. Repair still available; rate lower.  
5. `reasoning: "none"` on hot call options.  
6. Warm generate competitive with ~60 s when agent behaves.

## Spec coverage

| Design requirement | Task |
|--------------------|------|
| Separate queues | 1 |
| Discuss repair then text-only | 2 |
| reasoning none | 3 |
| Plan checklist + thrash + verify + stop | 4 |
| Keep repair | 4 (non-deletion) + existing worker |
| Timings | 5 |
| Pre-warm NM | 6 |
| Docs | 7 |

## Execution handoff

After this plan is approved for coding:

1. **Subagent-driven (recommended)** — one task per subagent + review between tasks.  
2. **Inline** — execute tasks in session with checkpoints.

Do not start Task 4 before 1–2 land if discuss latency is the first user pain; do not claim 10× until Task 4 + timings land.
```