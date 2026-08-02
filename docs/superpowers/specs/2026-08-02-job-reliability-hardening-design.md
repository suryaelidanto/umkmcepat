# Spec: Job reliability hardening (server-owned work)

**Status:** Implemented (2026-08-02)  
**Date:** 2026-08-02  
**Product:** UMKM Cepat — discuss → generate/build → edit → preview  
**Related:**

- `docs/superpowers/specs/2026-07-31-builder-reliability-production.md` (empty-source unstuck, mode resolve)
- `docs/superpowers/specs/2026-07-29-build-progress-server-side-design.md` (generate channel + reattach; partially shipped)
- `docs/superpowers/handoffs/2026-07-31-builder-reliability.md`

## Problem

Users expect: start work once, leave or refresh freely, and the product keeps working. Server owns jobs; the browser only starts and listens. ~100 concurrent product users should not wedge, hang, or require archaeology after a restart.

**Current reality (2026-08-02 audit):**

| Path | Queue | Survives tab close | Survives process death | Live reattach | Multi-instance |
|------|-------|--------------------|------------------------|---------------|----------------|
| Generate | BullMQ `project-attempt` | Yes | Fail/stale only | Same process yes; DB hydrate buggy | No (in-mem progress) |
| Discuss | In-process `void runDiscussTurn` | Same process only | No | Weak (GET `/chat/turn` status) | No |
| Edit agent | Request-scoped | **No** | No | Runtime poll only | No |
| Edit vite build | BullMQ `edit-build` | If request still waiting | Partial | N/A | Partial |

Additional gaps:

1. **Stream hydrate filter bug:** `GET …/attempts/$attemptId/stream` queries `runtimeEvent` with `where: { buildId: attemptId }`, but progress rows store the real `ProjectBuild.id`. Late-join after channel death can replay **empty** progress.
2. **Cancel does not abort worker:** lease cleared in DB; BullMQ job may run until renew fails → orphan AI spend.
3. **Stale recovery is opportunistic only:** `markStaleProjectBuilds` runs on generate/edit/runtime/preview hits — no background reaper. Stuck work can sit until the next user request (up to lease/stale thresholds).
4. **Progress bus is process-local** (`build-attempt-pubsub`, `discuss-turn-pubsub` in-memory `Map`). Acceptable for single-process deploy; not multi-API.
5. **BullMQ `attempts: 1`** — correct for fail-clean; no auto mid-job resume (by design for this spec).

## Goals

1. **FE starts then listens only** for generate, discuss, and edit. No job requires an open tab after start.
2. **All product jobs on BullMQ** (same queue family): `generate` | `discuss` | `edit` (full agent + compile).
3. **Refresh / navigate away:** reattach live stream when channel exists; else hydrate from DB; never infinite spinner on dead work.
4. **Process/worker death:** fail clean within reaper window; free lease; one-click retry. Progressive-save partial source kept when already written. **No mid-token resume.**
5. **Cancel aborts** in-flight worker work promptly.
6. **Background reaper** marks stale builds, expired leases, and expired discuss turns without waiting for a user request.
7. **Single app process + Redis** (queue only). Progress stays in-memory for v1.
8. **~100 concurrent users:** concurrency admin-tunable; default raised from 1; bottleneck is AI + per-project lease, not FE polling.

## Non-goals (v1)

- Mid-job / mid-token resume or checkpoint continue.
- Auto-requeue the same attempt after crash (optional later; not this spec).
- Horizontal multi-API + Redis progress pub/sub + sticky sessions.
- Separate worker fleet / multi-region.
- Perfect forever-full operation log for every discuss token.
- 1000 concurrent users or multi-region infra.
- Changing generated-site visual design quality.

## Decisions locked (brainstorming)

| Decision | Choice |
|----------|--------|
| Crash recovery bar | **Fail clean + one-click retry** |
| Deploy topology | **Single app process + Redis** (API + BullMQ worker co-located) |
| Discuss durability | **Queue discuss turns on BullMQ** |
| Edit path | **Queue full edit (agent + build)** |
| Architecture approach | **Unified attempt queue** (`project-attempt` kinds) |

## Success criteria

