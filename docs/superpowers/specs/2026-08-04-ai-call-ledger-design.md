# AI Call Ledger (`AiCallRecord`) — Design

**Date:** 2026-08-04
**Status:** Draft
**Depends on:** nothing (foundation for batched-generation and discuss-hedging specs)
**Related:** `prisma/schema.prisma` (`UserCredit`, `ProjectEditAttempt`, `ProjectChatTurn`), `src/lib/user-credits.ts`, `src/lib/ai.ts`, `src/lib/dev-log.ts`, `src/lib/ai-request-log.ts`
**Read this if you have zero context:** It is self-contained. It explains what the ledger is, why it exists, the exact fields, and where it's wired.

## Problem

Today, debugging "why was this AI call slow/failing/wrong-model" is archaeology:

- `UserCredit` rows exist but only for **charged** calls, and only store token counts + model + pricing — no latency, no retry count, no error class, no correlation to the specific attempt/turn/step.
- `devLog(...)` writes text lines to a rotating `dev.log` — not queryable, not durable across restarts/deploys.
- `ai-request-log.ts` writes raw payloads to a gitignored tmp dir **only when dev-logging is toggled on** — unavailable in production.
- Coverage is patchy: moderation logs `request-start`, **chat-compaction logs nothing**, generation/edit log aggregate phase timings but not per-LLM-request attribution.

Result: when a user reports "the build took 6 minutes" or "the card never appeared," an agent cannot answer *which* model served, *how many* retries happened, *where* time went, without guessing.

## What this is

A single Postgres table `AiCallRecord` — one row per upstream AI request — recording **metadata only** (never prompts, file contents, or response bodies). It is the always-on, production-visible index; raw payloads stay in the existing redacted tmp debug log for local debugging only.

This is the shared foundation both upcoming specs consume:
- **Batched-generation spec** records every streamed writer call, repair call, and fallback-agent call here, tagged with its phase.
- **Discuss-hedging spec** records one row per racer tagged `hedged: true, raceRole: winner|aborted`, so energy accounting (1:1 sum) and latency attribution (which model served the winner) are both derivable.

## What it is NOT

- Not prompt logging. Bodies never enter this table.
- Not replacing `UserCredit` (billing) or `devLog` (human-readable stream). It complements both: `UserCredit` answers "what did it cost," this answers "what happened and when."
- Not an error-tracker. Failure rows carry `errorClass`; stack traces stay in existing logs.

## Schema

```prisma
model AiCallRecord {
  id            String   @id @default(cuid())
  createdAt     DateTime @default(now())

  // Correlation — at least one is set. Grep any of these to see the chain.
  projectId     String?
  attemptId     String?   // ProjectEditAttempt.id when applicable
  turnId        String?   // ProjectChatTurn.id when applicable
  buildId       String?   // ProjectBuild.id when applicable

  // What kind of call
  task          String   @db.VarChar(32)  // moderation|discuss|compaction|build-spec|build-step|edit|edit-repair|build-repair
  phase         String?  @db.VarChar(32)  // engine-specific: writer|repair|fallback|hedge|spec ...
  stepIndex     Int?                      // agent step ordinal when applicable

  // Models
  modelRequested String  @db.VarChar(160) // combo label requested (e.g. discuss-combo-2)
  modelServed    String? @db.VarChar(160) // actual model if 9Router exposes it (response.model)

  // Latency (ms)
  requestMs     Int?      // full request duration
  ttftMs        Int?      // time to first token/chunk when streaming

  // Tokens
  inputTokens   Int?
  outputTokens  Int?
  cachedTokens  Int?      // prompt-cache reads if reported

  // Outcome
  status        String   @db.VarChar(16)  // ok|error|aborted|timeout
  errorClass    String?  @db.VarChar(64)  // schema-422|transport|rate-limit|parse|... coarse only
  retryCount    Int      @default(0)      // AI SDK retries observed for this logical call

  // Hedge metadata (discuss only)
  hedged        Boolean  @default(false)
  raceRole      String?  @db.VarChar(16)  // winner|aborted — only when hedged

  @@index([projectId, createdAt])
  @@index([attemptId])
  @@index([turnId])
  @@index([task, createdAt])
}
```

