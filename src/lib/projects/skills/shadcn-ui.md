---
name: shadcn-ui
description: shadcn/ui conventions for UMKM Cepat generated apps — pull components on demand with copy_component, cn() helper, no CLI.
---

# shadcn/ui (UMKM Cepat)

- Components live in `src/components/ui/`. Only `button` and `card` are pre-seeded (plus `cn()` in `src/lib/utils.ts` and `components.json`).
- To use any other shadcn primitive, call `copy_component("name")`. It writes the canonical shadcn "new-york" + Tailwind v4 source into `src/components/ui/<name>.tsx` and pulls any other components it depends on automatically. Idempotent — safe to call repeatedly.
- After copying, import as normal: `import { Dialog } from "@/components/ui/dialog"`.
- Available names (call copy_component with one of these):
  - **forms**: `button` (seeded), `input`, `label`, `checkbox`, `select`, `form`, `radio-group`, `switch`, `textarea`
  - **overlays**: `dialog`, `sheet`, `drawer`, `popover`, `hover-card`, `dropdown-menu`, `context-menu`, `menubar`
  - **navigation**: `navigation-menu`, `breadcrumb`, `pagination`, `tabs`, `accordion`, `collapsible`, `command`
  - **data-display**: `table`, `card` (seeded), `badge`, `avatar`, `separator`, `scroll-area`, `skeleton`, `progress`, `aspect-ratio`
  - **feedback**: `sonner`, `alert`, `alert-dialog`, `tooltip`, `spinner`
  - **extras**: `slider`, `carousel`, `toggle`, `toggle-group`, `input-otp`, `calendar`, `resizable`
- **Use these. Do not hand-roll custom widgets** (no custom `.btn`, no hand-written dropdowns). Call `copy_component` then compose the primitive.
- **Do NOT run a CLI** (no `npx shadcn add`, no `bunx`). If a component you need is not in the list above, write its source into `src/components/ui/<name>.tsx` per the canonical shadcn "new-york" + Tailwind v4 shape: import `cn` from `@/lib/utils`, use Radix primitives, style with Tailwind utilities + theme vars.
- Styling is Tailwind utility classes + `bg-background`/`text-foreground`/`bg-primary` vars. Never custom CSS classes.
- `cn()` merges classes conditionally — use it for variants: `className={cn("base classes", isActive && "active classes")}`.
