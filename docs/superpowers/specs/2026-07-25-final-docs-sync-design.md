# Final Docs Sync — Design

**Date:** 2026-07-25
**Topic:** 9 (the very last phase) of the eight-topic roadmap (extended to 9 with polish+security).
**Status:** Design approved; pending plan + implementation. Must run **last** — after topics 1–8 land.

## Goal

After all 8 feature topics ship, sync every canonical doc (`README.md`, `DEV.md`, `CLAUDE.md`/`AGENTS.md`, `PRINCIPLES.md`, `PRODUCT.md`, `DESIGN.md`, `CONTRIBUTING.md`, `docs/architecture.md`, `docs/deployment.md`, `CHANGELOG.md`, `docs/research/*`) + `.env.example` so they perfectly match the shipped reality. A 0-context future agent reading the docs sees what's actually true.

## Why

Docs drift during feature work. The 8 topics add: R2 display-media storage (`r2-client.ts`, `PROJECT_ASSET_STORAGE_PROVIDER`), photo-upload (`/media/<assetId>`, composer attachments, VL placement), waitlist admin (`/admin`, `WAITLIST_ENABLED`), mobile (bottom-nav, bottom-sheet), prettier-on-gen, codebase cleanliness contract, email/OTP adapters, polish+security (dark chrome, SEO copy, JSON-LD, error-sanitize). None of these are reflected in the docs yet — and two env vars the R2 plan references (`PROJECT_ASSET_STORAGE_PROVIDER`, `PROJECT_ASSET_R2_PREFIX`) aren't even in `.env.example` (the env-must-be-declared rule). This phase closes all that, once, at the end.

## Decisions (locked; no forks)

1. **Runs last, after topics 1–8.** Not a parallel phase — it documents the shipped reality, so it must run after everything lands. If a topic's docs update was already committed inline (e.g. `docs/architecture.md` storage-boundary row in the R2 plan), this phase confirms + reconciles; it doesn't redo.
2. **Every canonical doc gets a reconciliation pass.** Each doc is read against the shipped code; stale claims are fixed; new surfaces are documented. See the per-doc checklist in the plan.
3. **`.env.example` must be 1:1 with `.env` + contain every spec-referenced env var.** Add the two missing R2 vars (`PROJECT_ASSET_STORAGE_PROVIDER`, `PROJECT_ASSET_R2_PREFIX`) to the OPTIONAL section. Verify the 1:1 invariant via `diff <(sed 's/=".*"/=""/' .env.example) <(sed 's/=".*"/=""/' .env)`.
4. **`CLAUDE.md`/`AGENTS.md` boot-instructions updated** to mention the new surfaces an agent must read before touching them (R2 client, `/media` route, admin page, mobile chrome, email/OTP adapters, the cleanliness contract in DEV.md).
5. **`DEV.md` cleanliness contract** — if topic 6 didn't already land it, this phase ensures it's present.
6. **`README.md`** — user-facing intro reflects the SEO-grounded positioning (`Website UMKM yang ketemu pembeli`) + the actual feature set (AI builder, free, R2-backed media, mobile-native).
7. **`CHANGELOG.md`** — append a single entry summarizing the 8-topic batch.
8. **No behavior change.** This is docs-only; `bun run check` stays green (docs aren't gated, but the `.env.example` change is — verify it passes lint/format).

## Architecture

N/A — docs reconciliation. The only "code" is `.env.example` (+ `.env` to keep 1:1).

## Data flow

N/A.

## Error handling

- A doc claim that contradicts shipped code → fix the doc to match code (not the other way; this phase is doc-sync, not a behavior change).
- A missing env var → add to both `.env.example` + `.env` (1:1).
- An internal link that's broken → fix or remove.

## Testing

- The `.env.example` change passes `bun run check` (format/lint).
- The 1:1 invariant holds: `diff <(sed 's/=".*"/=""/' .env.example) <(sed 's/=".*"/=""/' .env)` → no output.
- Manual: a 0-context read of `CLAUDE.md` + `DEV.md` + `docs/architecture.md` correctly predicts where R2, `/media`, `/admin`, mobile chrome, email/OTP live.

## Out of scope

- Any code change (docs + `.env.example` only).
- Re-deriving the SEO strategy (that's topic 8).
- New features.

## Open questions for implementation

- Whether `docs/research/*` + `docs/superpowers/specs+plans` need pruning/archiving — lean: leave specs/plans (they're the decision trail); prune only obviously-stale research that contradicts shipped reality.
