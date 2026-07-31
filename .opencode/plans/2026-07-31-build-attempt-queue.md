# Build Attempt Queue + Live Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overflow generate/edit work waits in BullMQ (Redis) under `runtime.build_concurrency` instead of failing with `concurrency_limit`; admin concurrency changes apply live without process restart.

**Architecture:** One BullMQ queue `project-attempt` in the same Bun server process. Generate enqueues full `runBuildAttempt`; edit enqueues post-source vite build+finalize. Worker concurrency tracks `runtime.build_concurrency` (default 1). Settings PUT re-primes the AppSetting snapshot and refreshes worker concurrency. In-process `activeBuilds` reject-gate is removed once paths go through the queue.

**Tech Stack:** BullMQ, existing Redis (`docker-compose` `127.0.0.1:6379`), Vitest, existing `runBuildAttempt` / `createLocalBuildWorker`, admin settings registry.

**Spec:** `.opencode/plans/2026-07-31-build-attempt-queue-design.md` — on kickoff copy to `docs/superpowers/specs/2026-07-31-build-attempt-queue-design.md` (plan-mode write gate blocked that path earlier).

## Global Constraints

- Default concurrency fallback stays **1** (do not raise product default)
- No AI auto-retry (`attempts: 1`) — avoid double energy charge
- No `process.exit` on settings save
- No RabbitMQ/Kafka; Redis only
- User-facing copy stays Indonesian where touched; code/docs English
- No secrets in tracked files; `.env.example` uses `REDIS_URL=""`
- Bun only; keep `bun.lock`
- Surgical diffs; update `DEV.md` when Redis becomes required for builds
- Always-on queue after cutover (no dual inline/queue feature flag)

---

### Task 0: Canonicalize design doc

**Files:**

- Create: `docs/superpowers/specs/2026-07-31-build-attempt-queue-design.md` (copy from `.opencode/plans/2026-07-31-build-attempt-queue-design.md`, drop the “Canonical path after plan mode” footer)

