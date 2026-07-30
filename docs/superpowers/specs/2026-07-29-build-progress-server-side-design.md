# Build-Progress Server-Side (Reconnectable Generate) — Design

**Date:** 2026-07-29
**Status:** Brainstormed 2026-07-29; pending review
**Relationship to other plans:** Mirrors `2026-07-23-discuss-turn-server-side-design.md` for the build (generate) path. Pairs with the discuss refactor — both are "server owns the work, client just listens." Also the missing piece for the deploy-restore reliability push (Stage B runtime self-heal).

## Problem

The build/generate flow is **request-stream-driven**: the entire build runs inside the SSE `ReadableStream.start(controller)` callback in `src/routes/api.projects.$id.generate.ts` (the `send(event, data)` calls at lines 339, 362, 467, 476, 587, 600, 604, 622, 735, 772, 776, 814, 834, 843, 869, 874, 916, 946, 978, 989, 1024, 1041, 1062, 1069, 1120, 1246, 1257, 1262, 1313 are all synchronous emissions from inside one `await` chain). Two failure modes when the client disconnects mid-build:

1. **Lost live progress (symptom 1: "progress jumps / drops steps on refresh").** The client disconnects (refresh, navigation, network blip) → the SSE response aborts → the controller closes → the worker that's been doing the build is still running, but the *connected* client gets nothing past the disconnect. On reload, the client has to either re-tail (impossible — see #2) or rely on `GET /runtime` polling, which only shows the latest `activeJob.steps` snapshot, not the full event tail.
2. **Wedged second tab (symptom 2: "second tab stuck on 'Build berjalan' with no live updates").** Any second connection to the same in-flight build (new tab, new device) hits `409 project_build_in_progress` (`api.projects.$id.generate.ts:179-191` and `:202-210`). The only way to follow that build is the GET `/runtime` poll at 3-7s (`WorkspaceShell.tsx:495-518` and the 7s `setInterval` at `:1203-1208`).

The DB lease (`claimProjectOperation` in `src/lib/projects/project-operation.ts:15`) already exists and is the right shape — the issue is it's paired with a request-scoped stream instead of a job-scoped channel, which is what discuss already has via `discuss-turn-pubsub`.

The persistence side is partially there: `prisma.runtimeEvent` rows are written for `progress` events (`api.projects.$id.generate.ts:313-323`), but only for the *latest* label (one row per new label, not a full event log), and only for `progress` — `operation`, `done`, `error`, `energy`, `energy_exhausted` are stream-only. A late-joiner that wants to replay the full event tail cannot reconstruct it from `runtimeEvent` alone.

## Goal

Make the build/generate **server-side work** that completes + emits progress independent of the client connection, so:

- A refresh during a build never loses progress — the next connection tails the same in-process channel.
- A second tab can subscribe to the same in-flight build and see live events.
- The 3-7s `/runtime` poll while a build is active becomes unnecessary.
- The 7s `setInterval` re-poll loop (`WorkspaceShell.tsx:1203-1208`) becomes unnecessary.
- Late-joiners after a server restart can still reconstruct progress from persisted `runtimeEvent` rows (with the documented ceiling: a fresh `runtimeEvent` row per distinct progress label — operation-level events are reconstructed from the terminal state, not the log).

## Scope

**In scope:**

