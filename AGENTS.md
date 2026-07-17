# AGENTS.md

Boot instructions for AI agents working on UMKM Cepat.

## Read first

- `PRINCIPLES.md`: operating taste and quality bar.
- `DEV.md`: local workflow, commands, quality gate.
- `PRODUCT.md`: required before product positioning, builder flow, generated-project UX, or design-system decisions.
- `DESIGN.md`: required before UI, styling, layout, typography, colors, or components.
- `docs/architecture.md`: required before project, workspace, renderer, publishing, provider, storage, auth, or AI gateway work.
- `docs/deployment.md`: required before Docker, VPS, storage persistence, CI, or monitoring work.

## Commands

```bash
bun install
cp .env.example .env
bun run infra
bun run db:migrate
bun run dev
bun run check      # fast local gate (run before commit; hooks also run this)
bun run verify     # full suite: every test, every file, route tree regenerated (run on demand or rely on CI)
```

Local quality gates are automated:

- **Pre-commit** runs `bun run check`: cached Prettier/ESLint, incremental TypeScript, **only tests affected by the current diff** (`vitest --changed HEAD~1`), plus Knip. Typical commit-time: 3-10s on a focused diff.
- **No pre-push hook.** Push is intentionally cheap locally; CI runs the full suite on every push to `dev`/`main` and on every PR.
- **CI** runs `bun run verify` plus Storybook build, Storybook tests, Chromatic visual tests, and `bun run build`. This is the real quality gate.
- The local `bun run check` is a fast feedback loop, not a substitute for CI. Both must pass before anything reaches `main`.
- During fast iteration, run the nearest focused test plus targeted ESLint; do not repeatedly run the full suite. Never bypass a failing gate.

`bun run verify` is the same suite CI runs. Use it before handoff without a push, or when you want to confirm a clean state locally.

`bun run sweep:project-orphans` purges `.data/project-*` dirs whose IDs are not in the DB. Run after deleting projects via the DB / CLI (the homepage's delete path runs cleanup automatically).

`bun run infra` starts Postgres, 9Router, Headroom, and Langfuse. Use `bun run infra:minimal` only when you need Postgres without AI/observability services.

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
- Prefer deletion, reuse, platform features, and existing dependencies before adding code.
- User-facing product UI copy uses Indonesian; developer-facing docs/code/logs/errors use English.
- Follow `PRODUCT.md`, `DESIGN.md`, and `.agents/skills/impeccable` before frontend design work; do not introduce new visual language without updating the canonical design context.
- New reusable UI or repeated visual patterns must be added to Storybook first or in the same change.
- Use Graphify for non-trivial codebase discovery when available; do not add it as a project dependency.
- Docs are part of the change: if behavior, setup, env, architecture, provider, storage, deployment, UI system, or product flow changes, update the canonical doc in the same diff or state why docs did not change.
- Pre-commit runs `bun run check`; CI runs `bun run verify`. Never bypass a failing gate. Before handoff without a push, run `bun run check` explicitly.
- Do not run `bun run build` unless requested or touching build/deployment behavior.
- Never commit `.env`, secrets, OAuth credentials, API keys, private data, local uploads, logs, screenshots, `.next/`, `.pi/`, `.browser/`, `graphify-out/`, `storybook-static/`, or coverage artifacts.
