# Generated App Builder

Development workflow for UMKM Cepat generated Vite React TypeScript TanStack Router apps.

## Architecture

- **Stack:** Vite + React 19 + TypeScript + TanStack Router (hash history) + Tailwind CSS v4 + shadcn/ui ("new-york", source-copied)
- **Output:** Static `dist/` files served via iframe preview
- **Constraint:** Frontend only. No backend, API routes, database, auth, payments, checkout, fake persistence, browser automation, or native dependencies.

## File Structure

```
src/
  routes/
    __root.tsx          # Root layout — do not edit unless adding global wrapper
    index.tsx           # Home page — MUST edit this to build the actual app
    not-found.tsx       # 404 catch-all — do not edit
  components/
    ui/                 # shadcn/ui primitives (button, card, badge, input, label, separator) — do not edit
    custom/             # Business-specific React components (create here)
  content/site.ts       # Business data (name, contact, hours, etc.)
  index.css             # Tailwind v4 + shadcn theme CSS vars — keep unedited
  lib/
    preview-ready.ts    # Preview signal — keep usePreviewReady() in rendered route
    utils.ts            # cn() helper for Tailwind class merging — do not edit
  main.tsx               # Entry point — do not edit
  router.tsx             # Router setup (hash history, 404 catch-all) — do not edit
components.json          # shadcn config — platform-owned, do not edit
package.json             # Platform-owned — do not add/remove dependencies
vite.config.ts           # Platform-owned — do not edit
tsconfig.app.json        # Platform-owned — do not edit
```

## Development Workflow

### Step 1: Read before writing

Read these files to understand the project:

- `PRODUCT.md` — business context and requirements
- `DESIGN.md` — visual direction and design tokens
- `src/content/site.ts` — business data available for use
- `src/index.css` — shadcn theme CSS vars (--background, --foreground, --primary, --accent, etc.)
- `src/routes/index.tsx` — current route structure (starter placeholder)
- `src/router.tsx` — router setup (hash history)

### Step 2: Edit src/routes/index.tsx

This is the most important file. Replace the starter placeholder with real JSX.

**Requirements:**

- Import and compose shadcn components from `src/components/ui/` (Button, Card, Badge, Input, Label, Separator)
- Create business-specific components under `src/components/custom/`
- Keep `usePreviewReady()` call — it signals to the parent iframe that the app is ready
- Use business data from `site.ts` (name, contact, hours, etc.)
- Write real Indonesian customer-facing copy, not placeholders

### Step 3: Edit src/content/site.ts

Replace placeholder data with business-specific data from the implementation spec. Use the `site` object in components and routes.

### Step 4: Compose UI with Tailwind + shadcn

- Use shadcn components (Button, Card, Badge, Input, Label, Separator) as building blocks
- Use Tailwind CSS v4 utility classes for layout, spacing, and styling
- Use `cn()` from `@/lib/utils` for conditional class merging
- Use design tokens via Tailwind utilities: `bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `bg-muted`, `text-muted-foreground`, `bg-accent`, `text-accent-foreground`, `border-border`, `ring-ring`
- Mobile-first responsive: base styles for mobile, `sm:` / `md:` / `lg:` prefixes for larger screens

### Step 5: Create components in src/components/custom/

Create business-specific React components:

- One component per file
- Use TypeScript
- Import business data from `site.ts`
- Import shadcn primitives from `@/components/ui/`
- Use `lucide-react` for icons (already installed)
- Use `cn()` from `@/lib/utils` for conditional classes

### Step 6: Validate

Run `check_app` after all writes. It validates platform integrity:

- Resource budget / file size limits
- Generated app manifest present and valid
- Package allowlist + allowed build scripts only (no new deps like prisma/express)
- Design policy bans (e.g. gradient-text, h-screen)
- Vite config matches the platform-owned config (with `@` alias)

It does **not** ban ordinary business words like "payment", "login", or "register" in copy.

Post-generation structural checks (separate) also require meaningful edits, routes/content, preview-ready signal (`generated-app-preview-ready` / `usePreviewReady()`), and CSS coverage for any custom (non-Tailwind) classNames.

## Static product patterns

- Prefer WhatsApp / phone / maps CTA, static catalog, price list, hours, testimonials.
- Copy may describe cara bayar (transfer, COD, dll). Do **not** build fake login, checkout carts with payment gateways, member auth, or `fetch('/api/...')` to invented backends.
- Data lives in `src/content/site.ts` and JSX — not a database.

## Forbidden

- No real backend, database, authentication, or payment-gateway integrations
- No new npm dependencies (package.json is platform-owned)
- No invented API routes or server code
- No `localStorage` for durable business data (except ephemeral drafts)
- No third-party scripts or analytics
- No edits to `src/components/ui/*`, `src/lib/utils.ts`, `vite.config.ts`, `tsconfig.app.json`, `components.json`, `src/main.tsx`, `src/router.tsx`, or `src/routes/__root.tsx`
- No `h-screen` (use `min-h-dvh`)
- No placeholder text like "Lorem ipsum" or "Coming soon"
