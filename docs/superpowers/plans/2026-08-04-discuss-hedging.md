# Discuss Hedging — Implementation Plan

**Date:** 2026-08-04
**Status:** Draft
**Spec:** `docs/superpowers/specs/2026-08-04-discuss-hedging-design.md`
**Depends on:** AiCallRecord spec migrating first (telemetry).

## Tasks

1. **Settings registry** — edit `src/lib/app-settings-registry.ts`: add the two hedge entries (`ai.model.discuss_hedge_2`, `ai.model.discuss_hedge_3` + env aliases). Follow the `ai.model.discuss` entry's exact shape.

2. **Resolver** — `src/lib/ai-models.ts`: add `getDiscussHedgeModels(): string[] | undefined`. Returns `[hedge2, hedge3]` for whichever are set, in stable order.

3. **Race implementation** — in `src/lib/projects/discuss-turn-worker.ts`, replace single `streamText` with:
   - Build config list = primary + whitelisted hedge legs.
   - Spawn N parallel `streamText` calls, each with its own `AbortController`.
   - Winner selection: first stream that completes without error AND with `finishReason === "tool-calls"` carrying a parseable card.
   - On win: `controller.abort()` the others immediately; mark their records as `raceRole: "aborted"`.
   - Wire `recordAiCall` on start/finish/error for each leg.

4. **Energy** — leave existing `chargeEnergyForStep` flow alone; it already runs per call. Validate in a test that the turn's UserCredit total equals the sum of the three rows from `AiCallRecord`.

5. **Partial-tool streaming** — wire `nextAssistantTextDeltaFromPartialToolJson` into the winner's stream before publishing, gated on a setting `discuss.partial_tool_streaming` default-on. On providers that don't emit partial chunks this is a no-op.

6. **Repair** — keep existing `repairToolCallInTurn` but invoke it on the winner's state only. Never repair a loser.

7. **Deploy-time schema check** — `scripts/verify-hedge-schemas.ts`: minimal `streamText` invocation against each configured hedge; hard error + descriptive hint on 422.

8. **Tests**
   - `discuss-turn-worker.test.ts` race mock: three mocked streams where only one resolves cleanly → winner propagated, losers aborted, events only from winner.
   - Winner-invalid-card → `repairToolCallInTurn` invoked with winner's state.
   - Hedge-off (no settings) → same behavior as today.
   - Pricing: summed energy == UserCredit debit total.

9. **Docs** — DEV.md settings table gains the two new rows; debug section gains a sentence: "hedged turns record three AiCallRecord rows grouped by turnId; grep turnId for full picture."

10. **Rollout** — behind a feature flag `discuss.hedging` required true AND at least one hedge setting set. Flagged on for internal only at first; enable after schema check passes in staging.

## Verification before claiming done

- `bun run check`.
- Focused discuss tests: `bun test src/lib/projects/discuss-turn-worker.test.ts`.
- Manual: run a real discuss turn end-to-end via the preview UI, watch `[umkm:discuss]` timings and confirm p95 drop and valid card rendering. AiCallRecord rows for that turn visible in DB.
