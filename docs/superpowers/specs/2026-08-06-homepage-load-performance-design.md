# Homepage Load Performance Design

Date: 2026-08-06
Status: Draft (awaiting review)
Author: perf audit session

## Goal

Make the landing page (`/`) feel fast on first load: visible content within ~1s of the request instead of up to 5s. Guiding principle agreed with the user: **render now, fill in later** — nothing that is not needed for first paint may block first paint; everything else loads asynchronously after.

## Non-goals

- Per-page performance work on `/projects/:id` (workspace), `/admin`, `/waitlist` — the audit found their loaders are local-DB-only and fast; they only share the dev-graph bloat fixed here.
- Timeout/retry hardening as the *primary* fix — timeouts are safety nets, not performance. Added only where an external call remains off the critical path.
- CDN/proxy infra, HTTP/2, image optimization, font self-hosting, or prod build tuning. Prod is already code-split and minified; two prod-relevant wins (cache headers, session injection) are included because they are cheap.
- Reintroducing JS scroll-reveal entrances — removed in favor of always-visible content (D2).
- Per-user rollout flags for these changes.

## Background: measured findings

Measured on the running dev server (`bun run dev`, port 3000), warm process, 2026-08-06.

| # | Finding | Evidence |
|---|---|---|
| 1 | **Dev client graph is 256 modules / 23.8 MB on the homepage.** `routeTree.gen.ts` statically imports all 99 route files, so home pulls in every route: recharts 4.9 MB (admin), full lucide-react 3.5 MB, react-dom 2.7 MB, motion 1.8 MB, zod 1.6 MB, WorkspaceShell 0.47 MB. Vite dev serves each module separately (~190 ms avg transform, worst 2.7 s); browser downloads + parses all before hydration. Est. ~8.1 s at 6-parallel (warm). | module-graph crawl |
| 2 | **Render-blocking CSS recompiles for 4.3 s** on the first request after any source edit (`globals.css`, 199 KB, Tailwind v4). Cached at 0.004 s after. This is the "sometimes slow" — worst right after editing files or cold server start. | `curl` timing ×3 |
| 3 | **GitHub contributors API is on the SSR critical path for guests.** `loadHome` awaits `getCommunityContributors()` → 1–2 *serial* fetches (`/stats/contributors`, then `/contributors` fallback), no timeout. Measured 0.66 s authenticated, 3.4 s unauthenticated, variable. A slow GitHub hangs the entire TTFB; the data only feeds below-the-fold contributor cards. | `curl` timings, `CommunitySection.tsx:123-274` |
| 4 | **SSR TTFB ~1.2 s (guest) / ~0.5 s (signed-in), and `auth()` runs twice per request**: `_main` `beforeLoad` → `runRouteGates` → `getAuthState()`, then `loadHome` → `auth()`. Each = full Auth.js resolve + Prisma banned-check. | `_main.tsx:12-14`, `_main.index.tsx:41-93`, `auth.ts:36-120` |
| 5 | **HTML has `cache-control: no-store`** — every visit re-runs SSR + loaders. | response headers |
| 6 | **Key content is invisible at paint.** Motion SSR emits inline `opacity:0` for every hero word (`HeroContentMotion` variants), and `ScrollReveal` renders every below-hero section with `opacity:0; translateY(24px)`. Nothing visible until JS hydrates and animations run. | served HTML grep, `HeroContentMotion.tsx`, `ScrollReveal.tsx` |
| 7 | **Post-hydration round trip:** `AppProviders` never receives the SSR session, so `SessionProvider` always re-fetches `/api/auth/session` (0.08 s) → waitlist UI flips loading → authenticated after paint. | `AppProviders.tsx:9-16`, `auth-client.tsx:98-102` |

## Design decisions

### D1. Contributors move off the SSR path (fixes #3)

- `getCommunityContributors` + helpers move from `CommunitySection.tsx` into a new server-only `src/lib/community-contributors.ts`.
- Fetches gain `AbortSignal.timeout(2000)` (safety net) and an in-memory TTL cache (15 min, single-flight, mirroring the `primeSettingCache` pattern in `app-settings.ts`).
- New public route `GET /api/community/contributors` serves the cached value with `Cache-Control: public, max-age=900, s-maxage=900`.
- Contributor cards filter automation accounts before sorting in both stats and fallback responses: the case-insensitive `claude` exclusion, GitHub's `type: "Bot"`, and the `[bot]` login suffix (including `blacksmith-sh[bot]`).
- `CommunitySection` becomes a client-fetching component: `useQuery` gated on `typeof window !== "undefined"` (never fetches during SSR), skeleton rows while pending.
- `loadHome` no longer fetches contributors. Guest TTFB drops from ~1.2 s to ~0.6 s.

### D2. Hero + sections visible at paint (fixes #6)

