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
