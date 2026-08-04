# AI Call Ledger (`AiCallRecord`) — Implementation Plan

**Date:** 2026-08-04
**Status:** Draft
**Spec:** `docs/superpowers/specs/2026-08-04-ai-call-ledger-design.md`
**Reviews before merging:** run `bun run check`, then a focused test of the ledger helper, then verify one real AI call lands a row.

## Tasks (in order)

### 1. Schema migration
- Add the `AiCallRecord` model exactly as in the spec to `prisma/schema.prisma`.
- Run `bunx prisma migrate dev --name ai-call-record` (or the repo's `bun run db:migrate` equivalent for local).
- Acceptance: migration applies clean; table exists with all indexes from spec.

### 2. Helper: `src/lib/ai-call-record.ts`
- Export `recordAiCall(entry: AiCallEntry): void` — fire-and-forget, `.catch(err => devLog("ai-call-ledger", "write-failed", { error: err instanceof Error ? err.message : String(err) }))`. Never throws.
- Entry fields match schema (see spec); validate at the type level with a TS type; clamp varchars to their db lengths before write (copy the `.slice(0, N)` discipline from `user-credits.ts`).
- Export convenience: `startAiCallTimer(): () => { requestMs: number }` wrapping `performance.now()`.
- Tests: `src/lib/ai-call-record.test.ts` — (a) write with full fields, (b) write with only required fields, (c) DB failure is swallowed and logged (mock prisma create to reject), (d) varchar clamping.

### 3. Wire moderation
- `src/lib/ai-moderation.ts`: wrap both the primary call and the retry call. Capture `performance.now()` before each; record on resolve/reject with `status` and `errorClass` (map the thrown error/message to a coarse class string). `task: "moderation"`. Correlation args are already in scope as function params.
- Keep existing `devLog("moderation", ...)` lines untouched.

### 4. Wire discuss
- `src/lib/projects/discuss-turn-worker.ts`: around the primary `streamText` call. TTFT: capture on first received chunk if the SDK exposes a first-chunk hook; otherwise leave null. `task: "discuss"`.
- The hedging spec will add per-racer rows later; today this wires the single existing call so the table isn't empty.

### 5. Wire generation paths
- `build-attempt-worker.ts`: record the implementation-spec `generateText` call (`task: "build-spec"`).
- `custom-source-generator.ts`: record each agent step — the SDK's `onStepFinish`-adjacent point is `energy-step-charger.ts`'s `onStepFinish`; add the record call there so step index + usage + modelId are already in scope. `task: "build-step"`, `stepIndex` from the step counter. Same for the repair generator entrypoints (`build-repair`).
- `source-edit-agent.ts`: `task: "edit"`.

### 6. Wire chat compaction
- `chat-compaction.ts`: `task: "compaction"`. (This is the "nothing logged today" gap.)

### 7. Docs
- DEV.md "Debugging" section: add one line — per-request AI metadata lives in the `AiCallRecord` table (query by turnId/attemptId/projectId); raw payloads remain in `.data/tmp/ai-debug/requests.ndjson` (dev-only).

### 8. Verification
- `bun run check`.
- Focused: run the new ledger test file.
- Manual smoke: one discuss turn locally; then query `SELECT * FROM "AiCallRecord" ORDER BY createdAt DESC LIMIT 5;` and confirm a row with `task='discuss'`, latency fields, and correlation ids.

## Out of scope

- The batched-generation engine's own per-call records (added when that engine ships — the helper already accepts its `phase` values).
- Per-racer `hedged` rows (added by discuss-hedging spec).
- Dashboard/admin UI for the table (SQL is fine for now).
- Any change to charging logic.
