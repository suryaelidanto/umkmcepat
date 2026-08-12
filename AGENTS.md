# AGENTS.md

Boot instructions for AI agents working on UMKM Cepat.

## Read first

- `PRINCIPLES.md` → taste
- `DEV.md` → workflow + Cleanliness + typecheck/lint/test gate
- `PRODUCT.md` → who/what for
- `DESIGN.md` → tokens/UI
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

brief → discuss-turn-worker (ONE call) → build-planner → batched-generator / batched-edit → scaffold/manifest → generated-source → preview-proxy / runtime-supervisor
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
- **CI** runs route generation, Storybook build/tests, Chromatic visual tests (if token), `bun run build`, `bun run verify`, generated-file diff check, and integration tests. This is the real quality gate.
- The local `bun run check` is the manual fast gate (parallel format/lint/typecheck/`test:changed`/Knip) — a feedback loop, not a substitute for CI. Both must pass before anything reaches `main`.
- During fast iteration, run the nearest focused test plus targeted ESLint; do not repeatedly run the full suite. Never bypass a failing gate.

`bun run verify` checks docs, regenerates the route tree, and runs format/lint/typecheck/full unit tests/Knip. It does not run `bun run build`, Storybook, integration tests, or generated-file diff check — those are separate CI steps. Use it before handoff without a push, or when you want to confirm a clean state locally.

`bun run sweep:project-orphans` purges `.data/project-*` dirs whose IDs are not in the DB. Run after deleting projects via the DB / CLI (the homepage's delete path runs cleanup automatically).

`bun run infra` starts full local infra (no Compose profiles): Postgres, Redis (BullMQ), 9Router, Headroom, and MinIO (local S3 on `http://localhost:9000`; `scripts/init-s3-buckets.ts` auto-creates the two buckets from `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`). Use `bun run infra:minimal` for Postgres + Redis only.

Optional Storybook:

```bash
bun run storybook
bun run storybook:build
bun run test:storybook
```

## Rules

- Optimize for the next capable agent with zero session context: leave canonical docs, scripts, and checks clear enough that future work resumes in minutes, not archaeology.
- Use Bun only; keep `bun.lock` as the canonical lockfile.
- Work from `dev`; open PRs into `dev` unless maintainers say otherwise.
- Keep changes small, focused, and easy to review.
- Surgical edits: touch only what the task requires. Match surrounding style. Don't refactor, "improve," or clean up adjacent code, comments, or formatting unless asked. Notice unrelated code that looks broken or dead? Mention it in your response — don't edit it. Clean up only your own mess (unused imports/vars your edit created).
- Uncertain about a dependency or the intent of existing code? Stop and ask. Don't guess, and don't rewrite logic that already exists — search and reuse first.
- Prefer deletion, reuse, platform features, and existing dependencies before adding code.
- User-facing product UI copy uses Indonesian; developer-facing docs/code/logs/errors use English.
- Follow `PRODUCT.md`, `DESIGN.md`, and `.agents/skills/impeccable` before frontend design work; do not introduce new visual language without updating the canonical design context.
- New reusable UI or repeated visual patterns must be added to Storybook first or in the same change.
- Use Graphify for non-trivial codebase discovery when available; do not add it as a project dependency.
- Docs are part of the change: if behavior, setup, env, architecture, provider, storage, deployment, UI system, or product flow changes, update the canonical doc in the same diff or state why docs did not change.
- Pre-commit runs `bun scripts/check-staged-fix.ts`; CI runs the real gate. Never bypass a failing gate. Before handoff without a push, run `bun run check` explicitly.
- Do not run `bun run build` unless requested or touching build/deployment behavior.
- Never commit `.env`, secrets, OAuth credentials, API keys, private data, local uploads, logs, screenshots, `.next/`, `.pi/`, `.browser/`, `graphify-out/`, `storybook-static/`, or coverage artifacts.
- Never write secrets into tracked files: no API keys, access keys, secret keys, tokens, passwords, account IDs, or credentialed connection strings in `.md`, docs, specs, plans, comments, commits, or fixtures. Env blocks in docs use empty `""` values, never real values — not even as a "before" block or a "to show current state" example. This repo is public; a secret in a tracked file is a secret leaked.
- Never echo `process.env` or secrets to the terminal or logs. Assume a developer is watching on streaming mode and reads every `console.*`/log line live. To reference an env var in a log, print its name and a set/unset boolean, never the value. No parsed `.env` dumps, no auth-header logs, no "redacted" values that can be reversed.
- Open-source mindset: this repo is public, seen by millions, and safe for anyone to clone. Treat every tracked file, commit, and log line as public forever. Secrets live only in `.env` (gitignored) or deployment secrets. Before writing any value into a tracked file, ask: "am I fine if this appears on the public GitHub front page tomorrow?"
