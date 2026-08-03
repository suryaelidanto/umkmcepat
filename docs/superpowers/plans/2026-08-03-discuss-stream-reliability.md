# Discuss Stream Reliability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discuss chat always streams or settles without hard refresh: shared Redis progress bus, SSE DB terminal fallback, text-only protocol events, and client preparing settle — without inventing cards or undoing dual-queue/server-owned turns.

**Architecture:** Worker publishes UIMessageChunk-shaped progress to Redis (plus optional local buffer). POST preview SSE subscribes and **also** polls `ProjectChatTurn` until terminal or hard ceiling. Text-only still emits `{ type: "none" }` tool stream events. Client clears preparing when stream ends with text-only. Persist remains worker-owned.

**Tech stack:** Redis (`getRedisUrl`), BullMQ discuss queue (unchanged), AI SDK `createUIMessageStream` / `useChat`, existing Prisma `ProjectChatTurn`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-03-discuss-stream-reliability-design.md`

## Global constraints

- Do not invent workspace card questions/options or brief fields on text-only fallback.
- Keep dual queues (`project-discuss` / `project-attempt`) and repair×1.
- Keep server-owned `persistProjectChatTurn` in the worker (not in SSE execute).
- User-facing product copy Indonesian; developer docs/code/logs English.
- Surgical diffs; no drive-by refactors.
- Never commit secrets; env examples use empty `""`.
- Pre-commit / `bun run check` before handoff; focused tests during iteration.
- Bun only; work from `dev`.

## File map

| Area | Primary files |
|------|----------------|
| Progress bus | `src/lib/projects/discuss-turn-pubsub.ts`, tests |
| Redis helper (if split) | `src/lib/projects/discuss-progress-redis.ts` (optional; only if pubsub file grows) |
| Worker | `src/lib/projects/discuss-turn-worker.ts` |
| Fail-clean | `src/lib/projects/attempt-queue.ts` |
| POST SSE | `src/routes/api.projects.preview.ts` |
| GET resume stream | `src/routes/api.projects.$id.turns.$turnId.stream.ts` |
| Client | `src/components/projects/WorkspaceShell.tsx`; extract pure settle helper if needed |
| Docs | `DEV.md`, this plan, design spec |

---

### Task 1: Shared progress bus (Redis + buffer + API)

**Files:**

- Modify: `src/lib/projects/discuss-turn-pubsub.ts`
- Modify/create tests: `src/lib/projects/discuss-turn-pubsub.test.ts`
- Optional: `src/lib/projects/discuss-progress-redis.ts` if redis client isolation helps

**Interfaces:**

- Consumes: `getRedisUrl()` from `@/lib/redis-url`
- Produces (keep call sites stable where possible):

```ts
export type DiscussProgressEvent = { type: string; [key: string]: unknown };

export function publishProgress(
  turnId: string,
  event: DiscussProgressEvent,
): void;

export function subscribeProgress(
  turnId: string,
  onEvent: (e: DiscussProgressEvent) => void,
): () => void;

export function readTurnState(turnId: string): "live" | "gone";
```

- Publish is **sync fire-and-forget** from callers today; keep sync signature and schedule Redis IO internally (void promise + catch log). Do not make every worker call site async unless necessary.
- Subscribe must: (1) deliver buffered events for this turn if any, (2) deliver live events, (3) return unsubscribe that stops both local and Redis subscription.
- Redis: use a dependency already available for BullMQ (ioredis is typically pulled by bullmq — verify in `package.json` / lockfile; if not direct, add only if required, prefer existing).
- Channel key: `discuss-progress:{turnId}`.
- Buffer: per-turn event array (cap e.g. 500 events or until terminal + 30s delete). On `finish`/`error`, schedule channel cleanup after 30s (existing grace).
- If Redis is down: publish logs failure, still mutates local buffer so same-process tests and same-process deploys work; correctness for multi-process relies on Task 2 DB poll.

- [ ] **Step 1: Failing tests for cross-subscriber delivery**

```ts
// discuss-turn-pubsub.test.ts (extend)
it("delivers buffered events to a late subscriber", () => {
  publishProgress("t-late", { type: "text-delta", id: "x", delta: "hi" });
  const seen: string[] = [];
  const unsub = subscribeProgress("t-late", (e) => {
    seen.push(String(e.type));
  });
  expect(seen).toContain("text-delta");
  unsub();
});

it("notifies subscriber of finish", () => {
  const seen: string[] = [];
  const unsub = subscribeProgress("t-fin", (e) => {
    seen.push(String(e.type));
  });
  publishProgress("t-fin", { type: "finish" });
  expect(seen).toContain("finish");
  unsub();
});
```

  If Redis is hard to unit-test, inject a test double:

```ts
export function __setDiscussProgressBackendForTests(
  backend: DiscussProgressBackend | null,
): void;
```

- [ ] **Step 2: Implement Redis-backed publish/subscribe + local buffer**

  - Local buffer always updated on publish (for late local subscribers + tests).
  - Redis PUBLISH JSON-serialized event (size-safe: do not put huge payloads; tool inputs already small).
  - Redis SUBSCRIBE on first subscribe for that turn (or shared subscriber multiplexing — implementer choice; keep simple: per-turn subscribe is OK at discuss scale).
  - `readTurnState`: `live` if local channel exists OR Redis key/buffer marker exists; keep semantics usable for GET stream route.

- [ ] **Step 3: Run tests**

```bash
bunx vitest run --project unit src/lib/projects/discuss-turn-pubsub.test.ts
```

  Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/projects/discuss-turn-pubsub.ts src/lib/projects/discuss-turn-pubsub.test.ts
# + optional redis helper
git commit -m "feat(discuss): share progress bus over Redis with local buffer"
```