| ID | Criterion |
|----|-----------|
| S1 | Generate: POST → disconnect → EventSource reattach → terminal `done`/`error` without second POST |
| S2 | Discuss: POST → disconnect → reattach turn stream or hydrate → terminal; no hung “running” after process death beyond reaper window |
| S3 | Edit: POST returns quickly with `attemptId`; agent+build run in worker; FE listens like generate |
| S4 | Stream DB replay uses real `ProjectBuild.id` (not `attemptId` as `buildId`); late-join shows persisted progress labels/diffs when present |
| S5 | Cancel clears lease **and** aborts worker `AbortSignal` for that job id |
| S6 | Background reaper (≤ ~60s tick) marks stale builds / expired leases / expired discuss turns without a user request |
| S7 | Process kill mid-job → open attempt/turn becomes failed/stale/expired + lease free → retry CTA works |
| S8 | Default build concurrency ≥ 3 (admin-tunable); documented for ~100 users |
| S9 | Unit + integration coverage for hydrate filter, cancel abort, reaper, discuss/edit enqueue; existing generate reliability harness still green |
| S10 | Docs (this spec + handoff/DEV note) match shipped behavior |

## Architecture

```
FE ──POST start──► API (auth, energy/rate limit, claim lease/turn, DB row, enqueue)
FE ◄──SSE / EventSource── in-process progress channel (single process)
Worker (same process) ◄── Redis BullMQ queue "project-attempt"
  kinds: generate | discuss | edit
Reaper interval ──► global stale builds + lease expiry + discuss turn TTL
Refresh ──► /runtime | GET chat/turn | GET attempt/turn stream
Crash ──► reaper or stream “terputus” ──► UI retry (partial source kept if progressive-save wrote)
```

### Principles

1. **Server owns work lifetime.** HTTP stream is a *view* of the job, not its lifetime.
2. **One active project operation** via existing lease (`claimProjectOperation` / turn claim).
3. **Fail clean, don’t resume mid-token.** Progressive-save is the only partial continuity.
4. **Idempotent job ids** = durable `attemptId` / `turnId`.
5. **Correctness > throughput.** Concurrency is a knob, not a license to skip leases.

## Job kinds (unified queue)

Queue name: `project-attempt` (`ATTEMPT_QUEUE_NAME`).

| Kind | Payload spine | Worker entry | Notes |
|------|---------------|--------------|-------|
| `generate` | `attemptId`, `buildId`, `generateMode`, `operationToken`, `projectId`, `userId`, … | `runBuildAttempt` (existing) | Keep; wire abort map |
| `discuss` | `turnId`, `projectId`, `userId`, discuss inputs | `runDiscussTurn` (move off `void` fire-and-forget in route) | POST only claims + enqueues |
| `edit` | `attemptId`, `buildId`, `operationToken`, `projectId`, `userId`, edit payload | New `runEditAttempt` (agent then compile) | Replaces request-scoped agent + `enqueueAndWaitEditBuild` as primary path |

**Retire as primary path:** request-thread `enqueueAndWaitEditBuild` waiting on HTTP. Compile may still be a function called *inside* the edit worker.

**BullMQ options (v1):**

- `attempts: 1` (fail-clean; no auto requeue).
- `jobId` = `attemptId` or `turnId`.
- `lockDuration` / stall settings aligned with long AI + lease renew (must not stall mid-agent while renewals succeed).
- `removeOnComplete` / `removeOnFail` ages keep current spirit (hours / day scale).

**Concurrency:**

- Setting `runtime.build_concurrency` (existing).
- **Default raise: `1` → `3`** (admin-tunable). Document that ~100 users share AI capacity and **one op per project**.
- Discuss and edit share the same worker pool in v1 (one knob).

## FE contract

All three flows:

1. **Start:** `POST` → response includes durable id (`attemptId` | `turnId`). Optional short SSE tail on POST is allowed but not required for correctness.
2. **Listen:** EventSource (or body SSE) on the stream endpoint for that id; build already uses seq dedupe (`createBuildStreamDeduper`) — keep and mirror where needed.
3. **Refresh / return:**
   - Hydrate from DB (`GET /runtime`, `GET …/chat/turn`, attempt status).
   - If channel **live** → reattach stream.
   - If channel **gone** + work still **open** → fail-clean copy + **retry CTA** (not forever spinner).
   - If **terminal** → show result/error from DB.
4. **FE never drives work** after start (no client keep-alive generate loop).

