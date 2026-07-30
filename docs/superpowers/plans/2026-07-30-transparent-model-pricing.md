# Transparent Model Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve 9Router/CMC model ids to fair prices, keep manual prices Git-reviewable, and persist pricing proof on every energy debit.

**Architecture:** `model-pricing.ts` gains `resolveModelPricing()` that returns price plus proof metadata. It checks `config/model-pricing-overrides.json`, then OpenRouter cache/refresh, then aliases from `/models`, then conservative floor. `user-credits.ts` uses that proof once per charge and writes it into `UserCredit` debit rows.

**Tech Stack:** TypeScript, Bun, Prisma + Postgres, Vitest, TanStack Start, OpenRouter `/api/v1/models`, local 9Router/CMC model ids.

## Global Constraints

- Bun only. `bun.lock` is canonical.
- Work from `dev`.
- Keep changes small and surgical.
- User-facing product UI copy is Indonesian; developer-facing docs/code/logs/errors are English.
- Do not commit secrets, `.env`, logs, screenshots, local uploads, `.data`, build artifacts, or generated junk.
- Energy formula stays USD cost × 1,000,000.
- Do not change the free/premium split, daily limit, or WIB day boundary.
- `umkmcepat-combo` is not a real priced model; do not assign a fake exact price.
- Unknown models use conservative floor and warn once.
- Energy charging must never throw into request paths.
- Do not run `bun run build` unless requested.
- Before handoff, run `bun run check`.

---

## File Structure

**Create:**
- `prisma/migrations/20260730000000_add_user_credit_pricing_proof/migration.sql` — nullable pricing proof columns on `UserCredit`.

**Keep:**
- `config/model-pricing-overrides.json` — Git-tracked manual price/mapping source.

**Modify:**
- `prisma/schema.prisma` — add nullable pricing proof fields to `UserCredit`.
- `src/lib/model-pricing.ts` — override loader, alias resolver, proof-returning `resolveModelPricing()`.
- `src/lib/model-pricing.test.ts` — resolver tests.
- `src/lib/user-credits.ts` — use `resolveModelPricing()` and persist proof in debit rows.
- `src/lib/user-credits.test.ts` — ledger proof tests.
- `PRODUCT.md` — plain product note about simple user ledger.
- `DEV.md` — developer note about pricing overrides and audit proof.

---

## Tasks

1. Add pricing proof columns.
2. Add proof-returning model pricing resolver.
3. Persist pricing proof on energy debits.
4. Document pricing override workflow.
5. Final verification.
