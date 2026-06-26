<p align="center">
  <img src="public/readme/umkmcepat-home.png" alt="UMKM Cepat homepage" width="900" />
</p>

<h1 align="center">UMKM Cepat</h1>

<p align="center">
  AI builder open-source untuk membantu UMKM Indonesia membuat website dan alat digital dari prompt sederhana.
</p>

<p align="center">
  <a href="https://github.com/suryaelidanto/umkmcepat/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-green" /></a>
  <a href="https://github.com/suryaelidanto/umkmcepat/pulls"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen" /></a>
  <a href="https://github.com/suryaelidanto/umkmcepat/stargazers"><img alt="Github stars" src="https://img.shields.io/github/stars/suryaelidanto/umkmcepat?style=flat&label=stars" /></a>
  <a href="https://github.com/suryaelidanto/umkmcepat/network/members"><img alt="Github forks" src="https://img.shields.io/github/forks/suryaelidanto/umkmcepat?style=flat&label=forks" /></a>
</p>

## What is UMKM Cepat?

UMKM Cepat helps Indonesian small businesses turn plain Indonesian prompts into useful websites. The product is chat-first: users describe the business, AI clarifies the brief, then the workspace builds previewable frontend output.

The goal is practical: help sellers get a clean online presence without needing to understand design systems, routing, deployment, or AI tooling.

## Current direction

UMKM Cepat is evolving into a Lovable-like builder for UMKM:

- guided AI discussion before build
- no manual discuss/build mode switch
- generated frontend preview, source, and build artifacts
- reusable design-system components in Storybook
- private project workspace with chat memory and account/profile UX
- local-first object storage, with R2 reserved for later
- export and publish workflows later

## Tech overview

- Next.js 15 and React 19
- TypeScript
- Tailwind CSS and owned shadcn/ui-style components
- Prisma and PostgreSQL
- NextAuth Google OAuth with Turnstile consent gate
- Vercel AI SDK through 9Router
- Storybook, Vitest, ESLint, Prettier, TypeScript, and Knip

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
