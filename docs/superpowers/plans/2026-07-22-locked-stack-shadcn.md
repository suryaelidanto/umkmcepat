# Locked Stack (Vite + TanStack Router + Tailwind v4 + shadcn/ui) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the generated-project stack to Vite + React 19 + TanStack Router (hash history, multi-page) + Tailwind v4 + shadcn/ui, fix the slow-build + broken-output bugs, and make the engine reliably produce working, designed static frontends.

**Architecture:** Replace the bare starter scaffold with a shadcn-seeded scaffold (pre-seeded `src/components/ui/*` + `components.json` + `@` alias + Tailwind-v4 CSS vars). Rewrite the agent prompt + skills so they stop contradicting each other (the root cause of both the "agent did not edit enough files" build-fail and the broken-CSS/stale-placeholder output). Strengthen the quality gate into a true verify-before-ship critic. Key workspace cache key uses the real project id, not the AI-written slug, so `bun install` is skipped on repeat builds.

**Tech Stack:** Vite 8, React 19, TanStack Router ^1.170.17, Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui ("new-york" style, source-copied components, no CLI at build time), TypeScript ~6.0.2, Bun.

## Global Constraints

- **No shell / no CLI at build time.** The agent tool runner (`agent-tool-runner.ts`) exposes only `check_app`, `list_files`, `read_file`, `search_files`, `write_file`, `replace_in_file`, `read_skill`. shadcn components are **source-copied into the scaffold** (option (a)) — the AI never runs `shadcn add`. If the AI needs a component not pre-seeded, it writes shadcn-pattern source into `src/components/ui/`.
- **No backend, no database, no auth, no payment gateways, no fake `/api`.** Static frontend only. (architecture.md)
- **package.json is platform-owned.** AI cannot add deps. The dependency allowlist (`generated-package-policy.ts`) is the source of truth — new shadcn deps (`class-variance-authority`, `tailwind-merge`, `@radix-ui/react-slot`, `@radix-ui/react-label`, `@radix-ui/react-separator`) MUST be added to the allowlist or the build-policy gate rejects them.
- **Vite config is platform-owned and pinned.** `vite.config.ts` must match `PLATFORM_VITE_CONFIG` byte-for-byte (after normalize). The `@` alias must therefore be added to `PLATFORM_VITE_CONFIG` itself, not authored by the AI.
- **`vite.config.ts` `base: './'`** stays (relative asset URLs, rewritten by the preview proxy — already works).
- **No `h-screen`.** Use `min-h-dvh` / `min-h-screen`.
- **User-facing copy in Indonesian; dev comments/logs/errors in English.** (CLAUDE.md)
- **Bun only; `bun.lock` canonical.** (CLAUDE.md)
- **Pre-seeded shadcn components must be Tailwind v4-compatible** (CSS vars in `@theme`/`:root`, no `tailwind.config.js`, `@import "tailwindcss"`).
- **Every task ends with `bun run check` green + a commit.** Conventional Commits. Never bypass a failing gate.
- **Docs are part of the change** (CLAUDE.md): the final task updates canonical docs.

---

## File Structure

**New files (scaffold + skills):**
- `src/lib/projects/scaffold/` — new dir holding the locked-stack scaffold generator + shadcn seed components, split by responsibility:
  - `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts` — produces the full starter file set (replaces `createGeneratedViteTanStackStarterFiles`).
  - `src/lib/projects/scaffold/shadcn-components.ts` — the pre-seeded shadcn component sources (`button`, `card`, `badge`, `input`, `label`, `separator`) + `utils.ts` `cn()` + `components.json`.
  - `src/lib/projects/scaffold/shadcn-theme.ts` — maps a `ProjectSiteSchema.theme` → shadcn CSS vars (`:root` + `.dark`).
- `src/lib/projects/skills/tailwind-v4.md` — slim Tailwind v4 skill.
- `src/lib/projects/skills/tanstack-router-static.md` — slim TanStack Router static skill.
- `src/lib/projects/skills/shadcn-ui.md` — slim shadcn-ui skill (composition, `cn()`, where to add new components).
- `docs/superpowers/plans/2026-07-22-locked-stack-shadcn.md` — this plan.

**Modified files:**
- `src/lib/projects/generated-source.ts` — scaffold call site swaps to the new starter; `BuildGeneratedProjectOptions` gains `workspaceKey`.
- `src/lib/projects/generated-package-policy.ts` — allowlist adds shadcn deps; drops `postcss` (unused under Tailwind v4 `@tailwindcss/vite`) only if confirmed unused.
- `src/lib/projects/generated-build-policy.ts` — `PLATFORM_VITE_CONFIG` gains the `@` alias + `@types/node` import; `PLATFORM_OWNED_PATHS` gains `components.json`, `src/lib/utils.ts`, `src/components/ui/*` rule (platform-owned, AI may add but not rewrite the seeded ones — see Task 2 note).
- `src/lib/projects/custom-source-generator.ts` — rewrites `buildGeneratedAppAgentInstructions` + `skillsBlock` + `buildAgentPrompt` (kills contradictions; flips routing to allow multi-route + `<Link>`; flips styling to shadcn-only); rewrites `checkAgentSourceQuality` (detect stale starter string → fail; relax `size < 2` to a presentation-edit check).
- `src/lib/projects/skills/generated-app-builder.md` — rewritten to the locked stack.
- `src/routes/api.projects.$id.generate.ts` — pass `{ workspaceKey: projectId }` to the 4 `buildGeneratedProject` calls.
- `src/routes/api.projects.$id.edit.ts` — pass `workspaceKey` through the build worker.
- `src/lib/projects/build-worker.ts` — thread `workspaceKey` to `buildProject`.
- `docs/architecture.md`, `DESIGN.md`, `PRODUCT.md` (if it references old styling) — locked-stack doc updates.