- [ ] **Step 1: Copy design into specs/**

```bash
cp .opencode/plans/2026-07-31-build-attempt-queue-design.md \
  docs/superpowers/specs/2026-07-31-build-attempt-queue-design.md
# Remove the trailing "Canonical path after plan mode" section from the copy
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-31-build-attempt-queue-design.md
git commit -m "docs(specs): build attempt queue + live concurrency design"
```

---

### Task 1: Live settings — re-prime on PUT + drop false `requiresRestart`

**Files:**

- Modify: `src/routes/api.admin.settings.ts` (PUT success path ~140)
- Modify: `src/lib/app-settings-registry.ts` (`runtime.build_concurrency` entry ~351–361)
- Modify: `src/lib/app-settings.test.ts` (or add focused test if PUT is hard to hit — prefer unit on invalidate+prime path already partially covered)
- Test: extend `src/lib/app-settings.test.ts` and registry assertion if any exists

**Interfaces:**

- Consumes: `invalidateSettingCache`, `primeSettingCache` from `@/lib/app-settings`
- Produces: after admin PUT, `getSettingSync` returns DB values without restart

- [ ] **Step 1: Failing test — re-prime restores sync read after invalidate**

In `src/lib/app-settings.test.ts`, add (follow existing prisma mock patterns in that file):

```ts
it("getSettingSync returns DB value after invalidate + prime (admin save path)", async () => {
  // seed DB mock with runtime.build_concurrency = 3
  // await primeSettingCache()
  // expect(getSettingSync("runtime.build_concurrency", 1)).toBe(3)
  // invalidateSettingCache()
  // without re-prime, sync may fall back — then:
  await primeSettingCache();
  expect(getSettingSync("runtime.build_concurrency", 1)).toBe(3);
});
```

Also assert registry:

```ts
import { findConfigEntry } from "@/lib/app-settings-registry";

it("runtime.build_concurrency does not require restart", () => {
  expect(
    findConfigEntry("runtime.build_concurrency")?.requiresRestart,
  ).toBeFalsy();
});
```

- [ ] **Step 2: Run test — expect registry assertion FAIL (still `requiresRestart: true`)**

```bash
bun run test src/lib/app-settings.test.ts
```

- [ ] **Step 3: Implement**

`api.admin.settings.ts` PUT after transaction:

```ts
import { invalidateSettingCache, primeSettingCache } from "@/lib/app-settings";
// ...
invalidateSettingCache();
await primeSettingCache();
// Task 3 will also call refreshAttemptWorkerConcurrency() here
return Response.json({ ok: true });
```

`app-settings-registry.ts` — on `runtime.build_concurrency`, **remove** `requiresRestart: true` (or set `false`). Leave `runtime.max_containers` unchanged.

- [ ] **Step 4: Tests pass**

```bash
bun run test src/lib/app-settings.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.admin.settings.ts src/lib/app-settings-registry.ts src/lib/app-settings.test.ts
git commit -m "fix(admin): re-prime settings on save; build concurrency live"
```

---

### Task 2: Redis URL + BullMQ dependency + connection helper

**Files:**

- Modify: `package.json` / `bun.lock` via `bun add bullmq ioredis`
- Modify: `.env.example` — add `REDIS_URL=""` near other infra vars with comment: local default `redis://127.0.0.1:6379` when unset in dev
- Create: `src/lib/redis-url.ts`
- Create: `src/lib/redis-url.test.ts`
- Create: `src/lib/projects/attempt-queue-connection.ts`

**Interfaces:**

- Produces:
  - `getRedisUrl(): string` — `process.env.REDIS_URL?.trim() || "redis://127.0.0.1:6379"`
  - `getAttemptQueueConnection(): { host, port, password? } | { url: string }` suitable for BullMQ `connection` option (parse URL; keep simple)

- [ ] **Step 1: Install**

```bash
bun add bullmq ioredis
```

- [ ] **Step 2: Tests for URL default**

```ts
// src/lib/redis-url.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { getRedisUrl } from "@/lib/redis-url";

describe("getRedisUrl", () => {
  const prev = process.env.REDIS_URL;
  afterEach(() => {
    if (prev === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = prev;
  });

  it("defaults to local compose Redis", () => {
    delete process.env.REDIS_URL;
    expect(getRedisUrl()).toBe("redis://127.0.0.1:6379");
  });

  it("honors REDIS_URL when set", () => {
    process.env.REDIS_URL = "redis://example:6380";
    expect(getRedisUrl()).toBe("redis://example:6380");
  });
});
```

- [ ] **Step 3: Implement `getRedisUrl` + connection export**

```ts
// src/lib/redis-url.ts
export function getRedisUrl(): string {
  const raw = process.env.REDIS_URL?.trim();
  return raw && raw.length > 0 ? raw : "redis://127.0.0.1:6379";
}
```

```ts
// src/lib/projects/attempt-queue-connection.ts
import { getRedisUrl } from "@/lib/redis-url";

export function getAttemptQueueConnection() {
  return { url: getRedisUrl() };
}
```

(If BullMQ version requires host/port only, parse with `new URL(getRedisUrl())` — verify against installed bullmq types.)

- [ ] **Step 4: `.env.example`**

```bash
# BullMQ / attempt queue (compose redis: 127.0.0.1:6379). Empty = local default.
REDIS_URL=""
```

- [ ] **Step 5: Test + commit**

```bash
bun run test src/lib/redis-url.test.ts
git add package.json bun.lock .env.example src/lib/redis-url.ts src/lib/redis-url.test.ts src/lib/projects/attempt-queue-connection.ts
git commit -m "feat(queue): bullmq deps + redis url helper"
```

---

### Task 3: Attempt queue module — enqueue + worker + concurrency refresh

**Files:**

- Create: `src/lib/projects/attempt-queue.ts`
- Create: `src/lib/projects/attempt-queue.test.ts`
- Modify: `src/lib/instrumentation.ts` — start worker after other boot work
- Modify: `src/routes/api.admin.settings.ts` — call concurrency refresh after prime

**Interfaces:**

```ts
export type AttemptJobKind = "generate" | "edit-build";

export type GenerateAttemptJob = {
  kind: "generate";
  attemptId: string;
  buildId: string;
  generateMode: "first_generate" | "retry_build";
  operationToken: string;
  projectId: string;
  projectPrompt: string;
  projectStatus: string;
  userId: string;
};

export type EditBuildAttemptJob = {
  kind: "edit-build";
  attemptId: string;
  buildId: string;
  operationToken: string;
  projectId: string;
  snapshotId: string;
  userId: string;
  // files are already on snapshot/source artifact — worker reloads via snapshotId
};

export type AttemptJob = GenerateAttemptJob | EditBuildAttemptJob;

export async function enqueueAttemptJob(job: AttemptJob): Promise<void>;
/** jobId = attemptId for idempotent enqueue */
export function startAttemptQueueWorker(): void;
export function refreshAttemptWorkerConcurrency(): void;
export function getBuildConcurrencyLimit(): number; // shared helper from settings
```

**Worker behavior:**

- Queue name: `project-attempt`
- `attempts: 1`, modest `removeOnComplete` / `removeOnFail` (e.g. count 100 / age 1h — pick numbers, document in code)
- `concurrency: getBuildConcurrencyLimit()` from `getSettingSync("runtime.build_concurrency", 1)` clamped ≥1
- On `generate`: `AbortController` local (not request-linked); call `runBuildAttempt({...})`
- On `edit-build`: call `runEditBuildAttempt(...)` (Task 5 implements; Task 3 can stub with throw until Task 5 — prefer implement generate processor fully in Task 4 wiring, edit in Task 5)
- `refreshAttemptWorkerConcurrency`: set `worker.concurrency = getBuildConcurrencyLimit()` if worker exists
- Boot: `startAttemptQueueWorker()` from `register()` after production checks (log error + throw if Redis unreachable on first connect in production; in dev log loud and throw too — fail fast per spec)

**Testing without Redis:** unit-test pure helpers (`getBuildConcurrencyLimit` clamp) and mock Queue/Worker via `vi.mock("bullmq")` for enqueue jobId + refresh.

- [ ] **Step 1: Failing tests**

```ts
// attempt-queue.test.ts
it("getBuildConcurrencyLimit clamps invalid to 1", ...);
it("enqueueAttemptJob uses attemptId as jobId", async () => {
  // mock Queue.add and assert add("project-attempt" or default name, data, { jobId: attemptId, attempts: 1 })
});
```

- [ ] **Step 2: Implement module + wire boot + admin refresh**

Extract concurrency read (same logic as today’s `getBuildConcurrencyLimit` in `build-worker.ts`) into `attempt-queue.ts` or shared one-liner; Task 6 will delete duplicate from build-worker.

```ts
// instrumentation.ts — end of register():
const { startAttemptQueueWorker } =
  await import("@/lib/projects/attempt-queue");
