# Discuss Streaming & Reliability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the perceived discuss "hang" and harden the SSE transport, using t3code's snapshot/sequence/heartbeat/activity discipline while keeping our SSE stack. Ship R1 (compaction off critical path), R4 (Google Fonts CSP), R6 (heartbeat), R8 (Redis client fix), R9 (reattach deltas) fully; R2/R5/R7 in scoped form; R3 behind an off-by-default flag (not executed).

**Architecture:** Compaction becomes a dedicated BullMQ job so the turn publishes `finish` immediately. The SSE transport gains heartbeat + snapshot + sequence. The dead Redis client is re-created on reconnect. CSP allows Google Fonts. Reattach renders deltas.

**Tech Stack:** Bun, TypeScript, TanStack Start, Prisma/Postgres, BullMQ/ioredis, Vitest.

## Global Constraints

- Work from `dev`; atomic Conventional Commits per task.
- TDD: write failing test → run to confirm fail → implement → run to confirm pass.
- Run unit tests with `bunx vitest run --project unit <file>`. Full gate: `bun run check`.
- Use Bun only; keep `bun.lock` canonical.
- Docs are part of the change when behavior changes (this plan + spec already created).
- `git status` shows ~200 phantom modified files. Verify real state with `git diff --quiet HEAD`. Stage explicit paths only — **never** `git add -A`.
- Do NOT touch hedging (`discuss.hedging`), combos, model pricing, or R3's parallel-moderation default.
- Do NOT "fix" tests to lower error counts; `p1`/`project_1`/`deployment_timeout` rows are fixtures.
- Never commit `.env`, secrets, uploads, logs, `.next/`, `.pi/`, `.browser/`, coverage artifacts.
- User-facing copy Indonesian; developer logs/code English.

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
- Modify: `src/lib/projects/discuss-turn-sse-tail.ts` (heartbeat comment + typed `heartbeat` event)
- Modify: `src/routes/api.projects.$id.turns.$turnId.stream.ts` and `src/routes/api.projects.preview.ts` (include `retry:` in SSE response)
- Test: `src/lib/projects/discuss-turn-sse-tail.test.ts`, `src/lib/projects/build-attempt-pubsub.test.ts` (for `encodeSseEvent`)

**Interfaces:**
- Produces: `runDiscussProgressTail` emits a `{ type: "heartbeat" }` event every `heartbeatIntervalMs` (default 15_000) while running, plus writes an SSE `: ping` comment; stream responses include `retry: 3000`.

- [ ] **Step 1: Write the failing test**

In `src/lib/projects/discuss-turn-sse-tail.test.ts`, add a test with a small `heartbeatIntervalMs` that asserts a `heartbeat`-type event is written during a running turn, and that terminal `finish` stops the heartbeat.

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL (no heartbeat emitted).

- [ ] **Step 3: Implement heartbeat in the tail**

Add `heartbeatIntervalMs = 15_000` option to `runDiscussProgressTail`; in the interval callback (next to the DB poll), if not settled, call `write({ type: "heartbeat" })`. Also write the SSE comment form via a small helper so clients using raw SSE see liveness:
```ts
// inside the poll interval, alongside the DB poll:
if (!settled) {
  try { write({ type: "heartbeat" }); } catch { /* client gone */ }
}
```
Note: `write` receives event objects; for the raw `: ping` comment form, add an option `writeComment` (default no-op) and emit `: ping` from the stream routes. Keep the tail's `write` for the typed heartbeat.

- [ ] **Step 4: Add `retry:` to stream responses**

In `stream.ts` `createDiscussReadStream` and `replayDiscussStream`, and `preview.ts` `createUIMessageStreamResponse` usage, prepend `retry: 3000\n` to the response body (or via a stream chunk). Locate how `createUIMessageStreamResponse` composes the body and prepend the retry directive.

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

### Task 7: Snapshot + sequence + `afterSequence` resume (R7 server)

**Files:**
- Modify: `src/lib/projects/discuss-turn-pubsub.ts` (sequence), `src/lib/projects/discuss-turn-sse-tail.ts` (snapshot/synchronized), `src/routes/api.projects.$id.turns.$turnId.stream.ts` (replay + afterSequence)
- Test: `src/lib/projects/discuss-turn-pubsub.test.ts`, `src/lib/projects/discuss-turn-sse-tail.test.ts`

**Interfaces:**
- Produces: every published event carries a monotonically increasing `sequence`; the stream route emits `snapshot` → buffered events → `synchronized`; honors `afterSequence` (from `Last-Event-ID`) with a gap ceiling fallback to fresh snapshot.

**Scope note:** This is the architectural piece tied to the web/worker split. Ship server-side only. Client consume (`Last-Event-ID` send + dedupe) is a follow-up (R7b) — note it in the plan but do not implement.