### Stream APIs

| Path | Role |
|------|------|
| `POST /api/projects/$id/generate` | Claim build lease + create attempt/build + enqueue `generate`; optional SSE tail |
| `GET /api/projects/$id/attempts/$attemptId/stream` | Live channel if live; else DB replay by **real buildId** + terminal; open+gone → restart error |
| `POST /api/projects/$id/edit` | Claim edit lease + create attempt + enqueue `edit`; return `{ attemptId }` quickly |
| `GET /api/projects/$id/attempts/$attemptId/stream` | Same reattach for edit |
| `POST /api/projects/preview` (discuss) | Claim turn + enqueue `discuss`; return `{ turnId }` (or existing shape + turnId) |
| `GET /api/projects/$id/turns/$turnId/stream` **(new)** | Live discuss progress when channel live; else terminal/fail-clean from DB |
| `GET /api/projects/$id/chat/turn` | Hydrate turn status (keep) |
| `GET /api/projects/$id/runtime` | Hydrate active generate/edit job + steps (keep; after reaper) |
| `POST /api/projects/$id/cancel` | Clear lease **and** abort worker by job id + terminal event |

**Progress bus v1:** in-memory maps (existing pattern). Persist labels (and write/replace diffs for generate/edit) for hydrate.

## Lease, durable rows, channel keys

| Flow | Lease | Durable row | Channel key |
|------|-------|-------------|-------------|
| Generate | `kind: "build"` | `ProjectEditAttempt` + `ProjectBuild` | `attemptId` |
| Edit | `kind: "edit"` | same family | `attemptId` |
| Discuss | existing `claimDiscussTurn` TTL | discuss turn row | `turnId` |

Rules:

- Worker renews lease on a timer; cancel / reaper / expire → terminal + clear token.
- Progressive-save for generate/edit stays; discuss keeps final message persist as today.
- One active project operation at a time (existing claim semantics).

## Recovery matrix (fail-clean + one-click retry)

| Event | System | User |
|-------|--------|------|
| Browser drop mid-job | Worker continues; progressive-save keeps partial source | Reopen → reattach or see progress/result |
| Process/worker die | Job not requeued. Open attempt/turn + lease → reaper or stream path marks failed/stale/expired, clear lease | One-click retry (new attempt/turn) |
| Lease expire (~15m) | Fail open attempts + clear lease (existing + reaper) | Retry |
| Build stale (>10m no update) | `markStaleProjectBuilds` (existing thresholds + reaper) | Retry |
| Cancel | Abort worker + clear lease + terminal event | “Proses dihentikan.” |
| Empty source / bad mode | Keep `resolveGenerateMode` + empty `retry_build` demotion | Retry generate |

### User-facing copy (Indonesian, existing tone)

- Cancel: “Proses dihentikan.”
- Restart / channel gone while open: “Server restart terputus. Coba jalankan lagi.” (discuss/edit may use the same or parallel wording for “turn”/“edit”).
- Stale/lease: existing Indonesian failure summaries; UI always offers **retry** when terminal fail/stale/canceled.

## Must-fix items (in scope)

### 1. Stream hydrate `buildId` filter

**Bug:** `src/routes/api.projects.$id.attempts.$attemptId.stream.ts` uses `where: { buildId: attemptId }`.

**Fix:** Load attempt’s real `buildId` (or join) and query `runtimeEvent` by that `ProjectBuild.id`. Optionally also match metadata `attemptId` if stored — primary key is real build id.

Replay should include persisted operation rows with `diff` when present (already written by worker after prior fix).

### 2. Cancel aborts worker

Maintain a process-local registry: `jobId → AbortController` (or equivalent) registered when worker starts a job, removed on finish.

`POST …/cancel` (and reaper terminalization where appropriate) signals abort. Worker paths must honor `abortSignal` (generate already takes one; discuss/edit must take one too).

### 3. Background reaper

- Start with attempt queue worker (or app bootstrap).
- Interval **~60s**.
- Global sweep (not project-scoped only):
  1. Builds `queued`/`running` with `updatedAt` older than **10m** → `stale` (same constants as `STALE_BUILD_TIMEOUT_MS`).
  2. Projects with expired `activeOperationExpiresAt` + token → fail open attempts + clear lease.
  3. Discuss turns past TTL still `running` → `failed`/`expired`.
