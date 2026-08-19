# AGENTS.md

Boot instructions for AI agents working on UMKM Cepat.

## Read first

- `PRINCIPLES.md` → taste
- `DEV.md` → workflow + Cleanliness + typecheck/lint/test gate
- `PRODUCT.md` → who/what for
- `DESIGN.md` → tokens/UI
- `.agents/skills/unslop/SKILL.md` → unslop writing standard (cut AI tells, active voice, plain speech)
- `docs/superpowers/README.md` → specs/plans are decision trail, trust source over old specs

## What makes UMKM Cepat special

Warm, restrained trust engine for busy Indonesian owners. Four non-negotiables:

1. Trust beats spectacle — visible progress, honest states, no fake awards/prices/addresses
2. One useful path — next action obvious: discuss → build → preview → edit → publish
3. Portable output — generated Vite+Tailwind stands alone, no lock-in
4. 100% free to succeed — every feature works on pilot Energy grant (500k), booster is optional extra, never a paywall

## Glossary

- brief = AI-owned facts/decisions (facts, offer, contact, product)
- turn = one discuss cycle (user message → workspace card)
- attempt = queued build/edit job (BullMQ)
- handoff = spec → build bridge
- scaffold = manifest-derived template (archetype + shadcn)
- project = DB row + .data/project-*

## How it works

brief → discuss-turn-worker (ONE call) → build-planner (contract/plan deterministic + ONE creative-direction call, fail-open) → batched-generator / batched-edit → scaffold/manifest → generated-source → preview-proxy / runtime-supervisor

Facts are deterministic, taste is not: the contract owns every customer-facing value, while the frozen creative direction on the handoff tells the writer what matters about this business. Direction never introduces a fact — source gates reject anything outside `site.*`.
One control-plane, many project rows, supervised generated runtimes.

## Where code lives

- `src/lib/projects/` — 224 files: brief-flow, batched-generator, batched-edit, build-attempt-worker
- `src/routes/api.projects.*` — 40 handlers: generate, edit, preview, chat.turn, runtime
- `src/components/projects/Workspace*` — shell, composer, preview
- `src/lib/s3-client.ts` — storage (MinIO local / R2 prod)
- `src/lib/projects/scaffold/` — archetypes + shadcn starter
- Graphify → `bun run graph:update`, read `graph.html` before non-trivial discovery

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

## Commands

```bash
bun install
cp .env.example .env
bun run infra
bun run db:migrate
bun run dev
bun run check      # fast manual gate: locks + parallel format/lint/typecheck/affected tests/Knip/docs
bun run verify     # locks + docs + route regen + format/lint/typecheck/full tests/Knip
```

- When debugging, read `dev.log` at repo root and `docker compose logs`; see `DEV.md`'s Debugging section for the full workflow.

Local quality gates are automated:

- **Pre-commit** runs `bun scripts/check-staged-fix.ts`: staged-file secret scan plus Prettier/ESLint auto-fix and read-only check. No typecheck, no tests, no Knip at commit time.
- **No pre-push hook.** Push is intentionally cheap locally; CI runs the full suite on every push to `dev`/`main` and on every PR.
- **CI** runs route generation, `bun run build`, `bun run verify`, generated-file diff check, and integration tests. This is the real quality gate.
- The local `bun run check` is the manual fast gate (parallel format/lint/typecheck/`test:changed`/Knip) — a feedback loop, not a substitute for CI. Both must pass before anything reaches `main`.
- During fast iteration, run the nearest focused test plus targeted ESLint; do not repeatedly run the full suite. Never bypass a failing gate.

`bun run verify` checks docs, regenerates the route tree, and runs format/lint/typecheck/full unit tests/Knip. It does not run `bun run build`, integration tests, or generated-file diff check — those are separate CI steps. Use it before handoff without a push, or when you want to confirm a clean state locally.

