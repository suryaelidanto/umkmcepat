# OpenRouter-Native Pricing + Hedge Floor Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pricing match what 9Router actually serves. Drop `cmc/*` and combo-name override cruft, pin bare OpenRouter ids so manual overrides truly outrank the cache, and stop hedged discuss from pricing/combo-naming hedge legs by combo name — price each racer at its real served model.

**Architecture:** Two independent subsystems. (1) The override file becomes a bare-OpenRouter-id lookup (no `openrouter/` or `cmc/` prefixes, no combo names). (2) `discuss-turn-worker.ts` captures the real served model id per hedge leg (`hedgeStream.response.modelId`) and uses it for the hedge ledger row, the energy leg, and the winner/repair/compaction pricing — mirroring the pattern already proven in `ai-moderation.ts:136` and `batched-generator.ts:562`.

**Tech Stack:** Bun, TypeScript, TanStack Start, Prisma/Postgres, Vitest, AI SDK (`streamText`).

## Global Constraints

- Work from `dev`; atomic Conventional Commits per task.
- TDD: write failing test → run to confirm fail → implement → run to confirm pass.
- Run unit tests with `bunx vitest run --project unit <file>`. Full gate: `bun run check`.
- Use Bun only; keep `bun.lock` canonical.
- Docs are part of the change (spec/plan/pricing docs) when behavior changes.
- Never commit `.env`, secrets, uploads, logs, `.next/`, `.pi/`, `.browser/`, coverage artifacts.
- Do NOT change 9Router combo contents.
- Do NOT change `default-combo` floor behavior (stays intentional catch-all).
- Do NOT touch moderation (`ai-moderation.ts` already real-served) or build (`energy-step-charger.ts` already `response.modelId || opts.modelId`).
- Do NOT remove the OpenRouter cron (`startModelPricingRefresh`, 24h).

---

### Task 1: Re-key override file to bare OpenRouter ids

**Problem recap:** `resolveModelPricing` does an exact `pricingOverrides[rawModelId]` lookup (model-pricing.ts:276). Production `AiCallRecord` shows served ids are bare (`xiaomi/mimo-v2.5`), so the `openrouter/*` and `cmc/*` keys never match a served id — the pins are dead and pricing silently falls through to cache/refresh.

**Fix:** Rewrite `config/model-pricing-overrides.json` keys to the bare served ids.

**Files:**
- Modify: `config/model-pricing-overrides.json`

**Change:**
- Delete 12 `cmc/*` entries (deepseek-v4-pro, deepseek-v4-flash, Kimi-K2.6, Kimi-K2.5, GLM-5.1, GLM-5, MiniMax-M2.7, MiniMax-M2.5, Qwen3.6-Max-Preview, Qwen3.6-Plus, Step-3.5-Flash, MiniMax-M3).
- Delete 3 `discuss-combo*` entries.
- Rename 6 `openrouter/<id>` keys → bare `<id>` (keep `openRouterModelId` unchanged).
- Keep 2 historical bare entries: `stepfun/step-3.5-flash`, `deepseek/deepseek-v4-flash-0731` (now bare-keyed).
- Final key set: `xiaomi/mimo-v2.5`, `minimax/minimax-m3`, `z-ai/glm-4.6v`, `x-ai/grok-4.20`, `moonshotai/kimi-k2.6`, `stepfun/step-3.5-flash`, `deepseek/deepseek-v4-flash-0731`.

**Test:** None at JSON level; covered by Task 3 (`model-pricing.test.ts`).

- [x] Rewrite `config/model-pricing-overrides.json` keys to bare served ids; drop `cmc/*` + `discuss-combo*`.

---

### Task 2: Hedged discuss prices by real served model per leg

**Problem recap:** `settleHedgeRows` hardcodes `modelServed: hedgeModelName` (discuss-turn-worker.ts:380) and `chargeDiscussEnergy` prices each hedge leg by `modelId: hedgeModelName` (line 776). Combo names hit the override/floor path. The primary leg prices by `modelName` (combo). The winner's `discussModelId` uses `hedgeWinner.current.modelName` when a hedge wins.

**Fix:** Capture `response.modelId` per hedge leg and thread it through ledger + energy pricing.

**Files:**
- Modify: `src/lib/projects/discuss-turn-worker.ts`

**Interfaces / types:**
- `HedgeOutcome`: add `servedModelId?: string | null`.
- New local `primaryServedModelId?: string` captured from `primaryResponse.modelId`.

