# Lighthouse quality guardrail

Lighthouse is a local, on-demand audit for release confidence. It is intentionally not part of CI, CD, or pre-commit because it starts a production server, opens Chrome, and can be slow or noisy on shared machines.

## Operating mindset

Treat Lighthouse as a local release guardrail for future agents with zero chat context. The goal is not a vanity 100; the goal is to catch real user-impacting regressions before production while keeping the normal dev loop fast.

## When to run

Run Lighthouse when a page feels slow, after meaningful UI/SEO/accessibility changes, and before a production release candidate.

```bash
bun run lighthouse
```

Target one device while iterating:

```bash
bun run lighthouse:mobile
bun run lighthouse:desktop
```

Authenticated pages use an ignored local cookie file:

```bash
mkdir -p .lighthouse-auth
# Fill .lighthouse-auth/cookies.txt from DevTools Application > Cookies.
# One auth cookie per line: name=value
bun run lighthouse:auth
```

Reports are written to `.lighthouseci/` and ignored by Git. Auth cookies are read from `.lighthouse-auth/cookies.txt` and ignored by Git.

## Current scope

The local audit covers public pages:

- `/`
- `/terms`
- `/privacy`

Authenticated audit covers `/profile` when `.lighthouse-auth/cookies.txt` exists. To include one project workspace, set `LIGHTHOUSE_AUTH_PROJECT_URL` to a local project URL before running `bun run lighthouse:auth`. `/projects/new` currently redirects after auth and is not a meaningful Lighthouse target. Authenticated/private routes audit performance, accessibility, and best practices only; SEO is excluded because `robots.txt` intentionally blocks private `/projects/` pages from indexing.

## Thresholds

Mobile:

| Category       | Minimum |
| -------------- | ------: |
| Performance    |      65 |
| Accessibility  |     100 |
| Best practices |     100 |
| SEO            |      95 |

Desktop:

| Category       | Minimum |
| -------------- | ------: |
| Performance    |      95 |
| Accessibility  |     100 |
| Best practices |     100 |
| SEO            |      95 |

Authenticated private app routes (`/profile`, `/projects/[id]`):

| Category       | Minimum |
| -------------- | ------: |
| Performance    |      75 |
| Accessibility  |     100 |
| Best practices |     100 |

Private app routes intentionally exclude SEO because `robots.txt` blocks project workspaces from indexing. Performance thresholds are regression floors from repeated local Chromium runs on this Windows dev machine, not long-term ceilings. Keep accessibility, best-practices, and SEO strict; raise performance floors only after the score is stable across fresh builds.

## Why not 100 everywhere

Performance scores vary with CPU, Chrome version, fonts, network emulation, and machine load. A 100-only performance gate creates false failures and encourages benchmark theater. Accessibility and best-practice failures are more deterministic, so they stay strict at 100.

Raise mobile performance to 95 only after it is stable across repeated local runs.

## How it runs

`scripts/run-lighthouse.mjs` reuses an existing `.next` build when available, otherwise builds once, starts `next start` on port 3005, waits for a real HTTP 200, then runs `@lhci/cli` for mobile and/or desktop. LHCI runs three audits per URL, keeps the representative run, asserts category scores, and saves HTML/JSON reports locally. Port 3005 avoids clashing with `bun run dev` on port 3000. The runner sets local-only Auth.js host env (`AUTH_TRUST_HOST`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`) so public pages do not fail from host mismatch during the audit.

## Agent workflow

1. Ensure the working tree has no unrelated changes or explicitly stash them.
2. Run `bun run check` first so Lighthouse is not hiding basic code failures.
3. Run `bun run lighthouse` for the full public-page audit.
4. Read the generated HTML/JSON under `.lighthouseci/`.
5. Fix deterministic issues first: accessibility, best practices, SEO metadata, console errors.
6. Fix performance issues that improve real UX: LCP, TBT, CLS, images, fonts, bundle weight, cache hints.
7. Re-run the failing target (`bun run lighthouse:mobile` or `bun run lighthouse:desktop`) until thresholds pass.
8. For authenticated pages, create `.lighthouse-auth/cookies.txt` manually from DevTools cookies. Include only Auth.js/NextAuth session cookies, one `name=value` per line. Never commit `.lighthouse-auth/`.
9. Finish with `bun run check` and a clean `git status`.

Do not weaken thresholds to make a bad run pass. Only adjust thresholds after repeated evidence that Lighthouse variance, not product quality, is the blocker.

## Interpreting failures

- Performance below threshold: inspect LCP, TBT, CLS, script size, fonts, images.
- Accessibility below 100: fix the failed audit, do not lower the threshold.
- Best practices below 100: fix headers, browser console errors, or unsafe patterns.
- SEO below 95: fix title, meta description, crawlability, canonical/indexing basics.

Keep Lighthouse as a release guardrail, not a daily edit loop.
