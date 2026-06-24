# Codebase Index

Fast context for fresh agents. Read this after `AGENTS.md` and before broad codebase indexing. Keep it short, current, and factual.

## Product

UMKM Cepat is an AI website builder for Indonesian UMKM. Users describe a business in Indonesian, discuss the brief with AI, then build a previewable generated website.

## Stack

- Next.js 15 App Router, React 19, TypeScript
- Tailwind CSS, owned shadcn/ui-style components in `src/components/ui`
- Prisma + PostgreSQL
- NextAuth/Auth.js with Google OAuth
- Vercel AI SDK through 9Router OpenAI-compatible gateway
- Bun only; `bun.lock` is canonical
- Vitest, ESLint, Prettier, TypeScript, Knip via `bun run check`

## Architecture rule

One platform app, many project rows, one shared renderer/preview path.

User projects are data and artifacts, not separate apps/processes/containers. Do not create per-user Next.js apps, per-project Docker containers, or arbitrary user backend code for runtime.

## Main runtime flow

```text
/ prompt
  -> POST /api/projects
  -> auth + global/AI rate limit + moderation + input validation
  -> create Project with fallback siteSchema, initial brief, workspaceCard
  -> /projects/[id]
```

```text
/projects/[id]
  -> auth + ownership check by userId
  -> load Project, chatMessages, brief, workspaceCard
  -> WorkspaceShell client UI
```

```text
WorkspaceShell chat
  -> POST /api/projects/preview
  -> validate incoming UI messages
  -> update brief from latest answer
  -> stream AI response
  -> save chatMessages, brief, workspaceCard JSONB
```

```text
WorkspaceShell build
  -> POST /api/projects/[id]/generate
  -> status = building
  -> stream structured ProjectSiteSchema from AI
  -> parse/sanitize partial schema
  -> create Vite React source files
  -> build in temp dir with Bun
  -> save siteSchema, sourceFiles, distFiles, buildStatus, buildLog
```

```text
Preview
  -> GET /api/projects/[id]/preview/[[...path]]
  -> auth + ownership check
  -> serve saved distFiles artifact
  -> noindex
```

## Important files

- `AGENTS.md` — agent rules
- `CHANGELOG.md` — daily general one-line change log for reporting/history
- `DEV.md` — maintainer workflow and quality gate
- `docs/project-architecture.md` — project/workspace/renderer/publishing constraints
- `docs/9router.md` — local AI gateway setup
- `docs/provider-architecture.md` and `docs/providers.md` — provider boundaries
- `prisma/schema.prisma` — DB models and indexes
- `src/lib/auth.ts` — NextAuth config
- `src/lib/ai.ts` — 9Router AI SDK adapter
- `src/lib/rate-limit.ts` — memory/none rate limiter
- `src/lib/projects/brief.ts` — brief model and build prompt
- `src/lib/projects/brief-flow.ts` — next workspace card and brief updates
- `src/lib/projects/chat-memory.ts` — chat parsing/paging/context
- `src/lib/projects/site-schema.ts` — safe generated website schema and parser
- `src/lib/projects/site-generation.ts` — AI generation system prompt
- `src/lib/projects/generated-source.ts` — generated Vite files, temp build, dist collection
- `src/app/api/projects/route.ts` — project creation
- `src/app/api/projects/preview/route.ts` — AI discussion endpoint
- `src/app/api/projects/[id]/generate/route.ts` — build endpoint
- `src/app/api/projects/[id]/preview/[[...path]]/route.ts` — artifact preview endpoint
- `src/components/projects/WorkspaceShell.tsx` — main project workspace UI
- `src/components/projects/renderer/ProjectSitePreview.tsx` — schema renderer preview

## Data model snapshot

`Project` is the main product model:

- identity: `id`, `userId`
- prompt/title/model/status
- generated schema/artifacts: `siteSchema`, `sourceFiles`, `distFiles`, `buildStatus`, `buildLog`, `builtAt`
- discussion state: `chatMessages`, `brief`, `workspaceCard`
- timestamps

Indexes currently matter most for:

- dashboard/project list: `Project.userId`, `Project.updatedAt`
- ownership fetches: `Project.id` + `Project.userId`
- auth sessions/accounts via NextAuth tables

JSONB fields are intentionally not indexed yet. Add JSON indexes only after a real query/filter needs them.

## Provider boundaries

- Components/routes must not call vendor SDKs directly.
- AI access goes through `src/lib/ai.ts` and Vercel AI SDK.
- Provider names/config live under `src/lib/provider-registry.ts`, `src/lib/config.ts`, `.env.example`, docs.
- Rate limit provider currently supports `memory` and `none`; Redis is only a future registered name.

## Safety constraints

- Validate AI output before saving/rendering.
- Check `userId` ownership on every private project route.
- Do not evaluate user JavaScript in platform runtime.
- Do not dynamically import generated/user files into the Next.js app.
- Generated source is built in a temp directory; generated paths must pass `assertSafeProjectFilePath`.
- Preview artifacts are private and served with `X-Robots-Tag: noindex`.
- Do not commit `.env`, secrets, logs, screenshots, `.next`, `.pi`, `.browser`.

## Current known tradeoffs

- `buildGeneratedProject()` runs `bun install` and `bun run build` per build. Simple but slow; optimize only when build time hurts real usage.
- Rate limiting is process-local memory. Fine for local/MVP; use Redis only when multi-instance/prod pressure appears.
- Large JSONB project fields (`chatMessages`, `sourceFiles`, `distFiles`) can grow. Split to version/artifact tables or object storage only when row size or query patterns demand it.
- Some routes use `$queryRaw` for JSON fields. Keep parameterized. Replace only if Prisma typing improves or queries get repeated enough to justify helper extraction.

## Change log

Keep newest first. Only record context useful for future agents, not every tiny edit.

### 2026-06-24

- Added this `CODEBASE-INDEX.md` as fresh-agent overview plus ongoing change log.
- Updated `AGENTS.md` so fresh agents must read `CODEBASE-INDEX.md` before code changes and keep it current when meaningful context changes.
- Added `CHANGELOG.md` for daily general one-line updates that can later support lightweight customer reporting.
- Current product shape: prompt -> discussion brief -> generated schema/source/dist -> private preview/code workspace.
- Current architecture stance: one platform app; projects remain DB data/artifacts, not per-project apps.

## Maintenance rules for agents

Update this file when you change any of these:

- product flow or route flow
- core DB model/indexing
- provider boundaries/config/env
- generation/build/preview architecture
- security/isolation assumptions
- important known tradeoffs

Do not duplicate full docs here. Link or name canonical files instead. Keep this file skim-friendly; prefer deleting stale notes over appending noise.
