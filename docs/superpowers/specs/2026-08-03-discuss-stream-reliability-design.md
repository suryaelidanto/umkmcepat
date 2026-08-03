# Discuss Stream Reliability — Design

**Date:** 2026-08-03  
**Status:** Draft for implementation  
**Study case:** live discuss hang (e.g. project `cmscsmrj9000d4l9nr3gxt0ct` on dev) — spinner until hard refresh; reply already in DB  
**Related:**

- `docs/superpowers/specs/2026-07-23-discuss-turn-server-side-design.md` (server-owned turn + in-process pub/sub)
- `docs/superpowers/specs/2026-08-02-discuss-build-speed-design.md` (dual queue, repair×1, text-only)
- `docs/superpowers/specs/2026-07-21-discuss-mode-reliability-design.md` (card + progressive text)

## Problem

Discuss is **server-owned** (persist succeeds without the browser), but the **live SSE tail** is not reliable enough for product UX.

### Observed symptoms

1. **Spinner / “streaming” forever** until hard refresh.
2. After refresh, **assistant text is already there** → worker finished + `persistProjectChatTurn` ran.
3. 9Router may show **1–2 model calls per user message** (primary + optional card repair). That is expected; it is not the same bug as a hung UI.
4. After speed work: dual queue (`project-discuss`), repair cap 1, text-only when card missing — these change timing and stream **shape**, and can worsen client “preparing” if tool events are omitted.

### Root cause classes (ordered)

| # | Class | Mechanism | Matches “refresh fixes it” |
|---|--------|-----------|----------------------------|
| A | **Progress bus process-local** | `discuss-turn-pubsub` is an in-memory `Map`. POST SSE subscribes in the request process; BullMQ worker publishes in the worker process. If they are not the same Node isolate, the tail never sees `text-delta` / `finish`. | Yes |
| B | **SSE never terminal** | Tail only ends on `finish`/`error`. No DB fallback while the HTTP connection is still open. Worker can succeed in DB while the client waits forever. | Yes |
| C | **Text-only stream protocol** | Text-only path skips `tool-input/output-available` (including `{ type: "none" }`). Client prefers tool card; may set `isPreparingNextQuestion` and poll; feels stuck even when chat text arrived. | Partial (preparing UI more than empty chat) |
| D | **Deploy / worker lag** | Discuss jobs enqueued to `project-discuss` but worker not started / old image / Redis down. | Yes if job never runs (then refresh also empty unless fail-clean) |
| E | **Repair gap after primary** | Primary streams text, then silent repair AI (~seconds–45s) before `finish`. Feels “stuck” after text; not the same as zero text + forever. | Partial |

**Honest split:** not frontend-only. Backend stream delivery + terminal signaling is primary; client preparing/card path is secondary hardening.

## Goals

1. **Live path:** progressive text (and card when present) without hard refresh, on single-process and multi-process app deploys that share Redis.
2. **Terminal guarantee:** every discuss POST SSE ends with `finish` or `error` within a bounded time after the turn row is terminal in DB (or fails cleanly).
3. **Text-only is first-class:** no invented cards/brief fields; stream + client still settle cleanly.
4. **Expected AI call count documented:** 1 primary; +1 repair only when card invalid/missing; optional compaction separate.
5. **Observability:** one turn id correlates enqueue → publish → tail → finalize in logs.
6. **No regression** of server-owned persist (disconnect still keeps the reply).

## Non-goals

- Removing dual queues or re-merging discuss into `project-attempt`.
- Raising discuss card repair back to 3.
- Inventing workspace cards or brief fields when repair fails.
- Full multi-region fan-out / dedicated chat microservice.
- Fixing generate/build SSE (separate channel; same patterns may be reused later).
- Model/provider A/B.

## Principles

1. **DB is source of truth for turn outcome; stream is a view.** If the view is wrong, DB still wins on reload — but the view must self-heal without reload.
2. **Progress must cross process boundaries** if HTTP and workers can ever split (Vite multi-worker, multiple containers, future scale). Redis already exists for BullMQ.
3. **Terminal events are mandatory** on every success/fail/cancel path (worker + fail-clean).
4. **Stream protocol stays AI SDK UIMessageChunk-shaped** so `useChat` / `DefaultChatTransport` keep working.
5. **YAGNI:** prefer Redis pub/sub (or list fan-out) over a second job queue for progress; keep in-process fast path optional, not required for correctness.
6. **User copy Indonesian; logs/docs English.**

