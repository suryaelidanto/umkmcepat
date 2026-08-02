# Plan — Builder progress UX: duplicate step rows + generic footer

Date: 2026-08-01 · Branch: `dev` · Baseline commit: `7daa0a8`

Supersedes the raw handoff at `/tmp/handoff-builder-progress-ux-2026-08-01.md`. That
handoff left an uncommitted, untested, unverified work-in-progress in the tree. This plan
finishes it: it keeps what was right, replaces two fragile mechanisms, fixes a third bug
the handoff did not catch, and defines how to prove the result.

## Outcome

While a build runs, the workspace must show:

1. **One row per phase and one row per agent tool call** — never a duplicate label, never a
   stale `done` row sitting next to a live `active` row with the same text.
2. **A footer that names what is happening right now** — not the static
   `Membuat website / AI sedang menyiapkan file website dan tampilannya.`

This is the `PRODUCT.md` line 40 bar: *"Trust beats spectacle. Use visible progress, clear
states, reversible actions, and honest copy before decorative effects."*

## Starting state

`git status` must show exactly these modified files before you begin:

```
 M docs/superpowers/plans/2026-07-29-mayar-spike-findings.md   <- NOT YOURS, do not commit
 M src/components/projects/WorkspacePrimitives.tsx
 M src/components/projects/WorkspaceShell.tsx
 M src/lib/projects/build-attempt-pubsub.ts
 M src/lib/projects/build-stream-event.ts
```

The four `src/` files hold the prior agent's WIP. Build on it — do not `git checkout` them.

---

## Root causes

### RC1 — Two readers of one channel, and the channel replays from index 0

`subscribeBuildProgress` (`src/lib/projects/build-attempt-pubsub.ts:55`) replays the entire
`channel.events` buffer to every new subscriber. Two independent client readers consume the
same attempt channel:

| Reader | Opened by | Sees |
|---|---|---|
| `POST /api/projects/:id/generate` SSE body | `startBuild`, `WorkspaceShell.tsx:893` | events from the moment the POST handler subscribes |
| `EventSource /api/projects/:id/attempts/:attemptId/stream` | `useBuildAttemptStream`, `WorkspaceShell.tsx:1262` | **full replay from index 0**, because it connects one runtime-poll later |

Both feed the same `handleBuildStreamEvent`. Every event published before the EventSource
connects therefore renders twice — the screenshot's two `Memahami usaha dan target pembeli`
rows (one `done` 2.7s, one `active` 31.7s).

`appendBuildProgressStep` deliberately never merges by label ("Always append; mark prior
active → done. No label merge, no cap." — `build-progress-steps.ts:18`), which is correct
for real repeated tool calls, so dedupe cannot live in the reducer. It has to be identity
based, at the transport level.

### RC2 — Runtime-poll hydrate clobbered live rows

The hydrate block did a blind `setBuildProgress(job.steps.map(...))` on every poll,
replacing rich live SSE rows with the throttled/persisted DB steps. The worker persists
only a subset: `persistProgressEvent` dedupes by `label\0detail\0path`, throttles non-write
operations by `OPERATION_PERSIST_MIN_MS`, and hard-caps at `MAX_PERSISTED_OPERATIONS = 60`
(`build-attempt-worker.ts:103-167`). So the DB list is always ≤ the live list while the
channel is alive.

### RC3 — Footer is generic for most of the build *(not in the handoff — found while reading)*

`appendBuildProgressStep` flips every `active` row to `done` before appending. Phase rows
arrive as `progress` events with `status: "active"`; tool calls arrive as `operation` events
with `status: "done"`. So the moment the first tool call lands, the phase row is finished
and **the list contains no `active` row at all** for the rest of that phase.

The WIP fix picks `buildProgress.findLast(step => step.status === "active")`, which is
`null` during exactly the long tool-call storm the footer most needs to describe. The footer
would still read `Membuat website` for the bulk of a build. Selecting the *newest* row
instead is both simpler and honest: the newest row is what the agent most recently did.

This also removes the handoff's open risk #1 (`Array.prototype.findLast` / TS `lib` target)
by deleting the call.

---

## Design decisions

### D1 — Stamp `attemptId` **and** `seq` in `publishBuildProgress`

`seq` alone is ambiguous across attempts: a second attempt restarts at 0. Stamping the
attempt id makes each event self-describing, so the client dedupes correctly without
knowing which reader delivered the event.

### D2 — Deduper keyed by `attemptId`, with bounded retention

The handoff's deduper was a flat `Set<number>` reset inside `startBuild`. That breaks
whenever a new attempt starts without `startBuild` running — the queue-retry and unstuck
paths, and any reattach after refresh/HMR. Keying by `attemptId` is correct by construction.

Retention is capped at 3 attempts so a long session with many builds cannot grow the map
without bound.

**Keep the `startBuild` reset as well.** It is not redundant with D2, it enforces a
different invariant: `startBuild` calls `setBuildProgress([])`, and clearing rendered rows
must also clear the record of what was rendered, or a replay of the same channel would be
suppressed into an empty panel. Same-invariant, different failure mode. Say so in the
comment.

Attempt ids are `build_${randomUUID()}` (`api.projects.$id.generate.ts:180`) so id reuse is
not a concern.

### D3 — Hydrate adopts the server list only when strictly longer

Per RC2 the DB list is a throttled subset while the channel is alive, so "server is
strictly ahead in count" is precisely the signal that the channel was lost (server restart,
or the 60s `CHANNEL_GRACE_MS` window expired) and the DB is now the better source.