`bun run sweep:project-orphans` purges `.data/project-*` dirs whose IDs are not in the DB. Run after deleting projects via the DB / CLI (the homepage's delete path runs cleanup automatically).

`bun run infra` starts full local infra (no Compose profiles): Postgres, Redis (BullMQ), 9Router, Headroom, and MinIO (local S3 on `http://localhost:9000`; `scripts/init-s3-buckets.ts` auto-creates the two buckets from `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`). Use `bun run infra:minimal` for Postgres + Redis only.

## Rules — god-tier

- Domain before file type — organize by feature/domain first; no generic catch-all folders (`hooks`, `utils`, `helpers`, `misc`). Local hooks/context/types/helpers stay beside their feature.
- Colocated tests by default — unit/component/route tests sit directly beside the module they verify (`foo.ts` + `foo.test.ts`). Top-level `tests/` is strictly for cross-domain (`tests/unit`), real DB/Redis infra (`tests/integration/*.itest.ts`), browser/mobile audits (`tests/browser/*.browser.test.ts`), and fixtures/helpers (`tests/support`).
- No any — any is lying to the compiler. Use unknown + narrowing, define the shape. No any, no as any, no ts-ignore / eslint-disable without one-liner why.
- Comments — code must be self-explanatory. No // loop over items. Authored comments delete by default; only one-liner `why:` or `ponytail:` when code looks wrong but is right. Delete the rest.
- Solid as hell — nothing ships without typecheck + lint + affected tests green together. CI is not your safety net. Broken = rejected, no excuses.
- Small, surgical — one concern per change. 50-line fix beats 500-line refactor. If description says also, split it.
- No dead weight — no commented-out code, no dead exports, no TODO without ticket. Knip + typecheck must stay green.
- Explicit over clever — boring explicit beats clever abstraction. Deep modules hide complexity behind small stable interfaces.
- Fail loud — validate at trust boundaries, fail closed on auth/money/publish, bound time/size/retries/concurrency. Silent fallback is a bug.
- Prefer deletion, reuse, platform features, existing deps before adding code.
- Plain over technical — explain to a developer in everyday words, not jargon. Sacrifice terminology for understanding. Only drop a technical term when it changes what they must do; skip exhaustive honesty when it adds nothing the user can act on.
- Optimize for next capable agent with zero context: leave canonical docs/scripts/checks clear enough to resume in minutes.
- Use Bun only; keep `bun.lock` canonical; work from `dev`; PRs into `dev`.
- User-facing copy Indonesian; dev docs/code/logs English.
- Always unslop — follow `.agents/skills/unslop/SKILL.md` by default across all code, prompt strings, and docs. Cut AI tells, puffery, filler verbs (utilize/leverage/showcase), and fake ranges. Plain words, active voice, concrete facts.
- Follow `PRODUCT.md`, `DESIGN.md`, `.agents/skills/impeccable` before frontend design;
- Use Graphify for non-trivial discovery when available; do not add as project dep.

## Docs are part of change — you are the linter

- If behavior/setup/env/architecture/provider/storage/deployment/UI changes, update the canonical doc in the same diff or state why not
- If you see code/docs in/adjacent to your touched files that violate DEV.md (any, restating comments, stale docs, broken typecheck/lint/test) — fix it NOW as part of this change. Don't leave broken windows. You are the linter, not deterministic tools
- Surgical but not blind — touch only what task requires, but fix violations you can see nearby. Mention only truly unrelated breaks
- Verification before completion — no claim without fresh evidence. Run `bun run check` (or nearest focused test + lint + typecheck), read exit code, then claim. "Should pass" is not evidence
- Pre-commit runs `bun scripts/check-staged-fix.ts`; CI is real gate. Never bypass failing gate. Before handoff without push, run `bun run check`
- Do not run `bun run build` unless requested or touching build/deployment
- Never commit `.env`/secrets/private data/uploads/logs/screenshots/.next/.pi/graphify-out; env blocks use empty "" values
- Never echo `process.env` values to terminal/logs; log name + set/unset only. Open-source mindset: every tracked file is public forever
