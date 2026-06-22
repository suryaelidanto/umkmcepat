# UMKM Cepat

UMKM Cepat is an open-source AI landing-page builder for Indonesian small businesses.

The goal is simple: help a seller describe their business in plain Indonesian, generate a professional landing page, and share it with customers through a clear call to action such as WhatsApp.

## Why this exists

Many Indonesian UMKM need a simple online page for products, services, promos, and contact links, but most website builders are too slow, too complex, or too expensive for early-stage sellers.

UMKM Cepat focuses on:

- a chat-first creation flow
- mobile-friendly landing pages
- Indonesian user-facing copy
- configurable AI providers through 9Router
- clean, contributor-friendly engineering

## Tech overview

- Next.js 15 and React 19
- TypeScript
- Tailwind CSS and shadcn/ui-style owned components
- Prisma and PostgreSQL
- NextAuth Google OAuth
- 9Router AI gateway
- Vitest, ESLint, Prettier, and Knip quality gates

## Contributing

Want to run the project locally or help build it?

Start here:

- [CONTRIBUTING.md](CONTRIBUTING.md) - setup, OS-specific install notes, PR workflow
- [DEV.md](DEV.md) - development SOP, quality commands, local troubleshooting
- [docs/9router.md](docs/9router.md) - AI gateway setup
- [docs/observability.md](docs/observability.md) - optional Sentry setup

Before opening a PR, run the quality gate from [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
