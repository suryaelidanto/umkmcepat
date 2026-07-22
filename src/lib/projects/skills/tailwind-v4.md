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
