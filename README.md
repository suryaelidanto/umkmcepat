<p align="center">
  <img src="public/readme/umkmcepat-home.png" alt="UMKM Cepat homepage" width="900" />
</p>

<h1 align="center">UMKM Cepat</h1>

<p align="center">
  AI builder open-source untuk membantu UMKM Indonesia membuat website dan alat digital dari prompt sederhana.
</p>

<p align="center">
  <a href="https://github.com/suryaelidanto/umkmcepat/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-AGPLv3-blue" /></a>
  <a href="https://github.com/suryaelidanto/umkmcepat/pulls"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen" /></a>
</p>

## What is UMKM Cepat?

UMKM Cepat helps Indonesian small businesses turn plain Indonesian prompts into useful websites. The product is chat-first: users describe the business, AI clarifies the brief, then the workspace builds previewable frontend output.

The goal is practical: help sellers get a clean online presence without needing to understand design systems, routing, deployment, or AI tooling.

The platform is 100% free for users — every feature is usable without paying. An optional paid Energy Booster exists for users who want extra energy beyond the free daily quota, but paying never locks out functionality, so the core experience stays free. Access is managed via a pilot whitelist with admin approval (targeting ~10 initial real UMKM businesses).

## Current direction

UMKM Cepat is evolving into a Lovable-like builder for UMKM:

- guided AI discussion before build
- no manual discuss/build mode switch
- generated frontend preview, source, and build artifacts
- reusable design-system components in Storybook
- private project workspace with chat memory and account/profile UX
- local-first object storage, with R2 reserved for later
- Energy Booster modal (1-column layout) integrated in navbar profile dropdown
- export and publish workflows later

## Tech overview

- Next.js 15 and React 19
- TypeScript
- Tailwind CSS and owned shadcn/ui-style components
- Prisma and PostgreSQL
- NextAuth Google OAuth with Turnstile consent gate
- Vercel AI SDK through 9Router
- Storybook, Vitest, ESLint, Prettier, TypeScript, and Knip

## Local development

```bash
bun install
cp .env.example .env
bun run infra
bun run db:migrate
bun run dev
```

`bun run infra` starts Postgres, 9Router, and Headroom.

```text
App: http://localhost:3000
9Router: http://localhost:20129
```

Use `bun run infra:minimal` only when you need Postgres without AI/observability services.

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

GNU Affero General Public License v3 (AGPLv3). See [LICENSE](LICENSE).