Note this is not a heuristic about *content*: because `subscribeBuildProgress` replays from
index 0, a client whose EventSource connected has the **complete** channel history. Live
rows are complete whenever the channel is alive. The length comparison is only there to
recover the case where it is not.

If this ever misbehaves in practice, the escalation is a key-based merge on
`label\0detail\0path` — do not build that now, it is unneeded complexity today.

### D4 — Footer names the newest row

`resolveCurrentBuildProgressStep(steps)` returns the last row, or `null` when empty. See
RC3. Rendered only while `isProcessing` is true, so a `done` row in the footer always means
"just finished this, still working".

### D5 — Extract the two decisions into pure helpers

Both D3 and D4 currently live inline inside `WorkspaceShell.tsx` — one in a `useEffect`, one
in JSX. Neither is testable there; the handoff's own "next steps" asked for a
`WorkspaceShell` hydrate test that is impossible to write against an inline effect. Move
both into `src/lib/projects/build-progress-steps.ts`, which already owns every other
progress-step list transform (`appendBuildProgressStep`, `completeBuildProgressSteps`) and
already has a test file.

This is the only structural change. It is in-scope because it is the code being edited, and
it is what makes the required tests writable.

---

## Changes

### 1. `src/lib/projects/build-attempt-pubsub.ts`

Replace the `stamped` construction inside `publishBuildProgress`:

```ts
  // `attemptId` + monotonic `seq` let a client that reads the same channel
  // twice (POST body reader + late EventSource replay) drop events it already
  // rendered, without needing to know which reader delivered them.
  const stamped: BuildProgressEvent = {
    ...event,
    attemptId,
    seq: channel.nextSeq,
  };
  channel.nextSeq += 1;
```

Spread first so the stamped fields always win. `Channel.nextSeq` and the two
`{ events: [], nextSeq: 0, subscribers: new Set() }` initialisers are already in the WIP —
leave them.

### 2. `src/lib/projects/build-stream-event.ts`

Replace `createBuildStreamDeduper` wholesale:

```ts
const MAX_TRACKED_ATTEMPTS = 3;

/**
 * Tracks which channel `seq` values a client already rendered, per attempt.
 *
 * The POST /generate body reader and the late-joining EventSource both read the
 * same attempt channel, and `subscribeBuildProgress` replays the buffer from
 * index 0 on subscribe. Without this, every event published before the
 * EventSource connects is appended twice (one stale `done` row plus one live
 * `active` row with the same label).
 *
 * Keyed by `attemptId` rather than reset by the caller: a new attempt can start
 * without `startBuild` running at all (queue retry, unstuck path, reattach after
 * refresh), and those attempts restart `seq` at 0.
 *
 * Events without a `seq` pass through — the DB replay in
 * `api.projects.$id.attempts.$attemptId.stream.ts` never went through the
 * channel and is only ever served when the channel is already gone.
 */
export function createBuildStreamDeduper(): (
  event: BuildStreamEvent,
) => boolean {
  const seenByAttempt = new Map<string, Set<number>>();

  return (event) => {
    if (typeof event.seq !== "number") {
      return true;
    }

    const attemptId = typeof event.attemptId === "string" ? event.attemptId : "";
    let seen = seenByAttempt.get(attemptId);
    if (!seen) {
      seen = new Set<number>();
      seenByAttempt.set(attemptId, seen);
      // Map iterates in insertion order, so this drops the oldest attempts
      // first and keeps a long session from growing the map without bound.
      for (const oldest of seenByAttempt.keys()) {
        if (seenByAttempt.size <= MAX_TRACKED_ATTEMPTS) {
          break;
        }
        seenByAttempt.delete(oldest);
      }
    }

    if (seen.has(event.seq)) {
      return false;
    }
    seen.add(event.seq);
    return true;
  };
}
```