Indexes chosen for the two real query shapes: "everything for this attempt/turn/project in order" and "p50/p95 by task over a window."

## Helper and wiring

One helper, `recordAiCall(entry)` in `src/lib/ai-call-record.ts`:

- Fire-and-forget `create()` with `.catch(devLog)` — **never throws into the request path** (same discipline as `chargeEnergyForAiUsage`).
- Accepts a start-time handle: callers capture `startedAt = performance.now()` before the call and pass it in, so latency is measured at the boundary closest to the wire.
- No retries, no queue. If Postgres hiccups, we lose a row — acceptable for telemetry, unacceptable for billing (that's why billing stays in `UserCredit`'s transactional path).

Wire points (each one line at the call site):

| Call site | task value | correlation available |
|---|---|---|
| `src/lib/ai-moderation.ts` | `moderation` | projectId, attemptId/turnId via caller |
| `src/lib/projects/chat-compaction.ts` | `compaction` | projectId, turnId |
| `src/lib/projects/discuss-turn-worker.ts` | `discuss` | projectId, turnId |
| `src/lib/projects/build-attempt-worker.ts` (spec gen) | `build-spec` | projectId, attemptId |
| `src/lib/projects/custom-source-generator.ts` (agent steps; batched writer later) | `build-step` | projectId, attemptId, stepIndex |
| `src/lib/projects/source-edit-agent.ts` | `edit` | projectId, attemptId |

Telemetry: `requestMs` is always the full request duration. `ttftMs` differs by call shape — streaming (`streamText`) records the delta to the first content chunk (`text-delta` / `tool-input-delta`), staying null when the stream fails pre-chunk; buffered calls (`generateText`/`generateObject`/`ToolLoopAgent.generate`) have no first-token moment, so `ttftMs = requestMs`. Call sites get both from `startAiCallTimer({ withTtft: true })` (mark `firstChunk()` per stream; pass `{ nonStreaming: true }` at stop for buffered calls). Agent step chargers record `ttftMs` only for stepIndex 0 of the logical call; later steps leave it unset.

`modelServed`: populated from the AI SDK result's `response.modelId` when present. If 9Router never exposes the underlying child model in responses, this column stays null — visible in data within a day, and it becomes a concrete, evidence-backed question to the 9Router operator instead of a guess.

## Privacy and rules compliance

- **No secrets, no prompts, no file contents.** Columns are ids, enums, counts, durations. This satisfies AGENTS.md ("never echo secrets/payloads") and PRINCIPLES.md ("treat generated content as data").
- The existing `ai-request-log.ts` (raw payloads) remains dev-only, gitignored, redacted — unchanged.
- No user-facing PII beyond project/attempt ids, which are internal opaque identifiers.

## Migration / rollout

1. `bunx prisma migrate dev --name ai-call-record`.
2. Helper + wire points in one PR.
3. No feature flag needed — purely additive. Volume is tiny (bounded by AI call count, which is already energy-gated).
4. Retention: revisit after a month of volume data; expected row rate is low enough that unbounded retention is fine initially.

## Success criteria

1. `SELECT task, count(*), avg(requestMs) FROM "AiCallRecord" GROUP BY 1` answers "which task is slow" from production data.
2. Given any attempt id, one query returns every upstream call in order with per-call latency and retries.
3. Hedged discuss turns show exactly 3 rows with distinct `raceRole` values summing to the UserCredit debit.
4. Zero user-facing behavior change; zero request-path failure modes added (helper never throws).
5. Charging behavior unchanged — verified by comparing UserCredit totals over a smoke session before/after.
