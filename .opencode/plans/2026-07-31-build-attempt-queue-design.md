# Build attempt queue + live runtime concurrency

## Goal

Under multi-user load, a second project must **wait**, not **fail**. Today a
process-global in-memory cap of 1 rejects overflow with `concurrency_limit`.
Admin can raise `runtime.build_concurrency`, but there is no real queue, and
the `perlu restart` chip is misleading for a value that is already read live.

This design:

1. Makes overflow **wait** via BullMQ + the existing Redis service.
2. Queues the **whole generate/edit attempt** (not vite-only).
3. Makes admin concurrency changes **apply without process restart**.
4. Keeps product **default concurrency = 1**; operators raise 2–4 per machine.

## Current state (facts)

| Piece             | Behavior today                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| Cap               | `src/lib/projects/build-worker.ts` module `activeBuilds`; limit from `getSettingSync("runtime.build_concurrency", 1)` |
| Overflow          | Immediate `failed` + `concurrency_limit` — Indonesian copy: wait and retry                                            |
| Default           | Registry fallback **1**; env `PROJECT_BUILD_CONCURRENCY`; admin advanced "Runtime — build concurrency"                |
| `requiresRestart` | `true` on that key — chip **perlu restart**                                                                           |
| Save path         | PUT upserts DB, `invalidateSettingCache()`, does **not** re-prime snapshot                                            |
| Sync read risk    | After invalidate, `getSettingSync` can fall through to fallback `1` until boot re-prime                               |
| Generate          | `void runBuildAttempt(...)` detached in-process (`api.projects.$id.generate.ts`)                                      |
| Edit build        | `createLocalBuildWorker().runBuild(...)` inline in edit route                                                         |
| DB `queued`       | Transient / cosmetic on edit (create `queued` → immediately `running`); not a wait queue                              |
| Per-project mutex | `claimProjectOperation` — one active op per project; orthogonal to global capacity                                    |
| Redis             | Already in `docker-compose.yml` (`redis:7-alpine`); no BullMQ dependency yet                                          |
| Specs             | Discuss/build designs call a durable worker queue **Stage C**, deferred                                               |

Stress failure mode: multiple users/projects share one process; with concurrency
1 the second attempt dies; raising concurrency without a queue only moves the
cliff and still rejects when over cap.

## Non-goals (v1)

- RabbitMQ, Kafka, or any broker besides Redis.
- Separate worker OS process / horizontal worker fleet (same Bun process first).
- Discuss-turn queue.
- Two queues (AI vs build) or per-user fair scheduling.
- Auto `process.exit` / process-manager restart when admin saves settings.
- Raising the **product fallback** above 1.
- Idempotent mid-AI resume / step checkpoints.
- Auto-retry of failed AI attempts (double-charge risk).

## Design

### 1. Queue ownership: whole attempt

**Decision:** one BullMQ queue owns the full generate/edit heavy path.

| Option                                     | Verdict                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| Build step only (`createLocalBuildWorker`) | Rejected for v1 — fixes the labeled error, leaves unbounded parallel AI |
| Two queues (AI + build)                    | Deferred — more knobs, ordering complexity                              |
| **Whole attempt**                          | **Chosen** — one global capacity bound for multi-user stress            |

**Jobs:**

| Job name             | Payload (min)                                                                   | Runs                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `project.generate`   | `projectId`, `attemptId`, `buildId`, `userId`, `generateMode`, `operationToken` | existing `runBuildAttempt`                                                                                  |
| `project.edit-build` | same shape as needed for edit finalize path                                     | extract edit’s post-source build+finalize into a worker entry (or one shared `project.attempt` with `kind`) |

Prefer a single queue name `project-attempt` with `kind: "generate" | "edit"` so
one Worker concurrency setting applies to both.

**Entry flow:**

```
POST generate | edit
  → auth + claimProjectOperation (unchanged; per-project single-flight)
  → create attempt / build rows with status queued (honest)
  → bullmq.add("project-attempt", payload, { jobId: attemptId })
  → return SSE tail / response (unchanged client contract)
Worker (concurrency = runtime.build_concurrency)
  → mark running / startedAt
  → run existing attempt logic
  → finalize operation + publish progress
```