Deleting from a `Map` while iterating its keys is well-defined — entries removed before
being visited are skipped. Do not rewrite this as `keys().next()` or array destructuring;
both fight `strict` typing here for no benefit.

### 3. `src/lib/projects/build-progress-steps.ts`

Append two exports (keep the existing ones untouched):

```ts
/**
 * Runtime-poll hydrate is a reattach path, not a mid-stream source of truth.
 *
 * Live SSE rows are complete whenever the attempt channel is alive —
 * `subscribeBuildProgress` replays its whole buffer on subscribe — and they
 * carry per-tool detail the persisted steps throttle away. A server list that
 * is strictly longer is what a lost channel looks like, so that is the only
 * case worth adopting.
 */
export function mergeHydratedBuildProgress<T extends ProgressStepLike>(
  current: T[],
  hydrated: T[],
): T[] {
  return hydrated.length > current.length ? hydrated : current;
}

/**
 * The step the composer footer should name.
 *
 * `appendBuildProgressStep` finishes the running phase row the moment a tool
 * operation row lands, so mid-build there is frequently no `active` row at all.
 * The newest row is what the agent most recently did, and the footer only
 * renders while a job is genuinely running, so naming it stays honest.
 */
export function resolveCurrentBuildProgressStep<T extends ProgressStepLike>(
  steps: T[],
): T | null {
  return steps.length ? steps[steps.length - 1] : null;
}
```

### 4. `src/components/projects/WorkspaceShell.tsx`

Four edits.

**(a)** Extend the `build-progress-steps` import to include
`mergeHydratedBuildProgress` and `resolveCurrentBuildProgressStep`.

**(b)** Hydrate block (~line 603). Replace the WIP inline comparison:

```ts
        setBuildProgress((current) =>
          mergeHydratedBuildProgress(current, hydrated),
        );
```

Leave the `hydrated` mapping above it as-is.

**(c)** `startBuild` (~line 817). Keep the reset, restate the comment:

```ts
    setBuildProgress([]);
    // Rows just got cleared, so the record of what was rendered must clear too
    // — otherwise a replay of this same channel would be deduped into nothing.
    buildStreamDeduperRef.current = createBuildStreamDeduper();
```

**(d)** `ProcessingControl` render (~line 2719). Replace the `findLast` block:

```tsx
                <ProcessingControl
                  currentStep={resolveCurrentBuildProgressStep(buildProgress)}
                  mode={isBuilding ? "Buat" : "Diskusi"}
                  onStop={stopCurrentJob}
                />
```

### 5. `src/components/projects/WorkspacePrimitives.tsx`

Rename the WIP `activeStep` prop to `currentStep` — it is no longer necessarily active — and
keep the `mode === "Buat"` gate (build rows must never leak into Diskusi copy):

```tsx
export function ProcessingControl({
  currentStep,
  mode,
  onStop,
}: {
  /** Newest live build row; when present it replaces the generic build copy. */
  currentStep?: { detail?: string; label: string } | null;
  mode: "Diskusi" | "Buat";
  onStop: () => void;
}) {
  const fallbackTitle = mode === "Buat" ? "Membuat website" : "Menyusun jawaban";
  const fallbackDetail =
    mode === "Buat"
      ? "AI sedang menyiapkan file website dan tampilannya."
      : "AI sedang menyiapkan jawaban.";
  const title =
    mode === "Buat" && currentStep?.label ? currentStep.label : fallbackTitle;
  const detail =
    mode === "Buat" && currentStep?.label
      ? currentStep.detail || fallbackDetail
      : fallbackDetail;
```

