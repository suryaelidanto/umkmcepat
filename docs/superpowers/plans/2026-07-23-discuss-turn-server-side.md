# Discuss-Turn Server-Side (Reconnectable Chat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the discuss/chat turn server-side work that completes + persists independent of the client SSE connection, so leaving mid-turn never loses the reply + the composer never wedges; auto-resume on reload.

**Architecture:** Three sections. Section 1 — a `ProjectChatTurn` table + `claimDiscussTurn`/`finalizeDiscussTurn`/`releaseDiscussTurn` DB-backed lease (survives restart, replaces the in-process `discussInFlight` Set). Section 2 — a detached `runDiscussTurn` worker (generation lifetime independent of the SSE stream; `persistProjectChatTurn` from the worker, not `execute`) + an in-process pub/sub progress channel keyed by turn id. Section 3 — the SSE stream becomes a tail of the channel (DB-state fallback on reconnect-after-restart) + the client auto-resumes on mount (tail/replay/retry) + `submitInFlightRef` resets on mount.

**Tech Stack:** TypeScript, Bun, Prisma (PostgreSQL), TanStack Router (SSE routes), AI SDK `@ai-sdk/react` (`useChat`), AI SDK `streamText`/`ToolLoopAgent` (unchanged generation core).

**Spec:** `docs/superpowers/specs/2026-07-23-discuss-turn-server-side-design.md`

## Global Constraints

