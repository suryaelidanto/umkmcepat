# Control-plane dark/light theme toggle — design

- **Date:** 2026-08-16
- **Status:** Approved for planning (implementation not started)
- **Scope:** Control-plane UI only — root chrome, public pages, waitlist,
  profile, legal, support, admin, workspace, preview chrome, code viewer,
  toast, Storybook. Generated customer sites + preview iframe stay
  independent.
- **Supersedes:** `docs/superpowers/specs/2026-07-25-polish-security-design.md`
  decision line 1 ("dark chrome by design") and line 82 ("theme toggle out of
  scope"). That decision is reversed here: the chrome becomes theme-aware and
  a toggle is added. The old spec is not rewritten — it stands as the
  decision trail for the dark-first era; this spec records the reversal.

## Problem

The audit (`/tmp/umkmcepat-theme-handoff.md`) framed the platform as
"dark-first." That framing is wrong. The actual state is two parallel color
systems bolted together:

1. **Token layer (`src/styles/globals.css`)** — `:root` and `.dark` both
   define identical *light* values (`--background: #eceae4`,
   `--foreground: #1c1c1c`, `--card: #fcfbf8`, …). The `.dark` block is a
   dead duplicate; it does nothing. There is no functioning dark token theme.
2. **Chrome literals** — the "dark" look is produced by hardcoded hex
   literals painted directly on chrome routes and components:
   `bg-[#151515]` on `__root.tsx`, `MainChrome.tsx`, `Header.tsx`,
   `Footer.tsx`, `surface.tsx` (`DarkPage`/`DarkCard`), and dozens of
   workspace primitives (`#1b1b19`, `#10100f`, `#232321`, `#242421`,
   `#262622`). On these dark surfaces, light text is achieved by reusing the
   cream *surface* token `text-surface-warm-white` as if it were a text
   color — so one token holds two roles (cream surface fill *and* light text
   on dark chrome). This is the role-overload the audit flagged.

Consequence: there is no real dark theme to "preserve." There is a light
token system with dark chrome bolted on top, with the cream surface token
doubly-overloaded. A global color inversion would be unsafe precisely because
the same token name is used for two opposing roles depending on context.

## Goal

One source of truth per surface role, with distinct light and dark values, so
that toggling `.dark` on `<html>` flips the entire control-plane palette
cleanly — buttons, text, borders, inputs, dialogs, workspace, preview chrome,
code viewer, toast — without any literal override anywhere in the tree.

### Non-goals

- No layout, typography, spacing, copy, animation, or product-logic changes.
- No generated-customer-site theming. `src/lib/projects/generated-site-theme.ts`,
  `shadcn-theme.ts`, `site-schema.ts`, and the preview iframe stay untouched.
- No server-side per-account theme persistence in this pass (user pref is
  `next-themes` client storage only). Upgrade path noted below.
- No email-template theming (`src/lib/email/templates/*`, `src/lib/support/email.ts`).
  Email clients cannot consume CSS variables; templates keep a fixed palette
  but are tokenized for consistency, not themeability.

## Architecture

### One source of truth: semantic role tokens

Replace the role-overloaded `surface-warm-white` and the hardcoded chrome
literals with a small set of **semantic role tokens**. Each role has a light
value and a dark value. Components reference roles, never raw hex and never
the doubly-overloaded surface name.

Proposed role set (final names settled in the implementation plan, but the
roles are fixed):

| Role token | Light value | Dark value | Used for |
|---|---|---|---|
| `--chrome` | `#eceae4` | `#151515` | page background, header/footer, root chrome |
| `--chrome-elevated` | `#fcfbf8` | `#1b1b19` | main content area on dark chrome (workspace shell) |
| `--surface` | `#fcfbf8` | `#232321` | cards, dialogs, panels |
| `--surface-muted` | `#f7f4ed` | `#242421` | muted panels, secondary surfaces |
| `--surface-sunken` | `#eceae4` | `#10100f` | code/preview wells, recessed areas |
| `--on-chrome` | `#1c1c1c` | `#fcfbf8` | primary text on chrome (replaces `surface-warm-white`-as-text) |
| `--on-surface` | `#1c1c1c` | `#fcfbf8` | primary text on surface |
| `--on-surface-muted` | `#5f5f5d` | `#fcfbf8` at `/60` | secondary text |
| `--border-chrome` | `#d8d5cc` | `#ffffff` at `/10` | chrome borders |
| `--border-surface` | `#d8d5cc` | `#fcfbf8` at `/12` | surface borders |
| `--accent` | `#1c1c1c` | `#fcfbf8` | primary action bg |
| `--accent-foreground` | `#fcfbf8` | `#1c1c1c` | primary action text |

The existing shadcn semantic tokens (`--background`, `--foreground`,
`--card`, `--popover`, `--primary`, `--secondary`, `--muted`,
`--accent`, `--border`, `--input`, `--ring`, `--destructive`,
`--sidebar-*`) are re-pointed to reference these role tokens, so all shadcn
primitives (Button, Dialog, Input, etc.) inherit both themes automatically.

Brand/aurora tokens (`--aurora-orange`, `--aurora-rose`, `--aurora-violet`,
`--aurora-blue`, `--aurora-gold`) stay theme-invariant — they're the brand
voice. Opacity modifiers on them may need per-theme review.

### Two real theme blocks

`globals.css` gets:

```css
:root {
  /* light values for every role + shadcn tokens pointed at roles */
}
.dark {
  /* dark values for every role + shadcn tokens pointed at roles */
}
```

The current dead duplicate `.dark` block is replaced with genuinely distinct
dark values. `@theme inline` keeps mapping `--color-*` to the role tokens so
Tailwind classes (`bg-chrome`, `text-on-chrome`, `border-border-surface`) work.

### ThemeProvider

`next-themes` is already a dependency and already consumed by
`src/components/ui/sonner.tsx`, but
`src/components/providers/AppProviders.tsx` does not wrap `ThemeProvider`.
Add it:

```tsx
<ThemeProvider attribute="class" defaultTheme={defaultTheme} enableSystem={false}>
```

- `attribute="class"` → toggles `.dark` on `<html>`.
- `enableSystem={false}` → no surprise OS switching (user explicitly wants a
  manual choice). System preference can be added later if requested.
- `defaultTheme` comes from the admin `ui.default_theme` setting (next section).
- Persistence: `next-themes` cookie + localStorage (built-in). Cookie enables
  SSR no-flash.

### Admin default-theme flag

Add one `ConfigEntry` to `src/lib/app-settings-registry.ts`:

```ts
{
  key: "ui.default_theme",
  category: "feature_flag",
  tier: "basic",
  type: "string",
  label: "Tema bawaan platform",
  fallback: "dark",
  enumOptions: ["dark", "light"],
}
```

The settings registry already auto-renders enum selects in `/admin/settings`,
so the toggle appears with zero UI work. Server reads the setting at root
render and passes it to `ThemeProvider` as `defaultTheme`. User's local
`next-themes` choice overrides the admin default once they toggle.

### Toggle UI

- **Global header** (`Header.tsx`) — desktop + mobile. One `ThemeToggle`
  component (icon button, cycles or menu dark/light). Reusable, Storybook'd.
- **Workspace top bar + mobile menu** — workspace bypasses the global header
  (see `MainChrome.tsx` workspace branch), so the same `ThemeToggle` is mounted
  in the workspace top bar and mobile menu too.

### Theme-sensitive third-party bits

- **Monaco** (`src/components/projects/CodeViewer.tsx:543`) — currently
  `theme="vs-dark"`. Derive from `useTheme()`: `"dark"` → `vs-dark`,
  `"light"` → `light` (or a custom named theme matching the palette).
- **Turnstile** (`src/components/common/LoginConsentDialog.tsx:101`) —
  currently `theme: "dark"`. Derive from `useTheme()`. The Turnstile
  `render()` options already accept `"auto" | "dark" | "light"`; re-render on
  theme change (the effect already re-runs on dependency change — add theme).
- **Toast** (`src/components/ui/sonner.tsx`) — already wired to `useTheme()`;
  once `ThemeProvider` exists, toasts inherit automatically.
- **Hero aurora** (`HeroAuroraBackground.tsx`, `globals.css` `.hero-aurora-*`)
  — hardcoded `#151515` orb base. Point at `--chrome` so the hero chrome
  follows the theme; the aurora colors themselves stay brand-invariant.

### Generated-site isolation

`src/lib/projects/generated-site-theme.ts`, `shadcn-theme.ts`,
`site-schema.ts`, and the preview iframe are a separate theme system
(per-customer). This spec does **not** couple them to the control-plane
toggle. The preview iframe keeps its own per-project theme. The only
coupling: the *chrome around* the preview iframe (the workspace preview
panel) follows the control-plane theme.

## TDD gates

Implementation is test-driven. Tests land before or with the code they cover.

1. **Token contrast tests** — for every `(foreground, background)` role pair
   in both `:root` and `.dark`, assert WCAG AA contrast (4.5:1 body, 3:1 large
   text / UI). One test file parses `globals.css`, computes contrast per pair
   per theme, fails on any miss. Covers: on-chrome on chrome, on-surface on
   surface, on-surface-muted on surface, accent-foreground on accent,
   destructive-foreground on destructive, etc.
2. **Both-theme interaction-state coverage** — Button, Input, Card, Dialog,
   Tooltip, Dropdown variants in both themes: default/hover/focus/active/disabled.
   Storybook stories or component tests asserting no token leaks (no raw hex
   survives — grep the rendered class string).
3. **No-literal-leak test** — a repo-wide test asserting that
   `bg-[#`, `text-[#`, `border-[#`, and the overloaded `surface-warm-white`
   do not appear in `src/components/**` or `src/routes/**` (excluding
   generated-site lib and CodeViewer's Monaco theme string). This is the
   guarantee that "one source of truth" actually holds after the refactor.
   Exclusions enumerated explicitly so the test is honest.
4. **SSR no-flash + persistence** — `ThemeProvider` renders the
   `next-themes` script tag; assert no flash on first paint (existing
   pattern). Persistence: toggle changes `localStorage` + cookie, survives
   reload.
5. **Admin setting** — `ui.default_theme` round-trips through the settings
   API (`/api/admin/settings`) and renders in `/admin/settings` as an enum
   select; fallback `"dark"`.
6. **`bun run check`** green (format/lint/typecheck/affected tests/Knip/docs).

Manual review (user) remains required before release: contrast tests catch
known failures, but subjective visual sign-off of the authenticated
workspace + preview chrome needs human eyes. The audit's honesty rule stands.

## Migration approach

Additive, baseline-preserving, revert-safe:

1. Add the role tokens to `globals.css` with both theme values. Do not delete
   the old tokens yet — shadcn primitives still reference them.
2. Point shadcn semantic tokens at the role tokens. Primitives now inherit
   both themes.
3. Add `ui.default_theme` setting + `ThemeProvider` in `AppProviders`.
4. Replace chrome literals (`#151515` etc.) with role tokens, file by file,
   running the no-literal-leak test as the gate. Order: globals → root →
   MainChrome/Header/Footer → `surface.tsx` (`DarkPage`/`DarkCard`) →
   workspace primitives → routes.
5. Wire Monaco + Turnstile to `useTheme()`.
6. Add `ThemeToggle` to Header + workspace top bar + mobile menu.
7. Land contrast + interaction + no-leak + SSR tests.
8. `bun run check` green.
9. User manual review of authenticated workspace + preview.

Each step is independently revertible. If visual review fails, revert the
additive `.dark` values without touching the light baseline — the light
theme was always the real baseline.

## Decisions deferred to the implementation plan

- Exact final names of the role tokens (the roles above are fixed; naming can
  be tuned for readability).
- Whether to add a `system` option to `enableSystem` later (out of scope here).
- Whether per-account server-side theme persistence is worth adding later
  (upgrade path: a `user.theme` column fed to `defaultTheme` when no client
  pref exists; not in this pass — YAGNI until requested).
- Monaco light-theme choice: built-in `light` vs a custom named theme matching
  the palette. Plan picks based on visual fit during implementation.

## Honesty note

"Perfect, zero-mistake, out-of-the-box" is not achievable honestly across
~43 files / 352 color matches / 72 overloaded `surface-warm-white` roles.
What this design achieves: one source of truth per role, TDD contrast +
no-leak + both-theme coverage, and your manual review. That is verifiably
good, not magically flawless. Anyone promising zero mistakes here is lying.

## References

- Audit handoff: `/tmp/umkmcepat-theme-handoff.md`
- Graphify report: `graphify-out/GRAPH_REPORT.md` (commit `6126f919` era)
- Old decision superseded: `docs/superpowers/specs/2026-07-25-polish-security-design.md`
- Design tokens: `DESIGN.md`, `src/styles/globals.css`
- Settings registry: `src/lib/app-settings-registry.ts`
- ThemeProvider gap: `src/components/providers/AppProviders.tsx` (no provider)
  vs `src/components/ui/sonner.tsx` (already consumes `useTheme`)
