# TanStack Start Full Migration PRD

Status: active
Created: 2026-07-14
Updated: 2026-07-14
Owner: suryaelidanto
Scope: Control-plane framework migration (Next.js 15 App Router → TanStack Start)
Read when: Planning, executing, or reviewing any part of the Next.js → TanStack Start migration on branch `migrate-tanstack-start`.
Do not read for: Generated-app runtime work, AI prompt/tooling changes, or feature work unrelated to the control-plane framework.
Current truth: source code + `docs/architecture.md` + `docs/deployment.md` + `AGENTS.md`

## Problem Statement

The UMKM Cepat control plane runs on Next.js 15 (App Router, webpack dev compiler). Local development consumes roughly 1.1 GB of RAM for the dev server alone on a 16 GB machine that also runs WSL, Postgres, browsers, and AI tooling. Dev startup takes tens of seconds and HMR cycles are slow. The maintainer wants a materially lighter and faster development experience, a leaner production server, and a simpler mental model — without regressing authentication, AI streaming, generated-project preview proxying, security posture, SEO, or deployment behavior.

## Solution

Migrate the entire control-plane application from Next.js 15 to TanStack Start (React 19 + Vite + TanStack Router) in one coordinated effort on the `migrate-tanstack-start` branch:

- All pages become TanStack file routes; server-component data reads become route loaders backed by server functions.
- All 28 API route handlers become TanStack server routes returning Web `Response` objects (most handlers already use Web `Request`/`Response`, so bodies port nearly verbatim).
- NextAuth v5 beta is replaced with Auth.js Core wired through a server route, preserving the Google provider, Prisma adapter, JWT session strategy, and existing session/jwt callback semantics.
- The Next middleware (cross-site mutation blocking, global rate limiting, security headers) becomes TanStack global request middleware with identical behavior.
- Sentry, sitemap/robots, image handling, and Storybook move to their Vite/TanStack equivalents.
- Production serves via Bun (with a Node/Nitro preset as fallback if Bun hosting issues surface).

The framework-agnostic core — Prisma schema, `lib` modules (AI, projects, storage, runtime supervision, rate limiting logic, security header logic, OTP, credits, moderation), and nearly all presentation components — is preserved unchanged. Only 3 lib modules have Next imports and need thin adaptations.

## Seams

The migration holds two seams fixed and tests at them:

1. **HTTP boundary (primary seam).** Every API behavior is specified as: given a Web `Request` (method, path, headers, cookies, body), the handler returns a Web `Response` (status, headers, body/stream). Handlers are already written against Web standards; the framework change swaps the router that dispatches to them, not the contract. Acceptance tests exercise handlers through this seam before and after.
2. **`lib` module boundary.** Route files stay thin; all domain logic remains in existing lib modules with unchanged signatures. No lib interface changes are permitted except removing `next/server` types from the 3 coupled modules (rate limit, API errors, auth).

No new seams are introduced.

## User Stories

