# Contributing

Thanks for helping build UMKM Cepat.

## Workflow

1. Fork or clone the repo.
2. Create a branch from `dev`.
3. Make a small focused change.
4. Add or update tests/docs when needed.
5. Run checks.
6. Open a pull request into `dev`.

## Branch names

Use short descriptive names:

```text
feat/catalog-checkout
fix/landing-page-image
chore/update-deps
docs/setup-guide
```

## Commit messages

Use Conventional Commits:

```text
feat: add product catalog form
fix: handle missing auth session
docs: clarify local setup
chore: update dependencies
refactor: simplify landing page renderer
test: add slug utility tests
```

Allowed common types:

- `feat`
- `fix`
- `docs`
- `chore`
- `refactor`
- `test`
- `style`
- `perf`
- `build`
- `ci`
- `revert`

Husky + commitlint checks this automatically.

## Required checks

Before opening a PR:

```bash
npm run check
npm run build
```

`npm run check` is strict: formatting, ESLint, TypeScript, tests, and unused-code/dependency checks must pass.

## Pull request checklist

- Clear title and short description.
- Linked issue if available.
- Screenshots for UI changes.
- Tests added/updated for behavior changes.
- Docs updated for setup/workflow/env changes.
- No secrets, credentials, tokens, or local-only files.
- No unrelated formatting or dependency churn.

## Code quality

- Prefer simple readable code.
- Reuse existing components and utilities.
- Keep functions small and named clearly.
- Avoid unused dependencies.
- Avoid broad rewrites unless discussed first.
- Do not fake passing tests or live integrations.

## Security

Never commit:

- `.env` or `.env.local`
- API keys or tokens
- private keys
- real database URLs
- production credentials
- personal/private customer data

Use `.env.example` for placeholders only.

## Dependency changes

Dependency updates should be intentional. Explain why a dependency is added, removed, or upgraded. Security patches are welcome, but avoid unrelated major upgrades in the same PR.