startAttemptQueueWorker();
```

```ts
// api.admin.settings.ts PUT:
invalidateSettingCache();
await primeSettingCache();
const { refreshAttemptWorkerConcurrency } =
  await import("@/lib/projects/attempt-queue");
refreshAttemptWorkerConcurrency();
```

- [ ] **Step 3: Tests pass**

```bash
bun run test src/lib/projects/attempt-queue.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/projects/attempt-queue.ts src/lib/projects/attempt-queue.test.ts src/lib/instrumentation.ts src/routes/api.admin.settings.ts
git commit -m "feat(queue): project-attempt bullmq worker skeleton"
```

---

### Task 4: Cut generate path to the queue

**Files:**

- Modify: `src/routes/api.projects.$id.generate.ts` (~230–244)
- Ensure early build row stays **`queued`** until worker starts (today create uses `running` at lines ~200–204 — change to `queued`, worker sets `running` + `startedAt` at start of `runBuildAttempt` or in queue processor before calling it)

**Current:**

```ts
void runBuildAttempt({...}).catch(...);
return createReadStreamFromChannel(operationAttemptId);
```

**Target:**

```ts
await enqueueAttemptJob({
  kind: "generate",
  attemptId: operationAttemptId,
  buildId: earlyBuildId,
  generateMode,
  operationToken: operation.token,
  projectId,
  projectPrompt,
  projectStatus: project.status,
  userId,
});
// optional: publish progress "Menunggu giliran build..." once — only if existing UX has a slot; else skip
return createReadStreamFromChannel(operationAttemptId);
```

Worker processor for `generate`:

```ts
await runBuildAttempt({
  abortSignal: new AbortController().signal,
  attemptId: job.attemptId,
  buildId: job.buildId,
  generateMode: job.generateMode,
  operationToken: job.operationToken,
  project: {
    id: job.projectId,
    prompt: job.projectPrompt,
    status: job.projectStatus,
  },
  userId: job.userId,
});
```

If `runBuildAttempt` assumes build already `running`, either:

- keep route creating `running` (queue only serializes start — weaker honesty), or
- **preferred:** route creates `queued`; at top of `runBuildAttempt` (or processor) update build → `running` + `startedAt`.

- [ ] **Step 1: Change generate route enqueue + status honesty**
- [ ] **Step 2: Worker runs `runBuildAttempt`**
- [ ] **Step 3: Manual smoke** (Redis up): `bun run infra` / ensure redis, `bun run dev`, trigger generate — still streams progress
- [ ] **Step 4: Commit**

```bash
git add src/routes/api.projects.$id.generate.ts src/lib/projects/attempt-queue.ts src/lib/projects/build-attempt-worker.ts
git commit -m "feat(generate): enqueue build attempts on bullmq"
```

---

### Task 5: Cut edit build phase to the queue

**Files:**

- Create: `src/lib/projects/edit-build-attempt-worker.ts` (extract from edit route)
- Modify: `src/routes/api.projects.$id.edit.ts` (~711–850 region — build create through finalize/deployment)
- Modify: `src/lib/projects/attempt-queue.ts` processor for `edit-build`

**Problem:** Edit AI stays in-request (SSE). Only vite+finalize hits `createLocalBuildWorker` and can `concurrency_limit`.

**Approach:**

1. After snapshot + source artifact written, create `projectBuild` with status **`queued`** (do **not** flip to `running` yet).
2. `await enqueueAttemptJob({ kind: "edit-build", attemptId, buildId, snapshotId, projectId, userId, operationToken })`.
3. **Wait for job completion** inside the edit SSE path so existing client contract (single stream through build) stays:
   - Use BullMQ `QueueEvents` `waitUntilFinished(job, ttl)` **or** enqueue then poll job state.
   - Prefer: `const job = await queue.add(...); await job.waitUntilFinished(queueEvents, timeoutMs)` with timeout aligned to operation TTL (15m).
4. Worker `runEditBuildAttempt`:
   - Mark build `running`
   - Load files from snapshot/source artifact (`resolveProjectSourceFiles` / `readProjectSourceArtifact`)
   - `createLocalBuildWorker().runBuild(...)` (gate removed in Task 6)
   - Same finalize/deployment/thumbnail side effects currently after `runBuild` in edit route — **move** that block into the worker so the route only waits for terminal job state and then emits the same SSE `done`/`error` based on DB or job return value

**Minimal variant if extract is too large:** worker only runs build+DB finalize; returns `{ status, logText, ... }` via job return value; route keeps SSE emits. Prefer return-value to avoid double-writing.

**Concrete extract target:** everything from `createLocalBuildWorker().runBuild` through deployment create + success/error `send(...)` that depends on buildResult — either fully in worker with progress via existing pubsub if edit uses it, or job return + route send.

Read edit route carefully: edit uses local `send` on the SSE controller, not necessarily `publishBuildProgress`. If so, **job return value + route send** is the right split.

```ts
// route after enqueue+wait:
const result = await waitForEditBuildJob(attemptId);
// then existing send("done"|"error") using result
```

- [ ] **Step 1: Extract `runEditBuildAttempt` returning structured result**
- [ ] **Step 2: Wire queue processor + `waitUntilFinished` helper in attempt-queue**
- [ ] **Step 3: Edit route: queued → enqueue → wait → SSE terminal events**
- [ ] **Step 4: Smoke one edit under concurrency 1 while generate holds the slot — edit waits, then completes (no `concurrency_limit`)**
- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/edit-build-attempt-worker.ts src/lib/projects/attempt-queue.ts src/routes/api.projects.$id.edit.ts
git commit -m "feat(edit): queue vite build phase via bullmq"
```