**Done when:** Late subscribers get buffered events; finish notifies; Redis failure does not throw out of `publishProgress`.

---

### Task 2: SSE terminal fallback (POST preview + GET turn stream)

**Files:**

- Modify: `src/routes/api.projects.preview.ts` (discuss tail `createUIMessageStream` execute)
- Modify: `src/routes/api.projects.$id.turns.$turnId.stream.ts`
- Test: `src/routes/-api.projects.preview.discuss.test.ts` (extend) and/or unit helper tests

**Interfaces:**

- Consumes: `subscribeProgress`, Prisma `projectChatTurn`, existing `createUIMessageStream` / `createUIMessageStreamResponse`
- Produces: helper preferred for reuse:

```ts
// e.g. src/lib/projects/discuss-turn-sse-tail.ts
export async function runDiscussProgressTail(options: {
  turnId: string;
  write: (event: DiscussProgressEvent) => void;
  pollIntervalMs?: number; // default 1500
  hardCeilingMs?: number; // default from turn TTL or 8 * 60_000
  isTerminalDb: () => Promise<
    | { kind: "running" }
    | { kind: "succeeded" }
    | { kind: "failed"; errorText: string }
    | { kind: "cancelled"; errorText: string }
    | { kind: "missing" }
  >;
}): Promise<void>;
```

  Behavior:

  1. Subscribe progress → `write` each event; on `finish`/`error` resolve.
  2. Interval poll `isTerminalDb`; if terminal and no terminal event written yet → `write({ type: "finish" })` or `write({ type: "error", errorText })` then resolve.
  3. Hard ceiling → `write` error with Indonesian user message, resolve.
  4. Always unsubscribe / clear timers.

- [ ] **Step 1: Unit tests for tail helper**

```ts
it("resolves via DB succeeded when no live publish", async () => {
  const events: string[] = [];
  let status: "running" | "succeeded" = "running";
  const done = runDiscussProgressTail({
    turnId: "t1",
    write: (e) => events.push(String(e.type)),
    pollIntervalMs: 10,
    hardCeilingMs: 2000,
    isTerminalDb: async () =>
      status === "succeeded" ? { kind: "succeeded" } : { kind: "running" },
  });
  status = "succeeded";
  await done;
  expect(events).toContain("finish");
});
```

- [ ] **Step 2: Implement helper + wire POST preview execute**

  Replace bare `subscribeProgress` + `await tailDone` with `runDiscussProgressTail`.  
  `isTerminalDb` loads turn by id for project (preview already has project context / turnId).

- [ ] **Step 3: Wire GET `/turns/$turnId/stream` to same helper when channel live; keep DB replay when gone**

  When `readTurnState === "live"` use tail helper. When gone, existing DB replay stays (succeeded → finish, etc.). Optionally improve succeeded replay later to include full message; out of scope if client already `reloadLatestChat` on resume.

- [ ] **Step 4: Run tests**

```bash
bunx vitest run --project unit \
  src/lib/projects/discuss-turn-sse-tail.test.ts \
  src/routes/-api.projects.preview.discuss.test.ts
```

  Expected: PASS (adjust paths if helper colocated).

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(discuss): terminate SSE via DB poll if progress bus misses"
```

**Done when:** SSE ends without any `publishProgress` if DB row becomes succeeded/failed.

---

### Task 3: Text-only stream protocol (worker)

**Files:**

- Modify: `src/lib/projects/discuss-turn-worker.ts` (hasCard false branch)
- Modify: `src/lib/projects/discuss-turn-worker.test.ts`

**Behavior contract:**

1. Progressive text unchanged.
2. When `!hasCard` and `chatText` non-empty: **publish** `tool-input-available` + `tool-output-available` with `workspaceCard: { type: "none" }` (and projectTitle), **then** persist text-only / none card as product rules require, **then** `finish`.
3. Do not invent question options or brief patches.
4. Keep `discuss:text-only-fallback` log.

- [ ] **Step 1: Failing test**

```ts
it("publishes none tool events on text-only fallback", async () => {
  // mock primary text, repair fail / none card
  // assert publishProgressMock called with tool-output-available
  // and workspaceCard.type === "none"
  // and finish
});
```

- [ ] **Step 2: Implement publish of none tool events before finish on text-only path**

  Mirror the structure of the `hasCard` branch for tool publish only; keep persist without inventing brief.

- [ ] **Step 3: Run tests**

```bash
bunx vitest run --project unit src/lib/projects/discuss-turn-worker.test.ts
```

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(discuss): emit none card tool events on text-only stream"
```

