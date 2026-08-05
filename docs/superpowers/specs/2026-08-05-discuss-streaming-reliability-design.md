# Discuss Streaming & Reliability — Design (t3code-informed)

**Date:** 2026-08-05
**Status:** Audited draft — implementation not started
**Related:**
- `src/lib/projects/discuss-turn-worker.ts` (turn lifecycle, compaction on critical path)
- `src/lib/projects/attempt-queue.ts` (BullMQ queue/worker wiring)
- `src/lib/projects/chat-compaction.ts` / `discuss-turn-shared.ts` (compaction + persist)
- `src/routes/api.projects.preview.ts` (serial preamble before stream)
- `src/routes/api.projects.$id.turns.$turnId.stream.ts` (SSE reattach route)
- `src/lib/projects/discuss-turn-pubsub.ts` (Redis/local progress bus)
- `src/lib/projects/discuss-turn-sse-tail.ts` (SSE tail + DB poll)
- `src/lib/security-headers.ts` (CSP)
- `src/components/projects/WorkspaceShell.tsx` (client reattach + card render)
- `src/lib/projects/discuss-tool.ts` (tool prompt + partial-tool streaming)
- `src/lib/projects/brief-flow.ts` (final workspace-card normalization)
- `src/components/projects/WorkspacePrimitives.tsx` (final card/build recommendation UI)
- `src/routes/__root.tsx:86` (Plus Jakarta Sans `<link>`)
- `/tmp/umkmcepat-handoff-2026-08-05-discuss-hedging-latency.md` (hedging/latency handoff)
- `6bcfc38 fix(discuss): refresh settings before hedging` (settings cache refresh before hedge decision)

**Read first if you have zero context:** `docs/superpowers/handoffs/2026-08-05-discuss-reliability-t3code-study.md` — the report this spec implements. It is self-contained; read it before touching any file listed here.

## Problem

Discuss turns are functionally reliable (162/162 succeeded in DB) but **feel** broken:

1. **Compaction blocks `finish`** — `discuss-turn-worker.ts:1429` runs a full LLM compaction call before `publishProgress(finish)` at `:1450`. User sees the full answer, yet the composer stays locked ~17-26s. (The three degraded paths `:889/:977/:1104` already publish `finish` first and return — proof early `finish` is safe.)
2. **Serial preamble before stream** — `api.projects.preview.ts` runs auth→rate-limit→read JSON→energy→project find→brief persist→chat parse→**moderation (LLM call)**→brief persist→validate→persist turn→claim→enqueue, all before the client receives one byte. Time-to-first-token includes a full moderation call (avg 2.2s, max 14.6s).
3. **`workspaceCard` does not stream** — only `assistantText` (≤20 words) streams via partial-tool JSON. The card (question + options) appears only at the end.
4. **SSE transport lacks snapshot/heartbeat/resume** — `stream.ts` has no `Last-Event-ID`, no `retry:`, no heartbeat, no sequence. Reconnect falls back to full reload.
5. **Reattach discards deltas** — `WorkspaceShell.tsx:2617` reattach `EventSource` only listens for `finish`/`error` then `reloadLatestChat()`; all `text-delta` ignored.
6. **Dead Redis client cached forever** — `discuss-turn-pubsub.ts:219` returns a dead `redisPub` on reconnect; no recovery path short of process restart.
7. **CSP blocks the brand font** — `security-headers.ts:86-87` omit `fonts.googleapis.com`/`fonts.gstatic.com`, so Plus Jakarta Sans (in `__root.tsx:86`, `DESIGN.md`) fails to load on every page.
8. **CSP report-only noise hides real signal** — generated preview report-only spam was not the root cause, but it makes true enforced CSP issues harder to see.
9. **Discuss energy rows can lose `projectId`** — unhedged `chargeDiscussEnergy` lacks `projectId`, so per-project cost accounting is incomplete.
10. **Connection state is implicit** — t3code has explicit `connecting/synchronizing/connected/backoff/offline/blocked` phases; UMKM mostly collapses stream failure into generic reload/error UI.
11. **Protocol work can accidentally change product semantics** — discuss currently uses a structured-response / pseudo-tool contract for cards and build recommendations. Transport work must not convert that into side-effectful real tool execution or change when builds start.