1. As the maintainer, I want the dev server to use several-fold less RAM than Next.js dev, so that my machine stays responsive while running Postgres, browsers, and AI tooling.
2. As the maintainer, I want dev startup in seconds and sub-second HMR, so that iteration feels fast.
3. As a visitor, I want the public landing page to render server-side with correct metadata, so that SEO and link previews keep working.
4. As a visitor, I want `/privacy` and `/terms` to render as before, so that legal pages remain reachable.
5. As a visitor, I want `sitemap.xml` and `robots.txt` served with the same content, so that search indexing is unaffected.
6. As a returning user, I want my existing session cookie to keep working after the migration deploys, so that I am not logged out.
7. As a user, I want Google OAuth sign-in (redirect, callback, account linking via Prisma) to behave identically, so that login never breaks.
8. As a user, I want sign-out to clear my session and refresh the client state, so that shared machines stay safe.
9. As a user, I want profile name/avatar updates to propagate into my session token (the `update` trigger path), so that the header reflects changes immediately.
10. As a new user, I want the Turnstile captcha and OTP send/verify flow to work unchanged, so that verification is not disrupted.
11. As a user, I want the authenticated home page to list my projects with the same data, so that my workspace is intact.
12. As a user, I want creating a project from the home prompt form to work, including the over-limit hard block, so that project creation rules are preserved.
13. As a user, I want the project workspace page to load with ownership checks and redirect/404 semantics preserved, so that authorization is unchanged.
14. As a user, I want AI discussion streaming (SSE) to start promptly and stream token-by-token, so that generation feels live.
15. As a user, I want the AI preview/card generation stream to behave identically, including honest failure and bounded retries, so that recent reliability fixes are preserved.
16. As a user, I want project edit, chat history, title rename, workspace, and source endpoints to respond identically, so that the workspace UI needs no changes.
17. As a user, I want runtime-event polling to keep its timing and payload shape, so that in-preview feedback works.
18. As a user, I want the generated-project preview proxy to serve HTML/assets with the same headers, sandboxing, and ownership checks, so that previews stay isolated and secure.
19. As a user, I want signed generated-asset and thumbnail routes to keep serving bytes with correct content types and caching, so that project cards render.
20. As a user, I want publish, stop, and runtime lifecycle endpoints to behave identically, so that deployment of generated apps is unaffected.
21. As a user, I want my avatar image route to serve the same bytes with the same authorization, so that profile pictures work.
22. As a user, I want credits and verification-status endpoints unchanged, so that billing/limits UI is correct.
23. As a platform operator, I want `/api/health/live` and `/api/health/ready` semantics preserved, so that orchestration probes keep working.
24. As a platform operator, I want cross-site mutation blocking (Sec-Fetch-Site/Origin checks) enforced on all API mutations, so that CSRF protection does not regress.
25. As a platform operator, I want global API rate limiting applied before handlers, so that abuse protection does not regress.
26. As a platform operator, I want security headers applied to every non-static response, including the generated-origin variant, so that CSP/isolation posture is unchanged.
27. As a platform operator, I want Sentry error and trace capture in production, so that observability survives the migration.
28. As a platform operator, I want a production build that starts under Bun with lower idle RSS and faster startup, so that hosting is cheaper and restarts quicker.
29. As a platform operator, I want moderation endpoints (project-request, projects moderate) unchanged, so that abuse review continues.
30. As a developer, I want the dev-only skip-verification endpoint to remain dev-only, so that no production bypass is introduced.
31. As a developer, I want `bun run check` (format, lint, typecheck, tests, knip) green on the migrated codebase, so that quality gates hold.
32. As a developer, I want all 299 unit tests and 50 Storybook tests passing (with fixtures updated from NextRequest to Web Request where needed), so that regressions are caught.
33. As a developer, I want Storybook running on the plain React-Vite builder, so that component workflow continues.
34. As a developer, I want typed routes, search params, and loaders, so that navigation code gets safer than string-based `next/navigation`.
35. As a developer, I want the repo to remain Bun-only (bun.lock enforced), so that tooling stays consistent.
36. As a developer, I want an explicit rollback path (Next remains on `dev`; migration isolated to this branch until acceptance passes), so that a failed migration cannot strand production.

## Implementation Decisions

### Framework and runtime