- **Surgical commits:** stage ONLY the files each task touches. Never `git add -A` blindly — the repo has unrelated skill-pack churn in the working tree; isolate. (A bad `git add -A` already swept up skill-pack deletions once this session — don't repeat.)
- Bun only; `bun.lock` canonical. `bun run check` green before every commit.
- One turn at a time per project (the DB lease enforces it). A second POST while one runs → 409.
- Energy charged for the full turn even on disconnect (the worker persists → the work happened → charged).
- The visible reply is never regenerated just to repair (the worker persists the real reply; a failed/expired turn offers retry, not silent regen).
- Static-frontend-only (the `ProjectChatTurn` table is platform metadata, not user backend code).
- No shell/CLI (the chat flow doesn't touch the generation tool surface).
- The server runtime model is a long-lived Bun process (not serverless/edge) — detached background work survives the POST response. Verify in the plan; if serverless, this needs a queue (Stage C). (The repo runs `bun run dev` / a Bun server — long-lived, so detached work is safe.)
- Each section ships + is testable. Continuous mode (no checkpoints, all committed per directive).
- Indonesian user-facing copy (error messages), English dev comments/logs.

---

## File Structure

**Section 1 (DB turn + lease):**
- Modify: `prisma/schema.prisma` — add `ProjectChatTurn` model + `ProjectChatTurnStatus` enum + a relation on `Project`.
- Create: `src/lib/projects/discuss-turn.ts` — `claimDiscussTurn`/`finalizeDiscussTurn`/`releaseDiscussTurn`/`getActiveDiscussTurn` + types.
- Test: `src/lib/projects/discuss-turn.test.ts`.

**Section 2 (detached worker + pub/sub):**
- Create: `src/lib/projects/discuss-turn-pubsub.ts` — in-process pub/sub (`publishProgress`/`subscribeProgress`/`readTurnState`).
- Create: `src/lib/projects/discuss-turn-worker.ts` — `runDiscussTurn` (the detached generation; persists + finalizes; the existing one-call logic moves here).
- Modify: `src/routes/api.projects.preview.ts` — POST writes user message + claims turn + `void runDiscussTurn` (detached) + returns the tail stream (Section 3 wires the tail; Section 2 leaves a thin live-subscribe placeholder or wires both together — see Task).
- Test: `src/lib/projects/discuss-turn-worker.test.ts`.

**Section 3 (stream-tail + client auto-resume):**
- Modify: `src/routes/api.projects.preview.ts` — the stream subscribes to the pub/sub + DB fallback.
- Create: `src/routes/api.projects.$id.chat.turn.ts` — GET the active/last turn (for client resume).
- Modify: `src/components/projects/WorkspaceShell.tsx` — mount auto-resume (check unanswered last user message → tail/replay/retry) + `submitInFlightRef` mount reset.
- Test: `src/components/projects/WorkspaceShell.test.ts` (resume cases) + `src/routes/api.projects.$id.chat.turn.test.ts`.

**Interfaces (locked names across tasks):**
- `claimDiscussTurn({ projectId, userId, userMessageId }): Promise<{ claimed: boolean; turnId: string | null }>` — Section 1.
- `finalizeDiscussTurn({ turnId, status, errorMessage? }): Promise<void>` — Section 1.
- `releaseDiscussTurn({ turnId }): Promise<void>` — Section 1.
- `getActiveDiscussTurn({ projectId }): Promise<ProjectChatTurn | null>` — Section 1.
- `publishProgress(turnId, event)` / `subscribeProgress(turnId, onEvent): () => void` / `readTurnState(turnId): TurnState` — Section 2.
- `runDiscussTurn({ turnId, project, chatContext, effectiveBrief, memoryFacts, messages, summary, userId }): Promise<void>` — Section 2 (void; detached; persists + finalizes internally).

---

### Task 1: Section 1 — `ProjectChatTurn` schema + migration

**Files:**
- Modify: `prisma/schema.prisma` (add model + enum + relation).
- Modify: `prisma/migrations/...` (new migration via `bun run db:migrate`).
- Test: `src/lib/projects/discuss-turn.test.ts` (added in Task 2; this task just adds the schema + runs the migration).

**Interfaces:**
- Produces: the `ProjectChatTurn` table in the DB.

- [ ] **Step 1: Add the model + enum + relation to `prisma/schema.prisma`**

In `prisma/schema.prisma`, after the `Project` model (line ~134), add:

```prisma
model ProjectChatTurn {
  id            String                @id @db.VarChar(32)
  projectId     String
  userMessageId String                @db.VarChar(64)
  status        ProjectChatTurnStatus
  startedAt     DateTime              @default(now())
  finishedAt    DateTime?
  expiresAt     DateTime
  errorMessage  String?
  project       Project               @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@index([projectId, status])
  @@index([expiresAt])
}

enum ProjectChatTurnStatus {
  running
  succeeded
  failed
  cancelled
}
```

Add a relation field to the `Project` model (near the other relations, line ~121-126):
```prisma
  chatTurns                  ProjectChatTurn[]
```

- [ ] **Step 2: Generate + apply the migration**

Run: `bun run db:migrate` (the repo's migration script — verify the exact command in `package.json`; it likely runs `prisma migrate dev`). Name it `add_project_chat_turn`.
Expected: a new migration file under `prisma/migrations/` + the table created in the local DB.

- [ ] **Step 3: Verify the schema compiles + Prisma client regenerates**

Run: `bunx prisma generate` (or whatever the repo uses) + `bun run check`.
Expected: green (the new model is in the Prisma client types; nothing uses it yet, so no test changes needed here).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/<the-new-migration>/
git commit -m "feat(db): add ProjectChatTurn table for server-side discuss turns"
```

---

### Task 2: Section 1 — the lease helpers (`discuss-turn.ts`)

**Files:**
- Create: `src/lib/projects/discuss-turn.ts`
- Test: `src/lib/projects/discuss-turn.test.ts`

**Interfaces:**
- Produces: `claimDiscussTurn`, `finalizeDiscussTurn`, `releaseDiscussTurn`, `getActiveDiscussTurn` (+ the `ProjectChatTurn` type re-export).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/projects/discuss-turn.test.ts`. Use a real test DB (the repo has one — check how other `*.test.ts` query the DB; if tests use a mock prisma, mirror it). 4 tests:

```ts
it("claims a turn when none is running", async () => {
  const r = await claimDiscussTurn({ projectId, userId, userMessageId: "m1" });
  expect(r.claimed).toBe(true);
  expect(r.turnId).toBeTruthy();
});

it("rejects a second claim while one is running", async () => {
  await claimDiscussTurn({ projectId, userId, userMessageId: "m1" });
  const r = await claimDiscussTurn({ projectId, userId, userMessageId: "m2" });
  expect(r.claimed).toBe(false);
});

it("re-claims after the running turn expires", async () => {
  const first = await claimDiscussTurn({ projectId, userId, userMessageId: "m1" });
  // Manually expire it (set expiresAt in the past) OR use a 0-TTL claim helper for the test.
  await prisma.projectChatTurn.update({ where: { id: first.turnId! }, data: { expiresAt: new Date(0) } });
  const r = await claimDiscussTurn({ projectId, userId, userMessageId: "m2" });
  expect(r.claimed).toBe(true);
  // The expired turn is finalized failed.
  const expired = await prisma.projectChatTurn.findUnique({ where: { id: first.turnId! } });
  expect(expired?.status).toBe("failed");
});

it("finalizeDiscussTurn marks the turn done + clears running", async () => {
  const { turnId } = await claimDiscussTurn({ projectId, userId, userMessageId: "m1" });
  await finalizeDiscussTurn({ turnId: turnId!, status: "succeeded" });
  const t = await prisma.projectChatTurn.findUnique({ where: { id: turnId! } });
  expect(t?.status).toBe("succeeded");
  expect(t?.finishedAt).toBeTruthy();
});
```

Adapt to the repo's real test-DB harness (read how `project-operation.test.ts` or similar tests the lease). The intent is fixed.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/lib/projects/discuss-turn.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `discuss-turn.ts`**

Create `src/lib/projects/discuss-turn.ts`:

```ts
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { ProjectChatTurn, ProjectChatTurnStatus } from "@prisma/client";

export const DISCUSS_TURN_TTL_MS = 7.5 * 60_000;

export type { ProjectChatTurn, ProjectChatTurnStatus } from "@prisma/client";

export async function claimDiscussTurn({
  projectId,
  userId,
  userMessageId,
  now = new Date(),
  ttlMs = DISCUSS_TURN_TTL_MS,
}: {
  projectId: string;
  userId: string;
  userMessageId: string;
  now?: Date;
  ttlMs?: number;
}): Promise<{ claimed: boolean; turnId: string | null }> {
  // Finalize any expired running turn for this project (on-claim TTL safety).
  const expired = await prisma.projectChatTurn.findFirst({
    where: { projectId, status: "running", expiresAt: { lt: now } },
    select: { id: true },
  });
  if (expired) {
    await prisma.projectChatTurn.update({
      where: { id: expired.id },
      data: { status: "failed", finishedAt: now, errorMessage: "expired" },
    });
  }

  // Atomic claim: only if no running turn exists for the project.
  const existing = await prisma.projectChatTurn.findFirst({
    where: { projectId, status: "running" },
    select: { id: true },
  });
  if (existing) {
    return { claimed: false, turnId: null };
  }

  const turnId = `ct_${randomUUID().replace(/-/g, "")}`;
  await prisma.projectChatTurn.create({
    data: {
      id: turnId,
      projectId,
      userMessageId,
      status: "running",
      expiresAt: new Date(now.getTime() + ttlMs),
    },
  });
  return { claimed: true, turnId };
}

export async function finalizeDiscussTurn({
  turnId,
  status,
  errorMessage,
  now = new Date(),
}: {
  turnId: string;
  status: ProjectChatTurnStatus;
  errorMessage?: string;
  now?: Date;
}): Promise<void> {
  await prisma.projectChatTurn.update({
    where: { id: turnId },
    data: { status, finishedAt: now, errorMessage: errorMessage ?? null },
  });
}

export async function releaseDiscussTurn({
  turnId,
  now = new Date(),
}: {
  turnId: string;
  now?: Date;
}): Promise<void> {
  await finalizeDiscussTurn({ turnId, status: "cancelled", now });
}

export async function getActiveDiscussTurn({
  projectId,
  now = new Date(),
}: {
  projectId: string;
  now?: Date;
}): Promise<ProjectChatTurn | null> {
  const running = await prisma.projectChatTurn.findFirst({
    where: { projectId, status: "running" },
    orderBy: { startedAt: "desc" },
  });
  if (running && running.expiresAt < now) {
    // Expired — finalize + return null (caller treats as no active turn).
    await prisma.projectChatTurn.update({
      where: { id: running.id },
      data: { status: "failed", finishedAt: now, errorMessage: "expired" },
    });
    return null;
  }
  return running;
}
```

Note: the `claimDiscussTurn` "atomic" claim isn't a true DB transaction here (the find-then-create is a check-then-act). For correctness under concurrency, mirror `claimProjectOperation`'s `updateMany`-style atomic claim if the repo requires it — read `project-operation.ts` + decide. The check-then-create is fine at pilot scale; flag in the report.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:changed -- src/lib/projects/discuss-turn.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate + commit**

Run: `bun run check`
Expected: green.

```bash
git add src/lib/projects/discuss-turn.ts src/lib/projects/discuss-turn.test.ts
git commit -m "feat(discuss): DB-backed discuss turn lease (claim/finalize/release/getActive)"
```

---

### Task 3: Section 2 — in-process pub/sub progress channel

**Files:**
- Create: `src/lib/projects/discuss-turn-pubsub.ts`
- Test: `src/lib/projects/discuss-turn-pubsub.test.ts`

**Interfaces:**
- Produces: `publishProgress(turnId, event)`, `subscribeProgress(turnId, onEvent): () => void`, `readTurnState(turnId): TurnState`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/projects/discuss-turn-pubsub.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { publishProgress, subscribeProgress, readTurnState } from "./discuss-turn-pubsub";

describe("discuss-turn pub/sub", () => {
  it("delivers published events to a live subscriber", () => {
    const received: unknown[] = [];
    const unsub = subscribeProgress("t1", (e) => received.push(e));
    publishProgress("t1", { type: "text-delta", delta: "hi" });
    publishProgress("t1", { type: "finish" });
    unsub();
    expect(received).toHaveLength(2);
  });

  it("buffers events before a subscriber attaches (replay on subscribe)", () => {
    publishProgress("t2", { type: "text-delta", delta: "early" });
    const received: unknown[] = [];
    subscribeProgress("t2", (e) => received.push(e));
    expect(received).toHaveLength(1);
  });

  it("readTurnState returns 'live' when a channel exists, 'gone' otherwise", () => {
    publishProgress("t3", { type: "text-delta", delta: "x" });
    expect(readTurnState("t3")).toBe("live");
    expect(readTurnState("nope")).toBe("gone");
  });

  it("unsubscribe stops delivery", () => {
    const received: unknown[] = [];
    const unsub = subscribeProgress("t4", (e) => received.push(e));
    publishProgress("t4", { type: "finish" });
    unsub();
    publishProgress("t4", { type: "text-delta", delta: "after" });
    expect(received).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/lib/projects/discuss-turn-pubsub.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `discuss-turn-pubsub.ts`**

Create `src/lib/projects/discuss-turn-pubsub.ts`:

```ts
type ProgressEvent = { type: string; [key: string]: unknown };
type TurnState = "live" | "gone";

const channels = new Map<string, { events: ProgressEvent[]; subscribers: Set<(e: ProgressEvent) => void> }>();

export function publishProgress(turnId: string, event: ProgressEvent): void {
  let ch = channels.get(turnId);
  if (!ch) {
    ch = { events: [], subscribers: new Set() };
    channels.set(turnId, ch);
  }
  ch.events.push(event);
  for (const sub of ch.subscribers) {
    try { sub(event); } catch { /* swallow subscriber errors */ }
  }
  // On finish/error, keep the channel briefly for late reconnect, then a sweeper (or the worker) clears it.
  if (event.type === "finish" || event.type === "error") {
    // Keep buffered events for a reconnect replay window; the worker clears after persist.
    setTimeout(() => channels.delete(turnId), 30_000);
  }
}

export function subscribeProgress(turnId: string, onEvent: (e: ProgressEvent) => void): () => void {
  let ch = channels.get(turnId);
  if (!ch) {
    ch = { events: [], subscribers: new Set() };
    channels.set(turnId, ch);
  }
  // Replay buffered events to the new subscriber.
  for (const e of ch.events) {
    try { onEvent(e); } catch { /* swallow */ }
  }
  ch.subscribers.add(onEvent);
  return () => {
    const c = channels.get(turnId);
    c?.subscribers.delete(onEvent);
  };
}

export function readTurnState(turnId: string): TurnState {
  return channels.has(turnId) ? "live" : "gone";
}
```

Note: `setTimeout` is fine (not module-scope `Date.now`). The 30s replay window handles a quick reconnect; the DB-state fallback (Section 3) handles reconnect-after-restart (channel gone).

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:changed -- src/lib/projects/discuss-turn-pubsub.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate + commit**

Run: `bun run check`
Expected: green.

```bash
git add src/lib/projects/discuss-turn-pubsub.ts src/lib/projects/discuss-turn-pubsub.test.ts
git commit -m "feat(discuss): in-process pub/sub progress channel for turns"
```

---

### Task 4: Section 2 — the detached `runDiscussTurn` worker

**Files:**
- Create: `src/lib/projects/discuss-turn-worker.ts`
- Test: `src/lib/projects/discuss-turn-worker.test.ts`

**Interfaces:**
- Consumes: `claimDiscussTurn`/`finalizeDiscussTurn` (Task 2), `publishProgress` (Task 3), the existing one-call discuss logic (currently in `api.projects.preview.ts` `handleDiscussTurnOneCall` — the prompt building + `streamText` + persist).
- Produces: `runDiscussTurn(...): Promise<void>` (detached; persists + finalizes internally).

- [ ] **Step 1: Write the failing test**

Create `src/lib/projects/discuss-turn-worker.test.ts`. The test asserts the worker persists the reply + finalizes the turn even if the "client" (the caller) never reads the stream. Use a mocked model (reuse the discuss-route's mock harness if extractable; otherwise a minimal mock `streamText` that yields a fixed delta + a tool call).

```ts
it("persists the assistant reply + finalizes the turn even without a stream consumer", async () => {
  const { turnId } = await claimDiscussTurn({ projectId, userId, userMessageId: "m1" });
  await runDiscussTurn({ turnId, project, chatContext, effectiveBrief, memoryFacts, messages, summary, userId, modelOverride: mockModel });
  // The reply persisted (chatMessages now has the assistant turn).
  const row = await prisma.project.findUnique({ where: { id: projectId }, select: { chatMessages: true } });
  expect(parseProjectChatMessages(row?.chatMessages).length).toBeGreaterThan(messages.length);
  // The turn finalized.
  const t = await prisma.projectChatTurn.findUnique({ where: { id: turnId } });
  expect(t?.status).toBe("succeeded");
});
```

If the full `runDiscussTurn` is too coupled to mock, test the invariant via: call `runDiscussTurn` with a mock `streamText` that yields one delta + finish, assert `persistProjectChatTurn` was called + `finalizeDiscussTurn` ran. Reuse the existing discuss-route test mocks — read them first.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/lib/projects/discuss-turn-worker.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `runDiscussTurn`**

Create `src/lib/projects/discuss-turn-worker.ts`. Move the one-call discuss logic from `api.projects.preview.ts:817-1280` (the `handleDiscussTurnOneCall` body: prompt build → `streamText` → consume `primary.stream` → `persistProjectChatTurn` → energy charge → log) into this function, BUT:
- Replace the `writer.write(...)` calls with `publishProgress(turnId, {...})` (same event shapes — `start`/`text-delta`/`tool-call`/`text-end`/`finish`/`error`).
- Keep the generation core (`streamText`, the model, the prompt builders) byte-identical — this is a MOVE, not a rewrite.
- `persistProjectChatTurn` + energy charge + `writeAiRequestLog` stay (now called from the worker).
- Wrap the whole body in try/catch/finally: on success → `finalizeDiscussTurn({ status: "succeeded" })` + `publishProgress(turnId, { type: "finish" })`; on error → `finalizeDiscussTurn({ status: "failed", errorMessage })` + `publishProgress(turnId, { type: "error", message })`.

```ts
export async function runDiscussTurn({
  turnId, project, chatContext, effectiveBrief, memoryFacts, messages, summary, userId,
}: {
  turnId: string;
  project: { id: string; prompt: string; status: string; title: string };
  chatContext: ReturnType<typeof buildProjectChatContext>;
  effectiveBrief: ReturnType<typeof parseProjectBrief>;
  memoryFacts: ReturnType<typeof parseProjectMemoryFacts>;
  messages: UIMessage[];
  summary: ReturnType<typeof parseProjectChatSummary>;
  userId: string;
}): Promise<void> {
  try {
    // ... move the one-call generation + persist logic here ...
    // publishProgress(turnId, { type: "start", messageId }) / text-delta / tool-call / text-end
    // persistProjectChatTurn + chargeEnergy + writeAiRequestLog
    await finalizeDiscussTurn({ turnId, status: "succeeded" });
    publishProgress(turnId, { type: "finish" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "discuss turn failed";
    await finalizeDiscussTurn({ turnId, status: "failed", errorMessage: message });
    publishProgress(turnId, { type: "error", message });
  }
}
```

This is the largest move — read `handleDiscussTurnOneCall` fully + reproduce its logic with `publishProgress` instead of `writer`. Keep the legacy `handleDiscussTurn` (two-call) path untouched for now (it's inactive; the one-call flag is on). If time-bound, scope to the one-call path only + leave a `ponytail:` on the legacy path.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:changed -- src/lib/projects/discuss-turn-worker.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate + commit**

Run: `bun run check`
Expected: green. (The route still calls the old `handleDiscussTurnOneCall` — that's fine until Task 5 rewires it. No regression: the old path still works.)

```bash
git add src/lib/projects/discuss-turn-worker.ts src/lib/projects/discuss-turn-worker.test.ts
git commit -m "feat(discuss): detached runDiscussTurn worker (generation persists independent of stream)"
```

---

### Task 5: Section 3 — wire POST to claim + detached worker + tail stream

**Files:**
- Modify: `src/routes/api.projects.preview.ts` — POST writes user message + claims turn + `void runDiscussTurn` + returns the tail stream.
- Test: `src/routes/api.projects.preview.test.ts` (the existing discuss test — adapt to the new flow).

**Interfaces:**
- Consumes: `claimDiscussTurn`, `runDiscussTurn`, `subscribeProgress`, `readTurnState`, `getActiveDiscussTurn`.
- Produces: POST `/api/projects/preview` returns a stream that tails the turn (live or DB-replay).

- [ ] **Step 1: Write the failing test**

In the discuss-route test, add: POST with a user message → 200 with a stream that emits the persisted reply deltas (from the worker's pub/sub), then `finish`. AND: a second POST while one is running → 409 `project_chat_in_progress`. Reuse the existing harness.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/routes/api.projects.preview.test.ts`
Expected: FAIL — the route still calls the old in-stream `handleDiscussTurnOneCall`.

- [ ] **Step 3: Rewire POST**

In `src/routes/api.projects.preview.ts` `handleDiscussTurn`/`handleDiscussTurnOneCall` (the POST entry, ~line 501/536/781):
1. **Before generation:** write the user message to `chatMessages` immediately (`persistProjectChatTurn` with the user message appended, or a lighter `appendUserMessage` helper — verify the persist helper's shape).
2. `claimDiscussTurn({ projectId, userId, userMessageId: messages[last].id })` → if `!claimed`, return `Response.json({ code: "project_chat_in_progress", ... }, { status: 409 })`.
3. `void runDiscussTurn({ turnId, project, chatContext, effectiveBrief, memoryFacts, messages, summary, userId }).catch(...)` — detached, NOT awaited.
4. Return the **tail stream**: a `createUIMessageStream` whose `execute` subscribes to `subscribeProgress(turnId, (e) => writer.write(e))`. On `finish`/`error`, the subscriber closes + `writer.write({ type: "finish"/"error" })`. If `readTurnState(turnId) === "gone"` at subscribe time (reconnect-after-restart), fall to `getActiveDiscussTurn` + replay the persisted reply (DB-state fallback).

Remove the old in-stream generation (`handleDiscussTurnOneCall`'s `streamText` + `for await` + persist-from-execute) — it's now in `runDiscussTurn`. The legacy `handleDiscussTurn` (two-call) path: leave a `ponytail:` or remove if unused (judge by whether anything calls it with the flag off).

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:changed -- src/routes/api.projects.preview.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate + commit**

Run: `bun run check`
Expected: green. (Existing discuss tests may need updating to the new flow — adapt them, don't weaken invariants.)

```bash
git add src/routes/api.projects.preview.ts src/routes/api.projects.preview.test.ts
git commit -m "feat(discuss): POST claims turn + detached worker + tail stream"
```

---

### Task 6: Section 3 — GET turn-state route (for client resume)

**Files:**
- Create: `src/routes/api.projects.$id.chat.turn.ts`
- Test: `src/routes/api.projects.$id.chat.turn.test.ts`

**Interfaces:**
- Produces: `GET /api/projects/[id]/chat/turn` → `{ turnId, status, userMessageId }` (the active/last turn) or `404` if none.

- [ ] **Step 1: Write the failing test**

Create `src/routes/api.projects.$id.chat.turn.test.ts`:
- `running` turn → 200 `{ status: "running", turnId, userMessageId }`.
- `succeeded` turn → 200 `{ status: "succeeded", turnId, userMessageId }` (client replays via the stream's DB fallback).
- no turn → 404.
- not-owner → 403/404.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/routes/api.projects.\$id.chat.turn.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the route**

Create `src/routes/api.projects.$id.chat.turn.ts`: auth → `getActiveDiscussTurn({ projectId })` (+ last finished if no running) → respond. Mirror the existing `api.projects.$id.chat.ts` GET route's auth + shape.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:changed -- src/routes/api.projects.\$id.chat.turn.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate + commit**

Run: `bun run check`
Expected: green.

```bash
git add src/routes/api.projects.\$id.chat.turn.ts src/routes/api.projects.\$id.chat.turn.test.ts
git commit -m "feat(discuss): GET active/last turn state for client resume"
```

---

### Task 7: Section 3 — client auto-resume + `submitInFlightRef` mount reset

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx` — mount auto-resume (check unanswered last user message → GET turn → tail/replay/retry) + `submitInFlightRef` mount reset.
- Test: `src/components/projects/WorkspaceShell.test.ts` (resume cases).

**Interfaces:**
- Consumes: `GET /api/projects/[id]/chat/turn`, the existing `useChat` transport.

- [ ] **Step 1: Write the failing tests**

In `WorkspaceShell.test.ts`, add:
- Mount with a last user message + no assistant reply + a `running` turn on the server → the client opens the tail stream (asserts a fetch to `/api/projects/preview` with the turn).
- Mount with a `succeeded` turn → the client injects the persisted reply (asserts the reply appears in messages).
- Mount with a `failed` turn → the client shows the error + a retry affordance.
- `submitInFlightRef` is `false` on mount (no wedge after reload) — assert a new send works immediately.

Reuse the existing component-test harness (read it first).

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/components/projects/WorkspaceShell.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement auto-resume + mount reset**

In `src/components/projects/WorkspaceShell.tsx`:
1. **Mount effect:** `useEffect(() => { submitInFlightRef.current = false; /* reset on mount */ }, [])`.
2. **Auto-resume effect (mount + when `messages` last is an unanswered user message):**
```ts
useEffect(() => {
  const last = messages.at(-1);
  if (!last || last.role !== "user") return;
  // Is there an assistant reply after this user message? (local messages only)
  const hasReply = messages.some((m, i) => i > messages.indexOf(last) && m.role === "assistant");
  if (hasReply) return;
  // Query the turn state.
  fetch(`/api/projects/${projectId}/chat/turn`).then(r => r.ok ? r.json() : null).then((turn) => {
    if (!turn) { return; /* no turn — composer stays ready */ }
    if (turn.status === "running") { /* resume: open the tail stream via sendMessage-with-empty OR a transport resume; reuse useChat's regenerate/transport */ }
    else if (turn.status === "succeeded") { /* reload chat from DB to get the persisted reply */ reloadLatestChat(); }
    else { setResumeError(turn); /* show retry */ }
  });
}, [messages, projectId]);
```
The exact resume mechanism (transport-level stream resume vs a chat-history reload) depends on `useChat`'s API — read the existing `reloadLatestChat` (line ~1483 region) + reuse it for `succeeded`; for `running`, the cleanest is a history reload + re-tail. Judge by the `useChat` version.
3. The `submitInFlightRef` reset on mount (step 1) is the wedge fix.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:changed -- src/components/projects/WorkspaceShell.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate + commit**

Run: `bun run check`
Expected: green.

```bash
git add src/components/projects/WorkspaceShell.tsx src/components/projects/WorkspaceShell.test.ts
git commit -m "feat(discuss): client auto-resume on reload + submitInFlightRef mount reset"
```

---

### Task 8: Remove the old in-process lock + docs

**Files:**
- Modify: `src/routes/api.projects.preview.ts` — remove `discussInFlight`/`discussLockTimers`/`acquireDiscussLock`/`releaseDiscussLock` (lines 75-99 + the call sites at 475/513) — now replaced by the DB lease.
- Modify: `docs/architecture.md` — record the server-side discuss turn.
- Test: `src/routes/api.projects.preview.test.ts` — the 409 dedupe test now tests the DB lease, not the in-memory Set.

- [ ] **Step 1: Verify the DB lease fully replaces the in-process lock**

Grep for `acquireDiscussLock`/`releaseDiscussLock`/`discussInFlight` — all call sites should now route through `claimDiscussTurn`/`releaseDiscussTurn`. Remove the old Set + timers + helpers.

- [ ] **Step 2: Update the 409 dedupe test**

The existing test that asserts a second concurrent discuss turn is deduped should now assert the DB lease rejects it (the 409 from Task 5). Adapt.

- [ ] **Step 3: Update `docs/architecture.md`**

Record: the discuss turn is server-side work (DB-backed `ProjectChatTurn` lease + detached `runDiscussTurn` worker + stream-is-a-tail + client auto-resume). Leaving mid-turn never loses the reply; the composer never wedges. The in-process lock is removed. Survives restart (DB); reconnect-after-restart falls to DB-state replay.

- [ ] **Step 4: Run the full gate + commit**

Run: `bun run check`
Expected: green.

```bash
git add src/routes/api.projects.preview.ts src/routes/api.projects.preview.test.ts docs/architecture.md
git commit -m "feat(discuss): remove in-process lock (DB lease replaces it) + docs"
```

---

## Self-Review (completed by plan author)

**1. Spec coverage:**
- Section 1 (DB turn + lease) → Tasks 1-2. ✓
- Section 2 (detached worker + pub/sub) → Tasks 3-4. ✓
- Section 3 (stream-tail + auto-resume + mount reset) → Tasks 5-7. ✓
- Old-lock removal + docs → Task 8. ✓
- Auto-resume (tail/replay/retry) → Task 7. ✓
- `submitInFlightRef` mount reset → Task 7. ✓
- Server-completes-on-disconnect → Task 4 (detached worker persists regardless of consumer). ✓
- DB-state fallback on reconnect-after-restart → Task 5 (the `readTurnState === "gone"` branch) + Task 6 (GET turn). ✓

**2. Placeholder scan:** No "TBD". Where the plan says "reuse the existing harness / read it first," that's a deliberate instruction (helpers vary), not a placeholder. The `setTimeout`-based replay window in Task 3 is concrete.

**3. Type consistency:** `claimDiscussTurn → { claimed, turnId }` (Task 2) used in Task 5. `runDiscussTurn(...): Promise<void>` (Task 4) used in Task 5. `publishProgress`/`subscribeProgress`/`readTurnState` (Task 3) used in Tasks 4-5. `getActiveDiscussTurn` (Task 2) used in Task 6 + Task 5's fallback. Names consistent.

**4. Known risks flagged in-task:**
- Task 1: migration command — verify the repo's `db:migrate` script.
- Task 2: the claim-then-create isn't a true atomic transaction (check-then-act); mirror `claimProjectOperation`'s `updateMany` atomicity if required at higher concurrency — flag; fine at pilot scale.
- Task 4: the move of `handleDiscussTurnOneCall` is the largest step — read it fully; keep the legacy two-call path untouched (inactive).
- Task 5: the resume-on-reconnect mechanism depends on `useChat`'s API — read the version; the cleanest resume is history-reload + re-tail.
- Task 7: `useChat`'s transport resume API varies — judge by the installed version.
- Task 8: the in-process lock removal must not leave a window where a deploy wedges ongoing chats — the DB lease is additive before removal (Tasks 2/5 land first), so removal in Task 8 is safe.
- Global: the repo has unrelated skill-pack churn in the working tree — **stage only what each task touches; never `git add -A`.**