**Tests:**
- `src/lib/projects/generated-source.test.ts` — add a test asserting repeat builds with the same `workspaceKey` skip install (and that different keys install).
- `src/lib/projects/generated-build-policy.test.ts` + `generated-package-policy.test.ts` — assert shadcn deps + `@`-alias vite config are accepted; old bare config now rejected.
- `src/lib/projects/api.projects.preview.test.ts` (or a new `custom-source-generator.test.ts`) — assert `buildGeneratedAppAgentInstructions` no longer contains the contradictory "WRITE first: src/content/site.ts" / "Do NOT use `<Link>`" lines; assert multi-route is permitted; assert `checkAgentSourceQuality` fails a stale-starter `index.tsx`.

---

### Task 1: Build-speed fix — stable workspace key

**Why:** Today the workspace dir is keyed by `manifest.projectId`, which is the AI-written `package.json` `name` (a slug like `surya-aff-12`) — it changes every rebuild, so every rebuild gets a fresh empty workspace and `bun install` runs every time. Key by the real project id instead.

**Files:**
- Modify: `src/lib/projects/generated-source.ts:33-39` (`BuildGeneratedProjectOptions`), `:277-295` (`buildGeneratedProjectInWorkspace`), `:157-212` (`buildGeneratedProject` signature + pass-through).
- Modify: `src/routes/api.projects.$id.generate.ts:447,498,935,993` (4 call sites), `src/routes/api.projects.$id.edit.ts:732` (via worker), `src/lib/projects/build-worker.ts:35-58`.
- Test: `src/lib/projects/generated-source.test.ts` (new test for workspace reuse).

**Interfaces:**
- Produces: `BuildGeneratedProjectOptions.workspaceKey?: string` — when set, the workspace dir is `<root>/<workspaceKey>/<runtimeProfile>/`; when unset, falls back to `manifest.projectId` (preserves existing tests that don't pass it).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/projects/generated-source.test.ts` (inside the existing describe for build caching, near the `:393` reuse test):

```ts
it("reuses the same workspace across rebuilds when workspaceKey is stable", async () => {
  const files = buildableFiles("stable-key");
  // First build installs (fresh workspace).
  const first = await buildGeneratedProject(files, {
    commandRunner: makeRecordingRunner(),
    workspaceRoot: tmpRoot(),
    workspaceKey: "project-stable-id",
  });
  expect(first.ok).toBe(true);

  // Second build with the SAME key must reuse node_modules → install skipped.
  const second = await buildGeneratedProject(files, {
    commandRunner: makeRecordingRunner(),
    workspaceRoot: tmpRoot(),
    workspaceKey: "project-stable-id",
  });
  expect(second.ok).toBe(true);
  const secondInstalls = makeRecordingRunner().calls.filter((c) =>
    c.includes("install"),
  );
  expect(secondInstalls.length).toBe(0);
});
```

If the existing test helpers (`makeRecordingRunner`, `tmpRoot`, `buildableFiles`) differ in name, reuse the actual helpers already in that file — do not invent new ones. The assertion's intent: a second build with the same `workspaceKey` does NOT run `bun install`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/lib/projects/generated-source.test.ts`
Expected: FAIL — `workspaceKey` option does not exist yet (type error) and/or install still runs because key is unstable.

- [ ] **Step 3: Add `workspaceKey` to the options + workspace path**

In `src/lib/projects/generated-source.ts`, change:

```ts
type BuildGeneratedProjectOptions = {
  commandRunner?: (
    command: string[],
    cwd: string,
  ) => Promise<BuildCommandResult>;
  workspaceRoot?: string;
  workspaceKey?: string;
};
```

In `buildGeneratedProject` (line ~209), pass it through:

```ts
  return buildGeneratedProjectInWorkspace(
    files,
    manifestResult.manifest,
    { ...options, workspaceKey: options.workspaceKey ?? manifestResult.manifest.projectId },
  );
```

In `buildGeneratedProjectInWorkspace` (line ~291), use it:

```ts
  const workspace = path.join(
    workspaceRoot,
    toSafeWorkspacePart(options.workspaceKey ?? manifest.projectId),
    toSafeWorkspacePart(manifest.runtimeProfile),
  );
```

- [ ] **Step 4: Thread `workspaceKey: projectId` through call sites**

In `src/routes/api.projects.$id.generate.ts`, each of the 4 `buildGeneratedProject(sourceFiles)` calls becomes `buildGeneratedProject(sourceFiles, { workspaceKey: projectId })`. (`projectId` is already in scope at each call site — confirmed at lines 447, 498, 935, 993.)

In `src/lib/projects/build-worker.ts`, add `workspaceKey?: string` to `runBuild`'s input and forward it:

```ts
async runBuild({
  buildId,
  files,
  workspaceKey,
}: {
  buildId: string;
  files: GeneratedProjectFile[];
  workspaceKey?: string;
}): Promise<BuildWorkerResult> {
  // ...
  const result = await buildProject(files, workspaceKey ? { workspaceKey } : {});
```

In `src/routes/api.projects.$id.edit.ts:732`:

```ts
const buildResult = await createLocalBuildWorker().runBuild({
  buildId: build.id,
  files: editResult.files,
  workspaceKey: project.id,
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun run test:changed -- src/lib/projects/generated-source.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full gate + commit**

Run: `bun run check`
Expected: all green (format, lint, typecheck, test, knip).

```bash
git add -A
git commit -m "fix(build): key build workspace by real project id to reuse node_modules

The workspace dir was keyed by manifest.projectId (the AI-written package.json
name, a per-rebuild slug), so every rebuild got a fresh empty workspace and
re-ran bun install. Key by the stable project id instead; bun install is now
skipped on repeat builds with unchanged dependency signature."
```

---

### Task 2: Build the shadcn-seeded locked-stack scaffold

**Why:** The bare starter (one placeholder `index.tsx`, contract `styles.css`) forces the AI to invent structure → unreliable, garbage CSS, stale placeholders. Pre-seed a known-good shadcn/Tailwind-v4 base so the AI composes components instead of inventing them.

**Files:**
- Create: `src/lib/projects/scaffold/shadcn-theme.ts`
- Create: `src/lib/projects/scaffold/shadcn-components.ts`
- Create: `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts`
- Modify: `src/lib/projects/generated-source.ts:751-898` (swap `createGeneratedViteTanStackStarterFiles` to delegate to the new scaffold), keep the old export name as a thin re-export so existing imports don't break.
- Modify: `src/lib/projects/generated-build-policy.ts:11-20` (`PLATFORM_VITE_CONFIG` gains `@` alias), `:22-26` (`PLATFORM_OWNED_PATHS` gains `components.json`).
- Modify: `src/lib/projects/generated-package-policy.ts:14-36` (allowlist shadcn deps).
- Test: `src/lib/projects/generated-build-policy.test.ts`, `generated-package-policy.test.ts`, and a new `scaffold.test.ts` asserting the starter produces all required files.

**Interfaces:**
- Consumes: `ProjectSiteSchema` (from `generated-types` / wherever defined) — its `.theme { background, foreground, muted, accent }`.
- Produces: `createViteTanStackShadcnStarterFiles(projectId: string, schema: ProjectSiteSchema): GeneratedProjectFile[]` — the full starter file set.

- [ ] **Step 1: Write the failing test for the scaffold file set**

Create `src/lib/projects/scaffold/scaffold.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createViteTanStackShadcnStarterFiles } from "./vite-tanstack-shadcn-starter";
import type { ProjectSiteSchema } from "@/lib/projects/generated-types";