**Invariants:**

- Per-project mutex stays on `claimProjectOperation` / operation token TTL.
- Queue is **global machine capacity**, not a second per-project lock.
- `jobId = attemptId` (or buildId) for idempotent enqueue (duplicate POST does
  not double-run).
- SSE/progress pubsub stays as today; worker publishes the same events.

### 2. Concurrency setting

| Concern          | Rule                                                                              |
| ---------------- | --------------------------------------------------------------------------------- |
| Source order     | DB → env `PROJECT_BUILD_CONCURRENCY` → fallback **1** (unchanged)                 |
| Registry min/max | 1–16 (max = input clamp only, not a target)                                       |
| Product default  | **1**                                                                             |
| Local stress     | Operator sets **2–4** via admin or env                                            |
| Prod guidance    | **1–2** until metrics; raise only with headroom                                   |
| Rule of thumb    | `min(floor(RAM_GB/2), max(1, nproc-1), llm budget)` — ~2GB peak per parallel vite |

**Rename (optional, same change or follow-up):** label/key may become
`runtime.attempt_concurrency` because the knob bounds whole attempts, not only
vite. If rename is deferred, document that `runtime.build_concurrency` means
attempt concurrency after this ships.

**Live apply (no restart):**

1. Admin PUT already `invalidateSettingCache()`.
2. Add **`await primeSettingCache()`** after invalidate so snapshot is warm and
   `getSettingSync` does not drop to fallback 1.
3. Set `requiresRestart: false` on `runtime.build_concurrency` (remove chip).
4. BullMQ `Worker` concurrency updated when the setting changes (re-read on a
   short interval, or explicit `worker.concurrency = n` after PUT via a small
   in-process hook). No `process.exit`.

**`runtime.max_containers`:** leave `requiresRestart` as-is unless its consumer
is also proven live; out of scope except not cargo-culting auto-restart.

**Auto-restart on `perlu restart`:** rejected for this key. True boot-bound
settings can be revisited later; process kill kills in-flight work and is
hostile to `bun dev`.

### 3. BullMQ + Redis

**Stack:** `bullmq` + Redis already in compose. Connection from env
(e.g. `REDIS_URL`, default `redis://127.0.0.1:6379` for local infra).

**Worker process model (v1):** same long-lived Bun server process that serves
HTTP. Boot: prime settings → start Worker. Later split to a separate worker
process without changing job payload.

**Concurrency:** Worker `concurrency` = effective `runtime.build_concurrency`.

**In-process `activeBuilds` gate:** remove reject-on-cap from
`createLocalBuildWorker` **or** keep as a last-ditch safety equal to the same
setting only if a code path still bypasses the queue. Goal: no user-visible
`concurrency_limit` for normal generate/edit once enqueued. Paths that skip the
queue must be deleted or wired.

**Job options (v1):**

| Option                | Value                                                              | Why                                               |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| Attempts / auto-retry | **1** (no AI re-run)                                               | Avoid double energy charge / partial side effects |
| Optional retry        | Only classified infra failures before work starts (optional later) | Safe empty retry                                  |
| `removeOnComplete`    | modest retention                                                   | Debug without unbounded Redis growth              |
| `removeOnFail`        | modest retention                                                   | Same                                              |
| Stall interval        | align with operation TTL / build stale sweeper                     | Crash mid-job → failed + client retry CTA         |

**Crash mid-attempt honesty:** queue makes **wait** and **enqueue durability**
better; it does **not** make AI generation idempotent. On worker death mid-job:
stale-build / operation TTL path marks failed; user retries. Document this
ceiling (same family as today’s Stage C note, improved only for “never started”
and “waiting in Redis”).

**Energy:** no change to charge points inside `runBuildAttempt`; because
auto-retry is off, queue does not introduce double-charge. Any future retry
must re-read energy rules first.

### 4. Status + UX

| State                          | Meaning after this design                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `queued`                       | Job in Redis (or claimed but worker not started) — **honest wait**                            |
| `running`                      | Worker executing attempt                                                                      |
| `failed` + `concurrency_limit` | Should become rare/unreachable on queued paths; keep enum/copy for safety/tests until removed |

