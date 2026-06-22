# Open-source readiness notes

## Current baseline

- Local env files are ignored by `.gitignore`.
- `.env.example` uses placeholders only.
- `README.md` stays product-facing and points contributors to `CONTRIBUTING.md`.
- `CONTRIBUTING.md` owns setup and PR workflow.
- `DEV.md` owns maintainer and agent SOP.
- Husky runs `bun run check` before commit.
- CI runs `bun run check` and `bun run build`.
- Bun is the only supported package manager.

## Integrations intentionally not tested by default

- AI generation through live 9Router/provider credentials
- Storage provider uploads to external S3/R2 services
- Auth provider login flows
- Production deploy/Sentry release upload
- Future payment/domain-provider flows

These require private credentials or external accounts and should use sandbox/local substitutes when available.

## Maintainer follow-up before public launch

- Review product copy and brand references for the final UMKM Cepat positioning.
- Rotate any credentials that may have existed in previous private history before publishing the repository publicly.
- Consider adding a dedicated secret scanner such as Gitleaks in CI.