**Domain note (from the t3code study):** t3code is an agent-harness control surface, not a site builder. Its product flow is unrelated. What we adopt is transport discipline only: **snapshot → event → synchronized**, subscribe-before-snapshot, cursor-based resume, explicit connection state, and a separate activity feed.

**Hedging note (from the 2026-08-05 hedging handoff):** hedging can help backend tail latency in limited historical data, but current hedged streaming buffers text and creates dead air. Keep `discuss.hedging=false`; commit `6bcfc38` already makes the worker refresh settings before deciding whether to hedge. Do not re-enable hedging in this project.

## Design

We implement these in order of impact-per-effort, keeping SSE (no WebSocket/Effect migration):

### R0 — Behavior locks before transport changes

Before touching risky streaming/card work, add regression coverage for the current pseudo-tool contract:

- The final persisted assistant message shape stays compatible with today's `present_workspace_card` envelope / structured card output.
- `workspaceCard`, `readyForBuild`, and build recommendation semantics are unchanged.
- No discuss stream event auto-starts build/edit/generation. Builds still start only through the existing explicit build path.
- Progressive/reattach/snapshot events may render earlier UI, but the final normalized card must match today's final card.

This is a guardrail, not a redesign.

### R1 — Compaction off the turn's critical path

Move `maybeCompactProjectChat` + `persistProjectChatCompaction` + its energy charge off the turn into a dedicated BullMQ job. The turn publishes `finish` first, then enqueues compaction. Compaction runs in a background worker; a failure logs via `devLog` (never blocks the turn, never silently vanishes).

