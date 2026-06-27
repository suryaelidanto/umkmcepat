# AGENTS.md

Boot instructions for AI agents working on UMKM Cepat.

## Read first

- `PRINCIPLES.md` — operating taste and quality bar.
- `DEV.md` — local workflow, commands, quality gate.
- `DESIGN.md` — required before UI, styling, layout, typography, colors, or components.
- `docs/architecture.md` — required before project, workspace, renderer, publishing, provider, storage, auth, or AI gateway work.
- `docs/deployment.md` — required before Docker, VPS, storage persistence, CI, or monitoring work.

## Commands

```bash
bun install
cp .env.example .env
bun run infra
bun run db:migrate
bun run dev
bun run check
```

Optional AI gateway:

```bash
bun run infra:ai
```

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
- New reusable UI or repeated visual patterns must be added to Storybook first or in the same change.
- Use Graphify for non-trivial codebase discovery when available; do not add it as a project dependency.
- Docs are part of the change: if behavior, setup, env, architecture, provider, storage, deployment, UI system, or product flow changes, update the canonical doc in the same diff or state why docs did not change.
- Run `bun run check` before handoff.
- Do not run `bun run build` unless requested or touching build/deployment behavior.
- Never commit `.env`, secrets, OAuth credentials, API keys, private data, local uploads, logs, screenshots, `.next/`, `.pi/`, `.browser/`, `graphify-out/`, `storybook-static/`, or coverage artifacts.
