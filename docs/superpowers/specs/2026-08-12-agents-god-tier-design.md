# AGENTS God-Tier Design — Trust Engine, Solid as Hell

Date: 2026-08-12
Status: Approved design (5/5 sections)
Scope: `AGENTS.md` restructure-in-place + `DEV.md` 2-line fix + god-tier Rules
Branch: `dev` → PR into `dev`

## Goal

Make `AGENTS.md` a 115-line bootloader that makes any agent produce **correct & polished in one try** for Indonesian UMKM (warm, restrained, 100% free to succeed) — navigates 600 files / 224 in `src/lib/projects` correctly, never breaks trust, ships `typecheck+lint+test` solid as hell, and heals docs/code proactively like a linter.

> For agentic workers: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` with this spec's plan. This spec is the source of truth.

## Context

Graphify (2026-08-07, 709 files indexed, commit `77b19d03` → now `1742951`, 24 files drift): `src` 2782 nodes, `src/lib/projects` 224 files, 233 communities. God nodes: `devLog` 78, `auth` 63, `WorkspaceShell` 59, `runDiscussTurn` 42, `getEnv` 40. Current `AGENTS.md` (73 lines) buries navigation in 5 volatile bullets (`batched-response.ts`, `hedging removed`, `WorkspaceCard` variants) that churned in last 5 days and lists peripheral Key modules (`s3/email/analytics`) instead of real hubs (`build-attempt-worker/batched-generator/brief-flow/discuss-turn-worker`). No glossary, no danger zone, no done checklist. Agent guesses wrong file, breaks trust.

Vision locked: **A) UMKM trust engine** — free tier that works (pilot 500k Energy, booster optional extra), one useful path, portable Vite+Tailwind, warm/restrained, no fake claims. Must remain.
Success locked: **A) correct & polished in one try**.
Prevent locked: **A) breaking trust** (secret leak, `.data/project-*` corruption, pipeline break, generic AI slop).

Other docs frozen: `PRINCIPLES.md`, `PRODUCT.md`, `DESIGN.md` untouched. `DEV.md` only 2-line fix for stale hedging.

## Architecture

One control-plane (`TanStack Start` on `127.0.0.1:3000`, Docker `docker-compose.prod.yml`), many project rows, supervised generated runtimes. Pipeline:

```
HomePrompt → brief-flow → discuss-turn-worker (ONE call via getDiscussModel) → build-planner → batched-generator / batched-edit → scaffold/manifest → generated-source → preview-proxy / runtime-supervisor
```

Storage both S3-compatible: MinIO local (`http://localhost:9000`) / R2 prod via `src/lib/s3-client.ts`. Observability: `AiCallRecord` + `dev.log` + `.data/tmp/ai-debug/requests.ndjson`.

## Design — AGENTS.md New Structure (~115 lines)

### Section 1 — What makes UMKM Cepat special

```markdown
## What makes UMKM Cepat special

Warm, restrained trust engine for busy Indonesian owners. Four non-negotiables:

1. Trust beats spectacle — visible progress, honest states, no fake awards/prices/addresses
2. One useful path — next action obvious: discuss → build → preview → edit → publish
3. Portable output — generated Vite+Tailwind stands alone, no lock-in
4. 100% free to succeed — every feature works on pilot Energy grant (500k), booster is optional extra, never a paywall
```

Source: `PRODUCT.md` + `PRINCIPLES.md`. Agent gets taste in 20s without opening deep docs.

### Section 2 — Glossary + How it works + Where code lives

```markdown
## Glossary

- brief = AI-owned facts/decisions (facts, offer, contact, product)
- turn = one discuss cycle (user message → workspace card)
- attempt = queued build/edit job (BullMQ)
- handoff = spec → build bridge
- scaffold = manifest-derived template (archetype + shadcn)
- project = DB row + .data/project-*

## How it works

brief → discuss-turn-worker (ONE call) → build-planner → batched-generator / batched-edit → scaffold/manifest → generated-source → preview-proxy / runtime-supervisor
One control-plane, many project rows, supervised generated runtimes.

## Where code lives

- `src/lib/projects/` — 224 files: brief-flow, batched-generator, batched-edit, build-attempt-worker
- `src/routes/api.projects.*` — 40 handlers: generate, edit, preview, chat.turn, runtime
- `src/components/projects/Workspace*` — shell, composer, preview
- `src/lib/s3-client.ts` — storage (MinIO local / R2 prod)
- `src/lib/projects/scaffold/` — archetypes + shadcn starter
- Graphify → `bun run graph:update`, read `graph.html` before non-trivial discovery
```

Fixes graph #1 navigation hallucination.

### Section 3 — Safety + Done + Dev/Test

