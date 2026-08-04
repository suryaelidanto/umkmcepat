# AI Model Combos + Pricing Overrides — Design

**Date:** 2026-08-04
**Status:** Draft
**Related:** `config/model-pricing-overrides.json`, `src/lib/model-pricing.ts`, `src/lib/user-credits.ts`
**Read first if you have zero context:** This doc is self-contained. It tells you why the combos exist, what entries to add, and how to verify.

## Problem

Charging correctness depends on `resolveModelPricing(modelId)` finding a price for every model id that can serve a call. The platform just created 6 new 9Router combos (see below) with model ids that are **not yet present** in `config/model-pricing-overrides.json`. If any of those models serve a call before pricing is updated, energy charging silently resolves to fallback pricing — wrong user billing.

The platform is also adding new hedge roles (discuss hedge-2/hedge-3) and a new build-fallback (`minimax-m3` instead of `qwen3-coder-plus` which is text-only), all of which need their own override entries.

## Context: the 6 combos (created by the operator in the 9Router dashboard)

| Combo | Primary | Fallback | Rationale |
|---|---|---|---|
| `default-combo` | `openrouter/xiaomi/mimo-v2.5` | `openrouter/minimax/minimax-m3` | Multimodal catch-all for misconfig/net scenarios |
| `moderation-combo` | `openrouter/z-ai/glm-4.6v` | `openrouter/x-ai/grok-4.20` | Vision-capable safety classifier |
| `discuss-combo` | `openrouter/xiaomi/mimo-v2.5` | — | Hedge A: multimodal, cheap |
| `discuss-combo-2` | `openrouter/z-ai/glm-4.6v` | — | Hedge B: different provider family |
| `discuss-combo-3` | `openrouter/minimax/minimax-m3` | — | Hedge C: third provider family |
| `build-combo` | `openrouter/moonshotai/kimi-k2.6` | `openrouter/minimax/minimax-m3` | Best long-form code; vision fallback |

Vision hard-gate for build (because generation/edit consumes owner-uploaded images): every model in `build-combo` must support image input. Verified via provider metadata: both kimi-k2.6 and m3 do.

Operator owns combo contents; this spec does not change them.

## What the override file is

`config/model-pricing-overrides.json` is a git-tracked static lookup that overrides the dynamic OpenRouter cache when ids differ (e.g. `openrouter/x/...` 9Router id vs `x/...` upstream OpenRouter id). Every energy charge stores pricing proof (`sourceModelId`, `openRouterModelId`, `pricingSource`). Without entries here it falls through to the resolver's heuristic path, which is not guaranteed for new ids.

## Entries to add (verified prices, fetched 2026-08-04 from OpenRouter `/api/v1/models`)

All prices are USD per token (multiply ×10⁶ to get energy micro-USD). `checkedAt: "2026-08-04"`.

| sourceModelId | openRouterModelId | promptPrice | completionPrice | Notes |
|---|---|---:|---:|---|
| `openrouter/xiaomi/mimo-v2.5` | `xiaomi/mimo-v2.5` | 1.4e-7 | 2.8e-7 | default primary, discuss hedge A |
| `openrouter/minimax/minimax-m3` | `minimax/minimax-m3` | 3e-7 | 1.2e-6 | default fallback, discuss hedge C, build fallback |
| `openrouter/z-ai/glm-4.6v` | `z-ai/glm-4.6v` | 3e-7 | 9e-7 | moderation primary, discuss hedge B |
| `openrouter/x-ai/grok-4.20` | `x-ai/grok-4.20` | 1.25e-6 | 2.5e-6 | moderation fallback |
| `openrouter/moonshotai/kimi-k2.6` | `moonshotai/kimi-k2.6` | 5.9e-7 | 2.48e-6 | build primary |
| `openrouter/stepfun/step-3.5-flash` | `stepfun/step-3.5-flash` | 1e-7 | 3e-7 | previous moderation fallback (kept for historical rows) |
| `openrouter/deepseek/deepseek-v4-flash-0731` | `deepseek/deepseek-v4-flash-0731` | 9e-8 | 1.8e-7 | verify existing entry still matches |

## Constraints / non-goals

- Do NOT change combo contents.
- Do NOT add entries for combos `cmc/...` variants unless operator says so.
- Do NOT add `qwen3-coder-plus` — it was considered as build fallback and rejected (text-only breaks owner-image flow).

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Wrong price source → over/undercharge | `promptPrice`/`completionPrice` taken from live OpenRouter API on `checkedAt`; overrides outrank cache, so a mistake is visible immediately in UserCredit rows (pricingSource = overrides file). |
| Old rows suddenly price differently | No action needed; overrides apply to new charges only. |
| Operator changes a combo after this lands | `checkedAt` date tells future readers entries might be stale; operator should verify before pushing price changes. |

## Success criteria

1. `bun run check` passes.
2. `resolveModelPricing("openrouter/xiaomi/mimo-v2.5")` etc. return the overrides (verified via a basic script test or a read of the returned object in a dev REPL).
3. No existing combos' charges change until their checkedAt is updated explicitly.
4. A fresh model id that ever lands in UserCredit via hedging builds (spec B) prices correctly without further overrides.

## Done when

The JSON file contains all entries in the table above, commits cleanly, and charging rows using these models show `pricingSource` referencing the overrides.