---

### Task 6: Remove in-process concurrency reject gate

**Files:**

- Modify: `src/lib/projects/build-worker.ts` — remove `activeBuilds` / `getBuildConcurrencyLimit` reject path
- Modify: `src/lib/projects/build-worker.test.ts` — delete or rewrite the `concurrency_limit` rejection test (replace with “allows parallel runBuild when called concurrently” **or** remove if queue is sole limiter)
- Keep: `concurrency_limit` in `build-logs.ts` enum/copy until no references remain; if unused, leave enum for one release or remove + update `build-logs.test.ts` / `build-repair-planner` lists

**Goal:** No user-visible `concurrency_limit` from normal generate/edit.

- [ ] **Step 1: Update tests first (TDD)** — concurrent two `runBuild` both succeed with slow mock build
- [ ] **Step 2: Remove gate**
- [ ] **Step 3:**

```bash
bun run test src/lib/projects/build-worker.test.ts src/lib/projects/build-logs.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/projects/build-worker.ts src/lib/projects/build-worker.test.ts
git commit -m "refactor(build-worker): drop in-process concurrency reject"
```

---

### Task 7: Docs + DEV workflow

**Files:**

- Modify: `DEV.md` — Redis required for generate/edit queue; `bun run infra` / compose redis port; `REDIS_URL`; operator note: concurrency 1 default, raise 2–4 local via admin
- Modify: `AGENTS.md` only if commands change (optional one-liner under infra)
- No secret values

