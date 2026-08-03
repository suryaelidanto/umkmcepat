# Transparent Model Pricing and Energy Ledger

**Date:** 2026-07-30
**Status:** Approved

## Problem

Energy is charged from token usage multiplied by model pricing, but model names are not stable across the stack.

9Router can return provider/backend ids such as `cmc/MiniMaxAI/MiniMax-M3`, while OpenRouter prices the same model as `minimax/minimax-m3`. The existing resolver strips a few gateway prefixes and then expects a direct OpenRouter id. When that fails, it uses the conservative floor and logs warnings such as `[model-pricing] no price for "MiniMaxAI/MiniMax-M3" — using conservative floor`.

That is safe because it never prices a model as free, but it is not transparent or fair enough. A user can be charged from a fallback even when an exact price is available through metadata. An admin also cannot later prove which model id, mapping, source, and price produced a specific ledger charge.

## Goals

- Resolve current 9Router/CMC model ids to OpenRouter prices automatically when metadata allows it.
- Keep a Git-tracked manual pricing override file for deterministic production behavior and contributor review.
- Preserve daily OpenRouter fetch/cache so common model price changes remain automatic.
- Store per-charge pricing proof in the ledger: raw model id, priced model id, pricing source, prompt price, completion price.
- Keep user-facing energy UI simple for non-technical UMKM users.
- Warn once per unresolved model id, not on every request.

## Non-goals

- Showing model/provider names in the default user-facing ledger.
- Replacing 9Router, CMC, or the current AI SDK provider path.
- Making `default-combo` a real priced model. It is a local routing label and must be resolved to the actual child model when possible.
- Changing the energy formula, free/premium split, daily limit, or WIB day boundary.
- Building a full billing/invoice system.

## Design

### 1. Git-tracked pricing override file

Keep one file:

```text
config/model-pricing-overrides.json
```

Each key is a raw model id as seen from 9Router or the AI SDK response. Each value can provide a manual price, an OpenRouter mapping, or both:

```json
{
  "cmc/MiniMaxAI/MiniMax-M3": {
    "sourceModelId": "cmc/MiniMaxAI/MiniMax-M3",
    "openRouterModelId": "minimax/minimax-m3",
    "promptPrice": 0.0000003,
    "completionPrice": 0.0000012,
    "source": "https://openrouter.ai/minimax/minimax-m3",
    "checkedAt": "2026-07-30"
  }
}
```

Rules:

- If `promptPrice` and `completionPrice` are finite numbers, they are authoritative for that raw id.
- If price fields are absent/null but `openRouterModelId` exists, use that id to resolve through the OpenRouter cache.
- If neither exists, the entry is documentation only and must not be treated as a successful price.
- `source` must be a public URL or short source note. No secrets.
- `checkedAt` is an ISO date for review freshness.

The generated initial file covers the currently active 9Router models. `default-combo` stays unpriced with a note because it is not a provider model.

### 2. Pricing resolver order

`getModelPricing` becomes a resolver with proof metadata, not only `{ promptPrice, completionPrice }`.

New internal result shape:

```ts
type ResolvedModelPricing = {
  rawModelId: string;
  pricedModelId: string;
  promptPrice: number;
  completionPrice: number;
  pricingSource:
    | "manual-override"
    | "openrouter-cache"
    | "openrouter-refresh"
    | "conservative-floor";
};
```

The public `getModelPricing(modelId)` can keep returning `{ promptPrice, completionPrice }` for existing callers. Add a new `resolveModelPricing(modelId)` for callers that write ledger rows.

Resolution order:

1. Exact manual override key.
   - If it has prices, return `manual-override`.
   - If it has only `openRouterModelId`, continue with that canonical id.
2. OpenRouter cache by canonical id.
3. On-demand OpenRouter refresh.
4. OpenRouter alias match from fetched `/models` metadata:
   - `id`
   - `canonical_slug`
   - `hugging_face_id`
   - case-insensitive forms
   - simple folded form that ignores punctuation/case.
5. Conservative floor with `pricingSource: "conservative-floor"`.

Do not upsert the conservative floor into `ModelPricing`; it is not real provider data.

### 3. Daily OpenRouter refresh stays

`startModelPricingRefresh` continues to refresh at boot and every 24 hours.