- **Section 1** — `buildProgressPubSub` (in-process pub/sub keyed by `attemptId`): `publishBuildProgress(attemptId, event)`, `subscribeBuildProgress(attemptId, onEvent)`, `readBuildProgressState(attemptId)`. Mirrors `discuss-turn-pubsub.ts`.
- **Section 2** — `runBuildAttempt` detached worker (`src/lib/projects/build-attempt-worker.ts`): same `attemptId` lease the route already claims via `claimProjectOperation`, but the actual build work is fired detached (`void runBuildAttempt(...).catch(...)`) and publishes events to the pub/sub.
- **Section 3** — the existing `POST /api/projects/$id/generate` becomes a thin route: claim → fire detached → return SSE tail of `subscribeBuildProgress(attemptId)`. Stream is a *view* of the work, not its lifetime.
- **Section 4** — new `GET /api/projects/$id/attempts/$attemptId/stream` late-joiner endpoint: subscribes to the in-process channel if live, falls back to replaying `prisma.runtimeEvent` rows for the attempt (`where: { buildId: attemptId, type: "build.progress" }, orderBy: createdAt ASC`) plus the terminal state from `prisma.projectEditAttempt`. Closes with the terminal event.
- **Section 5** — client cleanup: replace the 3-7s `runtimeQuery.refetchInterval` while a build is active with the new tail stream; drop the 7s `setInterval` re-poll; trim the 500ms duplicate `loadWorkspaceState`/`reloadLatestChat` in the chat status effect (Section 5 of the design only covers the build side; the discuss-side duplicate-fetch cleanup is out of scope here).

**Out of scope (deferred):**

- A full separate worker process / queue (Stage C of the discuss plan). The detached in-process worker is the MVP. The honest ceiling is the same: server restart mid-build loses the in-memory generation; the TTL + client resume handle it gracefully (`failed`/`expired` → retry CTA). A queue would survive this; deferred.
- Cross-process pub/sub (Redis/etc.) — the in-process channel suffices for single-process; the `runtimeEvent` DB replay covers late-joiners after restart. Defer.
- Persisting every event (`operation`, `done`, `error`, `energy`, `energy_exhausted`) to `runtimeEvent`. The spec accepts the current ceiling: late-joiner replays progress labels + reconstructs the terminal state from `projectEditAttempt.status` + `project.buildStatus`. The current `runtimeEvent.create` call at `api.projects.$id.generate.ts:313-323` already writes one row per distinct progress label — that is enough for the late-joiner "what step is the build on" view, because the *labels* are what the user sees, not the per-`operation` deltas. If full event log is ever needed, add a new `runtimeEvent` type and a `take: N` guard; not in this spec.
- Edit and visual-comment paths (`api.projects.$id.edit.ts`). They have the same architecture and the same bug; spec'ing them at the same time triples the surface area. After this ships and the pattern holds, a follow-up spec mirrors Sections 1-4 for `kind: "edit"`. Ponytail: the `attemptId` pub/sub channel is designed to be `kind`-agnostic so the edit path is a `subscribeBuildProgress` + new detached `runEditAttempt` worker away from being fixed; not in this spec.
- Removing the 500ms duplicate `loadWorkspaceState` + `reloadLatestChat` in the chat status effect (`WorkspaceShell.tsx:1719-1724`). That's a discuss-side cleanup, covered (or not) in a future discuss-side spec.
- Removing the `isPreparingNextQuestion` poll entirely. It's a discuss-side topic; the spec leaves it alone.
- Removing the discuss resume poll (`resolveDiscussResumeFromServer`). Discuss-side; out of scope.

## Architecture

### Section 1 — `buildProgressPubSub` in-process pub/sub

A new file `src/lib/projects/build-attempt-pubsub.ts` mirroring `discuss-turn-pubsub.ts`:

```ts
type BuildProgressEvent = {
  type: "progress" | "operation" | "energy" | "energy_exhausted"
       | "done" | "error";
  [key: string]: unknown;
};
type Channel = {
  events: BuildProgressEvent[];
  subscribers: Set<(e: BuildProgressEvent) => void>;
};
const channels = new Map<string /* attemptId */, Channel>();

export function publishBuildProgress(attemptId: string, event: BuildProgressEvent): void { /* ... */ }
export function subscribeBuildProgress(
  attemptId: string,
  onEvent: (e: BuildProgressEvent) => void,
): () => void { /* ... */ }
export function readBuildProgressState(attemptId: string): "live" | "gone" { /* ... */ }
```

Differences from `discuss-turn-pubsub.ts`:

