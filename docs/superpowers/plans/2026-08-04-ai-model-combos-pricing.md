# AI Model Combos + Pricing Overrides — Plan

**Date:** 2026-08-04
**Status:** Draft
**Spec:** `docs/superpowers/specs/2026-08-04-ai-model-combos-pricing-design.md`

## Tasks

1. **Edit overrides file** — `config/model-pricing-overrides.json`. Add these entries (verified prices, order preserved alphabetically as in existing file):
   - `openrouter/xiaomi/mimo-v2.5` / `xiaomi/mimo-v2.5` / 1.4e-7 / 2.8e-7
   - `openrouter/minimax/minimax-m3` / `minimax/minimax-m3` / 3e-7 / 1.2e-6
   - `openrouter/z-ai/glm-4.6v` / `z-ai/glm-4.6v` / 3e-7 / 9e-7
   - `openrouter/x-ai/grok-4.20` / `x-ai/grok-4.20` / 1.25e-6 / 2.5e-6
   - `openrouter/moonshotai/kimi-k2.6` / `moonshotai/kimi-k2.6` / 5.9e-7 / 2.48e-6
   - `openrouter/stepfun/step-3.5-flash` / `stepfun/step-3.5-flash` / 1e-7 / 3e-7 (only if not already present; check first)
   - Verify `openrouter/deepseek/deepseek-v4-flash-0731` exists with matching price.
   All `checkedAt: "2026-08-04"`, `source` pointing to `https://openrouter.ai/<or-path>`.

2. **Sanity check** — run:
   ```bash
   bun run check
   bun -e "const { resolveModelPricing } = require('./src/lib/model-pricing.ts'); console.log(await resolveModelPricing('openrouter/xiaomi/mimo-v2.5'))"
   ```
   Confirm overrides return (not cache). Do NOT echo secrets; resolveModelPricing does not expose them.

3. **Commit** — `feat(ai): add pricing overrides for new 6-model combos` with the conventional footer.