Client already treats `queued` / `running` as in-flight. Prefer progress label
like existing Indonesian copy for busy server if we surface queue position
later; **v1 needs no queue-position UI** — waiting without false failure is
enough.

### 5. Settings PUT hardening (small, same ship)

In `api.admin.settings.ts` PUT success path:

```ts
invalidateSettingCache();
await primeSettingCache();
```

Apply to all settings saves (not only concurrency): fixes sync-reader staleness
generally. Tests: after PUT (or simulated invalidate+prime), `getSettingSync`
returns DB value.

### 6. Infra / env

| Item                       | Action                                                                         |
| -------------------------- | ------------------------------------------------------------------------------ |
| `docker-compose.yml` redis | Already present; ensure app/dev docs mention Redis required for queue          |
| `bun run infra`            | Confirm redis starts with current infra script                                 |
| `.env.example`             | `REDIS_URL=""` (empty placeholder; no secrets) + short comment                 |
| Prod compose               | Redis service or managed Redis; fail boot loud if queue enabled and Redis down |
| Feature flag (optional)    | Prefer always-on after cutover — dual path is how overflow bugs survive        |

### 7. Testing

1. **Unit:** settings PUT → prime → `getSettingSync("runtime.build_concurrency")`
   matches DB; `requiresRestart` false for that key.
2. **Unit:** enqueue dedupe by `jobId` / attempt id.
3. **Worker unit:** with concurrency 1, second job stays waiting; first completion
   starts second — **no** `concurrency_limit` failure.
4. **Integration (optional local):** two generate claims from two projects;
   both succeed sequentially/parallel per concurrency; neither gets
   `concurrency_limit`.
5. **Regression:** existing `build-worker` tests updated for new gate behavior;
   `concurrency_limit` copy tests remain until reason removed.
6. **Energy:** single attempt still charges once; no retry path in v1.

### 8. Rollout slices (implement in order)

1. **Settings live path** — re-prime on PUT; drop false `requiresRestart` on
   build concurrency; tests.
2. **BullMQ wiring** — connection helper, queue, worker boot, health/fail-fast.
3. **Cut generate** to enqueue + worker runs `runBuildAttempt`.
4. **Cut edit build** to same queue; delete dual reject paths.
5. **Remove or neutralize** in-process reject-as-failure for queued flows;
   update tests/copy if reason retired.
6. **Docs** — `DEV.md` Redis requirement; Stage C note → done for attempts.

## Alternatives considered

| Alternative                    | Why not                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| Only raise default concurrency | Still rejects over cap; thrash under load                        |
| In-process FIFO array          | Dies on restart; multi-instance wrong                            |
| Postgres `SKIP LOCKED`         | Viable without Redis; more custom code; Redis already in compose |
| RabbitMQ / Kafka               | Ops and model mismatch for job fan-in                            |
| Auto process restart on save   | Kills in-flight work; wrong for live-read knobs                  |
| Build-only queue               | Leaves parallel AI as the real stress vector                     |

## Success criteria

- Two concurrent generates from different projects with concurrency 1: second
  stays `queued`, then runs; neither fails with `concurrency_limit`.
- Admin sets concurrency to 2, saves, no restart: two attempts can run together
  (machine permitting).
- Default unset install still concurrency 1.
- Server restart: jobs that never started can be picked up per BullMQ; mid-AI
  crash still surfaces failed + retry (documented).
- No new secrets in tracked files; Redis URL empty in `.env.example`.

## Open follow-ups (not v1)

- Rename setting to `runtime.attempt_concurrency`.
- Separate worker process / multiple Node workers.
- Discuss-turn queue.
- Fairness (per-user caps), queue position in UI.
- Safe infra-only retry; step checkpoints for resume.
- Split AI vs compile concurrency once metrics justify it.

---

**Canonical path after plan mode:** move/copy to
`docs/superpowers/specs/2026-07-31-build-attempt-queue-design.md` on implement
kickoff (plan-mode write gate blocked that path).
