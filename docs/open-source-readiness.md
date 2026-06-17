# Open-source readiness notes

## Completed baseline

- Local env files remain ignored by `.gitignore`.
- Placeholder `.env.example` documents required configuration without real values.
- README explains setup, checks, security expectations, and contribution flow.
- Husky pre-commit hook delegates to lint-staged.
- Vitest unit tests cover reusable utility behavior.

## Integrations intentionally not tested by default

- AI generation with OpenAI
- Cloudinary uploads
- Upstash-backed rate limits
- Auth provider login flows
- Payment/domain-provider flows if added later
- Production deploy/Sentry release upload

These require private credentials or external accounts and should use sandbox/local substitutes when available.

## Maintainer follow-up before public launch

- Add a license.
- Review product copy and brand references for the final UMKM Cepat positioning.
- Rotate any credentials that may have existed in previous private history before publishing the repository publicly.
- Consider adding a dedicated secret scanner such as Gitleaks in CI.
