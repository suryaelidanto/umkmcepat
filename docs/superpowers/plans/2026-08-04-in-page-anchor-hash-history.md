# In-Page Anchor Navigation on Hash-History Sites — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generated UMKM preview/published sites stop glitching on section navigation. In-page anchor links use TanStack Router's `<Link to="/" hash="id">` instead of raw `<a href="#id">`, because hash history treats `#id` as a route path and 404s to the catch-all (the first-click glitch). Smooth scroll and sticky-header offset come from native CSS (`scroll-behavior` + `scroll-mt`), not a library.

**Architecture:** Pure generator change — no runtime code, no dependency. The agent prompt (`buildGeneratedAppAgentInstructions`, `buildAgentPrompt`, `DESIGN_DIRECTIVE`), the routing skill doc (`tanstack-router-static.md`), and the scaffold seed home route (`vite-tanstack-shadcn-starter.ts`) + seed helper (`seedBriefBasedHome`) all model and require the `<Link hash>` pattern. Tests assert the guidance and seed shape.

**Tech Stack:** Bun, TypeScript, Vitest, string assertions on generated files and prompt text.

## Global Constraints

- Use Bun only; keep `bun.lock` as the canonical lockfile.
- Keep changes small, focused, and easy to review.
- User-facing product UI copy uses Indonesian; developer-facing docs/code/logs/errors use English.
- Do not add dependencies (explicitly no Lenis).
- Do not change TanStack Router wiring, the hash-history choice, or the 404 catch-all.
- Do not regenerate already-deployed sites as part of this change (see open question in spec).
- Before handoff, run `bun run check` explicitly.

---

## File Structure

- Modify: `src/lib/projects/custom-source-generator.ts`
  - `buildGeneratedAppAgentInstructions` and `buildAgentPrompt`: add an anchor rule — in-page section links MUST use `<Link to="/" hash="id">`; never raw `<a href="#id">` (hash history treats `#id` as a route and hits the 404 catch-all → first-click glitch).
  - `DESIGN_DIRECTIVE`: add a MOTION/NAV note — `scroll-behavior: smooth` on root, `scroll-mt-*` on section `id` targets for sticky-header offset.
  - `seedBriefBasedHome`: replace `<a href="#kontak">` with `<Link to="/" hash="kontak">` + `Link` import.
- Modify: `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts`
  - Seed home route: replace `<a href="#kontak">` with `<Link to="/" hash="kontak">`; add `import { Link } from "@tanstack/react-router"`.
- Modify: `src/lib/projects/skills/tanstack-router-static.md`
  - Add the anchor rule to the routing skill.
- Modify: `src/lib/projects/custom-source-generator.test.ts`
  - Assert the prompt forbids `href="#` and recommends `<Link ... hash=`.
  - Assert `seedBriefBasedHome` emits `<Link>` and no raw `href="#`.
- Modify: `src/lib/projects/scaffold/scaffold.test.ts`
  - Assert seed index uses `<Link>`/`hash` and contains no raw `href="#`.

---

### Task 1: Anchor rule in the agent prompts