No visual/layout change — copy source only, so no `DESIGN.md` update is required.

---

## Tests

All four files already exist. Add to them; do not restructure what is there.

### `src/lib/projects/build-attempt-pubsub.test.ts`

Use fresh attempt ids (`build_seq_*`) — the channel map is module-global and shared across
tests in the file.

- **stamps a monotonic seq and the attempt id on every event** — publish 3, assert
  `seq` `[0,1,2]` and `attemptId` equal to the channel id on each.
- **replays the same seq values to a late subscriber** — publish 2, subscribe, assert the
  replayed seqs are `[0,1]`; publish a 3rd, assert the subscriber saw `2` (proves the
  overlap that makes RC1 real and that dedupe by seq is sufficient).
- **counts seq independently per attempt channel** — two attempt ids each start at 0.

### `src/lib/projects/build-stream-event.test.ts`

New `describe("createBuildStreamDeduper")`:

- **passes events that carry no seq** — the DB replay path.
- **drops a repeated seq from the same attempt** — first `true`, second `false`.
- **keeps seq spaces separate per attempt** — same `seq: 0`, two attempt ids, both `true`.
- **forgets attempts past the retention bound** — touch 4 attempts, then re-send the first
  attempt's `seq: 0` and assert it passes again (documents the bound as intentional).

### `src/lib/projects/build-progress-steps.test.ts`

- `mergeHydratedBuildProgress`: keeps live rows when the server list is shorter; keeps live
  rows when lengths are **equal**; adopts the server list when strictly longer.
- `resolveCurrentBuildProgressStep`: `null` on empty; returns the newest row **even when its
  status is `done`** (this is the RC3 regression guard — assert the label of a trailing
  `done` operation row, not an `active` one).

### `src/components/projects/WorkspacePrimitives.test.ts`

Follow the existing `renderToStaticMarkup(createElement(...))` style in that file.
`ProcessingControl` takes no query client, so render it directly.

- renders `currentStep.label` and `currentStep.detail` in `Buat` mode.
- falls back to `Membuat website` when `currentStep` is `null`.
- ignores `currentStep` in `Diskusi` mode and renders `Menyusun jawaban`.

---

## Verification

Do **not** report this finished on unit tests alone. All three gates below must pass.

### Gate 1 — quality gate

```bash
bun run check
```

Paste the real output. Knip must stay clean: the new exports are consumed by test files,
and `knip.json` lists `src/**/*.test.ts` as entry points, so they count as used.

### Gate 2 — live build, real events, replayed through the real reducer

The dev server is already running on port 3000 (`bun run dev`, vite; the BullMQ worker runs
in-process via `src/lib/instrumentation.ts`). `dev.log` is at repo root.

`scripts/reliability/run-batch.ts` **hangs** — timed out at 600s and 900s with an empty log.
Do not use it. Drive the build with `curl`.

Auth: `cookie.header.txt` at repo root is gitignored and holds a **live session token**.
Pass it with `curl -H @cookie.header.txt`. Never `cat` it, never echo it, never let it reach
a log or a tracked file. If you target `dev.umkmcepat.com` instead of localhost, note that
Cloudflare 403s python `urllib` (error 1010) — `curl` is fine.

Procedure:

1. Create a project, POST the brief, then start a build with
   `POST /api/projects/:id/generate` and **tee the SSE body to a file** in the scratchpad.
2. As soon as the attempt id is known, open a **second, concurrent** reader on
   `GET /api/projects/:id/attempts/:attemptId/stream` and tee it to a second file. This
   reproduces RC1 deliberately — without it you are not testing the bug.
3. Write a throwaway replay harness in the scratchpad (**not** a tracked file) that:
   - parses both capture files into `BuildStreamEvent`s, concatenated in wall-clock order;
   - feeds them through the **real** `createBuildStreamDeduper()`, then
     `reduceBuildStreamEvent`, then `appendBuildProgressStep` — the exact client chain;
   - prints the resulting row list and the `resolveCurrentBuildProgressStep` label after
     each event.

   Assertions:
   - each capture file's seqs are strictly increasing;
   - the two files **do** overlap on seq (proves the duplicate source was live);
   - the final row count equals the count of distinct seqs — **no duplicate rows**;
   - no two adjacent rows share a `label` + `detail` pair;
   - the footer-label timeline advances and is not `Membuat website` once rows exist.
