# Discuss-Turn Server-Side (Reconnectable Chat) — Design

**Date:** 2026-07-23
**Status:** Approved (brainstormed 2026-07-23)
**Relationship to other plans:** A reliability fix for the discuss/chat flow (separate from the generation-speed phase, just shipped; + separate from the paused Stage B runtime self-heal). It pairs with both — all three are "server owns the work, client just listens."

## Problem

The discuss/chat turn is **client-stream-driven**: the AI generation runs inside the SSE `execute` callback (`createUIMessageStream`'s `execute` in `src/routes/api.projects.preview.ts`), and `persistProjectChatTurn` is called from inside that callback. Two failure modes when the client disconnects mid-turn:

1. **Lost reply (symptom 1: "AI response gone").** The client disconnects (leaves the page) → the SSE stream aborts → the `execute` is interrupted → `persistProjectChatTurn` may never run → the user's answer + the AI reply never land in the DB. On reload, the reply is gone.
2. **Wedged composer (symptom 2: "can't send again").** `submitInFlightRef` (a client-side lock) is set `true` on send + only resets when `useChat`'s `status` returns to `"ready"`/`"error"` (line 1488). A disconnect-mid-stream can leave `status` in `"submitted"`/`"streaming"` that never transitions → the ref stays `true` → `submitChatText` early-returns (line 1804) → the composer is dead until a hard reload.

The in-process discuss lock (`discussInFlight` Set + 7.5min TTL timer, lines 75-99) also dies on server restart (stuck until TTL) + can't be queried for resume.

## Goal

Make the discuss turn **server-side work** that completes + persists independent of the client connection, so:
- Leaving mid-turn never loses the reply (the server finishes + persists).
- The client **auto-resumes** on reload (tail the in-flight turn, or replay the persisted reply, or offer retry).
- The composer never wedges (`submitInFlightRef` resets on mount).
- The lock is DB-backed (survives restart, queryable for resume).

## Scope

**In scope:**
- Section 1 — `ProjectChatTurn` table + `claimDiscussTurn`/`finalizeDiscussTurn`/`releaseDiscussTurn` (DB-backed lease, TTL safety valve). Replaces the in-process `discussInFlight` Set.
- Section 2 — detached `runDiscussTurn` worker (generation lifetime independent of the SSE connection; `persistProjectChatTurn` from the worker, not the stream).
- Section 3 — stream-is-a-tail (subscribe to in-process pub/sub; DB-state fallback on reconnect) + client auto-resume (mount check for unanswered last user message + resume/replay/retry) + `submitInFlightRef` mount reset.

**Out of scope (deferred):**
- A full separate worker process / queue (Stage C — Approach 3; overkill at pilot scale; revisit if scale demands). The detached in-process worker is the MVP.
- Surviving a server restart mid-generation (the honest ceiling: the in-flight turn's in-memory generation is lost; the TTL + auto-resume handle it gracefully — failed/expired → retry). A queue would survive this; deferred.
- Cross-process pub/sub (Redis/etc.) — the in-process channel suffices for single-process; the DB-state fallback covers reconnect-after-restart. Defer.

## Architecture

### Section 1 — DB-backed discuss turn + lease

A `ProjectChatTurn` table is the source of truth for "is there an in-flight turn for this project?" — replacing the in-process Set.

**Table (`prisma/schema.prisma`):**
```prisma
model ProjectChatTurn {
  id           String   @id @db.VarChar(32)
  projectId    String
  userMessageId String  @db.VarChar(64)  // the client message id of the user's answer
  status       ProjectChatTurnStatus
  startedAt    DateTime @default(now())
  finishedAt   DateTime?
  expiresAt    DateTime
  errorMessage String?
  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@index([projectId, status])
}
enum ProjectChatTurnStatus { running succeeded failed cancelled }
```

**Lease helpers (`src/lib/projects/discuss-turn.ts`):**
- `claimDiscussTurn({ projectId, userId, userMessageId })` — atomic `updateMany`-style claim (only if no `running` turn for the project, or the existing one is expired). Sets `status: "running"`, `expiresAt = now + 7.5min`. Returns `{ claimed: boolean, turnId: string }`. Mirrors `claimProjectOperation`'s atomic pattern.
- `finalizeDiscussTurn({ turnId, status, errorMessage? })` — sets `finishedAt` + `status`. Clears the running flag.
- `releaseDiscussTurn({ turnId })` — marks `cancelled` (client-driven cancel) or auto-expires.
- `getActiveDiscussTurn({ projectId })` — query for the resume path (returns the in-flight or last turn).
- The TTL safety valve: a turn whose `expiresAt < now` is treated as `failed` by `claimDiscussTurn` (re-claimable). The mechanism is **on-claim** — `claimDiscussTurn`'s atomic claim treats an expired `running` turn as claimable (finalizes it `failed` as part of the claim). No separate sweeper worker needed for correctness; a periodic cleanup of old finished rows is optional + can reuse the `runtime:idle-stop` pattern if the table grows.

**Survives restart:** the DB row is the source of truth. A server restart doesn't lose the turn state — `getActiveDiscussTurn` queries it on the client's reconnect.

### Section 2 — Detached generation worker

The AI generation runs as **detached server work**, not inside the SSE `execute`.

**POST `/api/projects/preview` flow:**
1. Write the user message to the DB immediately (before any generation) — so the reply is never lost even if generation never starts.
2. `claimDiscussTurn({ projectId, userId, userMessageId })` — if not claimed (a turn is in-flight), return a 409/`project_chat_in_progress`.
3. **Start the generation detached:** `void runDiscussTurn({ turnId, project, chatContext, effectiveBrief, memoryFacts, messages, summary, userId }).catch(...)` — NOT awaited in the request handler. Runs as background work in the same process.
4. Return the streaming response that **tails** the turn (Section 3) — keyed by `turnId`.

**`runDiscussTurn` (the detached worker, `src/lib/projects/discuss-turn-worker.ts`):**
- Builds the prompt, runs the `ToolLoopAgent`/`streamText` (one-call mode), consumes the model stream.
- Emits progress (text deltas, tool calls, finish) to an **in-process pub/sub channel** keyed by `turnId` (Section 3).
- **Persists the assistant reply** (`persistProjectChatTurn`) + finalizes the turn (`finalizeDiscussTurn`) — **from the worker, not from the stream's `execute`.** Runs to completion whether or not the client is connected. On client disconnect, the stream reader aborts; the worker keeps running.
- On error/timeout: `finalizeDiscussTurn({ status: "failed", errorMessage })` + emit a failure to the channel. Never leaves a dangling `running` turn.

**The key invariant:** `persistProjectChatTurn` is called from the detached worker, not the SSE `execute`. The generation's completion + persist no longer depend on the stream staying open. Client disconnect → server keeps generating → persists → reply is there on reconnect.

**Honest cost:** the detached worker holds the generation's context in-process. If the server restarts mid-generation (rare), the in-flight turn's in-memory work is lost — the TTL expires it, the client auto-resumes (sees `failed`/`expired` → retry). A full worker queue (Stage C) would survive this; deferred.

### Section 3 — Reconnectable stream + client auto-resume

The SSE stream is a *view* of the turn's work (not its lifetime), + the client auto-resumes on reload.

**Stream-is-a-tail (server):**
- POST returns an SSE stream that **subscribes to the in-process pub/sub channel** for `turnId` (`turnProgress[turnId]`). As `runDiscussTurn` emits deltas/tool-calls/finish, the channel fans out to subscribers.
- **Live case** (generation in-flight when you connect): subscribe → stream live. Same feel as today.
- **Reconnect case** (server restarted, channel gone): the subscriber finds the channel empty → **queries the DB turn row**:
  - `status: "succeeded"` → replay the persisted assistant reply + card as a single batch.
  - `status: "running"` but channel gone → the generation was lost to a restart → surface a retry prompt (`status: "failed"`).
  - `status: "failed"`/`"cancelled"`/`expired` → show the error + retry.
  - no turn → empty stream.
  Never a silent loss.

**Client auto-resume (the wedge + lost-reply fix, `WorkspaceShell.tsx`):**
- On mount/reload: check — does the last user message in `messages` have a matching assistant reply? If **no** → query `GET /api/projects/[id]/chat/turn` (new) for the project's active/last turn:
  - `running` + channel live → resume the stream (tail it).
  - `succeeded` → inject the persisted reply + card (replay).
  - `failed`/`expired` → surface the error + a retry affordance.
  - none → reset the composer (ready to re-send).
- **`submitInFlightRef` resets on mount** (line 279, add a mount effect). So a reload never wedges — the ref is always clean on a fresh load. (The `status === "ready"|"error"` reset at 1488 stays.)
- `useChat`'s `status` reflects the stream's *connection* state, not the generation's lifetime. `"streaming"`→`"ready"` means "I stopped listening," not "the generation died."

## Why this fixes both symptoms

- **Symptom 1 (lost reply):** the generation completes + persists from the detached worker; on reload the client replays it via DB state. Gone = never again.
- **Symptom 2 (wedged composer):** `submitInFlightRef` resets on mount; `useChat` re-inits clean; auto-resume replaces the dangling `submitted`/`streaming` state. No wedge.

## Alternatives considered

- **Generate-in-stream + persist-on-abort + reconnectable replay (Approach 2).** Smaller change (no detached worker, no progress channel), but generation still dies on disconnect (truncates) — doesn't meet the locked "server completes + persists" decision. Rejected.
- **Full queue/worker service (Approach 3).** Most decoupled (survives restart, cross-process), but new infra (worker process + queue) — overkill at the ~10-UMKM pilot scale + single-process model. The detached in-process worker achieves the same connection-decoupling without a new service. Rejected for now (Stage C if scale demands).

## Key risks

- **The detached worker + the request lifecycle:** the worker must not be GC'd/killed when the POST response returns. In a serverless/edge context this is a real risk; in the local-process + Bun server it's fine (the process stays alive). **Verify the runtime model** — if the app runs serverless, detached work needs a durable queue (Stage C). Flag for the plan.
- **In-process pub/sub on reconnect-after-restart:** the live channel is gone; the DB-state fallback MUST handle every case (succeeded/running-lost/failed/expired/none) cleanly, or resume shows a blank. Each branch is explicit in Section 3.
- **Transition from the in-process lock to the DB lease:** existing in-flight turns + the old `discussInFlight` Set must be migrated/handled so a deploy doesn't wedge ongoing chats. The plan owns this (the old lock can coexist briefly during transition; the DB lease is additive until the Set is removed).
- **Energy on disconnect:** the locked decision is "server completes + persists → charged for the full turn." The worker charges energy on persist (full turn), even if the client never reconnects. This is intentional (the work happened) but means an abandoned turn costs energy — acceptable per the decision.
- **One turn at a time:** the DB lease enforces it (no concurrent discuss turns per project). A second POST while one is running → 409.

## Invariants preserved (architecture.md)

- One turn at a time per project (DB lease).
- Energy charged for the full turn even on disconnect (locked decision).
- The visible reply is never regenerated just to repair (the worker persists the real reply; a failed/expired turn offers retry, not silent regen).
- Static-frontend-only (the `ProjectChatTurn` table is platform metadata, not user backend code).
- No shell/CLI (the chat flow doesn't touch the generation tool surface).

## Implementation order (each ships + is testable)

1. **Section 1** (DB turn + lease) — committed; the lease works standalone (claim/finalize, TTL). Existing chat keeps working during transition.
2. **Section 2** (detached worker) — committed on top; generation completes + persists independent of the stream. Testable: disconnect mid-turn → reply still persists.
3. **Section 3** (stream-tail + auto-resume + mount reset) — committed on top; reconnect shows the reply, composer never wedges. The user-facing fix.

Each section: implementer → review → gate green → commit. Continuous mode (no checkpoints, all committed per directive).

## Success criteria

- Section 1: `claimDiscussTurn` atomically claims one turn per project; `finalizeDiscussTurn`/`releaseDiscussTurn` clear it; the TTL auto-expires crashed turns; survives a server restart (the row persists).
- Section 2: a generation whose client disconnects mid-stream still completes + persists the assistant reply + card; `persistProjectChatTurn` is called from the worker, not the SSE `execute`.
- Section 3: on reload after a mid-turn disconnect, the client auto-resumes (tails the live turn, or replays the persisted reply, or offers retry); `submitInFlightRef` resets on mount (no wedge). Both symptoms (lost reply, wedged composer) no longer reproduce.
