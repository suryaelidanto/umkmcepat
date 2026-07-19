# Design: Generated App Builder Reliability Hardening

## Background & Problem Statement
The custom site/app generator sometimes fails to pass quality checks. The two most common failures are:
1. `usePreviewReady()` signal defined but never called in a route/component. This happens when the AI agent rewrites the index route but forgets/omits the `usePreviewReady()` call, causing the preview iframe to hang.
2. Missing CSS rules for Tailwind utility classNames (e.g. `space-y-4`, `text-emerald-600`, etc.). The AI agent often leaks Tailwind classNames out of habit/preference, but they are not defined in `src/styles.css`, causing the CSS coverage check to fail.

## Proposed Solution

We will apply a hybrid approach to make the generator 100% resilient:

### Part 1: Prompt Hardening
We will inject loud, explicit instructions across all agent generation, rewrite, and repair modes:
- Explicitly instruct the agent to include `import { usePreviewReady } from "../lib/preview-ready";` and call `usePreviewReady();` inside `HomeRouteComponent`.
- Warn the agent that Tailwind CSS is NOT installed, and any utility classes used must be avoided or fully styled in `src/styles.css`.

### Part 2: Auto-Injecting `usePreviewReady()`
If the agent forgets to call `usePreviewReady()`, we will auto-heal `src/routes/index.tsx` in a post-generation pass:
- If the file imports or references `HomeRouteComponent` but doesn't call `usePreviewReady()`, we will parse/replace the file content to add the import and call.
- This ensures that the iframe preview signal is 100% guaranteed to be called.

### Part 3: Tailwind Utility CSS Generator in Fallback Stubs
Instead of generating empty color-only stubs (which are rejected or capped at 20), we will write a Tailwind utility CSS generator. When `applyStylesCoverStubs` is run, if it sees common Tailwind classes (e.g., `space-y-4`, `text-emerald-600`, `flex`, `grid`, etc.), it will generate the actual functional CSS rules for them:
- `space-y-{n}` -> `.space-y-{n} > * + * { margin-top: {n * 0.25}rem; }`
- `space-x-{n}` -> `.space-x-{n} > * + * { margin-left: {n * 0.25}rem; }`
- `p-{n}`, `px-{n}`, `py-{n}`, `m-{n}`, etc. -> generate actual margins and paddings.
- `text-{color}-{weight}` -> map common Tailwind colors (emerald, blue, red, slate, gray) to hex values.
- Layout helpers like `flex`, `grid`, `items-center`, `justify-between`.
- For other non-standard classes, it falls back to the default stub.

This ensures that if the agent does leak utility classes, they actually render correctly on screen, and the site doesn't fail the build.

## Implementation Details

### 1. `ensurePreviewReadyCalled`
We will add `ensurePreviewReadyCalled(files: GeneratedProjectFile[])` inside `custom-source-generator.ts`.
It will check if `src/routes/index.tsx` has `HomeRouteComponent`.
If `usePreviewReady()` is not invoked:
- Ensure the import exists: `import { usePreviewReady } from "../lib/preview-ready";`
- Find `export function HomeRouteComponent() {` (or `function HomeRouteComponent() {`) and inject `usePreviewReady();` at the beginning of the function body.

### 2. Tailwind Utility Mapper in `applyStylesCoverStubs`
We will create a function `getTailwindCssRuleBody(className: string): string | null` in `custom-source-generator.ts`:
- Match `space-y-(\d+)` -> return `display: flex; flex-direction: column; gap: calc($1 * 0.25rem);` (much safer/easier to declare directly on the parent flex or via standard flex/grid gaps, or using the sibling selector `> * + * { margin-top: calc($1 * 0.25rem); }`). Since `space-y` works on any element, the sibling selector `> * + * { margin-top: calc($1 * 0.25rem); }` is correct.
- Match `space-x-(\d+)` -> return `> * + * { margin-left: calc($1 * 0.25rem); }`.
- Match padding/margin classes like `p-(\d+)`, `px-(\d+)`, `py-(\d+)`, `m-(\d+)`, etc.
- Match colors like `text-emerald-100` -> `color: #d1fae5;`, `text-emerald-600` -> `color: #059669;`, etc.

## Verification Plan
We will add unit tests in `custom-source-generator.test.ts` to verify:
1. `ensurePreviewReadyCalled` auto-injects the import and call correctly.
2. Tailwind utility CSS is correctly generated and satisfies `cssCoversClassName`.
3. The generator runs successfully when simulating a failing agent run.