- Replace motion-driven hero word animation with CSS keyframes (`hero-word-in`: translateY + blur, **opacity stays 1** so words are readable during their stagger delay) and reuse the existing `draw` keyframe for the underline. `prefers-reduced-motion: reduce` → `animation: none`.
- `HeroContentMotion` / `HeroMotionItem` become plain divs (they exist only to stagger variants; the container currently renders the whole hero at `opacity:0`).
- `ScrollReveal` becomes a plain div. Its `whileInView` entrance is why every below-hero section renders `opacity:0` in SSR HTML; keeping it forces either hidden-until-JS (the bug) or a visible→hidden→visible flash. Content visibility wins; entrance polish can return later via CSS `animation-timeline: view()` (progressive enhancement, no JS).

### D3. Session resolved once per request (fixes #4)

- Mirror the existing CSP nonce pattern: an `AsyncLocalStorage<Map>` (`__authStore`) initialized at server boot (`src/server.ts`), scoped per request in the security middleware (`src/start.ts`).
- `getAuthState()` memoizes its result in the store; all callers (`auth()`, `getAuthState()`, `checkRouteGates`, `loadHome`) share one Auth.js resolve + one banned-check per request.

### D4. SSR session passed to the client (fixes #7)

- `_main` layout gains a loader that resolves the session server-side only (`typeof window === "undefined"`) and returns it in loader data (dehydrated by TanStack Start).
- `MainLayout` renders a nested `<SessionProvider session={session}>` around `MainChrome` (nested provider overrides the outer fallback from `AppProviders`).
- On boot, children render with the correct session at hydration — no `/api/auth/session` fetch, no loading flip. On client-side navigation the loader returns `undefined` and the provider falls back to its existing refresh behavior (same as today).
- Known cost: the outer provider in `AppProviders` still fires one refresh on boot (~80 ms, parallel, invisible). Accepted; eliminating it would require moving session resolution to the root route, which would add an auth resolve to every API request.

### D5. Cacheable anonymous landing HTML (fixes #5)

- New `src/lib/landing-cache.ts` with `applyLandingCacheHeaders(request, response)`: applies `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` + `Vary: cookie` only when: GET, pathname in `/`, `/privacy`, `/terms`, `/support`, status 200, and no `session-token` cookie.
- Wired at the end of `securityMiddleware` in `src/start.ts` (after `applySecurityHeaders`). No-op in dev (no shared cache); correct headers for prod proxies/CDNs.

### D6. Split the admin overview route (fixes #1, partial)

- Use TanStack Router's file-based route splitting (generator 1.167 supports the `*.lazy.tsx` piece; confirmed in `router-generator/dist/esm/generator.js`): `_main.admin.index.tsx` keeps the route definition, new `_main.admin.index.lazy.tsx` carries `OverviewPage` + recharts.
- Removes recharts 4.9 MB + ~30 modules from the home (and workspace) dev graph. `bun run routes:generate` regenerates `routeTree.gen.ts`; CI's generated-file check covers it.
- **Not split:** `WorkspaceShell` (its page needs it for first paint; home gain only ~0.47 MB), lucide-react (shared by every page; dev pre-bundling can't tree-shake — prod already does).
- Honest expectation: home graph 23.8 MB → ~18.5 MB; combined with the removed SSR GitHub wait this changes the experience from "multi-second blank" to "content at paint + hydrate sooner". Full parity with a bundled dev server is out of scope.

## Acceptance criteria

1. Guest TTFB for `/` drops below ~0.7 s warm (was 1.24 s).
2. Served HTML for `/` contains no inline `opacity:0` in the hero or in `ScrollReveal`-wrapped sections; hero words use `hero-word` classes.
3. `/api/community/contributors` returns 200 with `Cache-Control`; a second call within 15 min does not hit GitHub (verified in unit test).
4. Signed-in users see the correct hero/waitlist state at hydration; `useSession().status` is `authenticated` on first render (no loading flip).
5. Anonymous `/` responses carry the landing cache headers; cookie-bearing requests do not.
6. Home dev module graph drops by ≥ 4 MB and recharts disappears from it (measure with `bun scripts/measure-dev-graph.ts`).
7. `bun run check` green; Storybook build green (no visual regression in stories that render these components).

## Risks & trade-offs

- **ScrollReveal removal** changes the design language (sections appear without entrance). Accepted by user preference ("show it"); CSS `animation-timeline: view()` can restore it later without JS.
- **Route splitting** touches the route generator; if the generator emits something unexpected (spike in Task 6 verifies first), fall back to `lazyRouteComponent` on `AdminOverviewDashboard`.
- **HTML caching** must never apply to cookie-bearing requests (D5 guards); `Vary: cookie` prevents shared-cache poisoning.
- **Auth memoization** is per-request only; session can't change mid-request (cookies are fixed), so no staleness risk.
- In-memory contributor cache is per-process; prod workers each hold their own — acceptable for display data.

Supersedes: nothing.