- Target: TanStack Start (latest RC, exact versions pinned in lockfile) with React 19, Vite, TanStack Router.
- Production server: Bun. If the known TanStack/Bun hosting issues (router#5205, router#5328) reproduce against our pinned version, fall back to the Nitro Node preset — this is a pre-approved fallback, not a new decision.
- The repo stays Bun-only; scripts (`dev`, `build`, `check`) update in place, same names.

### Route mapping

- Each of the 7 pages becomes a file route. The route-group layout becomes a layout route wrapping the main chrome. `notFound`/`redirect` calls map to router equivalents with identical status behavior.
- Server-component data reads (landing, project detail, profile) become route loaders calling server functions that reuse the existing lib/Prisma calls unchanged.
- The single `"use server"` action (project creation with revalidation) becomes a server function; `revalidatePath` is replaced by router/loader invalidation of the affected route.
- All 28 API handlers become server routes at the same URL paths. Handlers that already build Web `Response` objects port with only import changes. The 6 files using `NextResponse` switch to `Response.json`. Catch-all segments (assets, preview proxy) map to splat routes.
- Streaming rules: AI discussion/generation (SSE, `streamText`) and the preview/thumbnail/asset proxies must be server routes returning streamed Web `Response` — never server functions.
- `sitemap.ts` and `robots.ts` become server routes emitting the same XML/text.

### Authentication

- NextAuth v5 beta → Auth.js Core (`@auth/core`) mounted on a catch-all server route, keeping: Google provider, Prisma adapter, JWT session strategy, the exact session/jwt callbacks (including the `update` trigger handling for name/image and public-profile-image mapping), and the same secret env var.
- Cookie compatibility is a hard requirement: same cookie name, flags, and JWT encoding so existing sessions survive the deploy. Verified by an acceptance test that decodes a pre-migration cookie post-migration.
- The `auth()` helper is reimplemented as a small session-reading function over Auth.js Core used by loaders, server functions, and server routes; call sites keep the same shape.
- Better Auth is explicitly rejected for this migration (widens risk); it may be evaluated separately later.

### Middleware and security

- The Next middleware becomes global request middleware running before all handlers, preserving exact order: cross-site mutation block (403 with same error body) → global rate limit → security headers on every response, including the generated-origin branch.
- The rate-limit and API-error lib modules drop their `next/server` types in favor of Web `Request`/`Response` — signature-compatible, behavior identical.
- Security-header logic is already framework-agnostic and moves untouched.

### Client-side Next API replacements

- `next/link` → router `Link`; `next/navigation` (7 files) → router hooks.
- `next/image` (4 files) → plain `img` with explicit width/height and lazy loading. The Next image optimizer is dropped; remote avatar hosts are served directly. If avatar bytes need proxying, the existing avatar route already covers it.
- Route `metadata` exports → route `head` configuration producing equivalent tags.
- `next-themes` is framework-agnostic and stays.

### Observability and tooling

- `@sentry/nextjs` → Sentry's TanStack Start / Vite integration with the same DSN gating (production + DSN present only) and equivalent tunnel behavior; if the tunnel route is unsupported, expose it as a server route.
- Storybook moves from the Next-Vite builder to the plain React-Vite builder; stories importing Next modules (3 story files) update to router-agnostic wrappers.
- ESLint drops `eslint-config-next` for the TanStack/React equivalents; knip config updates for the new entry points.

### Cutover

- All work happens on `migrate-tanstack-start`. Next remains intact on `dev`/`main` until the full acceptance suite (below) passes; merge is the cutover, revert is the rollback.
- No dual-framework period inside one app: the branch replaces Next wholesale, since both cannot share `src/app`.
- The benchmark protocol from the migration research (dev RSS, prod idle RSS, stream first-byte, proxy cold-start, build time) is run before merge and recorded in the PR description.

## Testing Decisions

- Tests assert external behavior only: request in, response out (status, headers, body, stream events) — never router internals or framework wiring.
- The existing unit-test suite is the base. Only 2 test files import `next/server` fixtures; they switch to plain Web `Request`/`Response` construction. Handler tests continue calling exported handler functions directly — same pattern as today's route tests.
- New acceptance coverage, written before cutover, at the HTTP seam:
  - Auth: OAuth callback session creation, cookie decode compatibility with a pre-migration token, session `update` trigger, sign-out, ownership-gated route rejection.
  - Streaming: one full SSE discussion stream (event framing, first-byte, honest-failure path from commit `694c05e` preserved).
  - Proxying: preview HTML and asset routes (headers, content types, ownership, 404/cold-start behavior).
  - Middleware: cross-site mutation 403, rate-limit 429, security-header presence on page and API responses, generated-origin variant.
  - SEO: landing HTML contains expected metadata; sitemap/robots byte-comparable.
- Storybook's 50 interaction tests keep running under the Vite builder as the presentation-layer regression net.
- Prior art: existing route handler tests (e.g. preview proxy route tests) and lib tests for rate limiting and security headers.

## Out of Scope

- Generated-app runtime, build pipeline, isolation, and scale-to-zero behavior (framework-independent; governed by `docs/architecture.md`).
- Any change to AI prompts, model routing (9Router boundary), tool definitions, or generation logic.
- Replacing Auth.js with Better Auth or changing session strategy (JWT stays).
- Prisma schema changes or database migrations.
- Visual redesign or component rewrites; UI ports as-is.
- Extracting a separately deployable API service (no Hono layer under TanStack Start).
- Production infrastructure changes beyond the app server entrypoint (Docker authority stays outside the web app).

## Further Notes

- TanStack Start is RC-status. Pin exact versions; treat any framework bug encountered as a stop-and-assess event, not something to patch around silently.
- The measured motivation is development experience (dev RSS ~1.1 GB → expected several-hundred-MB range, startup and HMR much faster). Production gains are plausible but unproven; the pre-merge benchmark decides whether prod claims go in release notes.
- Do not duplicate or reverse the reliability work in commit `694c05e` (AI honest-failure and bounded retries) when porting the generation routes.
- Session-cookie compatibility between NextAuth v5 beta and Auth.js Core must be verified empirically early (both derive from the same core, but the JWT encoding/salt must match); if incompatible, a documented one-time re-login is the fallback and must be called out before merge.

## Status History

- 2026-07-14: proposed — full migration authorized by maintainer after resource audit; supersedes the earlier PoC-first recommendation.
- 2026-07-14: active — migration implemented on `migrate-tanstack-start`. All 29 API routes ported to server routes, 7 pages to file routes + loaders, NextAuth → Auth.js Core (cookie-compatible, `basePath: /api/auth`), Next middleware → global request middleware, Sentry/sitemap/robots/Storybook ported, Next tree removed. `bun run check` green (format, lint, typecheck, 299 tests pass / 1 skip, knip). Production build (Vite + Nitro Bun preset) green. Runtime-verified in dev: health, SSR pages, 404, auth session/csrf/providers, auth-gated 401, cross-site 403, security headers. Remaining follow-ups: (1) live Google OAuth round-trip + session-cookie compatibility with a real pre-migration token (needs prod secrets); (2) live AI streaming through 9Router (needs infra); (3) Storybook static build blocked by an upstream Vite 8 / rolldown "multiple entries" bug — not in the `check` gate; interaction-test runner and dev/build of the app are unaffected.
