# Homepage Load Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the landing page (`/`) show content within ~1s instead of up to 5s by removing everything non-essential from the first-paint critical path: GitHub contributor fetches, invisible-at-paint hero/reveal animations, double session resolution, missing HTML caching, and the admin dashboard's recharts bundle from the dev module graph.

**Architecture:** Six independent tasks: (1) per-request `auth()` memoization via `AsyncLocalStorage`; (2) contributor cards move off SSR into a cached client-fetched API route; (3) hero + `ScrollReveal` become CSS-first / plain markup so content is visible at paint; (4) SSR session injected into a nested `SessionProvider`; (5) `Cache-Control` headers for anonymous landing HTML; (6) TanStack Router route splitting for `/_main/admin/` to drop recharts from the home dev graph. Spec: `docs/superpowers/specs/2026-08-06-homepage-load-performance-design.md`.

**Tech Stack:** Bun, React 19, TanStack Router/Start, TanStack Query, Vitest, Vite dev server. No new dependencies.

## Global Constraints

- Bun only; `bun.lock` canonical. No new dependencies.
- User-facing product UI copy stays Indonesian; developer-facing code/logs/errors use English.
- The 2s `AbortSignal.timeout` on GitHub fetches is a safety net only (spec D1) — the primary fix is removing the fetch from the SSR path.
- Surgical edits only: touch what each task requires, match surrounding style.
- `bun run routes:generate` regenerates `src/routeTree.gen.ts` — commit it when generator output changes (Task 6).
- Unit tests run with: `bunx vitest run --project unit <file>`. Full gate before handoff: `bun run check`.
- No comments unless explaining a non-obvious gotcha. No `TODO`/`TBD`.
- Commits use Conventional Commits (`perf:`, `refactor:`, `feat:`, `test:`).

---

## File Structure

**New files:**
| File | Purpose |
|---|---|
| `scripts/measure-dev-graph.ts` | Dev-only module-graph crawler (verification tool) |
| `src/lib/community-contributors.ts` | Server-only GitHub fetch + 15-min TTL cache (moved from `CommunitySection.tsx`) |
| `src/routes/api.community.contributors.ts` | Public `GET /api/community/contributors` |
| `src/lib/landing-cache.ts` | `applyLandingCacheHeaders()` for anonymous landing HTML |
| `src/routes/_main.admin.index.lazy.tsx` | Lazy half of the admin overview route (Task 6) |
| `tests/lib/community-contributors.test.ts` | Fetch/cache/timeout tests |
| `tests/routes/api.community.contributors.test.ts` | Route handler test |
| `tests/lib/landing-cache.test.ts` | Header logic matrix |

**Modified files:**
| File | Why |
|---|---|
| `src/lib/auth.ts` | Memoize `getAuthState()` per request via `__authStore` |
| `src/server.ts` | Initialize `__authStore` at boot |
| `src/start.ts` | Request scope over auth store; wire landing cache headers |
| `src/lib/auth.test.ts` | +2 memoization tests |
| `src/components/home/CommunitySection.tsx` | Remove server fetch; client query + skeleton |
| `src/routes/_main.index.tsx` | Drop contributors from `loadHome`; CSS hero words |
| `src/components/home/HeroContentMotion.tsx` | Plain divs (drop motion) |
| `src/components/home/ScrollReveal.tsx` | Plain div (drop motion) |
| `src/styles/globals.css` | `hero-word` / `hero-underline` keyframes + reduced-motion |
| `src/routes/_main.tsx` | Loader returns SSR session; nested `SessionProvider` |
| `src/routes/_main.admin.index.tsx` | Route def only; component moves to `.lazy.tsx` |

---

## Task 0: Measurement baseline script

**Files:**
- Create: `scripts/measure-dev-graph.ts`

**Interfaces:**
- Consumes: running dev server on `http://localhost:3000`
- Produces: console report — module count, total bytes, est. sequential load, top-10 modules by size. Used by Task 6 to prove the graph shrank.

- [ ] **Step 1: Write the script**

