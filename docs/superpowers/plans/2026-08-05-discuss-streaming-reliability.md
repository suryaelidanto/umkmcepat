# Discuss Streaming & Reliability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the perceived discuss "hang" and harden the SSE transport, using t3code's snapshot/sequence/heartbeat/activity discipline while keeping our SSE stack. Ship R0 behavior locks first, then R1, R2, R4, R5, R6, R7, R8, R9, R10, R11, R12 in atomic phases; implement R3 only behind an off-by-default flag.

**Architecture:** Behavior-lock tests pin the existing structured-response / pseudo-tool contract before protocol changes. Compaction becomes a dedicated BullMQ job so the turn publishes `finish` immediately. The SSE transport gains heartbeat, snapshot, sequence, subscribe-before-snapshot, resume, and explicit activity phases. The dead Redis client is re-created on reconnect. CSP allows Google Fonts and reduces report-only noise. Reattach renders deltas.

**Tech Stack:** Bun, TypeScript, TanStack Start, Prisma/Postgres, BullMQ/ioredis, Vitest.

## Global Constraints

- Work from `dev`; atomic Conventional Commits per task.
- TDD: write failing test → run to confirm fail → implement → run to confirm pass.
- Run unit tests with `bunx vitest run --project unit <file>`. Full gate: `bun run check`.
- Use Bun only; keep `bun.lock` canonical.
- Docs are part of the change when behavior changes (this plan + spec already created).
- `git status` shows ~200 phantom modified files. Verify real state with `git diff --quiet HEAD`. Stage explicit paths only — **never** `git add -A`.
- Do NOT touch hedging (`discuss.hedging`), combos, model pricing, or R3's parallel-moderation default.
- Handoff `/tmp/umkmcepat-handoff-2026-08-05-discuss-hedging-latency.md` + commit `6bcfc38` are authoritative for hedging: keep hedging off; settings cache refresh before hedge decision already shipped.
- R3 runtime default stays serial moderation. Only add an off-by-default setting unless a separate approval explicitly enables it.
- Preserve the current structured-response / pseudo-tool contract. Do not convert cards/build recommendations into side-effectful real tool execution.
- Preserve build trigger semantics. Build starts only through the existing explicit build path.
- Preserve final persisted `messages`, `workspaceCard`, `readyForBuild`, and build recommendation semantics. Earlier progressive rendering is allowed only when the final normalized output remains equivalent.
- Do NOT "fix" tests to lower error counts; `p1`/`project_1`/`deployment_timeout` rows are fixtures.
- Never commit `.env`, secrets, uploads, logs, `.next/`, `.pi/`, `.browser/`, coverage artifacts.
- User-facing copy Indonesian; developer logs/code English.

---

## Related Work Already Shipped

- `6bcfc38 fix(discuss): refresh settings before hedging` — `runDiscussTurn()` force-refreshes settings before deciding hedging. This prevents stale `discuss.hedging` snapshots from launching hedge calls after the setting is off.
- Do not duplicate that work. Phase 1 starts with compaction after `finish`, not settings cache refresh.
- Hedging remains disabled until a separate adaptive-hedging spec optimizes visible-progress latency, not just backend completion latency.

---

### Task 0: Behavior Locks for Pseudo-Tool Contract (R0)

**Files:**
- Test: `src/lib/projects/discuss-turn-worker.test.ts`, `src/lib/projects/brief-flow.test.ts`, and/or existing workspace-card/build-recommendation tests

**Interfaces:**
- Consumes: current `present_workspace_card` envelope, `normalizeWorkspaceTurn`, `persistProjectChatTurn`, existing build recommendation card behavior.
- Produces: regression tests proving transport/card changes cannot alter build trigger semantics or final card shape.

- [ ] **Step 1: Add final-card shape regression**

Add a test that feeds the current structured/pseudo-tool input through `normalizeWorkspaceTurn` and asserts the final `workspaceCard` shape is unchanged for:
- `type: "question"` with `answerMode: "choice"`
- `type: "image_upload"`
- `type: "build_recommendation"`

Expected: final normalized cards match current snapshots/inline objects. Use explicit objects, not broad snapshots.

- [ ] **Step 2: Add no-auto-build regression**

Add or adjust a discuss worker test proving a `build_recommendation` card persists a card/output but does **not** enqueue a build/generate/edit job by itself. Build must still require the existing explicit build action.

- [ ] **Step 3: Add final-message compatibility regression**

Add a test that a successful discuss turn persists an assistant message with the same tool-envelope/structured output shape the UI currently reads via `getWorkspaceCardFromMessages`.

- [ ] **Step 4: Run focused tests**

