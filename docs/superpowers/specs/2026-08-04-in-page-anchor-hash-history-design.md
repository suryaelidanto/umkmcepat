# In-Page Anchor Navigation on Hash-History Sites — Design

**Status:** Approved for planning
**Date:** 2026-08-04
**Related:** `2026-07-22-locked-stack-shadcn.md`, `2026-08-04-broken-image-placeholder-design.md`

## Problem

Generated UMKM preview/published sites use TanStack Router with **hash history**
(`createHashHistory()` in `src/router.tsx`). With hash history, the **entire
route lives in the URL hash**: the site is served at `/#/` and the path is
`/#/katalog`, `/#/kontak`, etc. `parseLocation` in `@tanstack/history` splits the
URL hash on `#` and treats the **first segment as the router path**:

```ts
const hashSplit = win.location.hash.split('#').slice(1) // ["lokasi"] for "#lokasi"
const pathPart = hashSplit[0] ?? '/'                    // "lokasi" → a route path
```

The generation agent writes one-page section navigation as raw in-page anchors:

```tsx
<a href="#lokasi">Lokasi</a>
...
<section id="lokasi">…</section>
```

Clicking that anchor sets `location.hash = "#lokasi"`. The router reads the hash
as the path `"lokasi"`, finds **no such route**, and resolves to the
`path: "*"` 404 catch-all — the router re-renders and scrolls to top. That is the
**glitch**: the first click visibly jumps/re-renders instead of landing on the
section. On the second click the browser's native fragment-scroll behavior takes
over (history state differs), so the jump finally works. Result: every section
link needs two clicks and flickers on the first.

Verified in the live site bundle (`website-warung-surya-jamu`): nav emits
`<a href={"#lokasi"}>` / `<a href={"#menu"}>` with `<section id>` targets, and
the router is wired with `createHashHistory()`.

## Goals

- **G1:** In-page section links on generated sites scroll to the target section
  on the **first** click, with no router 404, no re-render, no top-scroll flicker.
- **G2:** Section jumps are **smooth** (optional but expected) with correct offset
  for a fixed/sticky header if one exists.
- **G3:** The guidance is enforced at the **source of truth** (generator prompt +
  scaffold seed) so new generated sites are correct by construction.

## Non-goals

- Not fixing already-deployed/built sites (warung preview/published). They were
  generated with the old prompt; fixing them means regenerating, which is out of
  scope for this change (see open question).
- Not adding **Lenis** or any new dependency. Native CSS `scroll-behavior` +
  `scroll-margin` covers the smooth-scroll requirement; a library is unnecessary
  for this bug.
- Not converting existing multi-page `<Link>` usage — that already works.
- Not changing TanStack Router, the hash-history choice, or the 404 catch-all.
- Not adding a post-generation lint/guard that rewrites built routes.

## Design

### Anchor pattern for hash history

In-page section links must go through TanStack Router's `<Link>` with a `hash`
prop, which targets the `"/"` route with a fragment — producing `/#/lokasi`
instead of `/#lokasi`:

```tsx
import { Link } from "@tanstack/react-router";

<Link to="/" hash="lokasi">Lokasi</Link>
...
<section id="lokasi">…</section>
```

TanStack Router's built-in scroll handler then runs
`document.getElementById("lokasi").scrollIntoView(...)` when the hash is set on a
matched route. No 404, no re-render, first-click jump works.

### Smooth scroll (native, no dependency)

Two CSS additions make the jump smooth and header-safe:

- `scroll-behavior: smooth` on the root so native fragment scrolls are smooth.
- `scroll-mt-<n>` (Tailwind, e.g. `scroll-mt-24`) on every `id` target section to
  offset for a sticky header. Without it, a fixed nav would cover the target.

Because these are the platform-owned `src/index.css` / section styling the agent
already owns, the fix lives in the prompt guidance and the seed example — no new
file, no dependency.

### Enforcement points (source of truth)

1. **`buildGeneratedAppAgentInstructions`** and **`buildAgentPrompt`** in
   `custom-source-generator.ts` — add a routing/anchor rule: in-page section
   navigation MUST use `<Link to="/" hash="id">`; never raw `<a href="#id">`
   (hash history treats `#id` as a route → 404 catch-all → glitch). Optionally
   note smooth scroll + `scroll-mt` offset.
2. **`src/index.css`** guidance (via `DESIGN_DIRECTIVE`) — add a MOTION/NAV note:
   set `scroll-behavior: smooth` and `scroll-mt-*` on section `id` targets.
3. **`src/lib/projects/skills/tanstack-router-static.md`** — add the anchor rule
   so the routing skill carries it consistently.
4. **Scaffold seed** — `vite-tanstack-shadcn-starter.ts` home route and
   `seedBriefBasedHome` in `custom-source-generator.ts`: replace the raw
   `<a href="#kontak">` example with the `<Link to="/" hash="kontak">` pattern so
   new scaffolds model the correct usage.

## Security analysis

- No new code runs in the browser; the change is prompt copy and seed TSX.
- `<Link>` produces a same-document hash navigation — no new URL, no external
  fetch, no script execution, no user input.
- The section `id` values are agent-written static strings; `<Link hash>` renders
  as `href="#/lokasi"`, which is the router's own hash path, not an open redirect.
- No dependencies added; no CSP or header changes.

## Reliability

- New sites are correct by construction (G3), so the bug does not recur.
- TanStack Router's native hash-scroll handler is battle-tested and already used
  by every multi-page site; the fix just routes one-page anchors through the same
  mechanism.
- If an agent ignores the guidance and emits `href="#id"`, the symptom is the
  existing glitch — a graceful degradation, not a crash. The prompt rule raises
  the probability of compliance; a future post-gen guard (explicitly out of
  scope) would make it a hard gate.

## Open question

- **Existing sites:** the warung preview/published sites keep the glitch until
  regenerated. This change does not regenerate them. Confirm whether the plan
  should add a one-off regeneration step or leave that to the owner.

## Files

- Modify: `src/lib/projects/custom-source-generator.ts` — anchor rule in
  `buildGeneratedAppAgentInstructions`, `buildAgentPrompt`, `DESIGN_DIRECTIVE`;
  fix `<a href="#kontak">` in `seedBriefBasedHome`.
- Modify: `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts` — seed home
  route uses `<Link to="/" hash="kontak">` + `Link` import.
- Modify: `src/lib/projects/skills/tanstack-router-static.md` — anchor rule.
- Modify: `src/lib/projects/custom-source-generator.test.ts` — assert the prompt
  forbids `href="#` and recommends `<Link hash>`; assert seed emits `<Link>`.
- Modify: `src/lib/projects/scaffold/scaffold.test.ts` — assert seed index uses
  `<Link>`/`hash` and no raw `href="#`.