## Architecture

```text
POST /api/projects/preview (discuss)
  → persist user message
  → claimDiscussTurn → turnId
  → enqueueAttemptJob(kind: discuss)  // project-discuss
  → createUIMessageStreamResponse
       subscribeDiscussProgress(turnId)
       ALSO: poll ProjectChatTurn until terminal OR timeout
       write UIMessageChunks until finish|error

BullMQ discuss worker (same or other process)
  → runDiscussTurn
  → publishDiscussProgress(turnId, chunk)  // Redis + optional local
  → persistProjectChatTurn
  → finalizeDiscussTurn
  → publish finish|error

Client useChat
  → consumes SSE
  → status → ready on stream end
  → card from tool parts OR text-only settle (no endless preparing)
```

### Progress bus (shared)

Replace “memory-only is enough for pilot” with:

**`publishDiscussProgress` / `subscribeDiscussProgress`**

- **Transport:** Redis (same `getRedisUrl()` as BullMQ).
  - Channel name: `discuss-progress:{turnId}` (pub/sub) **or** Redis Stream / list with short TTL — implementer picks one; must support late subscriber catching buffered events for the active turn (or accept short race covered by DB poll).
- **Buffer:** keep a short in-memory ring **and/or** Redis list of events for the turn (cap size, e.g. last N events or until finish + 30s grace) so:
  - subscriber that attaches after first `text-delta` still gets start + deltas when possible;
  - same-process unit tests can inject a memory backend.
- **API:** keep shapes used today (`start`, `text-start`, `text-delta`, `text-end`, `tool-input-available`, `tool-output-available`, `finish`, `error`).
- **Fail-open for publish:** if Redis publish fails, log + still finalize DB (persist must not depend on pub/sub). Tail relies on DB poll fallback.

**Deprecate pure process-local Map as the sole bus.** Local Map may remain as L1 cache in one process but **must not** be the only path for correctness.

### SSE tail hardening (POST preview)

In `createUIMessageStream` execute:

1. Subscribe to shared progress for `turnId`.
2. Parallel **DB poll** (e.g. every 1–2s): if turn `succeeded`/`failed`/`cancelled` and no terminal chunk yet:
   - `succeeded` → write `finish` (and optionally a synthetic path that forces client ready; full message already in DB — client may `reloadLatestChat` on finish if message incomplete).
   - `failed`/`cancelled` → write `error` with user-facing Indonesian text from row.
3. **Hard ceiling:** e.g. `expiresAt` of turn or `max( discussOneCall + discussCard + buffer )` so the HTTP response never lives forever.
4. On terminal: unsubscribe, resolve, close stream.

This closes class **B** even if progress bus drops events.

### Stream protocol for text-only (class C)

When primary+repair yield no valid card but `chatText` non-empty:

1. Still publish progressive text (unchanged).
2. **Always** publish tool events with a **protocol** card `{ type: "none" }` (or a dedicated client-understood “no card” signal that already exists as `type: "none"`).
3. Persist assistant as **text-only parts** without inventing question options / brief fields (product rule from speed design). Stream tool output may still carry `{ type: "none" }` so the UI message stream is complete; storage can strip or keep `none` consistently with existing `workspaceCard: { type: "none" }` persist path.
4. Log `discuss:text-only-fallback` (already).

**Rule:** “No dummy cards” means **no fake questions/options/business data**, not “omit tool-output-available from the stream.”

### Client settle rules (`WorkspaceShell`)

When chat status transitions to `ready` / `error`:

1. If tool card non-`none` → set card, clear preparing (existing).
2. If last assistant has **text** and no non-`none` card → **clear `isPreparingNextQuestion`**, clear card error unless product wants soft “card missing” (prefer no red error for intentional text-only).
3. Do **not** enter preparing-poll solely because the user answered a previous question **if** the stream just completed with text-only assistant for this turn.
4. Keep mount resume via `/chat/turn` + turn stream GET (DB terminal replay).

### Worker / deploy hardening (class D)

1. Boot log must include **both** queues: `project-attempt`, `project-discuss`.
2. Optional: on enqueue discuss, if Redis cannot accept job → fail turn + error SSE immediately (already partially there).
3. Document in `DEV.md`: single Redis, workers start via `register()` / instrumentation; dual queue required after speed ship.

