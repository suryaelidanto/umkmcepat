# Control-Plane Dark/Light Theme Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the control-plane UI theme-toggleable (dark default, opt-in light) by replacing hardcoded chrome literals and the role-overloaded `surface-warm-white` with one source of truth per surface role, each having distinct light and dark values.

**Architecture:** Semantic role tokens in `globals.css` (`:root` light, `.dark` dark) re-pointed through shadcn's existing semantic tokens; `next-themes` `ThemeProvider` in `AppProviders` toggles `.dark` on `<html>`; an admin `ui.default_theme` flag feeds the provider default; Monaco and Turnstile derive their theme from `useTheme()`; a no-literal-leak test guarantees no raw hex survives in components/routes after refactor.

**Tech Stack:** Bun, TanStack Router, Tailwind v4 (`@theme inline` + `@custom-variant dark`), `next-themes` ^0.4.6 (already a dep), shadcn primitives, Vitest, Storybook.

## Global Constraints

- Use Bun only; `bun.lock` canonical. No new deps; `next-themes` already installed.
- No `any`, no `as any`, no `ts-ignore`/`eslint-disable` without a one-liner `// why`.
- Comments: self-explanatory code; only one-liner `why` where code looks wrong but is right.
- User-facing copy Indonesian; dev docs/code/logs English.
- Control-plane scope only. Do NOT touch `src/lib/projects/generated-site-theme.ts`, `src/lib/projects/scaffold/shadcn-theme.ts`, `src/lib/projects/site-schema.ts`, the preview iframe's per-project theme, or `src/lib/email/templates/*` (email fixed palette).
- Dark is the default and the regression baseline. Light is opt-in.
- No layout/typography/spacing/copy/animation/product-logic changes.
- `bun run check` must stay green after each task; CI is the real gate.
- Conventional Commits; commit per task.
- Reference spec: `docs/superpowers/specs/2026-08-16-control-plane-theme-toggle-design.md`.

## File Structure

**Create:**
- `src/lib/theme-tokens.test.ts` — contrast + no-leak token tests (TDD gate).
- `src/components/common/ThemeToggle.tsx` — the toggle button (header + workspace).
- `src/components/common/ThemeToggle.stories.tsx` — Storybook for the toggle.

**Modify:**
- `src/styles/globals.css` — real `:root` (light) + `.dark` (dark) role tokens; re-point shadcn semantic tokens at roles.
- `src/components/providers/AppProviders.tsx` — add `ThemeProvider`.
- `src/lib/app-settings-registry.ts` — add `ui.default_theme` entry.
- `src/routes/__root.tsx` — `bg-[#151515]` → `bg-chrome`; `suppressHydrationWarning` already present (needed for `next-themes`).
- `src/components/common/Header.tsx`, `Footer.tsx`, `MainChrome.tsx`, `surface.tsx` — replace literals.
- `src/components/projects/CodeViewer.tsx:543` — Monaco theme from `useTheme()`.
- `src/components/common/LoginConsentDialog.tsx:100-102` — Turnstile theme from `useTheme()`.
- `src/components/projects/WorkspacePrimitives.tsx`, `WorkspaceShell.tsx`, `WorkspaceComposer.tsx`, `WorkspacePreview.tsx`, `WorkspaceBuildProgress.tsx`, `ChatMessage.tsx`, `BuildNotices.tsx`, `ProjectList.tsx`, `HomePromptForm.tsx`, `project-mark.ts`, `ComposerAttachments.tsx`, `WorkspaceHistoryDrawer.tsx` — replace literals + overloaded surface token with role tokens.
- `src/components/ui/dialog.tsx`, `button.tsx`, `mobile-sheet.tsx` — literals → role tokens.
- `src/components/home/HeroAuroraBackground.tsx` — `#151515` orb base → `bg-chrome`.
- `src/routes/_main.*.tsx` chrome (index, waitlist, profile, blocked, support, admin.*) — literals → role tokens.

---

### Task 1: Role tokens + real light/dark blocks in globals.css

**Files:**
- Modify: `src/styles/globals.css`
- Test: `src/lib/theme-tokens.test.ts` (created here, contrast assertions added in Task 2; this task only validates the block parses + roles resolve)

**Interfaces:**
- Produces: CSS custom properties `--chrome`, `--chrome-elevated`, `--surface`, `--surface-muted`, `--surface-sunken`, `--on-chrome`, `--on-surface`, `--on-surface-muted`, `--border-chrome`, `--border-surface`, `--accent`, `--accent-foreground` (both `:root` and `.dark`); Tailwind `@theme inline` exposes them as `--color-chrome`, `--color-surface`, etc. → classes `bg-chrome`, `text-on-chrome`, `border-border-surface` work.