Run: `bunx vitest run --project unit src/lib/projects/brief-flow.test.ts src/lib/projects/discuss-turn-worker.test.ts`
Expected: PASS. If adding the tests reveals current behavior is unclear, stop and ask before implementing protocol changes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/brief-flow.test.ts src/lib/projects/discuss-turn-worker.test.ts
git commit -m "test(discuss): lock structured card contract before transport work"
```

---

### Task 1: Add compaction job type, queue, worker wiring

**Files:**
- Modify: `src/lib/projects/attempt-queue.ts` (queue name, `CompactionAttemptJob`, `AttemptJob` union, `queueNameForJob`, `jobIdFor`, `enqueueAttemptJob`, `startAttemptQueueWorker` worker)
- Create: `src/lib/projects/chat-compaction-queue-worker.ts`
- Test: `src/lib/projects/attempt-queue.test.ts`, `src/lib/projects/chat-compaction-queue-worker.test.ts`

**Interfaces:**
- Consumes: `maybeCompactProjectChat` (`chat-compaction.ts:77`), `persistProjectChatCompaction` (`discuss-turn-shared.ts:82`), `chargeEnergyForAiUsage` (`user-credits.ts:275`), `getModerationModel()` (`ai-models.ts:50`), `prisma` (`@/lib/prisma`), `devLog` (`@/lib/dev-log`).
- Produces:
  - `COMPACTION_QUEUE_NAME = "project-compaction"`
  - `export type CompactionAttemptJob = { kind: "compaction"; projectId: string; turnId: string; userId: string; }`
  - `AttemptJob` union gains `CompactionAttemptJob`
  - `export async function runQueuedProjectCompaction(job: CompactionAttemptJob): Promise<void>`
  - `export function enqueueCompaction(job: CompactionAttemptJob): Promise<void>` (or reuse `enqueueAttemptJob`)

- [ ] **Step 1: Write the failing worker test**

Create `src/lib/projects/chat-compaction-queue-worker.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  maybeCompact: vi.fn(),
  persistCompaction: vi.fn(),
  charge: vi.fn(),
  moderationModel: vi.fn(),
  queryRaw: vi.fn(),
  messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] }],
  summary: { text: "s", compactedMessageCount: 0 },
  memoryFacts: { facts: [], decisions: [], preferences: [] },
}));

vi.mock("@/lib/projects/chat-compaction", () => ({
  maybeCompactProjectChat: (...a: unknown[]) => mocks.maybeCompact(...a),
}));
vi.mock("@/lib/projects/discuss-turn-shared", () => ({
  persistProjectChatCompaction: (...a: unknown[]) => mocks.persistCompaction(...a),
}));
vi.mock("@/lib/user-credits", () => ({
  chargeEnergyForAiUsage: (...a: unknown[]) => mocks.charge(...a),
}));
vi.mock("@/lib/ai-models", () => ({
  getModerationModel: () => mocks.moderationModel(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...a: unknown[]) => mocks.queryRaw(...a),
  },
}));

import { runQueuedProjectCompaction } from "./chat-compaction-queue-worker";