### Call-count contract (class E documentation)

| Situation | AI calls |
|-----------|----------|
| Valid card on primary | 1 (`streamText`) |
| Invalid/missing card | 2 (primary + 1× `repairDiscussCardWithTool`) |
| Chat compaction | +0/1 (existing, separate) |

UI may show a quiet “still working” after text while repair runs; do not treat 2 calls as a bug.

## Edge cases (must pass)

| Edge | Expected |
|------|----------|
| Client disconnect mid-primary | Worker continues; persist; reconnect/reload shows reply |
| Client stays open; Redis progress ok | Live deltas + finish; no refresh |
| Client stays open; Redis progress broken | DB poll still emits finish/error; chat may jump to final state via reload on finish |
| Multi-process: worker ≠ HTTP | Shared Redis bus + DB poll still terminate SSE |
| Text-only after repair fail | Stream ends; composer ready; no endless preparing; no invented card |
| Primary tool-only (no prose), repair ok | Card-only assistant as today |
| Primary empty + repair fail | `error` + failed turn; no fake text |
| Concurrent second message | 409 `project_chat_in_progress` |
| Job throw after partial text | fail-clean + `error` event; partial text policy: keep already streamed; DB may degrade/persist per existing worker rules |
| Turn expired / process death mid-run | TTL + claim path; client resume shows failed/retry |
| Dual queue only discuss worker down | Job waits; DB poll eventually hits expire/fail; surface error (not infinite silent spinner without bound) |
| Compaction after success | After persist; must not block `finish` forever — compaction failure must not prevent terminal publish |

## Alternatives considered

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| **A. Redis progress + DB poll on SSE** | Fixes multi-process; hard terminal guarantee; reuses Redis | Slightly more code; Redis dependency for discuss UX | **Recommended** |
| **B. Memory pub/sub only + client poll chat** | Small code | Fails multi-process; client thrash; hides server bug | Reject for reliability goal |
| **C. Run discuss AI inside POST again** | Simple stream | Loses disconnect-safe persist; regresses 2026-07-23 | Reject |
| **D. Redis Streams as sole history + no memory** | Strong ordering | Heavier; overkill if list/pubsub + DB poll enough | Optional if pub/sub buffer races |

## Success criteria

1. Manual: send discuss message on warm project → text streams within primary model latency; status returns to ready **without** hard refresh ≥ 95% of trials on single-container dev/prod.
2. Forced text-only (mock/invalid card): still ends ready; no invented options; no preparing spinner until timeout.
3. Kill Redis pub channel mid-turn (or inject publish failure): SSE still ends via DB poll after worker finalize.
4. Two model calls only when repair runs; healthy card path = one call.
5. Unit tests: progress subscribe across “two backends”; SSE execute resolves on DB terminal without live publish; text-only emits protocol `none` tool events + finish.
6. `DEV.md` documents discuss progress bus + dual queue + terminal fallback.

## File map (implementation)

| Area | Files |
|------|--------|
| Progress bus | `src/lib/projects/discuss-turn-pubsub.ts` (+ tests); optional `discuss-progress-redis.ts` |
| Worker publish | `src/lib/projects/discuss-turn-worker.ts`, `discuss-queue-worker.ts`, fail-clean in `attempt-queue.ts` |
| SSE tail | `src/routes/api.projects.preview.ts`; `api.projects.$id.turns.$turnId.stream.ts` (same subscribe API) |
| Client settle | `src/components/projects/WorkspaceShell.tsx` (+ small pure helpers/tests if extracted) |
| Docs | this spec; plan; `DEV.md` |

## Open decisions locked by this design

1. **Shared progress uses Redis** (already required for BullMQ) — not deferred.
2. **DB poll on open SSE** is mandatory safety net, not optional polish.
3. **Text-only still emits `type: "none"` tool stream events** for protocol completeness; product still forbids inventing question content.
4. **No** return to in-request AI generation.

## Spec self-check

- No TBD on transport: Redis + DB poll.
- Consistent with speed design: dual queue, repair×1, no dummy business data.
- Extends 2026-07-23: Stage C cross-process progress is now **in scope** for discuss only.
- Scope is discuss reliability only; generate SSE out of scope unless reuse is free.