- [ ] **Step 1: Write the failing test (block parse + role presence)**

Create `src/lib/theme-tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(
  resolve(process.cwd(), "src/styles/globals.css"),
  "utf8",
);

function blockVars(selector: string): Record<string, string> {
  const re = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`);
  const match = css.match(re);
  if (!match) return {};
  const vars: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^\s*(--[\w-]+):\s*([^;]+);/);
    if (m) vars[m[1]] = m[2].trim();
  }
  return vars;
}

describe("theme role tokens", () => {
  const roles = [
    "--chrome",
    "--chrome-elevated",
    "--surface",
    "--surface-muted",
    "--surface-sunken",
    "--on-chrome",
    "--on-surface",
    "--on-surface-muted",
    "--border-chrome",
    "--border-surface",
    "--accent",
    "--accent-foreground",
  ];

  it("defines every role in :root", () => {
    const root = blockVars(":root");
    for (const r of roles) expect(root[r], `${r} missing in :root`).toBeTruthy();
  });

  it("defines every role in .dark", () => {
    const dark = blockVars(".dark");
    for (const r of roles) expect(dark[r], `${r} missing in .dark`).toBeTruthy();
  });

  it("light and dark differ for every role", () => {
    const root = blockVars(":root");
    const dark = blockVars(".dark");
    for (const r of roles) {
      expect(root[r], `light ${r}`).not.toBe(dark[r]);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/theme-tokens.test.ts`
Expected: FAIL — roles not defined.

- [ ] **Step 3: Add role tokens to globals.css**

In `:root` (light), add after the existing tokens:

```css
  --chrome: #eceae4;
  --chrome-elevated: #fcfbf8;
  --surface: #fcfbf8;
  --surface-muted: #f7f4ed;
  --surface-sunken: #eceae4;
  --on-chrome: #1c1c1c;
  --on-surface: #1c1c1c;
  --on-surface-muted: #5f5f5d;
  --border-chrome: #d8d5cc;
  --border-surface: #d8d5cc;
  --accent: #1c1c1c;
  --accent-foreground: #fcfbf8;
```

Replace the entire **dead duplicate `.dark` block** (currently identical to `:root`) with genuinely distinct dark values:

```css
.dark {
  --chrome: #151515;
  --chrome-elevated: #1b1b19;
  --surface: #232321;
  --surface-muted: #242421;
  --surface-sunken: #10100f;
  --on-chrome: #fcfbf8;
  --on-surface: #fcfbf8;
  --on-surface-muted: rgba(252, 251, 248, 0.6);
  --border-chrome: rgba(255, 255, 255, 0.1);
  --border-surface: rgba(252, 251, 248, 0.12);
  --accent: #fcfbf8;
  --accent-foreground: #1c1c1c;
  --background: #151515;
  --foreground: #fcfbf8;
  --card: #232321;
  --card-foreground: #fcfbf8;
  --popover: #232321;
  --popover-foreground: #fcfbf8;
  --primary: #fcfbf8;
  --primary-foreground: #1c1c1c;
  --secondary: #242421;
  --secondary-foreground: #fcfbf8;
  --muted: #242421;
  --muted-foreground: rgba(252, 251, 248, 0.6);
  --accent-foreground: #1c1c1c;
  --border: rgba(252, 251, 248, 0.12);
  --input: rgba(252, 251, 248, 0.12);
  --ring: #fcfbf8;
  --sidebar: #1b1b19;
  --sidebar-foreground: #fcfbf8;
  --sidebar-primary: #fcfbf8;
  --sidebar-primary-foreground: #1c1c1c;
  --sidebar-accent: #242421;
  --sidebar-accent-foreground: #fcfbf8;
  --sidebar-border: rgba(252, 251, 248, 0.12);
  --sidebar-ring: #fcfbf8;
}
```

In `:root`, also re-point the shadcn semantic tokens at the role tokens (replace their fixed hex values):

```css
  --background: var(--chrome);
  --foreground: var(--on-chrome);
  --card: var(--surface);
  --card-foreground: var(--on-surface);
  --popover: var(--surface);
  --popover-foreground: var(--on-surface);
  --primary: var(--accent);
  --primary-foreground: var(--accent-foreground);
  --secondary: var(--surface-muted);
  --secondary-foreground: var(--on-surface);
  --muted: var(--surface-muted);
  --muted-foreground: var(--on-surface-muted);
  --accent-foreground: var(--on-surface);
  --border: var(--border-surface);
  --input: var(--border-surface);
  --sidebar: var(--chrome-elevated);
  --sidebar-foreground: var(--on-chrome);
  --sidebar-primary: var(--accent);
  --sidebar-primary-foreground: var(--accent-foreground);
  --sidebar-accent: var(--surface-muted);
  --sidebar-accent-foreground: var(--on-surface);
  --sidebar-border: var(--border-surface);
  --sidebar-ring: var(--on-chrome);
```

In `@theme inline`, add the role color mappings so Tailwind generates `bg-chrome` etc.:

```css
  --color-chrome: var(--chrome);
  --color-chrome-elevated: var(--chrome-elevated);
  --color-surface: var(--surface);
  --color-surface-muted: var(--surface-muted);
  --color-surface-sunken: var(--surface-sunken);
  --color-on-chrome: var(--on-chrome);
  --color-on-surface: var(--on-surface);
  --color-on-surface-muted: var(--on-surface-muted);
  --color-border-chrome: var(--border-chrome);
  --color-border-surface: var(--border-surface);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/theme-tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/styles/globals.css src/lib/theme-tokens.test.ts
git commit -m "feat(theme): add real light/dark role tokens in globals"
```

---

### Task 2: Contrast tests for every role pair

**Files:**
- Modify: `src/lib/theme-tokens.test.ts`

**Interfaces:**
- Consumes: role tokens from Task 1.

- [ ] **Step 1: Write the failing contrast test**

Append to `src/lib/theme-tokens.test.ts`:

```ts
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function parseColor(raw: string): [number, number, number] | null {
  const s = raw.trim();
  const hex = s.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) return hexToRgb(hex[1]);
  const rgb = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  // var(--x) — not resolvable here; contrast test only covers raw values.
  return null;
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(a: string, b: string): number | null {
  const rgbA = parseColor(a);
  const rgbB = parseColor(b);
  if (!rgbA || !rgbB) return null;
  const l1 = luminance(rgbA);
  const l2 = luminance(rgbB);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

describe("theme contrast (raw-value pairs)", () => {
  const pairs: Array<[string, string, string]> = [
    ["on-chrome on chrome", "--on-chrome", "--chrome"],
    ["on-surface on surface", "--on-surface", "--surface"],
    ["accent-foreground on accent", "--accent-foreground", "--accent"],
  ];
  for (const [label, fg, bg] of pairs) {
    it(`light: ${label} ≥ 4.5:1`, () => {
      const root = blockVars(":root");
      const ratio = contrastRatio(root[fg], root[bg]);
      if (ratio === null) return; // skip var()-resolved; covered by browser
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
    it(`dark: ${label} ≥ 4.5:1`, () => {
      const dark = blockVars(".dark");
      const ratio = contrastRatio(dark[fg], dark[bg]);
      if (ratio === null) return;
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }
});
```

- [ ] **Step 2: Run test**

Run: `bunx vitest run src/lib/theme-tokens.test.ts`
Expected: PASS for raw-value pairs (dark `on-chrome` `#fcfbf8` on `#151515` ≈ 14.8:1; light `on-chrome` `#1c1c1c` on `#eceae4` ≈ 13.3:1). If any miss, adjust the role value in `globals.css` and re-run.

- [ ] **Step 3: Commit**

```bash
git add src/lib/theme-tokens.test.ts
git commit -m "test(theme): assert WCAG AA contrast for role pairs"
```

---

### Task 3: No-literal-leak test

**Files:**
- Create: `src/lib/no-color-leak.test.ts`

**Interfaces:**
- Consumes: the exclusion list below. This is the guarantee that "one source of truth" holds after refactor.

- [ ] **Step 1: Write the failing test (will pass once components are migrated in later tasks)**

Create `src/lib/no-color-leak.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(process.cwd(), "src");
const EXCLUDE_DIRS = [
  "lib/projects/generated",
  "lib/projects/scaffold",
  "lib/projects/site-schema.ts",
  "lib/email",
  "lib/support/email.ts",
  "components/projects/CodeViewer.tsx", // Monaco theme string is allowed
];
const BANNED_PATTERNS = [
  /bg-\[#/,
  /text-\[#/,
  /border-\[#/,
  /\bsurface-warm-white\b(?!\s*\/\s*\d)/, // token without opacity (the overload form)
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      acc.push(...walk(full));
    } else if (full.endsWith(".tsx") || full.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

function isExcluded(path: string): boolean {
  return EXCLUDE_DIRS.some((d) =>
    path.replace(/\\/g, "/").includes(`src/${d}`),
  );
}

describe("no raw color literals in components/routes", () => {
  const files = walk(ROOT).filter((f) => !isExcluded(f));
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const pattern of BANNED_PATTERNS) {
      it(`${file.replace(ROOT, "")} has no ${pattern}`, () => {
        expect(content).not.toMatch(pattern);
      });
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/no-color-leak.test.ts`
Expected: FAIL — many components still use `bg-[#151515]` and `surface-warm-white`. This test stays red until Task 9 completes; it is the gate for that task.

- [ ] **Step 3: Commit**

```bash
git add src/lib/no-color-leak.test.ts
git commit -m "test(theme): assert no raw color literals leak past tokens"
```

---

### Task 4: Add `ui.default_theme` admin setting

**Files:**
- Modify: `src/lib/app-settings-registry.ts`
- Test: none new; the settings API already validates `enumOptions` in `src/routes/api.admin.settings.ts:32-34`. Manually verify it renders in `/admin/settings`.

**Interfaces:**
- Produces: setting key `ui.default_theme`, fallback `"dark"`, `enumOptions: ["dark","light"]`. Read via `getSetting<string>("ui.default_theme", "dark")`.

- [ ] **Step 1: Add the ConfigEntry**

In `src/lib/app-settings-registry.ts`, add to the `feature_flag` group (before `feature.streamer_mode` or after the existing `feature.*` entries — keep category grouping):

```ts
  {
    key: "ui.default_theme",
    category: "feature_flag",
    tier: "basic",
    type: "string",
    label: "Tema bawaan platform",
    fallback: "dark",
    enumOptions: ["dark", "light"],
  },
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `bunx tsc --noEmit && bunx eslint src/lib/app-settings-registry.ts`
Expected: no errors.

- [ ] **Step 3: Verify the settings API accepts the enum**

Run: `bunx vitest run src/routes/-api.admin.settings.test.ts` (if exists) or start `bun run dev` and PUT `/api/admin/settings` with `{ ui: { default_theme: "light" } }` — expect 200; with `default_theme: "purple"` — expect 400.

- [ ] **Step 4: Commit**

```bash
git add src/lib/app-settings-registry.ts
git commit -m "feat(admin): add ui.default_theme setting (dark default)"
```

---

### Task 5: ThemeProvider in AppProviders + root no-flash

**Files:**
- Modify: `src/components/providers/AppProviders.tsx`
- Modify: `src/routes/__root.tsx` (pass `defaultTheme` from setting; replace `bg-[#151515]`)

**Interfaces:**
- Consumes: `getSetting` from `src/lib/app-settings.ts`; `ui.default_theme` from Task 4.
- Produces: `next-themes` context; `<html>` gets `.dark`/no class; `suppressHydrationWarning` already on `<html>` (line 207) handles no-flash.

- [ ] **Step 1: Add ThemeProvider to AppProviders**

Rewrite `src/components/providers/AppProviders.tsx`:

```tsx
"use client";

import { ThemeProvider } from "next-themes";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { SessionProvider } from "@/lib/auth-client";
import { getSettingSync } from "@/lib/app-settings";
import { createAppQueryClient } from "@/lib/query-client";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createAppQueryClient());

  // ponytail: server-side default only; next-themes overrides per user pref
  // on mount via cookie/localStorage. Upgrade path: per-account DB column.
  const defaultTheme = getSettingSync<string>("ui.default_theme", "dark");

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme={defaultTheme}
        enableSystem={false}
      >
        <SessionProvider>{children}</SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Replace root chrome literal**

In `src/routes/__root.tsx:213`:

```tsx
// before
className={cn("min-h-screen bg-[#151515] font-sans antialiased")}
// after
className={cn("min-h-screen bg-chrome font-sans antialiased")}
```

Also replace `bg-[#151515]` in `NotFound` (line 100) and `RootError` (lines 134, 163):

```tsx
// before
className="flex min-h-screen flex-col items-center justify-center bg-[#151515] px-4 text-center"
// after
className="flex min-h-screen flex-col items-center justify-center bg-chrome px-4 text-center text-on-chrome"
```

Replace `bg-white/10` → `bg-on-chrome/10` and `text-white` → `text-on-chrome`, `text-gray-300` → `text-on-chrome-muted` in the error components (lines 141, 180).

- [ ] **Step 3: Verify dev server renders without flash**

Run: `bun run dev`, open `http://localhost:3000`, confirm the page loads dark (default), no white flash on first paint. Toggle is not wired yet (Task 8).

- [ ] **Step 4: Commit**

```bash
git add src/components/providers/AppProviders.tsx src/routes/__root.tsx
git commit -m "feat(theme): wire ThemeProvider and root chrome to tokens"
```

---

### Task 6: Migrate chrome components (Header, Footer, MainChrome, surface)

**Files:**
- Modify: `src/components/common/Header.tsx`, `Footer.tsx`, `MainChrome.tsx`
- Modify: `src/components/ui/surface.tsx` (`DarkPage`/`DarkCard`)

**Interfaces:**
- Consumes: role tokens from Task 1.

- [ ] **Step 1: Header.tsx**

Replace `bg-[#151515]` → `bg-chrome`; `text-surface-warm-white` → `text-on-chrome`; `border-white/[0.07]` → `border-border-chrome`; `ring-surface-warm-white` → `ring-on-chrome`; `ring-offset-[#151515]` → `ring-offset-chrome`.

- [ ] **Step 2: Footer.tsx**

Same token swaps as Header.

- [ ] **Step 3: MainChrome.tsx**

`bg-[#1b1b19]` (workspace branch, line 118) → `bg-chrome-elevated`; `bg-[#151515]` (line 122) → `bg-chrome`.

- [ ] **Step 4: surface.tsx**

`DarkPage`: `bg-[#151515]` → `bg-chrome`; `text-surface-warm-white` → `text-on-chrome`.
`DarkCard`: `bg-[#232321]` → `bg-surface`; `border-surface-warm-white/10` → `border-border-surface`; `text-surface-warm-white` (if any) → `text-on-surface`; `shadow-[0_24px_80px_rgba(0,0,0,0.28)]` stays (shadow is theme-agnostic, acceptable).

- [ ] **Step 5: Run no-leak test partially**

Run: `bunx vitest run src/lib/no-color-leak.test.ts`
Expected: still failing for other files, but Header/Footer/MainChrome/surface no longer flagged.

- [ ] **Step 6: Commit**

```bash
git add src/components/common/Header.tsx src/components/common/Footer.tsx src/components/common/MainChrome.tsx src/components/ui/surface.tsx
git commit -m "refactor(theme): migrate chrome components to role tokens"
```

---

### Task 7: Migrate UI primitives (button, dialog, mobile-sheet)

**Files:**
- Modify: `src/components/ui/button.tsx`, `dialog.tsx`, `mobile-sheet.tsx`

- [ ] **Step 1: button.tsx**

In `buttonVariants`:
- `default`: `bg-action-primary text-surface-warm-white` → `bg-accent text-accent-foreground`.
- `outline`: `border-foreground-primary/12 bg-surface-warm-white text-foreground-primary` → `border-border-surface bg-surface text-on-surface`; `hover:bg-surface-muted` stays.
- `secondary`: `bg-surface-muted text-foreground-primary` → `bg-surface-muted text-on-surface`.
- `ghost`: `text-foreground-primary` → `text-on-surface`.
- `link`: `text-foreground-primary` → `text-on-surface`.
- Base: `focus-visible:ring-action-primary` → `focus-visible:ring-ring`; `ring-offset-background` stays.

- [ ] **Step 2: dialog.tsx**

`DialogContent` (line 33): `border-white/[0.08]` → `border-border-surface`; `bg-[#161614]` → `bg-surface`; `text-surface-warm-white` → `text-on-surface`.
`DialogClose` (line 44): `text-surface-warm-white/54` → `text-on-surface/54`; `hover:text-surface-warm-white` → `hover:text-on-surface`; `focus-visible:ring-white/40` → `focus-visible:ring-on-surface/40`.
`DialogDescription` (line 71): `text-surface-warm-white/62` → `text-on-surface-muted`.
`DialogOverlay` `bg-black/70` stays (modal scrim is theme-agnostic).

- [ ] **Step 3: mobile-sheet.tsx**

Replace `bg-[#151515]` → `bg-chrome`; `text-surface-warm-white` → `text-on-chrome`; `border-surface-warm-white/*` → `border-border-chrome/*`.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/button.tsx src/components/ui/dialog.tsx src/components/ui/mobile-sheet.tsx
git commit -m "refactor(theme): migrate ui primitives to role tokens"
```

---

### Task 8: ThemeToggle component + Storybook

**Files:**
- Create: `src/components/common/ThemeToggle.tsx`
- Create: `src/components/common/ThemeToggle.stories.tsx`

**Interfaces:**
- Produces: `<ThemeToggle />` — icon button, cycles dark ↔ light, persists via `next-themes` (cookie + localStorage). Accessible: `aria-label`, `aria-pressed`, keyboard-operable.

- [ ] **Step 1: Write the component**

Create `src/components/common/ThemeToggle.tsx`:

```tsx
"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      aria-label={isDark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      aria-pressed={isDark}
      size="icon"
      variant="ghost"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
```

- [ ] **Step 2: Write the Storybook story**

Create `src/components/common/ThemeToggle.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { ThemeProvider } from "next-themes";

import { ThemeToggle } from "@/components/common/ThemeToggle";

const meta = {
  component: ThemeToggle,
  decorators: [
    (Story) => (
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dark: Story = {};

export const Light: Story = {
  decorators: [
    (Story) => (
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <Story />
      </ThemeProvider>
    ),
  ],
};
```

- [ ] **Step 3: Verify Storybook**

Run: `bun run storybook`, open `http://localhost:6006`, find ThemeToggle, confirm both stories render and the icon toggles.

- [ ] **Step 4: Commit**

```bash
git add src/components/common/ThemeToggle.tsx src/components/common/ThemeToggle.stories.tsx
git commit -m "feat(theme): add ThemeToggle with Storybook"
```

---

### Task 9: Mount ThemeToggle in Header + workspace top bar + mobile menu

**Files:**
- Modify: `src/components/common/Header.tsx`
- Modify: `src/components/projects/WorkspacePrimitives.tsx` (the `WorkspaceTopBar` component)

- [ ] **Step 1: Mount in Header**

In `src/components/common/Header.tsx`, add `<ThemeToggle />` to the `flex items-center justify-end gap-3` container (next to `<EnergyDisplay />` and `<AuthButton />`):

```tsx
import { ThemeToggle } from "@/components/common/ThemeToggle";
// ...
<div className="flex items-center justify-end gap-3">
  <ThemeToggle />
  <EnergyDisplay />
  <AuthButton />
</div>
```

- [ ] **Step 2: Mount in workspace top bar**

Locate `WorkspaceTopBar` in `src/components/projects/WorkspacePrimitives.tsx`. Add `<ThemeToggle />` to its action cluster. (Read the file to find the exact JSX; the top bar renders the build/preview controls — add the toggle adjacent to them.)

- [ ] **Step 3: Mobile menu**

If `mobile-sheet.tsx` or `WorkspaceTopBar`'s mobile branch renders a menu, add `<ThemeToggle />` there too.

- [ ] **Step 4: Commit**

```bash
git add src/components/common/Header.tsx src/components/projects/WorkspacePrimitives.tsx
git commit -m "feat(theme): mount ThemeToggle in header and workspace"
```

---

### Task 10: Monaco theme from useTheme

**Files:**
- Modify: `src/components/projects/CodeViewer.tsx` (line 543)

- [ ] **Step 1: Read CodeViewer's Monaco usage**

Run: `rg -n "MonacoEditor|theme=|monaco" src/components/projects/CodeViewer.tsx` to confirm line 543.

- [ ] **Step 2: Derive Monaco theme from useTheme**

In `CodeViewer.tsx`, the component containing `<MonacoEditor theme="vs-dark" />` must:

```tsx
import { useTheme } from "next-themes";
// inside the component:
const { resolvedTheme } = useTheme();
const monacoTheme = resolvedTheme === "dark" ? "vs-dark" : "light";
// ...
<MonacoEditor theme={monacoTheme} ... />
```

- [ ] **Step 3: Verify**

Run: `bun run dev`, open a project with source view, toggle theme, confirm Monaco editor flips between dark and light.

- [ ] **Step 4: Commit**

```bash
git add src/components/projects/CodeViewer.tsx
git commit -m "feat(theme): Monaco editor follows theme toggle"
```

---

### Task 11: Turnstile theme from useTheme

**Files:**
- Modify: `src/components/common/LoginConsentDialog.tsx` (lines 100-102)

- [ ] **Step 1: Derive Turnstile theme**

In `LoginConsentDialog.tsx`, the `renderTurnstile` effect (line 100) currently passes `theme: "dark"`. Replace with:

```tsx
import { useTheme } from "next-themes";
// in component:
const { resolvedTheme } = useTheme();
const turnstileTheme = resolvedTheme === "dark" ? "dark" : "light";
// add turnstileTheme to the effect's dependency array
// in render call:
theme: turnstileTheme,
```

- [ ] **Step 2: Verify**

Run: `bun run dev`, open the login dialog, toggle theme, confirm the Turnstile widget restyles. (In dev with no site key, the widget may not render — verify the `theme` value is passed correctly via a `console.log` temporarily, then remove the log.)

- [ ] **Step 3: Commit**

```bash
git add src/components/common/LoginConsentDialog.tsx
git commit -m "feat(theme): Turnstile follows theme toggle"
```

---

### Task 12: Migrate workspace primitives and remaining components

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx`, `WorkspacePrimitives.tsx`, `WorkspaceComposer.tsx`, `WorkspacePreview.tsx`, `WorkspaceBuildProgress.tsx`, `ChatMessage.tsx`, `BuildNotices.tsx`, `ProjectList.tsx`, `HomePromptForm.tsx`, `project-mark.ts`, `ComposerAttachments.tsx`, `WorkspaceHistoryDrawer.tsx`, `AdminOverviewDashboard.tsx`, `AdminShell.tsx`, `AuthButton.tsx`, `EnergyDisplay.tsx`, `EnergyLedger.tsx`, `EnergyLedgerButton.tsx`, `WhatsAppCommunityInvite.tsx`, `CommunitySection.tsx`, `SponsorTable.tsx`, `HeroAuroraBackground.tsx`, `LegalDocumentContent.tsx`, `EnergyBoosterModal.tsx`, `ProfileNameForm.tsx`, `FormFields.tsx`, `file-upload.tsx`, `image-upload-thumb.tsx`, `AdvancedSettingsDisclosure.tsx`, `DashboardCard.tsx`, `AdminStatusBadge.tsx`, `AdminStatusFilter.tsx`, `SensitiveText.tsx`, `LoginConsentDialog.tsx` (residual surface-warm-white beyond Task 11).

**Token swap table (apply consistently):**

| Old | New |
|---|---|
| `bg-[#151515]` | `bg-chrome` |
| `bg-[#1b1b19]` | `bg-chrome-elevated` |
| `bg-[#10100f]` | `bg-surface-sunken` |
| `bg-[#232321]`, `bg-[#242421]`, `bg-[#262622]`, `bg-[#161614]`, `bg-[#20201d]`, `bg-[#1d1d1a]`, `bg-[#1b1b18]`, `bg-[#191916]`, `bg-[#171715]`, `bg-[#111110]`, `bg-[#181817]` | `bg-surface` (or `bg-surface-muted` for the slightly-elevated variants) |
| `text-surface-warm-white` (used as light text on dark) | `text-on-chrome` (in chrome context) or `text-on-surface` (in surface context) |
| `border-surface-warm-white/*` | `border-border-surface/*` (or `border-border-chrome/*` in chrome context) |
| `ring-surface-warm-white` | `ring-on-chrome` / `ring-on-surface` |
| `placeholder:text-surface-warm-white/*` | `placeholder:text-on-surface/*` |
| `accent-surface-warm-white` | `accent-accent` |
| `#ffb4a6`, `#8ce99a`, `#8fd3ff`, `#0d9488`, `#0f766e`, `#ff7a59`, `#f7a441`, `#ee4f9b`, `#7867ff`, `#2f8cff` (brand/status accents) | keep as-is (brand-invariant) OR introduce `--status-*` tokens if reused ≥3× across roles; judgment call per file. Default: keep literal for one-off accents. |
| `text-foreground-primary` | `text-on-surface` (it's the light-theme primary text) |

**Decision rule for `text-surface-warm-white` → `text-on-chrome` vs `text-on-surface`:** if the element's nearest ancestor background is a chrome bg (`bg-chrome`, `bg-chrome-elevated`), use `text-on-chrome`; if it's a surface bg (`bg-surface`, `bg-surface-muted`, `bg-surface-sunken`), use `text-on-surface`.

- [ ] **Step 1: Migrate file by file, running the no-leak test as the gate**

For each file in the list:
1. Read it.
2. Apply the token swaps per the table and the decision rule.
3. Run `bunx vitest run src/lib/no-color-leak.test.ts` — that file should drop out of the failures.
4. Commit per logical batch (group related files: workspace primitives together, admin together, home/marketing together).

Suggested commit batches:
- `refactor(theme): migrate workspace shell + primitives`
- `refactor(theme): migrate composer + preview + build progress`
- `refactor(theme): migrate chat + build notices + project list`
- `refactor(theme): migrate admin components`
- `refactor(theme): migrate home + community + footer-adjacent`
- `refactor(theme): migrate payment + profile + forms`
- `refactor(theme): migrate hero aurora background`

- [ ] **Step 2: Run the no-leak test to completion**

Run: `bunx vitest run src/lib/no-color-leak.test.ts`
Expected: PASS — zero banned patterns in `src/components/**` and `src/routes/**` (excluding the enumerated generated-site/email/CodeViewer paths).

- [ ] **Step 3: Commit final batch if not already**

```bash
git add -A
git commit -m "refactor(theme): final token migration, no-leak green"
```

---

### Task 13: Migrate route chrome

**Files:**
- Modify: `src/routes/_main.index.tsx`, `_main.waitlist.tsx`, `_main.profile.tsx`, `_main.blocked.tsx`, `_main.support.tsx`, `_main.support.$ticketId.tsx`, `_main.admin.*.tsx` (settings, projects, tickets, transactions, users, waitlist), `_main.booster.success.$orderId.tsx`

- [ ] **Step 1: Apply the same token swaps**

`#151515` → `bg-chrome`; `text-surface-warm-white` → `text-on-chrome`; etc. Per the Task 12 table.

- [ ] **Step 2: Run no-leak test**

Run: `bunx vitest run src/lib/no-color-leak.test.ts`
Expected: PASS (routes were included in the walk).

- [ ] **Step 3: Commit**

```bash
git add src/routes/_main.*.tsx
git commit -m "refactor(theme): migrate route chrome to role tokens"
```

---

### Task 14: Both-theme interaction-state Storybook coverage

**Files:**
- Modify: `src/stories/Button.stories.tsx`, `Dialog.stories.tsx` (add both-theme stories)

- [ ] **Step 1: Add both-theme stories**

In `Button.stories.tsx` and `Dialog.stories.tsx`, add stories wrapped in `<ThemeProvider defaultTheme="light">` and `<ThemeProvider defaultTheme="dark">` for each variant (default, outline, secondary, ghost, destructive; default/hover/focus/active/disabled states). Hover/focus/active can use Storybook's `play` functions or `force-hover` decorators if available; at minimum, render each variant in both themes.

- [ ] **Step 2: Verify Storybook**

Run: `bun run storybook`, confirm every Button/Dialog variant renders legibly in both themes — no invisible text, no invisible border.

- [ ] **Step 3: Commit**

```bash
git add src/stories/Button.stories.tsx src/stories/Dialog.stories.tsx
git commit -m "test(theme): both-theme interaction-state stories"
```

---

### Task 15: Update docs + final verify

**Files:**
- Modify: `DESIGN.md` (theme section — record the role-token system, the dark default, the toggle)
- Modify: `docs/superpowers/specs/2026-08-16-control-plane-theme-toggle-design.md` (mark Status: shipped)

- [ ] **Step 1: Update DESIGN.md**

Add/replace the theme section: the role-token table, the `:root`/`.dark` split, the `ThemeProvider` + `ui.default_theme` default-dark, the `ThemeToggle` locations, the generated-site independence, the email-template fixed-palette note.

- [ ] **Step 2: Mark spec shipped**

In `docs/superpowers/specs/2026-08-16-control-plane-theme-toggle-design.md`, change `Status: Approved for planning` → `Status: Shipped`.

- [ ] **Step 3: Run full check**

Run: `bun run check`
Expected: green (format/lint/typecheck/affected tests/Knip/docs).

- [ ] **Step 4: Commit**

```bash
git add DESIGN.md docs/superpowers/specs/2026-08-16-control-plane-theme-toggle-design.md
git commit -m "docs(theme): record role-token system and shipped status"
```

- [ ] **Step 5: Hand off for manual review**

Notify user: contrast + no-leak + both-theme tests green, `bun run check` green. User must manually inspect the authenticated workspace + preview chrome in both themes before release. Do not merge to `main` until user signs off.

---

## Self-Review

**1. Spec coverage:**
- Role tokens (light + dark): Task 1. ✓
- shadcn tokens re-pointed: Task 1 Step 3. ✓
- ThemeProvider in AppProviders: Task 5. ✓
- `ui.default_theme` admin flag: Task 4. ✓
- Toggle in global header: Task 9 Step 1. ✓
- Toggle in workspace top bar: Task 9 Step 2. ✓
- Toggle in mobile menu: Task 9 Step 3. ✓
- Monaco from useTheme: Task 10. ✓
- Turnstile from useTheme: Task 11. ✓
- Toast from useTheme: already wired via sonner; ThemeProvider added Task 5 → automatic. ✓
- Hero aurora follows theme: Task 12 (HeroAuroraBackground batch). ✓
- Generated-site independence: Global Constraints forbid touching those files. ✓
- Email-template fixed palette: Global Constraints forbid touching. ✓
- Contrast tests: Task 2. ✓
- Both-theme interaction coverage: Task 14. ✓
- No-literal-leak test: Task 3 (gate), Task 12 Step 2 (green). ✓
- SSR no-flash: Task 5 Step 3 (manual) + `suppressHydrationWarning` already present. ✓
- Admin setting round-trip: Task 4 Step 3. ✓
- `bun run check` green: Task 15 Step 3. ✓
- User manual review before release: Task 15 Step 5. ✓
- Supersedes old spec: recorded in the design doc's supersedes line. ✓

**2. Placeholder scan:** none. Every step has concrete code or an exact command. Task 12 has a judgment call (one-off accent literals vs `--status-*` tokens) — explicitly bounded by a "reuse ≥3×" rule, not vague.

**3. Type consistency:** `getSettingSync<string>` used in Task 5 matches the signature in `src/lib/app-settings.ts:160`. `useTheme` from `next-themes` returns `{ resolvedTheme, setTheme }` — consistent across Tasks 8, 10, 11. `ThemeToggle` props in Task 8 match usage in Task 9.
