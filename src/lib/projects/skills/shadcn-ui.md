---
name: shadcn-ui
description: shadcn/ui conventions for UMKM Cepat generated apps — the full pre-seeded set is available, import any, cn() helper, no CLI.
---

# shadcn/ui (UMKM Cepat)

- Components live in `src/components/ui/`. The **full shadcn "new-york" + Tailwind v4 set is pre-seeded** — pick any and `import { Button } from "@/components/ui/button"`.
- Categories seeded:
  - **forms**: `button`, `input`, `label`, `checkbox`, `select`, `form`, `radio-group`, `switch`, `textarea`
  - **overlays**: `dialog`, `sheet`, `drawer`, `popover`, `hover-card`, `dropdown-menu`, `context-menu`, `menubar`
  - **navigation**: `navigation-menu`, `breadcrumb`, `pagination`, `tabs`, `accordion`, `collapsible`, `command`
  - **data-display**: `table`, `card`, `badge`, `avatar`, `separator`, `scroll-area`, `skeleton`, `progress`, `aspect-ratio`
  - **feedback**: `sonner`, `alert`, `alert-dialog`, `tooltip`, `spinner`
  - Extras also seeded (slider, carousel, toggle, toggle-group, input-otp, calendar, resizable). If you need a specific one, list `src/components/ui/` with `list_files`.
- **Use these. Do not hand-roll custom widgets** (no custom `.btn`, no hand-written dropdowns). Compose shadcn primitives.
- **Do NOT run a CLI** (no `npx shadcn add`, no `bunx`). Components are already on disk. If a component somehow isn't seeded (shouldn't happen), write its source into `src/components/ui/<name>.tsx` per the canonical shadcn "new-york" + Tailwind v4 shape: import `cn` from `@/lib/utils`, use Radix primitives, style with Tailwind utilities + theme vars.
- Styling is Tailwind utility classes + `bg-background`/`text-foreground`/`bg-primary` vars. Never custom CSS classes.
- `cn()` merges classes conditionally — use it for variants: `className={cn("base classes", isActive && "active classes")}`.