```ts
/**
 * Dev-only: crawl the Vite module graph reachable from the TanStack Start dev
 * client entry and print counts, total size, and top offenders by size.
 *
 * Requires the dev server (bun run dev) on port 3000.
 *
 * Run: bun scripts/measure-dev-graph.ts
 */
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

type ModuleStat = { url: string; ms: number; size: number };

const seen = new Set<string>();
const queue: string[] = [];
const stats: ModuleStat[] = [];
let errors = 0;

function resolvePath(from: string, spec: string): string | null {
  if (
    spec.startsWith("/@id/") ||
    spec.startsWith("/@fs/") ||
    spec.startsWith("/src/") ||
    spec.startsWith("/@vite/") ||
    spec.startsWith("/node_modules/")
  ) {
    return spec;
  }
  if (spec.startsWith("/")) return spec;
  if (spec.startsWith("virtual:")) return "/@id/" + spec;
  if (!spec.startsWith(".")) return null;
  const url = new URL(spec, `${BASE_URL}/${from.replace(/^\/+/, "")}`);
  return `${url.pathname}${url.search}`;
}

async function visit(url: string): Promise<void> {
  if (seen.has(url)) return;
  seen.add(url);
  const startedAt = Date.now();
  const response = await fetch(`${BASE_URL}${url}`).catch(() => null);
  const elapsedMs = Date.now() - startedAt;
  if (!response || !response.ok) {
    errors += 1;
    return;
  }
  const text = await response.text();
  stats.push({ url, ms: elapsedMs, size: text.length });
  const importPattern = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = importPattern.exec(text))) {
    const resolved = resolvePath(url, match[1]);
    if (resolved && !seen.has(resolved)) {
      queue.push(resolved);
    }
  }
}

async function main() {
  queue.push("/@id/virtual:tanstack-start-dev-client-entry");
  while (queue.length > 0 && seen.size < 2000) {
    const batch = queue.splice(0, 30);
    await Promise.all(batch.map(visit));
  }

  const totalBytes = stats.reduce((sum, item) => sum + item.size, 0);
  const totalMs = stats.reduce((sum, item) => sum + item.ms, 0);
  const sortedBySize = [...stats].sort((a, b) => b.size - a.size);

  console.log(`modules: ${seen.size} (errors: ${errors})`);
  console.log(`total JS/CSS bytes: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(
    `sequential fetch sum: ${(totalMs / 1000).toFixed(1)} s (browser ~6-parallel: ${(totalMs / 6 / 1000).toFixed(1)} s)`,
  );
  console.log("top 10 by size:");
  for (const item of sortedBySize.slice(0, 10)) {
    console.log(`  ${String(Math.round(item.size / 1024)).padStart(5)} KB  ${item.url}`);
  }
}

main().catch((error) => {
  console.error("measure-dev-graph failed:", error);
  process.exit(1);
});
```

- [ ] **Step 2: Record the baseline**

Dev server must be running (`bun run dev`). Run: `bun scripts/measure-dev-graph.ts`
Expected: `modules: 256`, `total JS/CSS bytes: ~23.8 MB`, top offenders include `recharts` (~4938 KB) and `lucide-react` (~3575 KB). Record the exact numbers in Task 6's verification.

- [ ] **Step 3: Commit**

```bash
git add scripts/measure-dev-graph.ts
git commit -m "chore: add dev module-graph measurement script"
```

---

## Task 1: Per-request auth memoization

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/server.ts`
- Modify: `src/start.ts`
- Test: `src/lib/auth.test.ts`

**Interfaces:**
- Consumes: existing `getRequest()` / `Auth` / `prisma` as today.
- Produces: `getAuthStore(): AsyncLocalStorage<Map<string, unknown>>` exported from `src/lib/auth.ts`; `getAuthState()` returns the same value for every caller within one request scope. Task 4 depends on this to make the extra `auth()` call free.

- [ ] **Step 1: Add the store to `src/lib/auth.ts`**

At the top, after the existing imports:

```ts
import { AsyncLocalStorage } from "node:async_hooks";

declare global {
  var __authStore: any;
}
```

After the imports (next to `handleAuthRequest`):

```ts
export function getAuthStore(): AsyncLocalStorage<Map<string, unknown>> {
  if (typeof window !== "undefined") {
    throw new Error("Auth store is only available on the server side");
  }
  return (globalThis.__authStore ??= new AsyncLocalStorage<Map<string, unknown>>());
}
```

- [ ] **Step 2: Memoize `getAuthState()`**

Rename the current `getAuthState` body into a private `resolveAuthState()` and make `getAuthState` the memoizing wrapper:

```ts
export async function getAuthState(): Promise<AuthState> {
  const store = getAuthStore().getStore();
  if (store) {
    const cached = store.get("authState") as AuthState | undefined;
    if (cached !== undefined) {
      return cached;
    }
    const state = await resolveAuthState();
    store.set("authState", state);
    return state;
  }
  return resolveAuthState();
}

async function resolveAuthState(): Promise<AuthState> {
  // ... existing getAuthState body unchanged, starting with
  // const request = getRequest();
}
```

- [ ] **Step 3: Initialize the store at server boot in `src/server.ts`**

```ts
globalThis.__nonceStore = new AsyncLocalStorage<string>();
globalThis.__authStore = new AsyncLocalStorage<Map<string, unknown>>();
```

