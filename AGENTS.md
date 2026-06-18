# AGENTS.md

Guidance for AI agents and automated contributors working on UMKM Cepat.

## Read first

Before editing code, read these files:

- `README.md` — project overview, setup, scripts, security basics
- `CONTRIBUTING.md` — branch, commit, PR, review rules
- `DEV.md` — local development workflow and quality checks
- `docs/open-source-readiness.md` — security/open-source notes
- `docs/provider-architecture.md` — provider/configuration strategy and adapter rules
- `docs/providers.md` — supported provider names and env examples
- `docs/local-development.md` — Docker Compose local infrastructure setup
- `.env.example` — required environment variables, placeholders only
- `package.json` — available scripts and dependency context

## Core rules

- Keep changes small, focused, and easy to review.
- Reuse existing code, components, utilities, and patterns first.
- Prefer simple, readable code over clever abstractions.
- Build one provider first, but keep provider-specific code behind internal adapter boundaries.
- Provider choices must be configurable through environment variables or config files.
- Do not introduce secrets, tokens, private keys, real credentials, or local-only data.
- Do not edit `.env`, `.env.local`, production config, or private credentials.
- Do not run destructive commands unless explicitly requested.
- Do not bypass lint, tests, typecheck, commit hooks, or security checks.
- If unsure, document the tradeoff in the PR instead of guessing silently.

## Required checks

Before proposing a PR or final handoff, run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Use the combined command when appropriate:

```bash
npm run verify
```

## Commit rules

Use Conventional Commits:

```text
feat: add catalog checkout flow
fix: handle missing landing page image
chore: update dependencies
```

Commit messages are checked by Husky + commitlint.

## Quality bar

- Add or update tests for behavior changes.
- Keep UI accessible and responsive.
- Keep reusable logic in `src/lib` or shared components when appropriate.
- Avoid unused dependencies and unused exports.
- Do not import provider SDKs directly in routes/components unless no adapter exists yet and the change is explicitly part of creating one.
- Keep docs updated when setup, scripts, env vars, or workflows change.
- Explain skipped live integrations clearly; do not fake E2E success.

## Security bar

- Never print or commit secret values.
- Use `.env.example` for placeholders only.
- Run a secret scan or manual tracked-file grep before public/security-sensitive changes.
- Treat AI, payment, domain, database, storage, and monitoring credentials as private.

## Branching

- Branch from `dev` for normal work.
- Use short branch names: `feat/...`, `fix/...`, `docs/...`, `chore/...`.
- Open PRs into `dev` first unless maintainers say otherwise.
- `main` is the public/stable branch.