- [ ] **Step 1: Write DEV section** (short)

```markdown
## Attempt queue (BullMQ)

Generate/edit heavy work runs through Redis-backed BullMQ (`project-attempt`).
Local Redis: `docker compose` service `redis` on `127.0.0.1:6379` (started with
`bun run infra` / default compose). Override with `REDIS_URL`.

Concurrency: admin **Runtime — build concurrency** (default 1). Live after save
(no restart). Local multi-user stress: set 2–4 if RAM allows (~2GB per parallel vite).
```

- [ ] **Step 2: Commit**

```bash
git add DEV.md
git commit -m "docs(dev): redis/bullmq attempt queue requirements"
```

---

### Task 8: Verification gate

- [ ] **Step 1: Focused tests**

```bash
bun run test src/lib/app-settings.test.ts src/lib/redis-url.test.ts \
  src/lib/projects/attempt-queue.test.ts src/lib/projects/build-worker.test.ts \
  src/lib/projects/build-logs.test.ts
```

- [ ] **Step 2: `bun run check`** (or at least lint/typecheck on touched files if iterating)

- [ ] **Step 3: Manual checklist**
  1. Redis up; concurrency 1; start generate A; start generate B → B `queued`/waits; both succeed; neither `concurrency_limit`
  2. Admin set concurrency 2; save; no restart; two generates can overlap
  3. Edit while generate running (concurrency 1) → edit build waits then finishes

- [ ] **Step 4: Final commit only if docs/tests fixed up**

---

## Self-review (plan vs spec)

| Spec requirement                          | Task                       |
| ----------------------------------------- | -------------------------- |
| Whole-attempt generate on BullMQ          | 3–4                        |
| Edit build on same queue                  | 5                          |
| Wait not reject                           | 4–6                        |
| Default concurrency 1                     | unchanged fallback; Task 1 |
| Live settings re-prime                    | 1                          |
| Drop requiresRestart on build concurrency | 1                          |
| Worker concurrency refresh                | 3                          |
| No auto-restart                           | 1, 3                       |
| attempts: 1 / no AI retry                 | 3                          |
| Redis env empty in example                | 2                          |
| DEV.md                                    | 7                          |
| Remove in-process reject                  | 6                          |
| Design in docs/specs                      | 0                          |

**Out of plan (spec follow-ups):** rename to `attempt_concurrency`, discuss queue, separate worker process, queue position UI, AI resume checkpoints.

**Edit AI still unbounded across users:** accepted v1 partial (spec: edit-build job); generate AI is bounded by worker concurrency.

---

## Execution handoff

Plan saved to `.opencode/plans/2026-07-31-build-attempt-queue.md`.

On implement kickoff also copy plan to `docs/superpowers/plans/2026-07-31-build-attempt-queue.md` if that path is writable.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — this session with executing-plans checkpoints

Which approach?