**Done when:** Text-only path always emits tool-output `none` + finish; no dummy questions.

---

### Task 4: Client settle after stream (no endless preparing)

**Files:**

- Modify: `src/components/projects/WorkspaceShell.tsx` (status effect ~1686–1754 and preparing effect ~1530–1605)
- Prefer extract pure helper for testability:

```ts
// e.g. src/components/projects/discuss-chat-settle.ts
export function settleDiscussAfterChatReady(input: {
  toolCard: { workspaceCard: WorkspaceCard; projectTitle?: string } | null;
  lastAssistantHasText: boolean;
  mode: "discuss" | "build";
  answeredPreviousQuestion: boolean;
}): {
  clearPreparing: boolean;
  setCardError: boolean;
  enterPreparingPoll: boolean;
  applyToolCard: boolean;
};
```

**Rules (from spec):**

- Non-`none` tool card → apply card, clear preparing, no error.
- Text-only (text + no non-none card) after ready → clear preparing, **do not** set card error solely for intentional none.
- Do not start preparing poll for “answered previous” if this transition already completed a text-only assistant for the turn (use tool none or last assistant text without new card).

- [ ] **Step 1: Unit tests for settle helper**

```ts
it("clears preparing on text-only ready", () => {
  const r = settleDiscussAfterChatReady({
    toolCard: { workspaceCard: { type: "none" } },
    lastAssistantHasText: true,
    mode: "discuss",
    answeredPreviousQuestion: true,
  });
  expect(r.clearPreparing).toBe(true);
  expect(r.enterPreparingPoll).toBe(false);
  expect(r.setCardError).toBe(false);
});
```

- [ ] **Step 2: Wire WorkspaceShell status effect to helper**

- [ ] **Step 3: Run tests + typecheck if needed**

```bash
bunx vitest run --project unit src/components/projects/discuss-chat-settle.test.ts
```

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(discuss): settle preparing on text-only stream end"
```

**Done when:** Text-only turn leaves composer usable without hard refresh when SSE ends.

---

### Task 5: Observability + DEV docs + verification

**Files:**

- Modify: `DEV.md` (Attempt queue / discuss section)
- Optional: tighten `devLog` on enqueue + publish fail + tail fallback reason in preview helper
- Spec already written; update plan checkboxes as you go

**DEV.md must state:**

1. Discuss progress uses Redis + local buffer; requires same Redis as BullMQ.
2. SSE falls back to `ProjectChatTurn` terminal poll.
3. Dual queues still apply.
4. Text-only: no invented cards; stream may include `type: "none"` tool events.

- [ ] **Step 1: Update DEV.md**

- [ ] **Step 2: Add one log line when tail closes via DB fallback**

```ts
devLog("discuss", "sse-tail-db-fallback", { turnId, kind: "succeeded" });
```

- [ ] **Step 3: Focused tests + `bun run check`**

```bash
bunx vitest run --project unit \
  src/lib/projects/discuss-turn-pubsub.test.ts \
  src/lib/projects/discuss-turn-worker.test.ts \
  src/routes/-api.projects.preview.discuss.test.ts
bun run check
```

- [ ] **Step 4: Manual smoke checklist**

  1. Send discuss message → text streams live; ready without refresh.
  2. Force invalid card path (or env mock) → repair once → text-only or card; UI settles.
  3. Optional: stop Redis briefly after enqueue (hard) or mock publish fail → SSE still ends after worker finalize.
  4. Confirm 1 vs 2 model calls matches card success vs repair.

- [ ] **Step 5: Commit docs**

```bash
git commit -m "docs(dev): discuss progress bus and SSE terminal fallback"
```

**Done when:** Spec/plan/DEV aligned; check green; smoke notes recorded in PR/handoff.

---

## Order

1 → 2 → 3 → 4 → 5  

Task 3 can parallel Task 2 after Task 1 if two agents; Task 4 depends on Task 3 for full text-only UX.

## Out of scope

- Generate/build progress Redis migration (optional follow-up)
- Raising repair attempts
- In-request AI generation again
- Dummy business cards

## Success criteria (from design)

1. Live discuss without hard refresh on single-container deploy.  
2. Text-only settles cleanly.  
3. DB poll terminates SSE if progress bus drops.  
4. Call count contract documented and observed.  
5. Tests + check green.

## Spec coverage

| Design requirement | Task |
|--------------------|------|
| Redis progress bus | 1 |
| Local buffer / late subscriber | 1 |
| SSE DB poll terminal | 2 |
| GET turn stream consistent | 2 |
| Text-only tool `none` events | 3 |
| Client preparing settle | 4 |
| DEV + logs + smoke | 5 |

## Execution handoff

After plan approval:

1. **Subagent-driven (recommended)** — one task per subagent + review.  
2. **Inline** — execute in session with checkpoints.

Do not claim “fixed forever loading” until Task 2 + manual smoke pass.