- Keyed on `attemptId` (a `ProjectEditAttempt.id` of shape `build_<uuid>` — see `api.projects.$id.generate.ts:212`) instead of a chat turn id.
- No per-event TTL-based channel GC inside the route handler. The channel is deleted when the worker reaches a terminal state (`done` / `error` / `canceled`) after a 60s grace period so late-joiners connecting to a just-finished build still get the terminal event replay. The 60s grace is a single `setTimeout` inside `publishBuildProgress` when the event type is terminal (mirroring the 30s grace in `discuss-turn-pubsub.ts:27`).
- No `subscribeProgress` event-buffer replay across processes. The DB replay (Section 4) covers cross-process / restart late-joiners.

### Section 2 — Detached `runBuildAttempt` worker

A new file `src/lib/projects/build-attempt-worker.ts` (analogous to `discuss-turn-worker.ts`). Takes everything `handleGeneratePost` currently does inside the `ReadableStream.start(controller)` callback — the spec, the `sourceStepCharger`, the `progressive-saver`, the actual `generateCustomProjectFilesWithAgent` / `repairGeneratedProjectFiles` / `buildGeneratedProject` / `refreshProjectThumbnail` / `writeProjectDistArtifact` / `writeProjectSourceArtifact` / `stopSupersededPreviewDeployments` / `chargeEnergyForAiUsage` / `finalizeProjectOperation` chain — and runs it detached, with `publishBuildProgress(attemptId, event)` in place of every existing `send(event, data)` call.

```ts
// ponytail: modelOverride reserved for the worker unit test (mirrors runDiscussTurn
// at discuss-turn-worker.ts:64-66).
export async function runBuildAttempt({
  attemptId,
  project,
  userId,
  // ... every other field handleGeneratePost's start(controller) closure currently
  // captures: streamHandleForLateJoin, etc.
}): Promise<void> {
  try {
    // ... existing generate body, but every `send(event, data)` becomes
    //     `publishBuildProgress(attemptId, { type, ...data })`
    publishBuildProgress(attemptId, { type: "done", finalSchema });
  } catch (error) {
    publishBuildProgress(attemptId, {
      type: "error",
      detail: errorMessage,
    });
  } finally {
    // 60s grace before the channel is GC'd; lets late-joiners still
    // see the terminal event in the replay window.
    setTimeout(() => channels.delete(attemptId), 60_000);
  }
}
```

**The key invariant:** every `publishBuildProgress(attemptId, { type: "done" | "error", ... })` is paired with `finalizeProjectOperation` in a `try/finally`, so the DB lease and the in-process channel cannot diverge: terminal event reaches the client (or is replayed from `runtimeEvent`) before the channel is GC'd, and the project is `ready`/`failed` before the lease releases.

**Per-step energy events** stay inside the worker (`sourceStepCharger.onCharge` callback at `api.projects.$id.generate.ts:338-341` already does `send("energy", event)`; the worker version calls `publishBuildProgress(attemptId, { type: "energy", ...event })`).

**Persisting progress labels** to `runtimeEvent` stays where it is — moved into the worker alongside the `publishBuildProgress` call, so the DB write and the in-process event stay in lockstep.

### Section 3 — `POST /api/projects/$id/generate` becomes a thin route

The existing `handleGeneratePost` in `api.projects.$id.generate.ts` shrinks to:

1. `auth()` + `isUserVerified()` + `checkEnergy()` + `checkRateLimit()` + `isGeneratedBuildExecutionEnabled()` — same as today.
2. `prisma.project.findFirst` + `markStaleProjectBuilds` + the existing 409-on-`building` check.
3. `claimProjectOperation({ kind: "build", projectId, userId })` — same as today.
4. Create the `ProjectEditAttempt` row + the placeholder `ProjectSnapshot` + the placeholder `ProjectBuild` row — same as today.
5. **Fire the worker detached:** `void runBuildAttempt({ attemptId, project, userId, ... }).catch(error => publishBuildProgress(attemptId, { type: "error", detail: error instanceof Error ? error.message : String(error) }))`. Mirror the `void runDiscussTurn(...).catch(...)` pattern at `api.projects.preview.ts:444-455`.
6. Return an SSE response that tails the channel — `createReadStreamFromChannel(attemptId)` (new helper, see below). The response's `ReadableStream` is *not* the build's lifetime; it's a *view* of the work, closing when the channel reaches a terminal event.