4. Cross-check the DB: `RuntimeEvent` rows with `type = "build.progress"` and
   `buildId = <attemptId>`, ordered by `createdAt`, should be a **subset** of the rendered
   rows (throttled, capped at 60) — never a superset.

### Gate 3 — the actual UI

Open the workspace in a browser during a live build and confirm with your own eyes:

- exactly one row per phase and per tool call, no duplicated label pairs;
- the footer text changes as steps advance, including during the tool-call storm.

If no browser automation is available in the session, capture the Gate 2 footer timeline in
full and say plainly in the handoff that Gate 3 was verified by replay rather than by
screenshot. Do not silently skip it.

---

## Commit & CI

```bash
git add src/lib/projects/build-attempt-pubsub.ts \
        src/lib/projects/build-stream-event.ts \
        src/lib/projects/build-progress-steps.ts \
        src/lib/projects/build-attempt-pubsub.test.ts \
        src/lib/projects/build-stream-event.test.ts \
        src/lib/projects/build-progress-steps.test.ts \
        src/components/projects/WorkspaceShell.tsx \
        src/components/projects/WorkspacePrimitives.tsx \
        src/components/projects/WorkspacePrimitives.test.ts \
        docs/superpowers/plans/2026-08-01-builder-progress-ux.md
```

Explicit paths, because `docs/superpowers/plans/2026-07-29-mayar-spike-findings.md` is
dirty in the tree and **belongs to someone else** — never `git add -A`, never fold it in.

Conventional Commits, e.g.
`fix(builder): dedupe build progress rows and name the live step in the footer`.

Then push `dev` and watch CI (`gh run watch`) until the Quality workflow is green. CI runs
Storybook build + Storybook tests + Chromatic + `bun run build` + `bun run verify`, which is
strictly more than `bun run check`. Fix anything red; never bypass.

---

## Out of scope — do not touch

- `docs/superpowers/plans/2026-07-29-mayar-spike-findings.md` — another agent's dirty file.
- `src/components/projects/WorkspaceShell.test.ts.patch` — a stale tracked artifact whose
  diff is already applied to `WorkspaceShell.test.ts`. Dead file. **Report it, do not
  delete it.**
- `src/lib/projects/project-job.ts` — `mapActiveJobStepsToBuildProgress` is imported only by
  its own test and duplicates the hydrate block's inline map, but its `ProjectJobStep` input
  requires an `at` field that `RuntimeWorkspaceState.activeJob.steps` does not carry.
  Unifying them is a real refactor with a real type change. **Report it, do not do it.**
- The `label\0detail\0path` key-based hydrate merge (D3 escalation) — unneeded today.
- Removing either channel reader. Both are load-bearing: the POST body gives low latency,
  the EventSource survives a dropped POST connection.

## Key files

| Path | Why |
|---|---|
| `src/lib/projects/build-attempt-pubsub.ts` | channel buffer, replay-from-0, `seq`/`attemptId` stamping |
| `src/lib/projects/build-stream-event.ts` | event → step reducer, deduper |
| `src/lib/projects/build-progress-steps.ts` | append/complete/merge/current-step transforms |
| `src/lib/projects/build-attempt-worker.ts` | `send()` at :125, `persistProgressEvent()` at :92, phase labels |
| `src/routes/api.projects.$id.generate.ts` | attempt id creation :180, returns the channel stream :277 |
| `src/routes/api.projects.$id.attempts.$attemptId.stream.ts` | live channel vs DB replay fork :48 |
| `src/components/projects/WorkspaceShell.tsx` | hydrate ~603, `startBuild` ~800, `handleBuildStreamEvent` ~1219, stream wiring ~1262, footer ~2719 |
| `src/components/projects/useBuildAttemptStream.ts` | EventSource wiring |
| `src/components/projects/WorkspacePrimitives.tsx` | step cards ~1012, `ProcessingControl` ~1165 |

## Sensitive data

None in this document. `cookie.header.txt` holds a live session token — gitignored, never
print its contents, never paste it into tracked files or logs.