```markdown
## Three ways to hurt yourself

1. Killing infra by pattern — never pkill -f, use `bun run dev:reset` (kills only repo-owned PID on 3000)
2. Writing to live `.data/project-*` or `.env` secrets to tracked files — public leak, fix is `sweep:project-orphans`
3. `rm -rf .data` — use `bun run sweep:project-orphans`, thumbnails/snapshots regrow

## Hit every surface — definition of done

Before calling frontend done, check: build+edit both? preview + /media/<id> + thumbnail? /admin? Storybook if reusable UI? brief cards + /media refs emitted?

## Dev servers

`bun run infra` (full) / `infra:minimal` (Postgres+Redis only). App `http://localhost:3000`, `dev.log` at root + `docker compose logs`. Read `dev.log` grepping projectId/turnId first. `bun run dev:logs` tails.

## Test data

Empty DB = bad test. Seed worktree `.data` from real copy (never symlink live), bring `state.sqlite*` with VACUUM, keep secrets only if flow needs it.
```

Prevents top 3 destructive ops on god nodes `devLog/getEnv/prisma`.

### Section 4 — God-tier Rules

```markdown
## Rules — god-tier

- No any — any is lying to the compiler. Use unknown + narrowing, define the shape. No any, no as any, no ts-ignore / eslint-disable without one-liner why
- Comments — code must be self-explanatory. No // loop over items. Only one-liner why when code looks wrong but is right. Delete the rest
- Solid as hell — nothing ships without typecheck + lint + affected tests green together. CI is not your safety net. Broken = rejected, no excuses
- Small, surgical — one concern per change. 50-line fix beats 500-line refactor. If description says also, split it
- No dead weight — no commented-out code, no dead exports, no TODO without ticket. Knip + typecheck must stay green
- Explicit over clever — boring explicit beats clever abstraction. Deep modules hide complexity behind small stable interfaces
- Fail loud — validate at trust boundaries, fail closed on auth/money/publish, bound time/size/retries/concurrency. Silent fallback is a bug
```

Mirrors to `DEV.md` Core (`no any` + `solid as hell`) and Cleanliness (`one-liner why only`).

### Section 5 — Docs are part of change — you are the linter

```markdown
## Docs are part of change — you are the linter

- If behavior/setup/env/architecture/provider/storage/deployment/UI changes, update the canonical doc in the same diff or state why not
- If you see code/docs in/adjacent to your touched files that violate DEV.md (any, restating comments, stale docs, broken typecheck/lint/test) — fix it NOW as part of this change. Don't leave broken windows. You are the linter, not deterministic tools
- Surgical but not blind — touch only what task requires, but fix violations you can see nearby. Mention only truly unrelated breaks
- Verification before completion — no claim without fresh evidence. Run `bun run check` (or nearest focused test + lint + typecheck), read exit code, then claim. "Should pass" is not evidence
```

Overrides old `Surgical edits: mention but don't edit` to proactive heal.

## DEV.md Changes (2 lines)

- Debugging: replace `Hedged discuss turns record three AiCallRecord rows grouped by turnId` → `Discuss turn makes ONE direct call via getDiscussModel() → query AiCallRecord by turnId`
- Core: add cross-link `→ See AGENTS.md god-tier Rules for single truth` to avoid duplication

No changes to `PRINCIPLES.md`, `PRODUCT.md`, `DESIGN.md` in this pass.

## Read First (AGENTS top)

```markdown
## Read first

- `PRINCIPLES.md` → taste
- `DEV.md` → workflow + Cleanliness + typecheck/lint/test gate
- `PRODUCT.md` → who/what for
- `DESIGN.md` → tokens/UI
- `docs/superpowers/README.md` → specs/plans are decision trail, trust source over old specs
```

Dedupe secrets: single bullet `→ DEV.md` instead of 3 repeated, keeps public-repo safety.

## Commands

```bash
bun install
cp .env.example .env
bun run infra
bun run db:migrate
bun run dev
bun run check      # locks + format/lint/typecheck/affected tests/Knip/docs
bun run verify     # locks + docs + route regen + format/lint/typecheck/full tests/Knip
```

Add: `When debugging, read dev.log + docker compose logs; see DEV.md Debugging.`
Add: `Before handoff without push, run bun run check. Never bypass gate.`

## Quality Gate

- `solid as hell` = typecheck + lint + affected tests green together, not just one. Verified via `bun run check` (fast) or focused `vitest run <files> + eslint + tsc --noEmit`.
- Verification before completion iron law: no claims without fresh evidence.
- No `any` enforced via `eslint @typescript-eslint/no-explicit-any` (already max-warnings 0).

## Testing

- Light verification: `bun run check` (locks/parallel format/lint/typecheck/changed tests/Knip/docs)
- Full before merge: CI runs route gen + Storybook + `bun run build` + `bun run verify` + integration
- New reusable UI → Storybook story in same change

## Risks

- Proactive fix-now could widen diffs → bounded to in/adjacent to touched files.
- New glossary could stale → keep 6 terms only, link to source files.

## Non-goals

- No new docs creation, no `docs/internals/architecture.md` in this pass (future if team scales).
- No blending of `PRINCIPLES/PRODUCT/DESIGN` into `AGENTS.md`.

## File Touches

- Modify: `AGENTS.md` (restructure to ~115 lines, sections 1-5)
- Modify: `DEV.md` (2 lines + cross-link)
- No other docs.