describe("project compaction queue worker", () => {
  it("loads chat, compacts, persists, charges at moderation model", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        chatMessages: JSON.stringify(mocks.messages),
        chatSummary: JSON.stringify(mocks.summary),
        memoryFacts: JSON.stringify(mocks.memoryFacts),
      },
    ]);
    mocks.maybeCompact.mockResolvedValue({
      compactedMessageCount: 3,
      memoryFacts: { facts: [] },
      summary: { text: "new" },
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    mocks.moderationModel.mockReturnValue("mod-model");

    await runQueuedProjectCompaction({
      kind: "compaction",
      projectId: "proj",
      turnId: "t1",
      userId: "user",
    });

    expect(mocks.persistCompaction).toHaveBeenCalledWith(
      expect.objectContaining({ compactedMessageCount: 3, projectId: "proj" }),
    );
    expect(mocks.charge).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user",
        modelId: "mod-model",
        inputTokens: 10,
        outputTokens: 5,
        reason: "discuss:compaction",
        projectId: "proj",
      }),
    );
  });

  it("does not charge or persist when no compaction needed", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        chatMessages: JSON.stringify(mocks.messages),
        chatSummary: JSON.stringify(mocks.summary),
        memoryFacts: JSON.stringify(mocks.memoryFacts),
      },
    ]);
    mocks.maybeCompact.mockResolvedValue(null);

    await runQueuedProjectCompaction({
      kind: "compaction",
      projectId: "proj",
      turnId: "t1",
      userId: "user",
    });

    expect(mocks.persistCompaction).not.toHaveBeenCalled();
    expect(mocks.charge).not.toHaveBeenCalled();
  });

  it("logs compaction-failed via devLog and does not throw", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        chatMessages: JSON.stringify(mocks.messages),
        chatSummary: JSON.stringify(mocks.summary),
        memoryFacts: JSON.stringify(mocks.memoryFacts),
      },
    ]);
    mocks.maybeCompact.mockRejectedValue(new Error("boom"));

    await expect(
      runQueuedProjectCompaction({
        kind: "compaction",
        projectId: "proj",
        turnId: "t1",
        userId: "user",
      }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run --project unit src/lib/projects/chat-compaction-queue-worker.test.ts`
Expected: FAIL — module `./chat-compaction-queue-worker` not found.

- [ ] **Step 3: Implement the worker**

Create `src/lib/projects/chat-compaction-queue-worker.ts`:

```ts
import { validateUIMessages, type UIMessage } from "ai";

import { prisma } from "@/lib/prisma";
import { devLog } from "@/lib/dev-log";
import { getModerationModel } from "@/lib/ai-models";
import {
  parseProjectChatMessages,
  parseProjectChatSummary,
  parseProjectMemoryFacts,
  dedupeUiMessages,
} from "@/lib/projects/chat-memory";
import { maybeCompactProjectChat } from "@/lib/projects/chat-compaction";
import { persistProjectChatCompaction } from "@/lib/projects/discuss-turn-shared";
import { chargeEnergyForAiUsage } from "@/lib/user-credits";
import type { CompactionAttemptJob } from "@/lib/projects/attempt-queue";

/**
 * BullMQ entry for background chat compaction. Runs AFTER the discuss turn
 * publishes `finish`, so it never delays the user. Reloads chat state from
 * DB (same as the discuss queue worker) and compacts older messages into
 * the project summary/memory. Failures are logged and swallowed — the turn
 * is already done; a dropped compaction must never block chat.
 */
export async function runQueuedProjectCompaction(
  job: CompactionAttemptJob,
): Promise<void> {
  const [row] = await prisma.$queryRaw<
    Array<{
      chatMessages: unknown;
      chatSummary: unknown;
      memoryFacts: unknown;
    }>
  >`
    SELECT "chatMessages", "chatSummary", "memoryFacts"
    FROM "Project"
    WHERE id = ${job.projectId} AND "userId" = ${job.userId}
  `;

  if (!row) {
    return;
  }

  const messages = await validateUIMessages({
    messages: dedupeUiMessages(parseProjectChatMessages(row.chatMessages)),
  });
  const summary = parseProjectChatSummary(row.chatSummary);
  const memoryFacts = parseProjectMemoryFacts(row.memoryFacts);

  try {
    const compaction = await maybeCompactProjectChat({
      correlation: { projectId: job.projectId, turnId: job.turnId },
      memoryFacts,
      messages: messages as UIMessage[],
      summary,
    });

    if (!compaction) {
      return;
    }

    await persistProjectChatCompaction({
      compactedMessageCount: compaction.compactedMessageCount,
      memoryFacts: compaction.memoryFacts,
      projectId: job.projectId,
      summary: compaction.summary,
      userId: job.userId,
    });

    await chargeEnergyForAiUsage({
      userId: job.userId,
      projectId: job.projectId,
      modelId: getModerationModel(),
      inputTokens: compaction.usage?.inputTokens ?? 0,
      outputTokens: compaction.usage?.outputTokens ?? 0,
      reason: "discuss:compaction",
    });
  } catch (error) {
    devLog("discuss", "compaction-failed", {
      projectId: job.projectId,
      turnId: job.turnId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
```

> Note: the `moderationModel`/`devLog` mocks in the test don't strictly need vi.mock for `devLog` since it's a no-op logger on miss — but if `devLog` throws in the test environment, add `vi.mock("@/lib/dev-log", () => ({ devLog: () => {} }))`. The `charge`/`persist` assertions are the meaningful ones.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run --project unit src/lib/projects/chat-compaction-queue-worker.test.ts`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Wire queue + worker in attempt-queue.ts**

Modify `src/lib/projects/attempt-queue.ts`:
- Add `export const COMPACTION_QUEUE_NAME = "project-compaction";` near `DISCUSS_QUEUE_NAME` (`:14`).
- Add `CompactionAttemptJob` type and add it to the `AttemptJob` union (`:72-73`).
- Add `compactionQueue` module var near `discussQueue` (`:82-85`).
- Add `getCompactionQueue()` mirroring `getDiscussQueue()` (`:125-131`).
- Update `queueNameForJob` (`:101-103`) and `jobIdFor` (`:140-145`).
- Update `enqueueAttemptJob` (`:147-158`) to route compaction to `getCompactionQueue()`.
- Add a `compactionWorker` + `new Worker(COMPACTION_QUEUE_NAME, …)` block in `startAttemptQueueWorker` mirroring the discuss worker (`:358-386`), dispatching to `runQueuedProjectCompaction`.
- Update the `worker.started` devLog `queues` array (`:392`).

- [ ] **Step 6: Run attempt-queue tests**

Run: `bunx vitest run --project unit src/lib/projects/attempt-queue.test.ts`
Expected: PASS. (If the test imports fixtures for `AttemptJob`, they compile fine since `CompactionAttemptJob` is additive.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/attempt-queue.ts src/lib/projects/chat-compaction-queue-worker.ts src/lib/projects/chat-compaction-queue-worker.test.ts
git commit -m "feat(discuss): run compaction as a background BullMQ job"
```

---

### Task 2: Publish `finish` before compaction in the turn worker

**Files:**
- Modify: `src/lib/projects/discuss-turn-worker.ts:1429-1451`
- Test: `src/lib/projects/discuss-turn-worker.test.ts`

**Interfaces:**
- Consumes: `enqueueCompaction`/`enqueueAttemptJob` from `attempt-queue.ts` (Task 1).
- Produces: turn publishes `finish` → finalizes → enqueues compaction (fire-and-forget, `.catch` logged).

- [ ] **Step 1: Inspect current success path**

Read `discuss-turn-worker.ts:1420-1451`. Current order: `persistProjectChatTurn` → `maybeCompactProjectChat` → `persistProjectChatCompaction` → add tokens → `chargeDiscussEnergy` → `publishProgress(finish)` → `finalizeDiscussTurn`.

- [ ] **Step 2: Write the failing test**

In `src/lib/projects/discuss-turn-worker.test.ts`, add a test asserting that on a successful turn, `finish` is published and the compaction is **enqueued** (not awaited inline). Mock `enqueueAttemptJob` (or `enqueueCompaction`) and assert it is called; assert `publishProgress(finish)` is called. (Follow the existing test harness in that file — locate how `publishProgress` and the worker are invoked, and mirror its mock style.)

- [ ] **Step 3: Run test to verify it fails**

Expected: FAIL — current code awaits compaction inline and never enqueues.

- [ ] **Step 4: Reorder the success path**

Replace `:1429-1451` so that:
1. `chargeDiscussEnergy()` runs first (with the repair/primary tokens — **not** compaction tokens).
2. `publishProgress(turnId, { type: "finish" })`.
3. `finalizeDiscussTurn({ turnId, status: "succeeded" })`.
4. Enqueue compaction as fire-and-forget:
```ts
enqueueAttemptJob({
  kind: "compaction",
  projectId: project.id,
  turnId,
  userId,
}).catch((error) => {
  console.error("[discuss] compaction enqueue failed", {
    turnId,
    error: error instanceof Error ? error.message : "unknown",
  });
});
```
Remove the now-dead compaction await, `persistProjectChatCompaction`, and the `totalInputTokens += compaction…` lines. Remove the `compaction`-related additions to `chargeDiscussEnergy`'s totals (compaction tokens now charged in the job).

- [ ] **Step 5: Run tests**

Run: `bunx vitest run --project unit src/lib/projects/discuss-turn-worker.test.ts`
Expected: PASS. Also run `src/lib/projects/discuss-turn.test.ts` and `src/lib/projects/chat-compaction.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/discuss-turn-worker.ts src/lib/projects/discuss-turn-worker.test.ts
git commit -m "fix(discuss): publish finish before background compaction"
```

---

### Task 3: Allow Google Fonts in CSP (R4)

**Files:**
- Modify: `src/lib/security-headers.ts:86-87`
- Test: search for an existing CSP test; add one if present.

**Interfaces:**
- Produces: `buildContentSecurityPolicy` includes `https://fonts.googleapis.com` in `style-src` and `https://fonts.gstatic.com` in `font-src`.

- [ ] **Step 1: Write/verify a test**

Find the CSP test file (grep `buildContentSecurityPolicy` under `src/lib`). Add:
```ts
it("allows Google Fonts hosts for style and font", () => {
  const policy = buildContentSecurityPolicy("nonce");
  expect(policy).toContain("fonts.googleapis.com");
  expect(policy).toContain("fonts.gstatic.com");
});
```
Run to confirm it FAILS.

- [ ] **Step 2: Implement**

`src/lib/security-headers.ts`:
```ts
// Tailwind injects inline styles; a nonce cannot cover them.
// Plus Jakarta Sans loads from Google Fonts (__root.tsx:86) — the font
// stylesheet's CSS and font files need the two hosts allowlisted.
"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
"font-src 'self' data: https://fonts.gstatic.com",
```

- [ ] **Step 3: Run test**

Expected: PASS. Run `bunx vitest run --project unit` on the CSP test file.

- [ ] **Step 4: Commit**

```bash
git add src/lib/security-headers.ts <csp-test-file>
git commit -m "fix(security): allow Google Fonts in CSP for brand font"
```

---

### Task 4: SSE heartbeat + `retry:` (R6)

**Files:**
- Modify: `src/lib/projects/discuss-turn-sse-tail.ts` (typed `heartbeat` event + optional raw comment callback)
- Modify: `src/routes/api.projects.$id.turns.$turnId.stream.ts` (raw `retry:` + `: ping` comment; this route owns raw SSE)
- Modify: `src/routes/api.projects.preview.ts` (typed heartbeat/activity only; do **not** inject raw SSE bytes into AI SDK's `createUIMessageStreamResponse` unless its API exposes an official hook)
- Test: `src/lib/projects/discuss-turn-sse-tail.test.ts`, `src/lib/projects/build-attempt-pubsub.test.ts` (for `encodeSseEvent`)

**Interfaces:**
- Produces: `runDiscussProgressTail` emits a `{ type: "heartbeat" }` event every `heartbeatIntervalMs` (default 15_000) while running. Raw reattach SSE responses include `retry: 3000` and optional `: ping`; AI SDK streams receive typed events only.

- [ ] **Step 1: Write the failing test**

In `src/lib/projects/discuss-turn-sse-tail.test.ts`, add a test with a small `heartbeatIntervalMs` that asserts a `heartbeat`-type event is written during a running turn, and that terminal `finish` stops the heartbeat.

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL (no heartbeat emitted).

- [ ] **Step 3: Implement heartbeat in the tail**

Add `heartbeatIntervalMs = 15_000` option to `runDiscussProgressTail`; in the interval callback (next to the DB poll), if not settled, call `write({ type: "heartbeat" })`. Add optional `writeComment?: (comment: string) => void` so raw SSE routes can emit comments:
```ts
// inside the poll interval, alongside the DB poll:
if (!settled) {
  try { write({ type: "heartbeat" }); } catch { /* client gone */ }
}
```
Note: `write` receives event objects. Keep raw SSE comments confined to `src/routes/api.projects.$id.turns.$turnId.stream.ts`, where `encodeSseEvent` is manually used.

- [ ] **Step 4: Add `retry:` to stream responses**

In `stream.ts` `createDiscussReadStream` and `replayDiscussStream`, enqueue `retry: 3000\n\n` before event replay/live events. For `preview.ts`, do not prepend raw SSE bytes; rely on typed heartbeat/activity events through `writer.write`.

- [ ] **Step 5: Run tests**

Run `bunx vitest run --project unit src/lib/projects/discuss-turn-sse-tail.test.ts` and `src/lib/projects/build-attempt-pubsub.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/discuss-turn-sse-tail.ts src/routes/api.projects.$id.turns.$turnId.stream.ts src/routes/api.projects.preview.ts <test-files>
git commit -m "feat(discuss): SSE heartbeat + retry to keep idle streams alive"
```

---

### Task 5: Fix dead Redis client cache (R8)

**Files:**
- Modify: `src/lib/projects/discuss-turn-pubsub.ts` (`getRedisPub`, `ensureRedisSub`)
- Test: `src/lib/projects/discuss-turn-pubsub.test.ts`

**Interfaces:**
- Produces: on Redis `error`/`close`, module-level `redisPub`/`redisSub` reset to `null` and `redisInitFailed = false` so the next call re-creates the client.

- [ ] **Step 1: Write the failing test**

In `discuss-turn-pubsub.test.ts`, add a test that simulates the cached-client path: after a first `publishProgress`, force the module state (via the existing test backend hook) to model a dead client and assert a subsequent publish attempts a reconnect rather than throwing forever. Because the module caches a real `Redis` client, the most robust test is to assert the reconnect logic: export a test-only reset or spy. If a pure unit test is impractical (ioredis socket), rely on the manual/integration check in the plan and assert the code change compiles + existing tests pass.

- [ ] **Step 2: Implement reconnect reset**

In `getRedisPub` (`:215-238`) and `ensureRedisSub` (`:160-213`), attach handlers so a socket failure resets state:
```ts
redisPub.on("error", () => { redisPub = null; redisInitFailed = false; });
redisPub.on("close", () => { redisPub = null; redisInitFailed = false; });
```
Do the same for `redisSub`. Keep `maxRetriesPerRequest: 1`, `enableOfflineQueue: false`, `lazyConnect: true`.

- [ ] **Step 3: Run tests**

Run `bunx vitest run --project unit src/lib/projects/discuss-turn-pubsub.test.ts`. Expected: PASS (existing) + any added case.

- [ ] **Step 4: Commit**

```bash
git add src/lib/projects/discuss-turn-pubsub.ts src/lib/projects/discuss-turn-pubsub.test.ts
git commit -m "fix(discuss): re-create Redis pub/sub client on socket drop"
```

---

### Task 6: Reattach renders deltas (R9)

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx:2620-2651`
- Test: `src/components/projects/WorkspaceShell.test.tsx` (if present) — otherwise rely on `bun run check` + manual.

**Interfaces:**
- Produces: the reattach `EventSource` listens for `text-delta`, `tool-input-available`, `tool-output-available`, `workspace-card`, and `heartbeat`, forwarding them to the chat rendering instead of only waiting for `finish`/`error`.

- [ ] **Step 1: Inspect current reattach block**

Read `WorkspaceShell.tsx:2610-2678`. The reattach `EventSource` currently only listens for `finish`/`error` then `reloadLatestChat()`.

- [ ] **Step 2: Implement delta forwarding**

Inside the `es` block, add listeners for `text-delta` (append to a local buffer / call the same handler the main stream uses) and `heartbeat` (update a "still running" indicator). On `finish`/`error`, `es.close()` then `reloadLatestChat()` as today. Reuse the existing message-append path (find the function the main `useChat` stream uses to apply `text-delta`) rather than duplicating.

- [ ] **Step 3: Verify**

Run `bun run check` (typecheck + lint). Manual: start a turn, refresh mid-turn, confirm deltas appear instead of a blank spinner.

- [ ] **Step 4: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx
git commit -m "fix(workspace): render live deltas on turn-stream reattach"
```

---

### Task 7: Snapshot + sequence + `afterSequence` resume (R7 server + client handshake)

**Files:**
- Modify: `src/lib/projects/discuss-turn-pubsub.ts` (sequence + buffered replay helpers), `src/lib/projects/discuss-turn-sse-tail.ts` (snapshot/synchronized + subscribe-before-snapshot), `src/routes/api.projects.$id.turns.$turnId.stream.ts` (replay + afterSequence), `src/components/projects/WorkspaceShell.tsx` (store last sequence during reattach)
- Test: `src/lib/projects/discuss-turn-pubsub.test.ts`, `src/lib/projects/discuss-turn-sse-tail.test.ts`

**Interfaces:**
- Produces: every published event carries a monotonically increasing `sequence`; the stream route subscribes live **before** reading snapshot, emits `snapshot` → replay/buffered events → `synchronized`; honors `afterSequence` (from `Last-Event-ID` or query param) with a gap ceiling fallback to fresh snapshot. Client dedupes by sequence.

**Scope note:** This is the architectural piece tied to the web/worker split. Keep it backwards-compatible: clients that ignore `snapshot`/`synchronized` still receive `text-delta`/terminal events.

- [ ] **Step 1: Write failing tests**

Add tests asserting: (a) events carry incrementing `sequence`; (b) the tail subscribes before snapshot load and buffers live events that happen during snapshot load; (c) output order is `snapshot` → buffered/replayed events → `synchronized` → live events; (d) replay honors `afterSequence` (drops events ≤ sequence) and falls back to fresh snapshot on a too-large gap.

- [ ] **Step 2: Implement sequence in pub/sub**

In `discuss-turn-pubsub.ts`, track a per-channel sequence counter and stamp `event.sequence` in `publishProgress`. Keep `type` intact. Export helpers to read buffered events after a sequence and to detect replay gaps.

- [ ] **Step 3: Implement snapshot + synchronized in the tail**

In `discuss-turn-sse-tail.ts`, accept an `loadSnapshot`/replay provider. Subscribe to live progress first, buffering events while `loadSnapshot()` reads DB. Then emit `{ type: "snapshot", ... }`, replay buffered events with `sequence > afterSequence`, emit `{ type: "synchronized" }`, then switch to live pass-through.

- [ ] **Step 4: Wire afterSequence in the stream route**

In `stream.ts`, read `Last-Event-ID` header and `?afterSequence=`. If the turn is live, replay from that sequence with the gap ceiling; else terminal replay as today. In `WorkspaceShell.tsx`, remember the latest event sequence seen during reattach and pass it back on reconnect.

- [ ] **Step 5: Run tests + focused UI typecheck**

Run the pub/sub and sse-tail tests; then `bun run check`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/discuss-turn-pubsub.ts src/lib/projects/discuss-turn-sse-tail.ts src/routes/api.projects.$id.turns.$turnId.stream.ts <test-files>
git commit -m "feat(discuss): SSE snapshot + sequence + afterSequence resume (server)"
```

---

### Task 8: Early stream phases + connection state (R2/R12)

**Files:**
- Modify: `src/routes/api.projects.preview.ts` (early stream + phase events), `src/components/projects/WorkspaceShell.tsx` (connection/activity state), `src/lib/app-settings-registry.ts` (optional flags if needed)
- Test: existing preview/discuss route tests, component tests if present

**Scope:** Ship R2 fully: the client receives stream bytes/progress before moderation and discuss TTFT. Keep pre-stream validation for auth, rate-limit, body shape, energy, and project existence. Moderation still runs serially inside the stream before discuss enqueue unless R3 is explicitly enabled later.

- [ ] Split `handlePreviewPost` after safe pre-stream validation: auth/rate/body/project/energy errors still return JSON/SSE errors as today; moderation and enqueue happen inside a stream `execute` block.
- [ ] Emit coarse phase events: `{ type: "activity", phase: "checking" }` before moderation, `{ type: "activity", phase: "saving" }` before DB persist/claim, `{ type: "activity", phase: "responding" }` before/after enqueue, `{ type: "activity", phase: "synchronizing" }` during reattach.
- [ ] In `WorkspaceShell.tsx`, add explicit connection/activity state values: `connecting`, `checking`, `responding`, `synchronizing`, `connected`, `backoff`, `blocked`; render short Indonesian status copy separate from assistant text. Do not show provider/model/internal details.
- [ ] Re-run Task 0 behavior-lock tests after the route/UI changes. Expected: final card/message/build trigger semantics unchanged.

**R3 flag (off by default):**
- [ ] Add `AppSetting` `discuss.parallel_moderation` (default `false`) in `src/lib/app-settings-registry.ts`. The route reads the setting but keeps serial moderation unless the setting is true. Do **not** seed/flip it to true.

- [ ] **Verify:** run preview/discuss tests + `bun run check`.

- [ ] **Commit**
```bash
git add src/routes/api.projects.preview.ts src/components/projects/WorkspaceShell.tsx src/lib/app-settings-registry.ts <test-files>
git commit -m "feat(discuss): stream preamble activity and connection state"
```

---

### Task 9: Progressive workspace card streaming (R5)

**Files:**
- Modify: `src/lib/projects/discuss-tool.ts` (partial card parser), `src/lib/projects/discuss-turn-worker.ts` (publish partial-card events), `src/components/projects/WorkspaceShell.tsx` / `WorkspacePrimitives.tsx` (card skeleton/fill)
- Test: `src/lib/projects/discuss-tool.test.ts`, `src/lib/projects/discuss-turn-worker.test.ts`, component tests/story if present

**Interfaces:**
- Produces: `nextPartialWorkspaceCardFromToolJson(partialToolJson, previous)` returns an incremental card patch safe to render, controlled by existing `discuss.partial_tool_streaming`.

- [ ] Add parser tests for partial JSON where only `workspaceCard.type` is known, then question text, then first option, then all options. Expected result: parser emits monotonic patches and never downgrades/removes already-rendered fields.
- [ ] Implement `nextPartialWorkspaceCardFromToolJson` beside `nextAssistantTextDeltaFromPartialToolJson`.
- [ ] In `discuss-turn-worker.ts` `tool-input-delta` handling (`:569-607`), when partial card state changes, publish a typed event such as `{ type: "workspace-card-delta", workspaceCard }`.
- [ ] In the workspace UI, render a skeleton card when `workspaceCard.type` arrives but fields are incomplete; fill question/options as patches arrive. Keep accessibility intact: labels, buttons, focus order.
- [ ] On final `tool-output-available`, replace partial card with normalized final card exactly as today.
- [ ] Re-run Task 0 behavior-lock tests. Expected: progressive skeleton never changes final persisted card/message shape and never auto-starts build.
- [ ] Verify with focused unit/component tests + `bun run check`.
- [ ] Commit:
```bash
git add src/lib/projects/discuss-tool.ts src/lib/projects/discuss-turn-worker.ts src/components/projects/WorkspaceShell.tsx src/components/projects/WorkspacePrimitives.tsx <test-files>
git commit -m "feat(discuss): stream workspace card skeletons progressively"
```

---

### Task 10: CSP report-only noise + discuss energy projectId (R10/R11)

**Files:**
- Modify: `src/routes/api.csp-violation.ts` or `src/lib/security-headers.ts` (depending current implementation), `src/lib/projects/discuss-turn-worker.ts`
- Test: CSP violation test if present, `src/lib/projects/discuss-turn-worker.test.ts`

- [ ] Locate `/api/csp-violation` route. Add suppression/rate-limit for generated-preview report-only inline script signatures while keeping enforced violations logged.
- [ ] Add a test: report-only generated-preview inline script payload is accepted but not logged as a high-signal violation; enforced Google Fonts violations are no longer expected after R4.
- [ ] In unhedged `chargeDiscussEnergy`, pass `{ projectId: project.id }` to `chargeEnergyForAiUsage` just like hedged `addEnergyUsageLegs` already does at `discuss-turn-worker.ts:806-808`.
- [ ] Add/adjust test asserting `reason: "discuss:step"` energy charge includes `projectId`.
- [ ] Run focused tests + `bun run check`.
- [ ] Commit:
```bash
git add src/routes/api.csp-violation.ts src/lib/security-headers.ts src/lib/projects/discuss-turn-worker.ts <test-files>
git commit -m "fix(discuss): keep CSP reports actionable and tag energy by project"
```

---

### Task 11: Optional parallel moderation wiring (R3, off by default)

**Files:**
- Modify: `src/routes/api.projects.preview.ts`, `src/lib/app-settings-registry.ts`
- Test: preview/discuss route tests

**Scope:** Implement the capability only. Default remains `false`, so production behavior is unchanged until a separate setting flip.

- [ ] Add setting `discuss.parallel_moderation` default `false` with description that streaming can begin before moderation verdict if enabled.
- [ ] In `api.projects.preview.ts`, branch on the setting. If false: keep serial moderation inside early stream (Task 8). If true: start moderation promise and discuss preparation concurrently; if moderation rejects before enqueue, emit blocked error and do not enqueue; if moderation rejects after enqueue, cancel/finalize the turn and emit error.
- [ ] Tests: default false preserves serial behavior; true cancels/blocks correctly on rejection.
- [ ] Commit:
```bash
git add src/routes/api.projects.preview.ts src/lib/app-settings-registry.ts <test-files>
git commit -m "feat(discuss): add off-by-default parallel moderation path"
```

---

### Task 12: Docs sync + full gate

**Files:**
- Modify: this plan + `docs/superpowers/specs/2026-08-05-discuss-streaming-reliability-design.md` (mark shipped items; note deferred enablement only for R3)

- [ ] Update the spec's status/notes to reflect shipped items, R0 behavior locks, and R3's off-by-default runtime status.
- [ ] `bun run check` passes (format, lint, typecheck, tests, knip, docs).
- [ ] Confirm no fixture error counts changed (`git diff --stat` on test files shows only intended additions).

---

## Self-review notes

- **R0** added so the current structured-response / pseudo-tool contract and build trigger semantics are locked before risky transport/card work.
- **R1** fully specified (Task 1 worker + Task 2 reorder) with energy charge + `compaction-failed` log + failure-visibility preserved.
- **R4** trivial (Task 3), **R6** (Task 4), **R8** (Task 5), **R9** (Task 6) each have a test + a commit.
- **R7** now includes subscribe-before-snapshot + client sequence memory; no longer server-only vague scope.
- **R2/R12** now have a full early-stream/activity-state task, not emission-only.
- **R5** now has a dedicated progressive-card task with parser, worker, and UI steps.
- **R10/R11** added from the report: CSP report noise + projectId energy accounting.
- **R3** capability is off by default — matches the spec's safety constraint.
- No hedging/combo/pricing changes anywhere. `6bcfc38` already handled the settings-refresh prerequisite.

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-08-05-discuss-streaming-reliability.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach? (Also confirm before starting: compaction is priced at its own model in the job; R3 stays off-by-default unless a separate setting flip is approved.)

## Execution Status — 2026-08-05 (shipped)

Shipped and committed on `dev`:

- **R0** `507c094` — behavior-lock tests for the structured card contract.
- **R1** `4df4499` + `d5eb10a` — background compaction queue; `finish` published before enqueue.
- **R4** `5822723` — Google Fonts allowed in CSP.
- **R6** `2692e2c` — SSE heartbeat + `retry:`.
- **R8** `bc8df7f` — Redis pub/sub clients recreated on socket drop.
- **R9** `b4951a8` — reattach renders live deltas + card.
- **R7** `823f36c` — snapshot + sequence + `afterSequence` resume on turn streams.
- **R10/R11** `9fd85fa` — CSP report-only noise suppressed; discuss energy tagged by project.
- **R3** `eb34c1f` — off-by-default parallel moderation capability.
- **R12 (partial)** `5e90251` — worker emits `responding` activity phase.
- **R5 (server)** `4e89229` — partial workspace-card skeleton deltas streamed.

**Deferred (not shipped):**
- **R2 full early-open stream** — restructure of `api.projects.preview.ts` to open the SSE stream before the serial preamble. Deferred because it touches many early-return error paths (auth/rate/body/energy/moderation/dedupe) and is high-risk to change unattended. The liveness benefit is partially covered by the R12 `activity` phase event. Do this in a dedicated, reviewed session.
- **R12 full connection-state machine + R5 client-side skeleton render** — UI-side progressive rendering. Server emits the deltas; client progressive render is a follow-up.

## Audit Addendum — 2026-08-05

Deep audit result: the first plan was not complete enough for "all phases" execution. This updated plan fixes these gaps:

- Added R10/R11/R12 tasks that were missing from the report-derived scope.
- Replaced vague R2/R5 fallback language with concrete early-stream, activity-state, parser, worker, and UI steps.
- Tightened R7 with t3code's subscribe-before-snapshot race fix and client sequence memory.
- Corrected R6 so raw SSE directives are only emitted on the raw `EventSource` route, not blindly injected into AI SDK streams.
- Kept R3 safe: capability planned, default off.
- Incorporated the hedging-latency handoff: do not re-enable hedging; adaptive hedging is post-scope and separate.
- Added R0 behavior locks after user confirmed the pseudo-tool / structured-response contract is intentional and must not be replaced by real side-effectful tool execution.