(The `__authStore` global is declared in `src/lib/auth.ts`'s `declare global`, so the assignment type-checks — mirroring how `__nonceStore` is declared in `src/lib/csp-nonce.ts`.)

- [ ] **Step 4: Scope each request in `src/start.ts`**

Import the store:

```ts
import { getAuthStore } from "@/lib/auth";
```

Replace the `getNonceStore().run(...)` block with:

```ts
  const result = await getAuthStore().run(new Map(), async () => {
    return await getNonceStore().run(nonce, async () => {
      return await next();
    });
  });
```

- [ ] **Step 5: Add memoization tests to `src/lib/auth.test.ts`**

At the top of the file add `import { AsyncLocalStorage } from "node:async_hooks";` and add `getAuthStore` to the existing `@/lib/auth` import. In `beforeEach`, after `vi.clearAllMocks()`, add:

```ts
globalThis.__authStore = new AsyncLocalStorage<Map<string, unknown>>();
```

Then append two tests (match the mock response shape the existing tests use; the banned-check hits `prismaUserFindUniqueMock`, which returns `undefined` by default → `banned: false`):

```ts
it("resolves the session only once within a request scope", async () => {
  const mockRequest = new Request("http://localhost:3000/", {
    headers: { cookie: "session-token=123" },
  });
  vi.mocked(getRequest).mockReturnValue(mockRequest);
  const mockSessionResponse = new Response(
    JSON.stringify({ user: { id: "user-1", name: "Jane" } }),
    { status: 200 },
  );
  vi.mocked(Auth).mockResolvedValue(mockSessionResponse as never);

  await getAuthStore().run(new Map(), async () => {
    const first = await getAuthState();
    const second = await getAuthState();

    expect(first).toEqual(second);
    expect(first.session?.user?.id).toBe("user-1");
    expect(vi.mocked(Auth)).toHaveBeenCalledTimes(1);
  });
});

it("does not leak the memo across request scopes", async () => {
  const mockRequest = new Request("http://localhost:3000/", {
    headers: { cookie: "session-token=123" },
  });
  vi.mocked(getRequest).mockReturnValue(mockRequest);
  const mockSessionResponse = new Response(
    JSON.stringify({ user: { id: "user-1", name: "Jane" } }),
    { status: 200 },
  );
  vi.mocked(Auth).mockResolvedValue(mockSessionResponse as never);

  await getAuthStore().run(new Map(), () => getAuthState());
  await getAuthStore().run(new Map(), () => getAuthState());

  expect(vi.mocked(Auth)).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 6: Run the tests**

Run: `bunx vitest run --project unit src/lib/auth.test.ts`
Expected: all tests pass, including the two new ones.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth.ts src/server.ts src/start.ts src/lib/auth.test.ts
git commit -m "perf: memoize auth session resolution per request"
```

---

## Task 2: Move GitHub contributors off the SSR path

**Files:**
- Create: `src/lib/community-contributors.ts`
- Create: `src/routes/api.community.contributors.ts`
- Modify: `src/components/home/CommunitySection.tsx`
- Modify: `src/routes/_main.index.tsx`
- Test: `tests/lib/community-contributors.test.ts`
- Test: `tests/routes/api.community.contributors.test.ts`

**Interfaces:**
- Consumes: nothing new; mirrors the `primeSettingCache` single-flight pattern from `src/lib/app-settings.ts`.
- Produces: `getCommunityContributors()` (uncached) and `getCommunityContributorsCached()` from `src/lib/community-contributors.ts`; `GET /api/community/contributors`; `CommunitySection` with no props that fetches client-side.

- [ ] **Step 1: Move the fetch logic into `src/lib/community-contributors.ts`**

Copy from `src/components/home/CommunitySection.tsx` (delete after the move): the `GithubStatsContributor`, `GithubContributor`, `ContributionWeek`, `ContributorCard` types; `STATS_URL`, `CONTRIBUTORS_URL`, `RECENT_WEEK_COUNT` constants; `getGithubHeaders`, `formatWeek`, `formatMonth`, `formatCompact`, `getTopContributors`, `getContributorsFallback`, `getCommunityContributors`. Add the timeout, TTL cache, and single-flight:

```ts
const FETCH_TIMEOUT_MS = 2_000;
export const CONTRIBUTORS_CACHE_TTL_MS = 15 * 60_000;

let contributorsCache: { at: number; value: ContributorCard[] } | null = null;
let contributorsInFlight: Promise<ContributorCard[]> | null = null;
```

Add `signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)` to the `fetch` calls in `getTopContributors` and `getContributorsFallback`:

```ts
    const response = await fetch(STATS_URL, {
      headers: getGithubHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
```

Keep the 202/!ok early returns and the try/catch → `[]` behavior exactly as they are today. At the end add:

```ts
export function getCommunityContributorsCached(): Promise<ContributorCard[]> {
  const now = Date.now();
  if (
    contributorsCache &&
    now - contributorsCache.at < CONTRIBUTORS_CACHE_TTL_MS
  ) {
    return Promise.resolve(contributorsCache.value);
  }
  if (!contributorsInFlight) {
    contributorsInFlight = getCommunityContributors()
      .then((value) => {
        contributorsCache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        contributorsInFlight = null;
      });
  }
  return contributorsInFlight;
}
```

- [ ] **Step 2: Create the API route `src/routes/api.community.contributors.ts`**

```ts
import { createFileRoute } from "@tanstack/react-router";

import { getCommunityContributorsCached } from "@/lib/community-contributors";

export const Route = createFileRoute("/api/community/contributors")({
  server: {
    handlers: {
      GET: async () => {
        const contributors = await getCommunityContributorsCached();
        return Response.json(contributors, {
          headers: { "Cache-Control": "public, max-age=900, s-maxage=900" },
        });
      },
    },
  },
});
```

- [ ] **Step 3: Rewrite `CommunitySection` to fetch client-side**

In `src/components/home/CommunitySection.tsx`:
- Delete everything moved in Step 1.
- Add imports:

```ts
import { useQuery } from "@tanstack/react-query";

import { type ContributorCard } from "@/lib/community-contributors";
import { fetchJson } from "@/lib/query-client";
```

- Add the hook and change the component signature (no props):

```ts
const CONTRIBUTOR_QUERY_OPTIONS = {
  staleTime: 15 * 60_000,
  gcTime: 15 * 60_000,
  refetchOnWindowFocus: false,
} as const;

function useCommunityContributors() {
  return useQuery({
    queryKey: ["community", "contributors"],
    queryFn: () => fetchJson<ContributorCard[]>("/api/community/contributors"),
    enabled: typeof window !== "undefined",
    ...CONTRIBUTOR_QUERY_OPTIONS,
  });
}

export function CommunitySection() {
  const contributorsQuery = useCommunityContributors();
  const contributors = contributorsQuery.data ?? [];
```

- Replace the `{contributors.length ? (... rows ...) : null}` block with:

```tsx
            {contributorsQuery.isPending ? (
              <ContributorSkeleton />
            ) : contributors.length ? (
              <div className="mt-spacing-8 divide-y divide-white/[0.07] border-t border-white/[0.07]">
                {/* existing row markup unchanged */}
              </div>
            ) : null}
```

- Add the skeleton component at the bottom of the file:

```tsx
function ContributorSkeleton() {
  return (
    <div className="mt-spacing-8 divide-y divide-white/[0.07] border-t border-white/[0.07]">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="flex flex-col gap-spacing-5 py-spacing-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-center gap-spacing-4">
            <span className="w-5 shrink-0" />
            <div className="size-10 shrink-0 animate-pulse rounded-full bg-white/10" />
            <div className="min-w-0 space-y-spacing-2">
              <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-40 animate-pulse rounded bg-white/10" />
            </div>
          </div>
          <div className="h-16 w-full animate-pulse rounded bg-white/10 sm:w-48" />
        </div>
      ))}
    </div>
  );
}
```

(Keep `sponsors`, `faqs`, `MiniChart`, `SponsorTable`, `ScrollReveal` usage as-is.)

- [ ] **Step 4: Update the homepage route `src/routes/_main.index.tsx`**

- Change the import to drop `getCommunityContributors`:
  `import { CommunitySection } from "@/components/home/CommunitySection";`
- In `loadHome`, delete the `contributors` lines (the comment block, the fetch, and the `contributors,` entry in the return object).
- In `HomePage`, remove `contributors` from the `Route.useLoaderData()` destructure and render `<CommunitySection />` without the prop.

- [ ] **Step 5: Write `tests/lib/community-contributors.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONTRIBUTORS_CACHE_TTL_MS,
  getCommunityContributors,
  getCommunityContributorsCached,
} from "@/lib/community-contributors";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const statsContributors = [
  {
    total: 10,
    author: {
      login: "suryaelidanto",
      avatar_url: "https://avatars.example/u/1?v=4",
      html_url: "https://github.com/suryaelidanto",
    },
    weeks: [{ w: 1_750_000_000, a: 3, d: 1, c: 2 }],
  },
];

const fallbackContributors = [
  {
    login: "suryaelidanto",
    contributions: 5,
    avatar_url: "https://avatars.example/u/1?v=4",
    html_url: "https://github.com/suryaelidanto",
  },
];

describe("getCommunityContributors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns cards from /stats/contributors with a timeout signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(statsContributors));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCommunityContributors();

    expect(result).toHaveLength(1);
    expect(result[0].login).toBe("suryaelidanto");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("falls back to /contributors when stats returns 202", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(null, 202))
      .mockResolvedValueOnce(jsonResponse(fallbackContributors));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCommunityContributors();

    expect(result).toHaveLength(1);
    expect(result[0].totalCommits).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns [] when GitHub fails or times out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")),
    );

    const result = await getCommunityContributors();

    expect(result).toEqual([]);
  });
});

describe("getCommunityContributorsCached", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("serves the second call from cache without refetching", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(statsContributors));
    vi.stubGlobal("fetch", fetchMock);

    const first = await getCommunityContributorsCached();
    const second = await getCommunityContributorsCached();

    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches after the TTL elapses", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(statsContributors));
    vi.stubGlobal("fetch", fetchMock);

    await getCommunityContributorsCached();
    vi.advanceTimersByTime(CONTRIBUTORS_CACHE_TTL_MS + 1_000);
    await getCommunityContributorsCached();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 6: Write `tests/routes/api.community.contributors.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const { getCommunityContributorsCachedMock } = vi.hoisted(() => ({
  getCommunityContributorsCachedMock: vi.fn(),
}));

vi.mock("@/lib/community-contributors", () => ({
  getCommunityContributorsCached: getCommunityContributorsCachedMock,
}));

import { getHandler } from "./_handler";

import { Route } from "@/routes/api.community.contributors";

const GET = getHandler(Route, "GET");

describe("GET /api/community/contributors", () => {
  afterEach(() => {
    getCommunityContributorsCachedMock.mockReset();
  });

  it("returns the cached contributors with a public cache header", async () => {
    getCommunityContributorsCachedMock.mockResolvedValue([
      { login: "suryaelidanto" },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=900, s-maxage=900",
    );
    expect(await response.json()).toEqual([{ login: "suryaelidanto" }]);
  });
});
```

- [ ] **Step 7: Run the new tests**

Run:
`bunx vitest run --project unit tests/lib/community-contributors.test.ts tests/routes/api.community.contributors.test.ts`
Expected: all pass.

- [ ] **Step 8: Verify TTFB improvement**

With the dev server running: `curl -s -o /dev/null -w "ttfb=%{time_starttransfer}s\n" http://localhost:3000/`
Expected: guest TTFB drops from ~1.2 s toward ~0.6 s. (First call still warms Vite; run twice.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/community-contributors.ts src/routes/api.community.contributors.ts src/components/home/CommunitySection.tsx src/routes/_main.index.tsx tests/lib/community-contributors.test.ts tests/routes/api.community.contributors.test.ts
git commit -m "perf: load GitHub contributors client-side instead of blocking SSR"
```

---

## Task 3: Hero and sections visible at paint

**Files:**
- Modify: `src/styles/globals.css`
- Modify: `src/components/home/HeroContentMotion.tsx`
- Modify: `src/components/home/ScrollReveal.tsx`
- Modify: `src/routes/_main.index.tsx`

**Interfaces:**
- Consumes: `HERO_LEAD_WORDS`, `HERO_ACCENT`, `HERO_SUBLINE_WORDS`, `SUBLINE_DELAY` constants in `_main.index.tsx` stay unchanged; the existing `@keyframes draw` in `globals.css` (~line 300) is reused.
- Produces: no inline `opacity:0` in SSR HTML for the hero or reveal-wrapped sections; `--word-delay` / `--underline-delay` CSS custom properties consumed by the new `hero-word` / `hero-underline` classes.

- [ ] **Step 1: Add hero CSS to `src/styles/globals.css`**

Inside `@layer utilities {`, immediately after the existing `@keyframes draw { ... }` block (~line 300), insert:

```css
  @keyframes hero-word-in {
    from {
      filter: blur(6px);
      transform: translateY(14px);
    }
    to {
      filter: blur(0);
      transform: translateY(0);
    }
  }

  .hero-word {
    display: inline-block;
    will-change: transform, filter;
    animation: hero-word-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: var(--word-delay, 0s);
  }

  .hero-underline {
    transform-origin: left;
    animation: draw 0.55s ease-out both;
    animation-delay: var(--underline-delay, 0s);
  }

  @media (prefers-reduced-motion: reduce) {
    .hero-word,
    .hero-underline {
      animation: none;
    }
  }
```

Note: opacity is intentionally never animated (stays 1) so every word is readable during its stagger delay.

- [ ] **Step 2: Strip motion from `HeroContentMotion.tsx`**

Replace the whole file:

```tsx
import type React from "react";

export function HeroContentMotion({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-12rem)] w-full max-w-5xl flex-col items-center justify-center text-center">
      {children}
    </div>
  );
}

export function HeroMotionItem({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}
```

- [ ] **Step 3: Strip motion from `ScrollReveal.tsx`**

Replace the whole file:

```tsx
import type React from "react";

export function ScrollReveal({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
```

(Spec D2 documents why: `whileInView` forces `opacity:0` in SSR HTML for every wrapped section, so content below the hero is blank until JS hydrates.)

- [ ] **Step 4: Convert the hero words in `src/routes/_main.index.tsx`**

- Remove `import { motion } from "motion/react";`.
- Extend the react import: `import { useState, type CSSProperties } from "react";`.
- Delete the `wordMotion` constant and `heroWordTransition` function (lines ~166-178). Keep `SUBLINE_DELAY`.
- Replace `HeroSubline` and `HeroHeadline` with:

```tsx
function HeroSubline() {
  return (
    <span className="flex flex-wrap justify-center gap-x-[0.28em]">
      {HERO_SUBLINE_WORDS.map((word, i) => (
        <span
          key={word}
          className="hero-word"
          style={{ "--word-delay": `${SUBLINE_DELAY + 0.09 * i}s` } as CSSProperties}
        >
          {word}
        </span>
      ))}
    </span>
  );
}

function HeroHeadline() {
  return (
    <span className="flex flex-wrap justify-center gap-x-[0.13em] gap-y-1">
      {HERO_LEAD_WORDS.map((word, i) => (
        <span
          key={word}
          className="hero-word"
          style={{ "--word-delay": `${0.09 * i}s` } as CSSProperties}
        >
          {word}
        </span>
      ))}
      <span
        className="hero-word relative"
        style={
          { "--word-delay": `${0.09 * HERO_LEAD_WORDS.length}s` } as CSSProperties
        }
      >
        {HERO_ACCENT}
        <span
          aria-hidden
          className="hero-underline absolute inset-x-0 -bottom-1 h-[5px] origin-left rounded-full bg-emerald-400"
          style={
            {
              "--underline-delay": `${0.09 * HERO_LEAD_WORDS.length + 0.55}s`,
            } as CSSProperties
          }
        />
      </span>
    </span>
  );
}
```

Delays are identical to the old `heroWordTransition(i, 0)` / `heroWordTransition(i, SUBLINE_DELAY)` values, so the stagger look is preserved.

- [ ] **Step 5: Verify no SSR opacity:0 on the homepage**

With the dev server running:

```bash
curl -s http://localhost:3000/ -o /tmp/opencode/home-after.html
grep -c "opacity:0" /tmp/opencode/home-after.html
grep -c "hero-word" /tmp/opencode/home-after.html
```

Expected: first grep prints `0`, second prints > 0. Manual check: open `http://localhost:3000/` — hero words are visible immediately and settle into place; scroll sections are visible without scrolling-triggered entrances.

- [ ] **Step 6: Commit**

```bash
git add src/styles/globals.css src/components/home/HeroContentMotion.tsx src/components/home/ScrollReveal.tsx src/routes/_main.index.tsx
git commit -m "perf: render hero and sections visible at first paint (CSS entrance)"
```

---

## Task 4: Inject the SSR session into a nested SessionProvider

**Files:**
- Modify: `src/routes/_main.tsx`

**Interfaces:**
- Consumes: `auth()` from `@/lib/auth` (now memoized per request by Task 1); `SessionProvider` from `@/lib/auth-client` (already supports a `session` prop and skips the client refresh when it is defined).
- Produces: `_main` layout loader data `{ session: Session | null | undefined }`; `MainLayout` wraps children in `<SessionProvider session={session}>`.

- [ ] **Step 1: Update `src/routes/_main.tsx`**

Replace the file body with:

```tsx
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { MainChrome } from "@/components/common/MainChrome";
import { auth } from "@/lib/auth";
import { SessionProvider } from "@/lib/auth-client";
import { checkRouteGates } from "@/server/loaders/check-route-gates";

const runRouteGates = createServerFn({ method: "GET" })
  .validator((d: { pathname: string }) => d)
  .handler(({ data: { pathname } }) => checkRouteGates(pathname));

const loadSession = createServerFn({ method: "GET" }).handler(async () => {
  return auth();
});

export const Route = createFileRoute("/_main")({
  beforeLoad: async ({ location }) => {
    await runRouteGates({ data: { pathname: location.pathname } });
  },
  loader: async () => {
    const session =
      typeof window === "undefined" ? await loadSession() : undefined;
    return { session };
  },
  component: MainLayout,
});

function MainLayout() {
  const { session } = Route.useLoaderData();
  return (
    <SessionProvider session={session}>
      <MainChrome>
        <Outlet />
      </MainChrome>
    </SessionProvider>
  );
}
```

How it behaves:
- **SSR / first boot:** the layout loader resolves the session server-side; TanStack Start dehydrates it into the client payload, so at hydration `useSession().status` is already `authenticated` (or `unauthenticated`) — no `/api/auth/session` round trip, no loading flip, correct waitlist/hero state on first render.
- **Client-side navigation:** the loader re-runs on the client, `typeof window !== "undefined"` makes it return `undefined`, and the nested provider falls back to the existing refresh-on-mount behavior (same as today).
- The `AppProviders` provider in `__root.tsx` stays as the outer fallback; the nested provider overrides it for everything under `_main`.

- [ ] **Step 2: Verify**

With the dev server running and a signed-in session cookie (`curl -b cookie.txt`): load `/` in a browser, open DevTools → Network, and confirm no `/api/auth/session` request fires on boot and the hero shows the signed-in greeting without a swap. For guests, confirm the waitlist UI is stable (no loading flash).

- [ ] **Step 3: Commit**

```bash
git add src/routes/_main.tsx
git commit -m "feat: hydrate _main pages with the SSR session to skip the client session fetch"
```

---

## Task 5: Cache anonymous landing HTML

**Files:**
- Create: `src/lib/landing-cache.ts`
- Modify: `src/start.ts`
- Test: `tests/lib/landing-cache.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `shouldCacheLandingResponse(request, response): boolean` and `applyLandingCacheHeaders(request, response): void`; wired at the end of `securityMiddleware`.

- [ ] **Step 1: Write `src/lib/landing-cache.ts`**

```ts
const AUTH_COOKIE_PATTERN = /(?:^|;\s*)session-token=/i;
const LANDING_PATHS = new Set(["/", "/privacy", "/terms", "/support"]);
const LANDING_CACHE_CONTROL =
  "public, s-maxage=60, stale-while-revalidate=300";

export function shouldCacheLandingResponse(
  request: Request,
  response: Response,
): boolean {
  if (request.method !== "GET") {
    return false;
  }
  const url = new URL(request.url);
  if (!LANDING_PATHS.has(url.pathname)) {
    return false;
  }
  if (response.status !== 200) {
    return false;
  }
  if (AUTH_COOKIE_PATTERN.test(request.headers.get("cookie") ?? "")) {
    return false;
  }
  return true;
}

export function applyLandingCacheHeaders(
  request: Request,
  response: Response,
): void {
  if (!shouldCacheLandingResponse(request, response)) {
    return;
  }
  const vary = response.headers.get("Vary");
  response.headers.set("Vary", vary ? `${vary}, cookie` : "cookie");
  response.headers.set("Cache-Control", LANDING_CACHE_CONTROL);
}
```

- [ ] **Step 2: Wire it into `src/start.ts`**

Import:

```ts
import { applyLandingCacheHeaders } from "@/lib/landing-cache";
```

In `securityMiddleware`, after the existing `applySecurityHeaders(result.response.headers, { generatedOrigin, pathname, nonce });` call, add:

```ts
  applyLandingCacheHeaders(request, result.response);
```

- [ ] **Step 3: Write `tests/lib/landing-cache.test.ts`**

```ts
import { describe, expect, it } from "vitest";

import { applyLandingCacheHeaders } from "@/lib/landing-cache";

function request(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("applyLandingCacheHeaders", () => {
  it("caches a GET / without cookies", () => {
    const response = new Response("<html>", { status: 200 });
    applyLandingCacheHeaders(request("http://localhost:3000/"), response);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=300",
    );
    expect(response.headers.get("Vary")).toBe("cookie");
  });

  it("skips requests with a session-token cookie", () => {
    const response = new Response("<html>", { status: 200 });
    applyLandingCacheHeaders(
      request("http://localhost:3000/", {
        headers: { cookie: "session-token=abc; foo=1" },
      }),
      response,
    );
    expect(response.headers.get("Cache-Control")).toBeNull();
  });

  it("skips non-landing paths and non-GET methods", () => {
    const response = new Response("<html>", { status: 200 });
    applyLandingCacheHeaders(
      request("http://localhost:3000/projects/abc"),
      response,
    );
    expect(response.headers.get("Cache-Control")).toBeNull();

    applyLandingCacheHeaders(
      request("http://localhost:3000/", { method: "POST" }),
      response,
    );
    expect(response.headers.get("Cache-Control")).toBeNull();
  });

  it("appends to an existing Vary header", () => {
    const response = new Response("<html>", {
      status: 200,
      headers: { Vary: "accept" },
    });
    applyLandingCacheHeaders(request("http://localhost:3000/"), response);
    expect(response.headers.get("Vary")).toBe("accept, cookie");
  });
});
```

- [ ] **Step 4: Run the test**

Run: `bunx vitest run --project unit tests/lib/landing-cache.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/landing-cache.ts src/start.ts tests/lib/landing-cache.test.ts
git commit -m "perf: cache anonymous landing HTML at the shared cache"
```

---

## Task 6: Split the admin overview route (drop recharts from the home graph)

**Files:**
- Modify: `src/routes/_main.admin.index.tsx` (route def only)
- Create: `src/routes/_main.admin.index.lazy.tsx` (component half)
- Regenerated: `src/routeTree.gen.ts`

**Interfaces:**
- Consumes: TanStack Router generator 1.167 file-based route splitting (`.lazy.tsx` piece; confirmed in `router-generator/dist/esm/generator.js`); `bun run routes:generate`.
- Produces: `_main.admin.index.tsx` exports only `Route`; `_main.admin.index.lazy.tsx` exports `Route` from `createLazyFileRoute("/_main/admin/")` with `component: OverviewPage`. `GET /api/admin/overview` behavior is unchanged.
- Fallback if the generator output is wrong: instead of file splitting, keep `_main.admin.index.tsx` and use `lazyRouteComponent(() => import("@/components/admin/overview/AdminOverviewDashboard"), "AdminOverviewDashboard")` as the component — same goal, no generator involvement.

- [ ] **Step 1: Spike — split the route and inspect generator output**

`src/routes/_main.admin.index.tsx` becomes:

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/admin/")({});
```

Create `src/routes/_main.admin.index.lazy.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";

import {
  AdminOverviewDashboard,
  type OverviewData,
} from "@/components/admin/overview/AdminOverviewDashboard";
import { fetchJson } from "@/lib/query-client";

export const Route = createLazyFileRoute("/_main/admin/")({
  component: OverviewPage,
});

function OverviewPage() {
  const { data } = useQuery({
    queryFn: () => fetchJson<OverviewData>("/api/admin/overview"),
    queryKey: ["admin", "overview"],
  });

  return <AdminOverviewDashboard data={data} />;
}
```

Run: `bun run routes:generate`
Inspect `src/routeTree.gen.ts`: `grep -n "admin.index" src/routeTree.gen.ts`
Expected: the admin index route entry now references a lazy import (e.g. `.lazy(() => import('./routes/_main.admin.index.lazy')...`) or `lazyRouteComponent`; no static `import { Route as MainAdminIndexRouteImport } from './routes/_main.admin.index'` should be emitted for it.
If the generator errors or emits a duplicate static import, delete `_main.admin.index.lazy.tsx`, restore the original file, and use the `lazyRouteComponent` fallback described in Interfaces instead — then re-run `bun run routes:generate`.

- [ ] **Step 2: Verify the home graph shrank**

With the dev server running: `bun scripts/measure-dev-graph.ts`
Expected vs baseline (Task 0): total bytes down by ≥ 4 MB (recharts ~4.9 MB and its chunked dependencies gone from the top-10), module count down by roughly the number of admin-overview-only modules. Recharts must no longer appear in the top 10.

- [ ] **Step 3: Verify /admin still renders**

Open `http://localhost:3000/admin` (or run the existing admin tests: `bunx vitest run --project unit tests/routes/api.admin.overview.test.ts` if present). Expected: the overview dashboard loads with its chart after the lazy chunk resolves.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_main.admin.index.tsx src/routes/_main.admin.index.lazy.tsx src/routeTree.gen.ts
git commit -m "perf: code-split admin overview route so recharts stays out of the home graph"
```

---

## Final verification before handoff

- [ ] Run `bun run check` (locks + parallel format/lint/typecheck/affected tests/Knip) — must pass.
- [ ] Re-run `bun scripts/measure-dev-graph.ts` and record final numbers next to the Task 0 baseline in the PR description.
- [ ] Guest TTFB: `curl -s -o /dev/null -w "ttfb=%{time_starttransfer}s\n" http://localhost:3000/` twice — second run should be ~0.6 s or below.
- [ ] `curl -s http://localhost:3000/` contains no `opacity:0` and includes `hero-word` classes; `Cache-Control` header on anonymous `/` includes `s-maxage=60`.
- [ ] Storybook: `bun run storybook:build` passes (no broken stories from the `CommunitySection` / hero changes — add/update a story only if a story renders `CommunitySection` with props, since its signature dropped the prop).