**`createReadStreamFromChannel(attemptId)` helper (in `build-attempt-pubsub.ts`):**

```ts
export function createReadStreamFromChannel(attemptId: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const writeSafe = (event: BuildProgressEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeSseEvent(event.type, event)));
        } catch {
          // Client disconnected mid-tail. Worker keeps running; late-joiners
          // can still subscribe via the GET endpoint (Section 4).
        }
      };
      let resolveTail: () => void;
      const tailDone = new Promise<void>((resolve) => { resolveTail = resolve; });
      const unsubscribe = subscribeBuildProgress(attemptId, (event) => {
        writeSafe(event);
        if (event.type === "done" || event.type === "error") {
          resolveTail();
        }
      });
      // Subscribe replays any buffered events (including a terminal that
      // already landed). If a terminal was buffered, resolveTail already
      // fired. Otherwise wait for the worker's live terminal.
      tailDone.then(() => {
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
```

`encodeSseEvent(name, data)` is a tiny `event: <name>\ndata: <json>\n\n` helper, same shape as `encodeEvent` at `api.projects.$id.generate.ts:73-75`. The spec keeps it inside `build-attempt-pubsub.ts` so both Section 3 (the POST tail) and Section 4 (the GET late-joiner) use the same wire format.

**Honest cost (same as discuss):** the detached worker holds the build's context in-process. If the server restarts mid-build, the in-memory work is lost; the `activeOperationToken` lease expires after `DEFAULT_OPERATION_TTL_MS` (15min, `project-operation.ts:13`) and the client sees `failed`/`expired` on the next `/runtime` poll. A full worker queue would survive this; deferred.

### Section 4 — `GET /api/projects/$id/attempts/$attemptId/stream` late-joiner endpoint

A new TanStack file route `src/routes/api.projects.$id.attempts.$attemptId.stream.ts` (RESTful, attempt-scoped). The endpoint must work for the three late-joiner cases:

- **A. Same-process, mid-build.** Worker is still running, channel is live. Subscribe to the channel, return its tail.
- **B. Same-process, just-finished.** Worker emitted the terminal event 1-30s ago; channel still in the 60s grace window. Replay buffered events from the channel, close on the terminal.
- **C. After process restart.** Channel is gone. Replay from `prisma.runtimeEvent` rows: `where: { buildId: attemptId, type: "build.progress" }, orderBy: createdAt: "asc"`, plus the terminal state from `prisma.projectEditAttempt.findFirst({ where: { id: attemptId, userId } })` (or the 404 case if the attempt was cleaned up).

**Resolution order on each GET:**