const schema: ProjectSiteSchema = {
  businessName: "Test Biz",
  // ...fill with the minimal required ProjectSiteSchema fields per its type
} as ProjectSiteSchema;

describe("createViteTanStackShadcnStarterFiles", () => {
  const files = createViteTanStackShadcnStarterFiles("proj_1", schema);
  const paths = files.map((f) => f.path);

  it("includes the shadcn base files", () => {
    expect(paths).toContain("components.json");
    expect(paths).toContain("src/lib/utils.ts");
    expect(paths).toContain("src/components/ui/button.tsx");
    expect(paths).toContain("src/components/ui/card.tsx");
  });

  it("index.css is Tailwind-v4-only with theme vars, no contract classes", () => {
    const css = files.find((f) => f.path === "src/index.css")?.content ?? "";
    expect(css).toContain('@import "tailwindcss"');
    expect(css).not.toContain(".starter-shell");
  });

  it("router.tsx has a 404 catch-all route", () => {
    const router = files.find((f) => f.path === "src/router.tsx")?.content ?? "";
    expect(router).toMatch(/notFoundComponent|catchAll|starRoute|\*/);
  });

  it("vite.config.ts has the @ alias", () => {
    const vite = files.find((f) => f.path === "vite.config.ts")?.content ?? "";
    expect(vite).toContain("alias");
    expect(vite).toContain('"@"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/lib/projects/scaffold/scaffold.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `shadcn-theme.ts` — schema → CSS vars**

Create `src/lib/projects/scaffold/shadcn-theme.ts`:

```ts
import type { ProjectSiteSchema } from "@/lib/projects/generated-types";

/**
 * Map a brief's theme to shadcn CSS variables (Tailwind v4, OKLCH-ish).
 * ponytail: only light mode for now; add `.dark` vars when dark mode is needed.
 */
export function shadcnThemeCss(schema: ProjectSiteSchema): string {
  const { background, foreground, muted, accent } = schema.theme;
  return `@import "tailwindcss";

@theme {
  --color-background: ${background};
  --color-foreground: ${foreground};
  --color-muted: ${muted};
  --color-primary: ${accent};
  --color-accent: ${accent};
}

:root {
  --background: ${background};
  --foreground: ${foreground};
  --muted: ${muted};
  --primary: ${accent};
  --accent: ${accent};
  --border: color-mix(in srgb, ${foreground} 12%, transparent);
  --ring: ${accent};
}

body {
  background: var(--background);
  color: var(--foreground);
}
`;
}
```

Exact var names must match what the seeded shadcn components reference (shadcn "new-york" uses `bg-background text-foreground border-border` etc.). If a seeded component references a var not set here, add it.

- [ ] **Step 4: Create `shadcn-components.ts` — `cn()` + `components.json` + seeded components**

Create `src/lib/projects/scaffold/shadcn-components.ts`. Export an array of `{ path, content }` for: `src/lib/utils.ts`, `components.json`, and `src/components/ui/{button,card,badge,input,label,separator}.tsx`. Use canonical shadcn "new-york" + Tailwind v4 source (from `ui.shadcn.com/docs/components/<name>` — these are MIT-licensed source, copy verbatim). Example for `utils.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

`components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

Each component imports `cn` from `@/lib/utils` and Radix primitives where needed (`@radix-ui/react-slot` for `button`, `@radix-ui/react-label` for `label`, `@radix-ui/react-separator` for `separator`). Export as `SHADCN_COMPONENT_FILES: GeneratedProjectFile[]`.

- [ ] **Step 5: Update the package allowlist + vite config policy**

In `src/lib/projects/generated-package-policy.ts`, add to the `"vite-react-tanstack-v1"` set:

```ts
"class-variance-authority",
"tailwind-merge",
"@radix-ui/react-slot",
"@radix-ui/react-label",
"@radix-ui/react-separator",
```

(With version specifiers the AI's package.json must use — copy the exact `^x.y.z` from the canonical shadcn Vite guide; the specifier regex `^(\^|~)?\d+\.\d+\.\d+` requires semver.)

Drop `postcss` from the allowlist ONLY if no seeded file references it (Tailwind v4 uses `@tailwindcss/vite`, not PostCSS). Grep to confirm before removing.

In `src/lib/projects/generated-build-policy.ts`, update `PLATFORM_VITE_CONFIG`:

```ts
export const PLATFORM_VITE_CONFIG = `import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
`;
```

Add `components.json` to `PLATFORM_OWNED_PATHS` (AI must not rewrite it; it may add new `src/components/ui/*` files but must not edit the seeded ones — enforced by the gate in Task 5, not here).

- [ ] **Step 6: Create the starter generator**

Create `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts` producing `GeneratedProjectFile[]` with:
- `package.json` — same deps as the old starter (`generated-source.ts:757-793`) PLUS the new shadcn deps, with `name: toPackageName(schema.businessName)` (slug stays in package.json, NOT used as workspace key anymore — Task 1 decoupled that).
- `vite.config.ts` = `PLATFORM_VITE_CONFIG` verbatim.
- `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` — old ones, PLUS in `tsconfig.app.json` add `"baseUrl": "."` and `"paths": { "@/*": ["./src/*"] }`.
- `eslint.config.js`, `index.html` — same as old.
- `src/main.tsx` — imports `./index.css` (not `./styles.css`).
- `src/index.css` = `shadcnThemeCss(schema)`.
- `src/lib/utils.ts`, `components.json`, `src/components/ui/*` = from `SHADCN_COMPONENT_FILES`.
- `src/lib/preview-ready.ts` — same as old.
- `src/router.tsx` — hash history, `indexRoute` at `/`, AND a `notFoundComponent` catch-all (404). Example:

```ts
import { createHashHistory, createRoute, createRouter } from "@tanstack/react-router";
import { rootRoute } from "./routes/__root";
import { HomeRouteComponent } from "./routes/index";
import { NotFoundRouteComponent } from "./routes/not-found";

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomeRouteComponent,
});

const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "*",
  component: NotFoundRouteComponent,
});

const routeTree = rootRoute.addChildren([indexRoute, notFoundRoute]);
const history = createHashHistory();

export const router = createRouter({ history, routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

- `src/routes/__root.tsx` — `createRootRoute({ component: () => <Outlet /> })` (generic; AI may add a layout here).
- `src/routes/index.tsx` — a clean shadcn-based placeholder (compiles, looks designed, still signals "replace me"). Uses `Card`/`Button` + `usePreviewReady()`. No `starterMessage` string the gate will flag — instead a comment `// Replace this with the real home page built from the brief`.
- `src/routes/not-found.tsx` — minimal 404 using `Button` + a link home.
- `src/content/site.ts` — `export const site = ... as const; export default site;` (same as old).
- NO `src/styles.css` (removed — replaced by `index.css`).

- [ ] **Step 7: Wire the new starter into the scaffold call site**

In `src/lib/projects/generated-source.ts`, replace the body of `createGeneratedViteTanStackStarterFiles` (lines 751-892) with a delegation:

```ts
export function createGeneratedViteTanStackStarterFiles(
  projectId: string,
  schema: ProjectSiteSchema,
): GeneratedProjectFile[] {
  return createViteTanStackShadcnStarterFiles(projectId, schema);
}
```

Delete `createStarterContractStyles` (line 895-898) — replaced by `shadcnThemeCss`. Keep `createGeneratedProjectFiles` / `createGeneratedViteTanStackProjectFiles` working (they call into the starter; verify their bodies at lines 900-914 still compile against the new file set, fixing any references to removed files like `src/styles.css`).

- [ ] **Step 8: Run the scaffold + policy tests**

Run: `bun run test:changed -- src/lib/projects/scaffold/scaffold.test.ts src/lib/projects/generated-build-policy.test.ts src/lib/projects/generated-package-policy.test.ts`
Expected: PASS.

- [ ] **Step 9: Run the full gate + commit**

Run: `bun run check`
Expected: green. (Some downstream tests in `generated-source.test.ts` / `custom-source-generator` tests may reference `src/styles.css` or `.starter-shell` — fix them in this step, not deferred.)

```bash
git add -A
git commit -m "feat(scaffold): lock generated-project stack to Vite + TanStack Router + Tailwind v4 + shadcn/ui

Replace the bare starter (one placeholder route + contract CSS) with a
shadcn-seeded scaffold: pre-seeded src/components/ui/* (button, card, badge,
input, label, separator), components.json, cn() helper, @ alias in vite
config + tsconfig, Tailwind v4 index.css with theme CSS vars, and a 404
catch-all route. The AI composes known-good components instead of inventing
structure from a blank canvas — the reliability lever behind broken-CSS and
stale-placeholder output."
```

---

### Task 3: Add slim Tailwind v4 + TanStack Router + shadcn skills

**Why:** Distilled, stack-matched guidance the AI reads via `read_skill`. The AI already knows these libraries; the skills pin *our* conventions (which files to touch, shadcn-only, multi-page allowed) so it doesn't drift. Skills are inert — loading them is already handled by `agent-tool-runner.ts:324-339`.

**Files:**
- Create: `src/lib/projects/skills/tailwind-v4.md`
- Create: `src/lib/projects/skills/tanstack-router-static.md`
- Create: `src/lib/projects/skills/shadcn-ui.md`

**Interfaces:**
- Consumes: the `read_skill` tool (`name` = filename without `.md`).
- Produces: markdown content returned to the agent as `result`.

- [ ] **Step 1: Write `tailwind-v4.md`**

```markdown
---
name: tailwind-v4
description: Tailwind CSS v4 conventions for UMKM Cepat generated apps — utility-first, CSS vars in index.css, no custom classes.
---

# Tailwind CSS v4 (UMKM Cepat)

- `src/index.css` starts with `@import "tailwindcss";` and holds theme CSS vars under `@theme` + `:root`. **Do not edit `src/index.css`** unless adding a theme var.
- Write ALL styles as Tailwind utility classes inline in TSX: `className="flex flex-col gap-4 p-6 bg-background text-foreground rounded-xl"`.
- **No custom CSS class names** (no `.btn-primary`, `.hero-section`). If you need a reusable style, make a React component, not a CSS class.
- No `tailwind.config.js` — Tailwind v4 is CSS-first config via `@tailwindcss/vite`.
- Responsive: mobile-first, `md:`/`lg:` prefixes. Full-height sections use `min-h-dvh`, never `h-screen`.
- Colors: use the theme vars (`bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`) so the brief's palette applies. Avoid raw hex except in `index.css` vars.
```

- [ ] **Step 2: Write `tanstack-router-static.md`**

```markdown
---
name: tanstack-router-static
description: TanStack Router conventions for static multi-page UMKM Cepat apps — hash history, route files, <Link>, 404 catch-all.
---

# TanStack Router — static frontend (UMKM Cepat)

- Router uses **hash history** (`createHashHistory()`) because the app is served inside a sandboxed iframe via relative asset URLs.
- Routes are file-based under `src/routes/`. `index.tsx` → `/`. Add a file per extra page (e.g. `src/routes/katalog.tsx`, `src/routes/kontak.tsx`) and register each in `src/router.tsx` via `createRoute({ getParentRoute: () => rootRoute, path: "/katalog", component: ... })` then add it to `rootRoute.addChildren([...])`.
- Navigate between pages with `<Link to="/katalog">` from `@tanstack/react-router`. **Do not** fake routing with `useState` tabs — use real routes when the brief has distinct sections.
- `src/routes/__root.tsx` is the layout wrapper (`<Outlet />`). Put shared header/footer there if the brief calls for them.
- A `path: "*"` catch-all 404 route is pre-wired. Keep it.
- **Do not edit** `src/main.tsx`, `src/router.tsx` wiring beyond adding your routes, or `src/routes/__root.tsx` beyond adding a layout.
- Every page component calls `usePreviewReady()` (from `@/lib/preview-ready`) so the preview iframe knows rendering finished.
- Read business data via `import { site } from "@/content/site"`.
```

- [ ] **Step 3: Write `shadcn-ui.md`**

```markdown
---
name: shadcn-ui
description: shadcn/ui conventions for UMKM Cepat generated apps — compose pre-seeded components, cn() helper, where to add new ones.
---

# shadcn/ui (UMKM Cepat)

- Components live in `src/components/ui/`. Pre-seeded: `button`, `card`, `badge`, `input`, `label`, `separator`. Import as `import { Button } from "@/components/ui/button"`.
- **Use these. Do not hand-roll custom widgets** (no custom `.btn`, no hand-written dropdowns). Compose shadcn primitives.
- If you need a component that is NOT pre-seeded (e.g. `sheet`, `accordion`, `dialog`), write shadcn-pattern source into `src/components/ui/<name>.tsx` following the canonical shadcn "new-york" + Tailwind v4 shape: import `cn` from `@/lib/utils`, use Radix primitives, style with Tailwind utilities + theme vars.
- Styling is Tailwind utility classes + `bg-background`/`text-foreground`/`bg-primary` vars. Never custom CSS classes.
- `cn()` merges classes conditionally — use it for variants: `className={cn("base classes", isActive && "active classes")}`.
- No CLI at build time. You write component source files directly with `write_file`.
```

- [ ] **Step 4: Run the gate + commit**

Run: `bun run check`
Expected: green (skills are inert markdown; only knip/lint on .md is minimal).

```bash
git add -A
git commit -m "feat(skills): add tailwind-v4, tanstack-router-static, and shadcn-ui skills

Distilled, stack-matched guidance loaded via read_skill. Pins our conventions
(utility-first, shadcn-only composition, real multi-page routing with <Link>)
so the agent does not drift from the locked stack."
```

---

### Task 4: Rewrite the agent prompt + builder skill (kill contradictions)

**Why:** The current prompt is self-contradictory and fights the new direction: `skillsBlock` (line 1937) tells the AI to WRITE `src/content/site.ts` + `src/styles.css`; `buildAgentPrompt` (line 1864) says do NOT edit `site.ts`; the STYLING CONTRACT (line 1955) says keep `styles.css` unedited; the ROUTING contract (line 1960-1962) FORBIDS multiple route files and `<Link>`, forcing single-page `useState` tabs. All four contradict the locked stack. This is the root cause of the "agent did not edit enough files" build-fail and the broken/stale output.

**Files:**
- Modify: `src/lib/projects/custom-source-generator.ts:1849-1968` (`buildAgentPrompt`, `buildGeneratedAppAgentInstructions`, `skillsBlock`).
- Modify: `src/lib/projects/skills/generated-app-builder.md` (full rewrite).
- Test: a new `custom-source-generator.test.ts` asserting the prompt no longer contains the banned lines and now permits multi-route + `<Link>`.

**Interfaces:**
- Consumes: the new scaffold (Task 2) + skills (Task 3).
- Produces: a single coherent instruction string fed to `ToolLoopAgent.instructions`.

- [ ] **Step 1: Write the failing test for the prompt content**

Create `src/lib/projects/custom-source-generator.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildGeneratedAppAgentInstructions } from "./custom-source-generator";
import type { ProjectSiteSchema } from "./generated-types";

const schema = { businessName: "Test" } as unknown as ProjectSiteSchema;

describe("buildGeneratedAppAgentInstructions", () => {
  const instructions = buildGeneratedAppAgentInstructions(schema, undefined, "generate");

  it("does not contradict itself about site.ts or styles", () => {
    expect(instructions).not.toContain("WRITE first: src/content/site.ts");
    expect(instructions).not.toContain("WRITE first: src/content/site.ts, src/routes/index.tsx, src/styles.css");
  });

  it("permits real multi-page routing with <Link>", () => {
    expect(instructions).not.toContain("Do NOT use TanStack Router's <Link>");
    expect(instructions).not.toContain("implement them as React state-based tab");
  });

  it("directs the agent to use shadcn components", () => {
    expect(instructions).toContain("shadcn");
  });

  it("still forbids backend/auth/db", () => {
    expect(instructions.toLowerCase()).toContain("no auth");
    expect(instructions.toLowerCase()).toContain("no backend");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/lib/projects/custom-source-generator.test.ts`
Expected: FAIL — current prompt still contains the banned lines.

- [ ] **Step 3: Rewrite `buildAgentPrompt` + `buildGeneratedAppAgentInstructions` + `skillsBlock`**

In `src/lib/projects/custom-source-generator.ts`, replace the `skillsBlock` block (lines 1934-1942) and the prompt body (1944-1967) with a coherent version. The new `skillsBlock` (generate mode) drops the contradiction and points at skills:

```ts
const skillsBlock =
  mode === "generate"
    ? `\nWrite files directly — you already know the stack. You MAY call read_skill for "tailwind-v4", "tanstack-router-static", or "shadcn-ui" if unsure, but do not stall on exploration.
WRITE first: src/routes/index.tsx (the home page, composing shadcn components + Tailwind utilities).
Then add any extra routes under src/routes/ and components under src/components/.
Never call check_app before at least one write_file.`
    : mode === "rewrite"
      ? `\nFORCED REWRITE MODE: write core routes/components immediately, then check_app.`
      : "";
```

The new prompt body (replace 1944-1967) — key flips: shadcn-only styling, multi-page + `<Link>` ALLOWED, `site.ts` read-only, `index.css` read-only, no custom CSS:

```ts
  return `You are a frontend coding agent for UMKM Cepat generated apps.

Business: ${implementationSpec?.businessName || schema.businessName} — ${implementationSpec?.appKind || "landing"} — ${(implementationSpec?.features || [schema.offer, schema.audience]).join(", ")}
${skillsBlock}
${DESIGN_DIRECTIVE}

STACK (locked — do not change tooling):
- Vite + React 19 + TypeScript + TanStack Router (hash history, static).
- Tailwind CSS v4 (utility classes inline; src/index.css is pre-wired with theme vars — do not edit it).
- shadcn/ui components in src/components/ui/ (button, card, badge, input, label, separator pre-seeded). Compose these; do not hand-roll custom widgets.

ROUTING (multi-page encouraged when the brief has distinct sections):
- Home page is src/routes/index.tsx and MUST export HomeRouteComponent.
- Add real route files under src/routes/ for extra pages (e.g. katalog.tsx, kontak.tsx) and register them in src/router.tsx via createRoute + rootRoute.addChildren([...]).
- Navigate with <Link to="/path"> from @tanstack/react-router. Do NOT fake routing with useState tabs when the brief calls for distinct pages.
- Do NOT edit src/main.tsx or the existing src/router.tsx route registration beyond adding your routes. Keep the path:"*" 404 catch-all.
- Every page component calls usePreviewReady() from "@/lib/preview-ready".

STYLING (shadcn + Tailwind only — no custom CSS):
- All styling is Tailwind utility classes inline in TSX using theme vars (bg-background, text-foreground, bg-primary, text-muted-foreground).
- Do NOT write custom CSS class names. Do NOT edit src/index.css. No .btn-primary / .hero-section / etc.
- If you need a shadcn component not pre-seeded, write its source into src/components/ui/<name>.tsx (canonical new-york + Tailwind v4 shape, import cn from "@/lib/utils"). No CLI.
- Use min-h-dvh for full-height sections, never h-screen.

DATA:
- Read business data via import { site } from "@/content/site". Do NOT edit src/content/site.ts — it is fully populated.

STATIC ONLY: no auth, no backend, no database, no payment gateway, no fake /api routes. Use WhatsApp/contact CTAs and real Indonesian business copy.
Do not add or remove dependencies — package.json is platform-owned.

Call check_app after all writes.`;
```

Keep `DESIGN_DIRECTIVE` as-is (it is taste guidance, not stack-contradicting) — but scan it for `src/styles.css` token references (line 1847 mentions `--bg/--fg/--muted/--accent` from `src/styles.css`); update that one line to reference `src/index.css` theme vars instead.

- [ ] **Step 4: Run the prompt test to verify it passes**

Run: `bun run test:changed -- src/lib/projects/custom-source-generator.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite `generated-app-builder.md` to the locked stack**

Rewrite `src/lib/projects/skills/generated-app-builder.md` so it agrees with the new prompt (stack = shadcn + Tailwind v4 + TanStack Router; styling = utility classes only, `index.css` untouched; routing = multi-page with `<Link>`; no backend; package.json platform-owned). Remove the lines that contradicted: "No Tailwind CSS (custom CSS only)" (old line 99), "styles.css — every className needs a rule" (old line 20/56), "rewrite styles.css fully" (old line 58). Add a "Direct tools, not design" note: the AI picks pages/sections from the brief — no forced contact/footer/testimonials.

- [ ] **Step 6: Run the full gate + commit**

Run: `bun run check`
Expected: green. (The `api.projects.preview.test.ts` assertions on `buildChatSystemPrompt` are unrelated; but `custom-source-generator`-adjacent tests that asserted old prompt strings or `src/styles.css` presence must be updated here.)

```bash
git add -A
git commit -m "fix(agent): rewrite source-generation prompt and builder skill to the locked stack

The prompt contradicted itself (told the agent to write site.ts/styles.css
while also forbidding it; forbade multi-page routing and <Link>). Align it to
the locked stack: shadcn + Tailwind v4 utilities only, real multi-page
routing with <Link>, index.css and site.ts read-only. Removes the root cause
of the 'agent did not edit enough files' build-fail and stale-placeholder
output."
```

---

### Task 5: Strengthen the quality gate into a verify-before-ship critic

**Why:** The gate accepts partial/stale output. It must (a) detect a stale starter `index.tsx` (the placeholder that still compiles) and fail → trigger the bounded rewrite, and (b) relax the `agentEditedFiles.size < 2` rule (a shadcn-only agent legitimately editing `index.tsx` + one component can be exactly 2; but the real signal is "did it edit a presentation file", which is already checked at line 1749-1757). The Anthropic evaluator-optimizer pattern: detect → bounded repair loop → re-verify.

**Files:**
- Modify: `src/lib/projects/custom-source-generator.ts:1726-1813` (`checkAgentSourceQuality`).
- Modify: `src/lib/projects/custom-source-generator.ts:25-35` (`NO_MEANINGFUL_EDIT_ISSUES` + prefixes — add the stale-starter issue string).
- Test: `custom-source-generator.test.ts` — assert a stale-starter file set fails the gate.

**Interfaces:**
- Consumes: the new scaffold's `index.tsx` (whose placeholder uses a `// Replace this` comment, NOT a `starterMessage` string — so the gate must detect the *comment marker*, not a hardcoded business string).
- Produces: `checkAgentSourceQuality` adds issue `"home route is still the starter placeholder"` when `src/routes/index.tsx` contains the starter marker.

- [ ] **Step 1: Write the failing test**

In `src/lib/projects/custom-source-generator.test.ts`, add:

```ts
import { checkAgentSourceQuality } from "./custom-source-generator";
import { createViteTanStackShadcnStarterFiles } from "./scaffold/vite-tanstack-shadcn-starter";

it("fails the gate when index.tsx is still the starter placeholder", () => {
  const files = createViteTanStackShadcnStarterFiles("p1", schema);
  const edited = new Set<string>(["src/routes/index.tsx"]); // agent "touched" it but left starter content
  const quality = checkAgentSourceQuality(files, edited);
  expect(quality.ok).toBe(false);
  expect(quality.issues).toContain("home route is still the starter placeholder");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/lib/projects/custom-source-generator.test.ts`
Expected: FAIL — gate currently passes a stale starter (it compiles + has preview-ready).

- [ ] **Step 3: Add the stale-starter check + wire it into the recoverable set**

In `checkAgentSourceQuality` (after the `agentEditedFiles.size` block, ~line 1743), add:

```ts
  const homeRoute = files.find((file) => file.path === "src/routes/index.tsx");
  const STARTER_MARKERS = [
    "Replace this with the real home page",
    "Replace this starter route",
  ];
  if (
    homeRoute &&
    STARTER_MARKERS.some((marker) => homeRoute.content.includes(marker))
  ) {
    issues.push("home route is still the starter placeholder");
  }
```

(The scaffold's `index.tsx` from Task 2 Step 6 must contain exactly the marker string `"Replace this with the real home page built from the brief"` as a comment, so the gate can detect it. Confirm the scaffold writes that exact substring.)

Add `"home route is still the starter placeholder"` to `NO_MEANINGFUL_EDIT_ISSUES` (line 25-28) so the existing forced-rewrite path (line 193) picks it up automatically — no new repair-loop code needed; the rewrite pass already re-heals and re-checks.

Also relax the hard `size < 2`: change line 1741 from `if (agentEditedFiles.size < 2)` to `if (agentEditedFiles.size < 1)` — the real "meaningful edit" signal is the `presentationEdited`/`contentEdited` check below it (line 1749-1761), which already requires a presentation or content file. The `< 2` rule was the old "edit site.ts + styles.css" expectation that the new stack abandons. (Keep the `presentationEdited`/`contentEdited` checks — they're the real bar.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:changed -- src/lib/projects/custom-source-generator.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate + commit**

Run: `bun run check`
Expected: green.

```bash
git add -A
git commit -m "fix(gate): detect stale starter index.tsx and relax file-count rule

The quality gate accepted a starter placeholder that compiled and had the
preview-ready signal. Add a stale-starter marker check that fails the gate
and trips the existing forced-rewrite pass (evaluator-optimizer pattern).
Relax the size<2 rule (a holdover from the old edit-site.ts+styles.css
workflow) to size<1; the real bar is the presentation/content-edit check."
```

---

### Task 6: Update canonical docs + SOP

**Why:** CLAUDE.md requires docs to change with behavior/architecture/styling. The locked stack, shadcn seeding, no-CLI constraint, and multi-page direction must be recorded so the next agent resumes without archaeology.

**Files:**
- Modify: `docs/architecture.md` (styling + full-stack-direction + generated-project sections).
- Modify: `DESIGN.md` (shadcn component system + theme vars).
- Modify: `PRODUCT.md` only if it references the old "custom CSS" styling.
- Modify: `src/lib/projects/skills/generated-app-builder.md` already done in Task 4 — re-verify it matches the docs.

**Interfaces:**
- Consumes: the implementation from Tasks 1-5.
- Produces: canonical docs reflecting the locked stack.

- [ ] **Step 1: Update `docs/architecture.md`**

In the generated-project / styling sections, record:
- Locked stack: Vite + React 19 + TanStack Router (hash history, static, multi-page) + Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first, no `tailwind.config.js`) + shadcn/ui ("new-york", source-copied, no CLI at build time).
- The agent tool runner exposes only file ops (`check_app`, `list_files`, `read_file`, `search_files`, `write_file`, `replace_in_file`, `read_skill`) — no shell. shadcn components are pre-seeded in the scaffold; the AI writes any extras as source into `src/components/ui/`.
- Build workspaces are keyed by the real project id (Task 1), so `bun install` is skipped on repeat builds with an unchanged dependency signature.
- Styling: Tailwind utility classes inline + theme CSS vars in `src/index.css`; no custom CSS classes; `src/index.css` and `src/content/site.ts` are read-only to the agent.
- Static-frontend-only remains the constraint; backend/DB/auth/payments are future, not now.
- A landing page is one valid outcome, not the forced default; multi-page is encouraged when the brief has distinct sections.

- [ ] **Step 2: Update `DESIGN.md`**

Add a short section: the generated-app design system is shadcn "new-york" + Tailwind v4; theme tokens come from the brief (`schema.theme`) and are emitted as CSS vars in `src/index.css` (`--background`, `--foreground`, `--muted`, `--primary`, `--accent`); components compose `bg-background`/`text-foreground`/`bg-primary`. No custom CSS classes; `DESIGN_DIRECTIVE` (taste guidance) still applies on top of the utility classes.

- [ ] **Step 3: Check `PRODUCT.md`**

Grep `PRODUCT.md` for "custom CSS" / "styles.css" / "Tailwind". If it asserts the old styling, align it to the locked stack. If it's silent on styling, no change.

- [ ] **Step 4: Run the full gate + commit**

Run: `bun run check`
Expected: green.

```bash
git add -A
git commit -m "docs: record locked generated-project stack (shadcn + Tailwind v4 + TanStack Router)

Update architecture.md, DESIGN.md for the shadcn-seeded scaffold, no-CLI
build constraint, stable workspace key, and multi-page static direction so
future work resumes without archaeology."
```

---

## Self-Review (completed by plan author)

**1. Spec coverage:**
- Slow builds → Task 1 (stable workspace key). ✓
- Broken CSS / wrong route (stale placeholder) → Task 2 (scaffold) + Task 4 (prompt) + Task 5 (gate). ✓
- Locked stack shadcn/Tailwind v4/TanStack Router → Tasks 2, 3, 4. ✓
- Multi-page + no backend direction → Task 4 (prompt flips) + Task 6 (docs). ✓
- Skills injection → Task 3. ✓
- Gate critic loop → Task 5 (uses existing forced-rewrite path). ✓
- Docs/SOP → Task 6. ✓

**2. Placeholder scan:** No "TBD"/"implement later". The one intentional indirection — "copy canonical shadcn source verbatim" in Task 2 Step 4 — is a real, fetchable source (MIT), not a placeholder; the implementer fetches `ui.shadcn.com/docs/components/<name>` for each. Exact var names flagged as "must match seeded components."

**3. Type consistency:** `workspaceKey?: string` (Task 1) used consistently at all call sites. `createViteTanStackShadcnStarterFiles(projectId, schema)` (Task 2) matches the re-export in Step 7 and the test in Task 5. Stale-starter marker string `"Replace this with the real home page built from the brief"` is consistent between Task 2 Step 6 and Task 5 Step 3. `NO_MEANINGFUL_EDIT_ISSUES` gets the new issue string (Task 5) matching what `checkAgentSourceQuality` pushes.

**Known risk:** Task 2 is the largest task and touches the most existing tests (anything referencing `src/styles.css`, `.starter-shell`, or the old `createStarterContractStyles`). Step 9 explicitly fixes those in-task, not deferred. If the gate explodes on `findMissingCssClasses` (which reads `src/styles.css` — now removed), Task 5 / Task 2 must also update `checkAgentSourceQuality`'s `styleFile` lookup to `src/index.css` or make missing-CSS a no-op under the new Tailwind-only stack (where there are no custom classes to check). Flagged here so the implementer handles it when `bun run check` surfaces it.