**Files:**
- Modify: `src/lib/projects/custom-source-generator.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `buildGeneratedAppAgentInstructions`, `buildAgentPrompt`, `DESIGN_DIRECTIVE` each carry the `<Link hash>` requirement.

- [ ] **Step 1: Write the failing tests**

In `src/lib/projects/custom-source-generator.test.ts`, inside the existing `describe("buildGeneratedAppAgentInstructions (prompt coherence)", ...)` block (near line 950), add:

```ts
it("requires <Link to= hash= for in-page anchors, never raw href=#", () => {
  expect(instructions).toContain('<Link to="/" hash="');
  expect(instructions).toMatch(/in-page/i);
  expect(instructions).toMatch(/hash history/i);
  expect(instructions).toMatch(/404/i);
  expect(instructions).toMatch(/href="#/);
});
```

Also add (same file, the `seedBriefBasedHome` block around line 341):

```ts
it("seedBriefBasedHome uses <Link hash> not raw href=#", () => {
  const starter = createGeneratedViteTanStackStarterFiles("p_seed", schema());
  const seeded = seedBriefBasedHome(starter, schema());
  const home = seeded.files.find((f) => f.path === "src/routes/index.tsx");
  expect(home?.content).toContain('import { Link } from "@tanstack/react-router"');
  expect(home?.content).toContain('<Link to="/" hash="kontak"');
  expect(home?.content).not.toContain('href="#kontak"');
});
```

Note: the `not.toContain('href="#kontak"')` assertion may fail if other seed content uses `href="#` — confirm by reading `seedBriefBasedHome` (around line 1121) and adjust the assertion to target only the CTA link. The `expect(instructions).toMatch(/href="#/)` intentionally asserts the prompt *mentions* the forbidden pattern as a caution.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test src/lib/projects/custom-source-generator.test.ts`
Expected: FAIL — the new assertions are unmet (prompt lacks the anchor rule; seed still uses `href="#kontak"`).

- [ ] **Step 3: Add the anchor rule to `buildAgentPrompt` and `buildGeneratedAppAgentInstructions`**

In `src/lib/projects/custom-source-generator.ts`, in the `ROUTING & PAGE CONTRACT` block of `buildGeneratedAppAgentInstructions` (around line 2439), add a bullet after the `<Link to="/katalog">` line (line 2443):

```ts
- In-page section links (same-page anchor scroll) MUST use <Link to="/" hash="sectionId"> from "@tanstack/react-router", targeting a <section id="sectionId">. NEVER use raw <a href="#sectionId">: with hash history the URL #... is the route path, so "#sectionId" resolves to no route and triggers the 404 catch-all — the anchor glitches (first click re-renders + scrolls to top) and only works on a second click. <Link to="/" hash="..."> produces #/sectionId and uses TanStack's native hash-scroll.
- Add scroll-mt-<size> (e.g. scroll-mt-24) to each id-target section so a fixed/sticky header does not cover it.
```

Apply the same anchor rule to `buildAgentPrompt` (around line 2317), near its routing guidance.

- [ ] **Step 4: Add the smooth-scroll note to `DESIGN_DIRECTIVE`**

In the `MOTION:` block of `DESIGN_DIRECTIVE` (around line 2309), add a line:

```ts
- Section navigation: use <Link to="/" hash="id"> for in-page anchors (never raw href="#id" — hash history turns it into a route and 404s). For smooth in-page scroll set scroll-behavior:smooth on the root and add scroll-mt-* on each id-target section to clear any fixed header.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test src/lib/projects/custom-source-generator.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/custom-source-generator.ts src/lib/projects/custom-source-generator.test.ts
git commit -m "feat(projects): require <Link hash> for in-page anchors in generated sites"
```

---

### Task 2: Seed home route + seed helper use `<Link hash>`

**Files:**
- Modify: `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts`
- Modify: `src/lib/projects/custom-source-generator.ts` (`seedBriefBasedHome`)
- Modify: `src/lib/projects/scaffold/scaffold.test.ts`

**Interfaces:**
- Consumes: `Link` from `@tanstack/react-router`.
- Produces: both seed home routes emit `<Link to="/" hash="kontak">` with the `Link` import and no raw `href="#kontak"`.

- [ ] **Step 1: Write the failing test**

In `src/lib/projects/scaffold/scaffold.test.ts`, inside the `index route has the Task-5 stale-starter marker comment and shadcn UI` block (near line 113), add:

```ts
    expect(index).toContain('import { Link } from "@tanstack/react-router"');
    expect(index).toContain('<Link to="/" hash="kontak"');
    expect(index).not.toContain('href="#kontak"');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test src/lib/projects/scaffold/scaffold.test.ts`
Expected: FAIL — seed index still uses `<a href="#kontak">`.

- [ ] **Step 3: Update the scaffold starter seed**

In `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts`, in the home route content (line 225):
- Add `import { Link } from "@tanstack/react-router";` after the `usePreviewReady` import.
- Replace the CTA:

```ts
<Button size="lg" asChild>
  <a href="#kontak">
    {site.primaryCta}
    <ArrowRight className="size-4" />
  </a>
</Button>
```

with:

```ts
<Button size="lg" asChild>
  <Link to="/" hash="kontak">
    {site.primaryCta}
    <ArrowRight className="size-4" />
  </Link>
</Button>
```

- [ ] **Step 4: Update the seed helper `seedBriefBasedHome`**

In `src/lib/projects/custom-source-generator.ts`, in `seedBriefBasedHome` (line 1121), apply the same replacement: add the `Link` import and swap `<a href="#kontak">` → `<Link to="/" hash="kontak">`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test src/lib/projects/custom-source-generator.test.ts src/lib/projects/scaffold/scaffold.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts src/lib/projects/scaffold/scaffold.test.ts src/lib/projects/custom-source-generator.ts src/lib/projects/custom-source-generator.test.ts
git commit -m "feat(scaffold): model <Link hash> in-page anchors in generated seed"
```

---

### Task 3: Routing skill doc carries the anchor rule

**Files:**
- Modify: `src/lib/projects/skills/tanstack-router-static.md`

- [ ] **Step 1: Add the anchor rule**

In `src/lib/projects/skills/tanstack-router-static.md`, after line 10 (the `<Link to="/katalog">` note), add:

```markdown
- In-page section links (anchor scroll within one page) use `<Link to="/" hash="sectionId">`, targeting `<section id="sectionId">`. **Never** use raw `<a href="#id">`: with hash history the hash is the route path, so `#id` resolves to no route and hits the 404 catch-all — the jump glitches (first click re-renders/scrolls to top, only works on the second). `<Link to="/" hash="...">` renders `#/id` and uses TanStack's native hash-scroll. Add `scroll-mt-*` to each `id` target so a fixed header does not cover it.
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/projects/skills/tanstack-router-static.md
git commit -m "docs(projects): document <Link hash> in-page anchors under hash history"
```

---

### Task 4: Guarantee smooth scroll in the scaffold CSS

**Rationale:** smooth scrolling must be guaranteed by construction, not left to
the LLM's discretion. `shadcnThemeCss` is the single source of truth for the
shared `src/index.css` emitted by both the scaffold starter and
`generated-source.ts`, so adding `scroll-behavior:smooth` there covers every
shadcn-based generated site.

**Files:**
- Modify: `src/lib/projects/scaffold/shadcn-theme.ts`
- Modify: `src/lib/projects/generated-source.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `shadcnThemeCss` output includes `scroll-behavior:smooth` on `html`
  with a `prefers-reduced-motion: reduce` fallback to `auto`.

- [ ] **Step 1: Write the failing test**

In `src/lib/projects/generated-source.test.ts`, inside the existing
`starter contract CSS includes shadcn theme tokens...` `it` block (after the
`--card` / `.starter-shell` assertions), add:

```ts
    expect(css).toContain("scroll-behavior: smooth");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/scroll-behavior: auto/);
```

(`schema` is scoped inside that block — do not add a separate `it` that
references it.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test src/lib/projects/generated-source.test.ts`
Expected: FAIL — assertions unmet (no `scroll-behavior` in the CSS).

- [ ] **Step 3: Update `shadcnThemeCss`**

In `src/lib/projects/scaffold/shadcn-theme.ts`, inside the `@layer base` block,
add a smooth-scroll rule with a reduced-motion fallback:

```css
  html {
    scroll-behavior: smooth;
  }
```

and after the `@layer base` block:

```css
@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test src/lib/projects/generated-source.test.ts src/lib/projects/scaffold/scaffold.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/scaffold/shadcn-theme.ts src/lib/projects/generated-source.test.ts
git commit -m "feat(scaffold): guarantee native smooth scroll in generated CSS"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run the local quality gate**

Run: `bun run check`
Expected: PASS (format, lint, typecheck, tests, Knip, docs). Fix any failures before proceeding. (Note: a pre-existing `_main.index.tsx` framer-motion typecheck error is unrelated to this change.)