1. `auth()` + project ownership check (`prisma.project.findFirst({ where: { id, userId }, select: { id: true } })` — same pattern as `api.projects.$id.runtime-events.ts:20-23`).
2. `readBuildProgressState(attemptId)` — if `"live"`, return the channel tail (Sections 3+4 share the same `createReadStreamFromChannel` helper; the only difference is the GET route has no worker to fall back to, so case A's tail will close naturally when the worker emits the terminal).
3. If `"gone"`: query the attempt + runtime events + terminal state, write the replay as a single SSE burst, close.

**Replay shape (case C):**

```ts
const events = await prisma.runtimeEvent.findMany({
  where: { buildId: attemptId, type: "build.progress" },
  orderBy: { createdAt: "asc" },
  select: { createdAt: true, id: true, message: true, metadata: true },
});
const attempt = await prisma.projectEditAttempt.findFirst({
  where: { id: attemptId, projectId: id, userId },
  select: { id: true, status: true, finishedAt: true },
});

const replayEvents: BuildProgressEvent[] = events.map((row) => {
  const metadata = (row.metadata ?? {}) as { detail?: string; label?: string };
  return {
    type: "progress",
    label: metadata.label ?? row.message ?? "",
    detail: metadata.detail ?? "",
  };
});
// Append the terminal event from the attempt row.
if (attempt?.status === "succeeded") {
  replayEvents.push({ type: "done" });
} else if (attempt?.status === "failed" || attempt?.status === "canceled") {
  replayEvents.push({
    type: "error",
    detail: attempt.status === "canceled" ? "Proses dihentikan." : "Build belum selesai.",
  });
}
```

**Why the missing-event types (`operation`, `energy`, `energy_exhausted`) are acceptable in the replay:** the client never re-renders those into a different UI on reconnect — it folds them into the `buildProgress` steps the user already sees (`appendBuildProgressStep` at `WorkspaceShell.tsx:890-893` and `:920-933`). The progress labels *are* the user-visible state. If a future spec needs the per-`operation` delta history (e.g. a "view build log" panel), add the persistence in a follow-up; not in this spec.

**404 vs closed stream policy:**

- Attempt not found / not owned: 404 (consistent with the other project-scoped GETs).
- Attempt found, status already terminal, no `runtimeEvent` rows (e.g. the build was canceled before any progress event fired): empty replay + a single terminal event + close. Client's `useChat`-style tail resolver sees the terminal and treats the connection as finished. No special-casing.
- Attempt found, status `running` (lease is alive), channel `"gone"`, no recent `runtimeEvent` rows within 30s: this is the "process restarted while the build was in flight" case. Emit one synthetic terminal `error` event with `detail: "Server restart terputus. Coba jalankan build lagi."` and close. The client treats this as a failed build and shows the retry CTA. (Alternative: emit a `restart_recovery` event and have the client re-`POST /generate` — adds a new event type, more client logic for marginal benefit. Defer.)

### Section 5 — Client cleanup

`src/components/projects/WorkspaceShell.tsx`:

- **Drop the 3-7s `runtimeQuery.refetchInterval` while a build is active.** Once the GET late-joiner endpoint exists, the client connects to the stream on mount when `runtimeState.userFacingState === "building"` or `activeJob` is set. The stream tail replaces the poll for the live case; the GET replay replaces it for the post-restart case. Keep the query (it's still useful for the *idle* state — deploy-restore detection, `publishedPath` refresh, etc.) but stop polling while a build is active and rely on the stream + the existing `[id].runtime-events` invalidate to refresh the post-build state.
- **Drop the 7s `setInterval` re-poll loop** at `WorkspaceShell.tsx:1203-1208`. Same reason — the stream owns the live progress; the 500ms-after-`done` invalidation already covers the post-build state.
- **Add a `subscribeBuildProgress(attemptId, onEvent)` consumer in the `WorkspaceShell`** that:
  - Connects on mount when `runtimeState.userFacingState === "building"` or `runtimeState.activeJob` is set, and `latestAttempt.id` matches the active build.
  - Routes `progress` events to `appendBuildProgressStep` (existing helper at `src/lib/projects/build-progress-steps.ts`).
  - Routes `operation` / `done` / `error` events through the same paths the existing `startBuild` SSE loop uses at `WorkspaceShell.tsx:888-967`.
  - Routes `energy` / `energy_exhausted` events through the existing energy-event path (`WorkspaceShell.tsx:900-919`).
  - Closes on terminal; cleans up the EventSource on unmount.
- **Pick the right connection target.** The client chooses `POST /api/projects/$id/generate` for the *first* start of a build (because the POST claims the lease, fires the worker, returns the tail) and `GET /api/projects/$id/attempts/$attemptId/stream` for *every subsequent* subscribe (refresh, second tab). The first-start path becomes a fire-and-forget that returns the tail; the second-start path is a pure tail subscribe. The lease contention behavior (409 on `POST` when a build is already running) is preserved — but now the second tab sees 409 on the POST and immediately falls back to the GET, so it gets the live stream instead of a dead end.

**What does NOT change in the client:**

- The discuss-side `runtimeQuery.refetchInterval` while a build is active is *also* dropped. Discuss doesn't use `runtimeQuery` for the live case — it uses `useChat` over the discuss SSE tail already. `runtimeQuery` is for the runtime REST snapshot; the stream is for the build event tail. They were redundantly polling in the build case; the stream takes over the live case.
- The discuss-side `isPreparingNextQuestion` poll and the resume poll stay (out of scope; discuss-side).
- The 500ms duplicate `loadWorkspaceState` + `reloadLatestChat` in the chat status effect stays (discuss-side; out of scope).

## Files to add / modify

**Add:**

- `src/lib/projects/build-attempt-pubsub.ts` — pub/sub + `createReadStreamFromChannel` + `encodeSseEvent`.
- `src/lib/projects/build-attempt-pubsub.test.ts` — pub/sub unit tests (buffered replay, subscriber removal, 60s grace GC). Mirrors `discuss-turn-pubsub.test.ts`.
- `src/lib/projects/build-attempt-worker.ts` — the detached worker; every existing `send(event, data)` from `api.projects.$id.generate.ts`'s `start(controller)` moves here as `publishBuildProgress(attemptId, { type, ...data })`. Same closures, same per-step charger, same finalizer chain.
- `src/lib/projects/build-attempt-worker.test.ts` — at minimum: a test that the worker publishes `progress` for each `send` it would have made; a test that an exception in the worker path publishes a terminal `error`; a test that the `done` event lands before the lease is released. (Mirror `discuss-turn-worker.test.ts`'s shape.)
- `src/routes/api.projects.$id.attempts.$attemptId.stream.ts` — the late-joiner GET. Auth + ownership + `readBuildProgressState` + replay fallback. Unit-test the replay branch.
- `src/components/projects/useBuildAttemptStream.ts` — the client hook that subscribes to the stream and routes events through the existing `appendBuildProgressStep` / energy / done / error paths. Used by `WorkspaceShell` in place of the inline `response.body.getReader()` loop in `startBuild`.

**Modify:**

- `src/routes/api.projects.$id.generate.ts` — shrink to claim → fire detached → return tail. Delete the inline `ReadableStream` body (moved to the worker). Keep the auth / lease / attempt-row / placeholder-snapshot scaffolding (it's the lease materialization, not the work).
- `src/components/projects/WorkspaceShell.tsx`:
  - `startBuild`'s inline `response.body.getReader()` loop at `:850-969` is replaced with a `useBuildAttemptStream` subscription to the POST's tail (the POST still returns an SSE body, so the existing code can keep the `await response.body` shape if simpler; the cleanest version is "POST → fire-and-forget → subscribe to GET /attempts/$id/stream after the POST returns the attemptId", but the minimal diff is to keep reading the POST's response body and route each event through the same helpers).
  - Drop the 3-7s `runtimeQuery.refetchInterval` while a build is active. Keep the query + the idle-state refetch.
  - Drop the 7s `setInterval` re-poll at `:1203-1208`.
  - On second tab / refresh-mid-build, the client now reads `runtimeState.latestAttempt.id` from the existing `GET /runtime` (which is loaded once on mount and on the 500ms invalidation) and subscribes to the GET late-joiner endpoint. If the attempt is already terminal in the runtime state, no subscription — just render the final state.

**No change:**

- `prisma/schema.prisma` — no new tables or columns. The `Project` lease columns (`activeOperationToken`, `activeOperationKind`, `activeOperationExpiresAt`) and the `ProjectEditAttempt` row are already there.
- `prisma.runtimeEvent` — no schema change. Existing rows + the `build.progress` write at `api.projects.$id.generate.ts:313-323` are the replay source.
- `src/lib/projects/project-operation.ts` — no change. The lease is the right shape; the route currently uses it correctly.
- `src/lib/projects/build-progress-steps.ts` — no change. `appendBuildProgressStep` / `completeBuildProgressSteps` are the shape the stream events will fold into.

## Verification

- **Unit: `build-attempt-pubsub.test.ts`** — buffered replay on subscribe, subscriber removal closes the channel reference, terminal event triggers 60s GC (use `vi.useFakeTimers()`), `readBuildProgressState` returns `"live"`/`"gone"` correctly.
- **Unit: `build-attempt-worker.test.ts`** — a `mockPublishProgress` captures every event; a mocked `claimProjectOperation` + `finalizeProjectOperation` + a `mockModel` (mirrors `discuss-turn-worker.test.ts`'s `modelOverride` pattern) drive the worker through the success path; assert the sequence `[progress, progress, ..., done]` lands in order; assert a thrown spec error publishes `error`; assert `finalizeProjectOperation` runs after the terminal event.
- **Unit: replay branch of `api.projects.$id.attempts.$attemptId.stream.ts`** — case A (channel live, no DB read), case B (channel in 60s grace, replay buffered), case C (channel gone, replay from `runtimeEvent` + terminal from `projectEditAttempt`), case D (attempt not found, 404), case E (attempt `running` + channel gone + no recent `runtimeEvent` rows, synthetic error).
- **Storybook: not required.** The stream events are non-visual server-emitted data; no reusable UI surface.
- **Manual:**
  1. Dev server, start a build on project A, watch the stream events arrive live (no 3-7s lag).
  2. Mid-build, refresh the page. The new page should resume the stream from where the old tab left off (case A or B in the GET endpoint). No missing progress labels in the panel.
  3. Open a second tab on the same project mid-build. The second tab should NOT see a 409 wedge; it should subscribe to the live stream and show the same progress.
  4. Mid-build, `kill -9` the dev server, restart, refresh. The new page should load with a synthetic `error` event in the stream (case E) and surface the retry CTA. (This is the documented ceiling; a queue would survive this.)
  5. `bun run check` (format/lint/typecheck/`test:changed`/Knip) green; `bun run verify` green; full unit test suite green; no Knip-detected dead code in the moved `send` calls.
  6. CI: `bun run build` + `bun run verify` + the existing Storybook + Chromatic + build pipeline — green.

## Risks + open questions

- **Edit / visual-comment path is not covered by this spec.** It's the same architecture, the same bug. If the build ships and the pattern holds, the follow-up spec is a near-copy with `runEditAttempt` + `kind: "edit"` filtering. If a follow-up is not on the roadmap, note it in the spec's "out of scope" section so the next reviewer doesn't have to rediscover it. (Already noted above.)
- **Per-`operation` events are not replayed after restart.** Acceptable for the current UI (the user-visible state is the progress labels, not the per-`operation` deltas). If a future "build log" view needs the full event log, add a new `runtimeEvent` write inside the `operation` emit path + a `take: N` guard; not in this spec.
- **60s grace on the in-process channel.** A late-joiner connecting 61s after the terminal event will see case C (replay from DB), not case B (replay from buffer). The replay produces the same wire output (terminal event + close), so the client is unaffected. The 60s window is enough for a "refresh 1-2s after the build finished" UX without a DB round-trip.
- **Cross-process pub/sub is not in scope.** The in-process channel suffices for single-process; a multi-process deploy would need Redis or a DB LISTEN/NOTIFY bridge. The DB replay is the only cross-process late-joiner path. Document this in the deploy notes when this lands.
- **The `useBuildAttemptStream` hook races the `useChat` discuss stream.** Both may emit `setBuildProgress` / `setMessages` during the build-finished moment. Today's inline `startBuild` SSE loop already does this race; the new hook doesn't introduce a new race, it just moves the same one to a hook. The existing "done event clears the progress + reloads runtime" path at `WorkspaceShell.tsx:940-952` is the single owner of the post-build state; the hook should call into the same helper, not duplicate it.
- **Knip.** After the move, the inline `send(event, data)` calls in `api.projects.$id.generate.ts` are gone, replaced by `publishBuildProgress(attemptId, { ... })` inside the worker. Knip should report no new dead exports; if it flags `encodeEvent` (now duplicated as `encodeSseEvent` in the pub/sub module), delete the local copy in the route file. (Already in the modify list above.)