- Idempotent; safe alongside opportunistic `markStaleProjectBuilds` on user routes.
- Log counts only; never secrets.

### 4. Queue discuss

- Route: claim turn → enqueue `kind: "discuss"` → return; stream is view.
- Worker runs existing `runDiscussTurn` logic with abort + publish to discuss channel.
- New `GET …/turns/$turnId/stream` mirrors attempt stream (live vs DB/terminal).

### 5. Queue full edit

- Route: claim edit lease → create attempt/build rows as needed → enqueue `kind: "edit"` → return `{ attemptId }`.
- Worker: run agent tools/path currently in `edit.ts` request body, then compile (reuse edit-build logic as function).
- FE: listen on attempt stream; hydrate via `/runtime`.

## Components / file touch map (implementation guidance)

| Area | Likely files |
|------|----------------|
| Queue | `src/lib/projects/attempt-queue.ts` — job types, worker dispatch, abort registry hooks, concurrency default |
| Generate worker | `src/lib/projects/build-attempt-worker.ts` — abort registration |
| Discuss | `src/routes/api.projects.preview.ts`, `src/lib/projects/discuss-turn-worker.ts`, `src/lib/projects/discuss-turn-pubsub.ts`, new turn stream route |
| Edit | `src/routes/api.projects.$id.edit.ts`, new/extended edit attempt worker, fold `edit-build-queue-worker.ts` |
| Stream hydrate | `src/routes/api.projects.$id.attempts.$attemptId.stream.ts` |
| Cancel | `src/routes/api.projects.$id.cancel.ts` + abort registry module |
| Reaper | new `src/lib/projects/job-reaper.ts` (or extend `stale-builds.ts`) + start from worker bootstrap |
| FE | `WorkspaceShell.tsx`, `useBuildAttemptStream.ts`, discuss reattach hooks |
| Settings | default `runtime.build_concurrency` |
| Tests | unit + route tests parallel to existing generate/discuss tests |
| Docs | this spec; handoff; short DEV note on recovery matrix |

## Testing bar

1. **Unit:** hydrate uses correct `buildId`; cancel aborts registered controller; reaper marks lease/build/turn; discuss/edit job shapes enqueue.
2. **Integration:** POST generate → drop SSE → EventSource reattach → done; discuss turn stream same pattern; edit POST returns fast, work finishes in worker.
3. **Crash sim:** kill mid-job → reaper or stream path → failed + lease free → retry succeeds.
4. **Load smoke (optional):** N concurrent projects without sticky FE; no forever spinners.
5. **Existing** generate reliability harness remains green.

## Rollout order

1. Fix hydrate filter + cancel abort + reaper (correctness; minimal product surface).
2. Queue discuss (+ turn stream) — optional flag `runtime.discuss_queue` if needed for safe rollout; default on when stable.
3. Queue full edit.
4. Raise default concurrency to 3; watch queue depth / lease conflicts.
5. Update handoff + DEV recovery matrix; mark this spec **Implemented** when S1–S10 pass.

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Double-charge energy on confused retry | Fail-clean only; new attempt/turn; no auto requeue same id |
| Orphan worker after cancel | Abort registry + lease renew checks |
| Discuss UX regression | Keep GET `/chat/turn` hydrate; add stream; feature flag if needed |
| Edit payload large on queue | Store edit intent in DB row; job carries ids only |
| Reaper too aggressive | Same thresholds as today (10m build, existing lease/TTL); only globalizes existing rules |
| Single process restart | Accept fail-clean; reaper ≤60s + stream error path |

## Out of scope follow-ups (explicit)

- Redis (or bus) progress pub/sub for multi-instance.
- Rate-limit store on Redis if memory limiter is single-instance-only (audit when scaling horizontally).
- True checkpoint resume.
- Auto-requeue once on infrastructure failure only.
- Separate discuss concurrency knob.

## Spec self-review notes

- No TBD placeholders for v1 decisions.
- Crash bar, topology, discuss, edit, approach locked and consistent across sections.
- Hydrate bug called out with concrete fix (real `buildId`).
- Non-goals prevent scope creep into multi-instance resume.
- Implementation plan is a separate document (`docs/superpowers/plans/…`) after user reviews this file.