**Changes (with line anchors):**
1. `HedgeOutcome` type (~line 76): add `servedModelId?: string | null`.
2. Hedge-leg IIFE (~line 342, next to `usage` capture): `outcome.servedModelId = (await Promise.resolve(hedgeStream.response).catch(() => undefined))?.modelId;`
3. `settleHedgeRows` (line 380): `modelServed: outcome.servedModelId ?? hedgeModelName`.
4. `chargeDiscussEnergy` primary leg (line 768): `modelId: primaryServedModelId ?? modelName`.
5. `chargeDiscussEnergy` hedge legs (line 776): `modelId: outcome.servedModelId ?? hedgeModelName`.
6. Winner `discussModelId` (line ~735): when hedge wins use `hedgeOutcomes[winner.modelIndex].servedModelId` (real served) instead of `hedgeWinner.current.modelName`; keep `primaryResponse.modelId` fallback for the unhedged/primary-win path.

**Test:** `src/lib/projects/discuss-turn-worker.test.ts` — Task 4 covers assertions; the existing hedge tests will drive the implementation change (they already assert `addEnergyUsageLegsMock` leg calls and `recordAiCallMock` rows).

- [x] Add `servedModelId` to `HedgeOutcome`.
- [x] Capture `outcome.servedModelId` from `hedgeStream.response` in the hedge-leg IIFE.
- [x] Use `outcome.servedModelId` in `settleHedgeRows` `modelServed`.
- [x] Use `primaryServedModelId` for the primary energy leg.
- [x] Use `outcome.servedModelId` for hedge energy legs.
- [x] Use winner's real served model for `discussModelId`.

---

### Task 3: Update `model-pricing.test.ts`

**Files:**
- Modify: `src/lib/model-pricing.test.ts`

**Change:**
- Remove the CMC override test (line ~83 "returns manual override pricing with proof for CMC model ids" using `cmc/MiniMaxAI/MiniMax-M3`).
- Update "returns manual override pricing for every hedged combo primary" (line ~110) — change the input ids from `openrouter/...` to bare served ids (`xiaomi/mimo-v2.5`, `z-ai/glm-4.6v`, `moonshotai/kimi-k2.6`).
- Keep the `normalizeOpenRouterModelId("cmc/deepseek/deepseek-v4-pro")` test (line ~46) — normalization is unchanged.
- Confirm the existing "returns manual override pricing for openrouter/* ids when present" test (line ~97) is removed or re-keyed to bare ids (key `openrouter/minimax/minimax-m3` no longer exists).

**Verify:**
- [x] `bunx vitest run --project unit src/lib/model-pricing.test.ts`

- [x] Drop CMC override test; re-key override tests to bare served ids.
- [x] Run `model-pricing.test.ts` green.

---

### Task 4: Update `discuss-turn-worker.test.ts`

**Files:**
- Modify: `src/lib/projects/discuss-turn-worker.test.ts`

**Change:** Hedge tests mock `response.modelId` with bare served ids (e.g. `z-ai/glm-4.6v`, `xiaomi/mimo-v2.5`) instead of `discuss-combo-2`. Assert:
- `modelServed` on hedge ledger rows uses the real served id.
- `addEnergyUsageLegsMock` leg `modelId`s are the real served ids (not combo names).
- The primary leg prices at the primary's real served id.

Anchor tests: line ~765 (primary wins, hedge aborted), ~869 (all fail), ~1027 (hedge wins).

**Verify:**
- [x] `bunx vitest run --project unit src/lib/projects/discuss-turn-worker.test.ts`

- [x] Re-key hedge test mocks to bare served ids; assert real served model in ledger legs + `modelServed`.
- [x] Run `discuss-turn-worker.test.ts` green.

---

### Task 5: Update canonical docs

**Files:**
- Modify: `docs/superpowers/specs/2026-08-04-ai-model-combos-pricing-design.md`
- Modify: `docs/superpowers/specs/2026-08-05-discuss-hedge-fairness-image-card-design.md` (pricing claims)

**Change:** State that served ids are bare OpenRouter ids, override keys are bare (no `openrouter/`/`cmc/` prefix, no combo names), and hedged discuss prices by real served model. Drop the "CMC variant" constraints that no longer apply.

- [x] Update `2026-08-04-ai-model-combos-pricing-design.md` (bare keys, no cmc, no combo names).
- [x] Update `2026-08-05-discuss-hedge-fairness-image-card-design.md` (hedge priced by real served model).

---

### Task 6: Full gate

- [ ] `bun run check` passes.
- [ ] Update AGENTS.md if it references `cmc/` or combo-name pricing.
