# Manrope and Birthstone Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use Manrope across the UMKM Cepat control-plane and Birthstone only for the public hero accent “100% Gratis.”

**Architecture:** Keep the existing Google Fonts loading path and Tailwind `font-sans` API, replacing the underlying family token with Manrope. Add one semantic `font-signature` token for Birthstone and consume it only in the unauthenticated hero accent. Keep generated customer sites and system monospace unchanged.

**Tech Stack:** React, TanStack Start, Tailwind CSS v4, Google Fonts, Storybook, Bun.

## Global Constraints

- Do not commit any changes until the user approves the real page.
- Manrope owns body, navigation, headings, labels, controls, authenticated UI, and HTML email font declarations.
- Birthstone is restricted to “100% Gratis.” on the unauthenticated homepage hero.
- Generated customer-site typography remains unchanged.
- Preserve Indonesian user-facing copy and existing hero animation.

---

### Task 1: Replace the control-plane font system

**Files:**
- Modify: `src/routes/__root.tsx:78-87`
- Modify: `src/styles/globals.css:4-14,104-143,244-248`
- Modify: `src/routes/_main.index.tsx:205-224`

**Interfaces:**
- Produces: Tailwind utilities `font-sans` backed by Manrope and `font-signature` backed by Birthstone.
- Consumes: Existing Google Fonts CSP allowances and homepage `HERO_ACCENT` markup.

- [ ] **Step 1: Update the font request**

Request Manrope weights 400–800 and Birthstone regular with `display=swap`:

```tsx
{
  rel: "stylesheet",
  href: "https://fonts.googleapis.com/css2?family=Birthstone&family=Manrope:wght@400;500;600;700;800&display=swap",
}
```

- [ ] **Step 2: Replace CSS font tokens**

Define the semantic stacks and route existing typography roles through Manrope:

```css
--font-sans: var(--font-manrope);
--font-signature: var(--font-birthstone);
--font-manrope: "Manrope", ui-sans-serif, system-ui, sans-serif;
--font-birthstone: "Birthstone", cursive;
```

Replace every control-plane `"Plus Jakarta Sans"` role token and body declaration with Manrope.

- [ ] **Step 3: Apply Birthstone only to the hero accent**

Add `font-signature` plus script-specific size, line-height, tracking, and alignment classes to the span that renders `HERO_ACCENT`. Preserve its animation and underline.

- [ ] **Step 4: Format and lint the changed source files**

Run:

```bash
bunx prettier --write src/routes/__root.tsx src/styles/globals.css src/routes/_main.index.tsx
bunx eslint src/routes/__root.tsx src/routes/_main.index.tsx
```

Expected: both commands exit 0.

### Task 2: Align documentation, stories, and email fallbacks

**Files:**
- Modify: `DESIGN.md`
- Modify: `src/stories/Foundations.stories.tsx`
- Modify: `src/stories/Introduction.mdx`
- Modify: `src/lib/email/templates/wrapper.ts`
- Modify: `src/lib/support/email.ts`

**Interfaces:**
- Consumes: The Manrope and Birthstone role decisions from Task 1.
- Produces: Canonical design documentation and Storybook examples matching the shipped typography.

- [ ] **Step 1: Update canonical typography documentation**

Replace control-plane Plus Jakarta Sans declarations with Manrope. Document Birthstone as a landing-hero accent exception, not a product UI family.

- [ ] **Step 2: Update Storybook foundation language**

Change the typography subtitle and visual rule to describe Manrope globally and Birthstone only as the public hero signature accent.

- [ ] **Step 3: Update email font declarations**

Replace the declared Plus Jakarta Sans stack with `Manrope, ui-sans-serif, system-ui, sans-serif`. Email clients without Manrope installed continue to use system fallbacks.

- [ ] **Step 4: Format and lint documentation and source**

Run:

```bash
bunx prettier --write DESIGN.md src/stories/Foundations.stories.tsx src/stories/Introduction.mdx src/lib/email/templates/wrapper.ts src/lib/support/email.ts docs/superpowers/specs/2026-08-13-manrope-birthstone-typography-design.md docs/superpowers/plans/2026-08-13-manrope-birthstone-typography.md
bunx eslint src/stories/Foundations.stories.tsx src/lib/email/templates/wrapper.ts src/lib/support/email.ts
```

Expected: both commands exit 0.

### Task 3: Verify before visual review

**Files:**
- Verify only; no additional files expected.

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: Evidence that the local typography change is safe to review.

- [ ] **Step 1: Confirm old control-plane references are gone**

Run:

```bash
rg -n 'Plus Jakarta Sans|Plus\+Jakarta|font-plus-jakarta' src DESIGN.md
```

Expected: no matches. The generated-site Inter starter remains out of scope.

- [ ] **Step 2: Run focused project checks**

Run:

```bash
bun run typecheck
bun test src/lib/security-headers.test.ts
```

Expected: both commands exit 0.

- [ ] **Step 3: Inspect the real homepage**

Start or reuse the local app and review `/` at mobile and desktop widths. Confirm Manrope loads globally, Birthstone appears only on “100% Gratis.”, the accent does not overflow, and the fallback remains readable while fonts load.

- [ ] **Step 4: Stop without committing**

Report changed files and verification evidence. Wait for user approval before any commit.