**Energy:** compaction must still be charged. In the new job, after `maybeCompactProjectChat` returns non-null, call `chargeEnergyForAiUsage` with `userId`, the compaction model, `compaction.usage`, `reason: "discuss:compaction"`, `projectId`. (Decision: price at compaction's own model — `getModerationModel()` as today — see plan Task 1.)

**Failure signal:** add `devLog("discuss", "compaction-failed", { projectId, error })` in the job's catch. This is the required failure surface the report's reviewer flagged.

### R2 — Open stream earlier + progress events for preamble

Restructure `handlePreviewPost` so the SSE stream starts before the serial work, and emit coarse progress events (`authenticating`, `checking`, `thinking`, `responding`) so the client always has something to render during dead air.

Minimal viable form (keep the DB/energy/moderate logic server-side; only the *ordering of the response* changes):
- Split the route into: (a) validate request shape / return early errors (4xx/5xx that must not be streamed), then (b) begin a `ReadableStream` that emits progress events and does the moderation + enqueue + tail inline.

> ponytail: R2 is the largest structural change. If it proves risky, ship the progress-event *emission* as a first step (events from within the existing tail) and defer the true early-open stream to R2b. Plan marks the full form as the target and the emission-only as the fallback checkpoint.

### R3 — Moderation parallel to discuss start (product decision)

Run `moderateProjectRequest` **concurrently** with the early stream open instead of serially blocking first-token. If moderation rejects, cancel the turn and emit an error.

**This is a product/risk decision:** the model may start producing tokens before moderation verdict. The report explicitly calls this out for human sign-off. **Plan does NOT execute R3**; it documents the approach and the flag (`AppSetting` toggle) so a later decision can flip it on. Default: off (keep serial).

### R4 — Allow Google Fonts in CSP

`security-headers.ts:86-87`: add `https://fonts.googleapis.com` to `style-src` and `https://fonts.gstatic.com` to `font-src`. Verified from `__root.tsx:80-87`. `style-src` already has `'unsafe-inline'`, so the font stylesheet's inline `@font-face`/rules are permitted; we only need the host allowlisted.

### R5 — Stream `workspaceCard` progressively

Extend `nextAssistantTextDeltaFromPartialToolJson` (or a sibling) to also emit partial `workspaceCard` fields as the tool JSON streams. Client renders a card skeleton once `workspaceCard.type` is known, filling options as they arrive. Controlled by the existing `discuss.partial_tool_streaming` setting.

> ponytail: partial card render is the hard part (options can arrive out of order across deltas). Scope R5 to emitting the fields; client-side progressive render is a follow-up (R5b) if parsing proves brittle.

### R6 — SSE heartbeat + `retry:`

In `discuss-turn-sse-tail.ts` (and the `stream.ts` write path), emit an SSE comment `: ping` every ~15s while the turn is running, and include `retry: 3000` in the initial SSE response. Prevents proxies from killing the idle connection during compaction/T1 gaps. Also emit a typed `heartbeat` event so clients can distinguish alive-but-waiting from stalled.

### R7 — Snapshot + sequence + `afterSequence` resume

The full t3code-style transport. Add to the pub/sub events a monotonically increasing `sequence`. The stream route must **subscribe to live progress before reading the DB snapshot**, buffer any live events that arrive during snapshot load, emit `snapshot`, flush buffered/replayed live events, then emit `synchronized`. Client resumes via `afterSequence` (HTTP header `Last-Event-ID` or query param); server replays buffered events after that sequence, falling back to a fresh snapshot if the gap exceeds a ceiling.

> ponytail: this is the architectural investment. It pairs with the eventual web/worker process split. Plan ships the server-side snapshot + sequence + replay; client consume is R7b gated on the R7 server tests passing.

### R8 — Fix dead Redis client cache

`discuss-turn-pubsub.ts:219` (`getRedisPub`) and `ensureRedisSub`:
- Register `error`/`close` handlers that set the module-level client reference to `null` and `redisInitFailed = false`, so the next call re-creates the client (ioredis reconnect or fresh connect).
- This restores progress delivery after a Redis socket drop without a process restart.

### R9 — Reattach renders `text-delta`

`WorkspaceShell.tsx:2620-2651`: the reattach `EventSource` should listen for `text-delta`, `tool-input-available`, `tool-output-available`, and `workspace-card` events and render them (or at least surface a "still running" activity) instead of only waiting for `finish`/`error` and reloading. Align the two transports (main `useChat` path vs reattach path).

### R10 — Reduce generated-preview CSP report-only noise

Keep the security posture, but stop reporting known-benign generated-preview inline script noise as if it were actionable. Either narrow the `Content-Security-Policy-Report-Only` route policy or suppress/report-rate-limit the known generated-preview report-only signature in `/api/csp-violation`. Enforced control-plane CSP remains unchanged except R4.

### R11 — Preserve `projectId` in discuss energy debit

Pass `projectId: project.id` in every `chargeEnergyForAiUsage`/`addEnergyUsageLegs` path for `reason: "discuss:step"` and `reason: "discuss:compaction"`. This fixes accounting only; it must not change pricing.

### R12 — Explicit connection state and activity feed

Adopt t3code's state-machine idea without its stack. Workspace discuss should expose explicit phases (`connecting`, `checking`, `responding`, `synchronizing`, `connected`, `backoff`, `blocked`) and show activity copy separately from assistant text. This is UX/state plumbing, not a protocol migration.

## Constraints / non-goals

- Do NOT rework the hedge race (option 3 in the prior handoff) or touch `discuss.hedging`. Leave hedged streaming behavior as-is.
- Do NOT re-enable hedging. `6bcfc38` already made `discuss.hedging=false` authoritative even when hedge model settings remain filled.
- Do NOT touch R2's moderation *decision* to be parallel by default (R3) — product decision, default off.
- Do NOT migrate to WebSocket or Effect.
- Do NOT turn R3 on by default. The user approved planning all phases; runtime default remains serial moderation until a separate enablement change flips the setting.
- Do NOT replace the existing structured-response / pseudo-tool contract with side-effectful real tool execution. Tool envelopes may still be used as data format, but they must not trigger build/edit side effects directly.
- Do NOT change build trigger semantics. Build starts only through the existing explicit build path.
- Do NOT change final `messages`, `workspaceCard`, `readyForBuild`, or build recommendation semantics except where a task explicitly adds earlier *preview/progress* rendering of the same final data.
- Do NOT "fix" tests to reduce error counts; `p1`/`project_1`/`deployment_timeout` rows are fixtures and correct.
- Do NOT change combo contents, model pricing, or hedge config.
- Asset transport already matches t3code (signed short-lived URLs) — no change.
- `git status` shows ~200 phantom modified files; verify real state with `git diff --quiet HEAD`; stage explicit paths, never `git add -A`.

## Post-Scope: Adaptive Hedging

Revisit hedging only after R1/R2/R5/R6/R7/R9 remove dead-air and resume failures. Any future hedging work must optimize visible-progress latency, not just backend completion latency; first streamed text/card progress must remain visible. Adaptive hedging belongs in a separate spec/plan.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Compaction failure now decoupled from turn → silently stops | Job catch emits `devLog("discuss","compaction-failed",…)`; keep `maybeCompactProjectChat`'s own throw path. |
| Compaction energy no longer charged | New job charges at compaction model; test asserts an energy call is made. |
| R2 early-open stream complexity / ordering bugs | R2b fallback (emission-only) checkpoint; existing `replayDiscussStream`/`runDiscussProgressTail` reused. |
| R3 token leak if parallel moderation | Default off (serial) — only flipped by explicit AppSetting + product sign-off. |
| R5 partial card parse brittleness | Scope to emitting fields; client render deferred (R5b). |
| R7 sequence/resume regressions | Server-side snapshot + replay first, gated on unit tests; client consume is R7b. |
| CSP change weakens policy | `style-src` already `'unsafe-inline'`; only adding the two font hosts. No `script-src` change. |
| Early-open stream changes error semantics | Keep pre-stream validation for auth/rate/body/project. Only moderation/discuss lifecycle becomes streamed. |
| Activity feed creates noisy UI | Show coarse phases only; never stream internal prompt/model/provider details. |
| Streaming/card work changes build behavior | R0 behavior-lock tests run before R2/R5/R7/R9; final persisted output remains the source of truth. |

## Success criteria

1. Behavior-lock tests prove the pseudo-tool/structured-response contract and build trigger semantics are unchanged (R0).
2. `finish` is published before compaction runs (R1): turn wall-clock drops the compaction cost; a `compaction-failed` dev-log appears on failure, never a stuck composer.
3. Font loads: Plus Jakarta Sans renders (R4).
4. SSE stream survives idle gaps: heartbeat comment + `retry:` present, reattach shows deltas (R6/R9).
5. Redis socket drop no longer permanently breaks progress publishing (R8).
6. Snapshot + sequence + `afterSequence` replay path works under unit test and uses subscribe-before-snapshot ordering (R7).
7. Known generated-preview CSP report-only noise no longer hides real enforced violations (R10).
8. Discuss energy debit includes `projectId` (R11).
9. UI exposes explicit connection/activity phases without leaking provider details (R12).
10. `bun run check` green. Existing fixture-based error counts unchanged.

## Done when

R0 behavior locks shipped first; R1, R4, R6, R8, R9, R10, R11, R12 shipped with tests; R2/R5/R7 shipped in full phased form (not vague emission-only placeholders); R3 is implemented only as an off-by-default capability flag; specs/plans updated in the same diff; `bun run check` green.

## Audit Addendum — 2026-08-05

The first plan was directionally right but not execution-complete. Missing items:

- R7 missed t3code's key race fix: **subscribe live before loading snapshot**.
- R10/R11 from the report were omitted even though they are cheap and useful.
- R12 (explicit connection state/activity feed) was mentioned as a t3code lesson but not planned.
- R2/R5 were too vague as "emission-only" fallbacks. Full execution needs separate tasks for protocol, reducer, and UI rendering.
- R6 over-specified raw `retry:` injection into the AI SDK `createUIMessageStreamResponse`; implementation must only add raw SSE directives where the route owns the event stream, and use typed heartbeat/activity events for AI SDK streams.
- The hedging-latency handoff confirms hedging stays out of scope. `discuss.hedging=false` remains the runtime default/decision; adaptive hedging is post-scope.
- The user confirmed the existing pseudo-tool / structured-response behavior is intentional. Add R0 behavior locks before implementation so transport improvements cannot accidentally make build/edit side effects happen through tool calls.

This audited spec is the source of truth for the next implementation pass.