Refresh should build an in-memory alias index from `/models` metadata in addition to upserting canonical prices. This keeps automatic behavior for model names that OpenRouter can explain through metadata.

If OpenRouter is unavailable, serve fresh/stale DB cache first, then manual override prices, then conservative floor.

### 4. `default-combo` handling

`default-combo` is a local preset/routing label. It must not get a fake exact price unless the combo is truly fixed to one child model.

Preferred behavior:

- Charge by the actual model id reported on each AI SDK step/response.
- If only `default-combo` is available, use conservative floor and store `rawModelId: "default-combo"`, `pricedModelId: "unknown"`, `pricingSource: "conservative-floor"`.
- Log once per process that combo did not expose a child model.

This keeps user charges safe and auditable without pretending the combo has a precise price.

### 5. Ledger proof columns

Add pricing proof columns to `UserCredit`:

```prisma
rawModelId      String?  @db.VarChar(160)
pricedModelId   String?  @db.VarChar(160)
pricingSource   String?  @db.VarChar(32)
promptPrice     Decimal? @db.Decimal(20, 12)
completionPrice Decimal? @db.Decimal(20, 12)
```

Every energy debit row records the pricing proof used at charge time. Credit/top-up rows leave these fields null.

Why store prices on the row: OpenRouter prices and manual overrides can change later. Historical ledger rows must remain explainable without replaying today's config.

`addEnergyUsage` should call `resolveModelPricing` once, use the returned prices to calculate energy, then persist the same proof into both free and premium debit rows if a charge is split.

### 6. User UI stays simple

Default user-facing UI should not show model names or provider details. UMKM users care about energy spent, not `cmc/MiniMaxAI/MiniMax-M3`.

Default ledger columns remain simple Indonesian copy:

- Langkah
- Token masuk
- Token keluar
- Energi terpakai
- Waktu

Technical pricing proof is for admin/debug surfaces and future export, not the default product UI. If an admin ledger exists, it may show raw model id, priced model id, pricing source, prompt price, and completion price.

### 7. Logging

Unknown model warnings should be deduped per process:

```text
[model-pricing] unresolved model "cmc/example/model" — using conservative floor; add config/model-pricing-overrides.json entry
```

Log fields must never include secrets or env values.

## Error handling

- Invalid override JSON fails closed at startup/test time for developers, but production runtime should continue with OpenRouter cache plus conservative floor if a parsed entry is invalid.
- Invalid price values are ignored; they must not become zero-cost pricing.
- Network failure during OpenRouter refresh serves fresh/stale DB cache where available.
- Unknown ids use conservative floor and warn once.
- Energy charging continues to catch/log errors and never throws into request paths.

## Testing

Unit tests:

- `resolveModelPricing("cmc/MiniMaxAI/MiniMax-M3")` returns manual override pricing.
- Override with only `openRouterModelId` resolves through cached OpenRouter price.
- `MiniMaxAI/MiniMax-M3` resolves through `hugging_face_id` alias metadata when no manual override exists.
- Unknown model returns conservative floor and does not upsert the floor.
- Unknown model warning is emitted once per model id.
- Invalid override prices are ignored.
- `addEnergyUsage` persists pricing proof columns on debit rows.
- Free/premium split rows receive identical pricing proof.
- Credit/top-up rows leave pricing proof null.

Focused integration/manual check:

- Run local app with 9Router models.
- Trigger a generation using a CMC model.
- Confirm no `[model-pricing] no price for "cmc/..."` warning for matched models.
- Confirm `UserCredit` row stores raw id, priced id, source, prompt price, completion price.
- Confirm `default-combo` either resolves to actual child model or records conservative-floor proof honestly.

## Docs

Update the canonical energy/product docs to explain:

- Energy is based on token usage multiplied by resolved model pricing.
- Manual overrides are Git-tracked in `config/model-pricing-overrides.json`.
- OpenRouter refresh remains the automatic source for supported model prices.
- The user UI intentionally hides technical provider/model names by default.

## Open decisions locked by this spec

- Hybrid resolver: manual override first, OpenRouter cache/refresh second, conservative floor last.
- One override file, not separate alias and price files.
- DB migration is required for historical transparency.
- Default user UI stays non-technical.
- `default-combo` is not assigned a fake exact price.