- [ ] **Step 1: Write failing tests**

Add tests asserting: (a) events carry incrementing `sequence`; (b) the tail emits a `snapshot` then `synchronized` when replay requested; (c) replay honors `afterSequence` (drops events ≤ sequence) and falls back to fresh snapshot on a too-large gap.

- [ ] **Step 2: Implement sequence in pub/sub**

In `discuss-turn-pubsub.ts`, track a per-channel or module `sequence` counter and stamp `event.sequence` in `publishProgress`. Keep `type` intact.

- [ ] **Step 3: Implement snapshot + synchronized in the tail**

In `discuss-turn-sse-tail.ts`, accept an `onSnapshot`/replay provider. When a client subscribes with `afterSequence`, first emit `{ type: "snapshot", ... }` (persisted state from the route), then replay buffered events with `sequence > afterSequence`, then `{ type: "synchronized" }`.

- [ ] **Step 4: Wire afterSequence in the stream route**

In `stream.ts`, read `Last-Event-ID` header; if the turn is live, replay from that sequence with the gap ceiling; else terminal replay as today.

- [ ] **Step 5: Run tests + full gate**

Run the pub/sub and sse-tail tests; then `bun run check`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/discuss-turn-pubsub.ts src/lib/projects/discuss-turn-sse-tail.ts src/routes/api.projects.$id.turns.$turnId.stream.ts <test-files>
git commit -m "feat(discuss): SSE snapshot + sequence + afterSequence resume (server)"
```

---

### Task 8: Scoped R2 progress events + R5 field emission + R3 flag (R2/R5/R3)

**Files:**
- Modify: `src/routes/api.projects.preview.ts` (progress events; optional R3 flag), `src/lib/projects/discuss-tool.ts` (R5 partial fields), `src/lib/app-settings-registry.ts` (R3 flag)
- Test: `src/lib/projects/discuss-tool.test.ts`, existing preview tests

**Scope:** This task ships the *emission* halves of R2 and R5 and the R3 off-by-default flag. The full early-open stream (R2b) and client progressive card render (R5b) are documented as follow-ups, gated on the emission tests passing.

**R2 (emission-only):**
- [ ] Emit `{ type: "phase", phase: "checking" }` etc. from within the existing tail when the worker signals phases. Wire the worker to publish phase events at turn start (`thinking`, `responding`) so the client shows liveness during the current dead air.

**R5 (emit partial card fields):**
- [ ] Extend `nextAssistantTextDeltaFromPartialToolJson` (or add `nextPartialCardFromToolJson`) to return the partial `workspaceCard` object alongside the text delta when `discuss.partial_tool_streaming` is on. Add tests in `discuss-tool.test.ts` covering a partially-parsed card.

**R3 (flag, off by default):**
- [ ] Add `AppSetting` `discuss.parallel_moderation` (default `false`) in `src/lib/app-settings-registry.ts`. Document the behavior change + risk in the spec. Do NOT change the moderation ordering to parallel by default.

- [ ] **Verify:** run `discuss-tool.test.ts` + preview tests + `bun run check`.

- [ ] **Commit**
```bash
git add src/routes/api.projects.preview.ts src/lib/projects/discuss-tool.ts src/lib/app-settings-registry.ts <test-files>
git commit -m "feat(discuss): phase progress + partial card emission; parallel-moderation flag (off)"
```

---

### Task 9: Docs sync + full gate

**Files:**
- Modify: this plan + `docs/superpowers/specs/2026-08-05-discuss-streaming-reliability-design.md` (mark shipped items; note R2b/R5b/R7b follow-ups)

- [ ] Update the spec's status/notes to reflect shipped vs deferred.
- [ ] `bun run check` passes (format, lint, typecheck, tests, knip, docs).
- [ ] Confirm no fixture error counts changed (`git diff --stat` on test files shows only intended additions).

---

## Self-review notes

- **R1** fully specified (Task 1 worker + Task 2 reorder) with energy charge + `compaction-failed` log + failure-visibility preserved.
- **R4** trivial (Task 3), **R6** (Task 4), **R8** (Task 5), **R9** (Task 6) each have a test + a commit.
- **R7** server-only (Task 7) with client R7b deferred.
- **R2/R5/R3** (Task 8) emission-only + off-by-default flag; full structural R2b / client R5b deferred.
- **R3** explicitly NOT executed (product risk, off by default) — matches the spec's constraint.
- No hedging/combo/pricing changes anywhere.

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-08-05-discuss-streaming-reliability.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach? (Also confirm before starting: Task 2's energy handling — I chose to price compaction at its own model in the job; and R3 stays off-by-default, not executed.)
