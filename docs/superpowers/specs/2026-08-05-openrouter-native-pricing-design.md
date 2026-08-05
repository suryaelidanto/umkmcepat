# OpenRouter-Native Pricing + Hedge Floor Fix — Design

**Date:** 2026-08-05
**Status:** Draft
**Related:** `config/model-pricing-overrides.json`, `src/lib/model-pricing.ts`, `src/lib/projects/discuss-turn-worker.ts`, `src/lib/user-credits.ts`
**Read first if you have zero context:** This doc is self-contained. It explains why we drop `cmc/*` and combo-name pricing, pin bare OpenRouter ids, and make hedged discuss energy price by the real served model.

## Problem

Two pricing defects make billing inaccurate and the override file misleading:

1. **Combo names enter pricing.** `settleHedgeRows` hardcodes `modelServed: hedgeModelName` and `chargeDiscussEnergy` prices each hedge leg at the combo name (`discuss-combo-2`, `discuss-combo-3`). The `discuss-combo*` override entries were added purely to rescue those combo names from the conservative floor. Combo names are operator config, not billable models.

2. **Override keys don't match what 9Router actually serves.** Production `AiCallRecord` rows confirm 9Router returns **bare OpenRouter ids** (`xiaomi/mimo-v2.5`, `z-ai/glm-4.6v`) — never `openrouter/...` or `cmc/...` prefixed. The 12 `cmc/*` entries and the `openrouter/*`-keyed entries are effectively dead; pricing for real served ids resolves via the DB cache / OpenRouter refresh, not the pins. This means the "manual override = source of truth" promise is broken for every actually-served model.

## Context: served ids observed in production

`SELECT task, modelRequested, modelServed FROM "AiCallRecord" GROUP BY ...`:

| task | modelRequested | modelServed | n |
|---|---|---|---|
| moderation | moderation-combo | `z-ai/glm-4.6v` | 10 |
| discuss | discuss-combo-2 | `discuss-combo-2` | 7 |
| discuss | discuss-combo-3 | `discuss-combo-3` | 7 |
| discuss | discuss-combo | `discuss-combo-3` | 6 |
| compaction | moderation-combo | `z-ai/glm-4.6v` | 2 |
| build-step | default-combo | `xiaomi/mimo-v2.5` | 2 |
| discuss | discuss-combo | `xiaomi/mimo-v2.5` | 2 |
| moderation | default-combo | *(empty)* | 25 |

Findings:
- Real served ids are **bare** (`xiaomi/mimo-v2.5`, `z-ai/glm-4.6v`, `minimax/minimax-m3`, `moonshotai/kimi-k2.6`, `x-ai/grok-4.20`).
- `discuss-combo-*` rows record the **combo name** as served — that's the `settleHedgeRows` hardcode.
- `moderation`/`default-combo` with empty served id is pre-existing historical data (before served-model capture); not in scope.

## Design

### 1. Override file: bare OpenRouter keys, no combos, no cmc

`config/model-pricing-overrides.json` becomes a lookup keyed by the **bare OpenRouter id** 9Router actually serves. Keys are `<provider>/<model>` (e.g. `xiaomi/mimo-v2.5`), not `openrouter/...` and not `cmc/...`.

- Delete all 12 `cmc/*` entries.
- Delete the 3 `discuss-combo*` entries.
- Rename the 6 `openrouter/*` keys to their bare `openRouterModelId` values.

Resulting entries (5 unique served models + 2 historical): `xiaomi/mimo-v2.5`, `minimax/minimax-m3`, `z-ai/glm-4.6v`, `x-ai/grok-4.20`, `moonshotai/kimi-k2.6`, plus historical `stepfun/step-3.5-flash` and `deepseek/deepseek-v4-flash-0731`.

`default-combo` stays un-keyed → intentional conservative-floor catch-all for misconfig.

`normalizeOpenRouterModelId` keeps stripping `openrouter/` and `cmc/` prefixes — harmless robustness for cache keys; not removed.

### 2. Hedged discuss energy prices by real served model

In `src/lib/projects/discuss-turn-worker.ts`:

- Add `servedModelId?: string | null` to `HedgeOutcome`.
- In the hedge-leg IIFE (next to `usage` capture), set `outcome.servedModelId` from `(await Promise.resolve(hedgeStream.response).catch(()=>undefined))?.modelId`.
- `settleHedgeRows`: `modelServed: outcome.servedModelId ?? hedgeModelName`.
- `chargeDiscussEnergy` hedge legs: `modelId: outcome.servedModelId ?? hedgeModelName`.
- Primary leg: price at `primaryServedModelId` (from `primaryResponse.modelId`) instead of the combo `modelName`.
- When a hedge wins, `discussModelId` (line ~735) uses `hedgeOutcomes[winner.modelIndex].servedModelId` (real served) instead of `hedgeWinner.current.modelName`. This flows to repair/compaction leg pricing and `recordDiscussCall` `modelServed`.

Net effect: **combo names never enter pricing or `modelServed` again.** The `discuss-combo*` override entries become unnecessary and are deleted.

## Constraints / non-goals

- Do NOT change 9Router combo contents or definitions.
- Do NOT remove the OpenRouter cron (`startModelPricingRefresh`, 24h) — it keeps the bare-id cache warm and is the auto-price safety net.
- Do NOT change `default-combo` floor behavior.
- Do NOT touch the `moderation` (already real-served) or build (`energy-step-charger` already `response.modelId || opts.modelId`) paths.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Bare key misses a served id → floor | Bare keys now match exactly what 9Router returns; cron + per-charge refresh cover anything un-pinned; floor is the last resort. |
| `default-combo` empty-served historical rows | Out of scope; pre-existing data, new charges resolve by served id. |
| A future combo backs a new model without an entry | Falls to cron/cache/refresh; add a bare override to pin. |
| Tests mock served ids that no longer match | Update tests to use bare served ids; `makeRaceStreamResult` already returns `response.modelId`. |

## Success criteria

1. `bun run check` passes.
2. `resolveModelPricing("xiaomi/mimo-v2.5")` returns manual override pricing.
3. `resolveModelPricing("openrouter/xiaomi/mimo-v2.5")` and `resolveModelPricing("cmc/MiniMaxAI/MiniMax-M3")` no longer return override pricing (keys removed) — they resolve via cache/refresh/floor.
4. Hedged discuss ledger rows record the real served model id in `modelServed`, and energy legs price each racer at its own real served model.
5. No combo name (`default-combo`, `discuss-combo*`, `moderation-combo`, `build-combo`) appears as `pricingSource: manual-override` for a charge.

## Done when

The JSON file contains only bare OpenRouter keys; hedged discuss captures and prices by real served model; tests assert bare served ids in legs/ledger; canonical pricing docs updated; `bun run check` green.
