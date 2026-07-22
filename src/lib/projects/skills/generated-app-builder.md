---
name: generated-app-builder
description: Development workflow for UMKM Cepat generated Vite React TypeScript TanStack Router apps.
---

# Generated App Builder

Development workflow for UMKM Cepat generated Vite React TypeScript TanStack Router apps.

## Architecture

- **Stack:** Vite + React 19 + TypeScript + TanStack Router (hash history, multi-page) + Tailwind CSS v4 + shadcn/ui ("new-york", source-copied)
- **Output:** Static `dist/` files served via iframe preview
- **Constraint:** Frontend only. No backend, API routes, database, auth, payments, checkout, fake persistence, browser automation, native dependencies.

## File Structure

```
src/
  routes/
    __root.tsx      # Root layout with <Outlet /> — may add shared header/footer if the brief calls for it
    index.tsx       # Home page — MUST edit to build the actual app
    not-found.tsx  # 404 catch-all — do not edit
    <page>.tsx      # Extra pages (katalog.tsx, kontak.tsx, ...) — create as needed
  components/
    ui/             # shadcn/ui primitives (button, card, badge, input, label, separator) — compose, do not edit; write extras here
    custom/         # Business-specific React components (create here)
  content/site.ts  # Business data (name, contact, hours, etc.) — READ-ONLY, already populated
  index.css        # Tailwind v4 + shadcn theme CSS vars — keep unedited
  lib/
    preview-ready.ts  # Preview signal — keep usePreviewReady() in each rendered route
    utils.ts          # cn() helper for Tailwind class merging — do not edit
  main.tsx         # Entry point — do not edit
  router.tsx       # Router setup (hash history, 404 catch-all) — MAY edit to register extra routes, nothing else
  components.json  # shadcn config — platform-owned, do not edit
  package.json     # Platform-owned — do not add/remove dependencies
  vite.config.ts   # Platform-owned — do not edit
  tsconfig.app.json # Platform-owned — do not edit
```

## Development Workflow

### Step 1: Read before writing

Read files to understand the project:

- `PRODUCT.md` — business context, requirements
- `DESIGN.md` — visual direction, design tokens
- `src/content/site.ts` — business data available to use (read-only)
- `src/index.css` — shadcn theme CSS vars (--background, --foreground, --primary, etc.)
- `src/routes/__root.tsx` — shared layout wrapper

### Step 2: Write the home page `src/routes/index.tsx`

Replace the starter placeholder with real JSX.

**Requirements:**

- Import and compose shadcn components from `src/components/ui/` (Button, Card, Badge, Input, Label, Separator)
- Create business-specific components under `src/components/custom/`
- Keep `usePreviewReady()` call — signals the parent iframe the app is ready
- Read business data from `src/content/site.ts` (name, contact, hours, etc.) via `import { site } from "@/content/site"`
- Write real Indonesian customer-facing copy, not placeholders

### Step 3: Add extra pages and register routes (when the brief has distinct sections)

If the brief has distinct sections (Home, Catalog, Contact, Product detail, etc.), add real multi-page routes:

- Add one route file per page under `src/routes/` (e.g. `katalog.tsx`, `kontak.tsx`)
- Register each route in `src/router.tsx` via `createRoute({ getParentRoute: () => rootRoute, path: "/katalog", component: ... })` then add it to `rootRoute.addChildren([...])`
- Keep the existing index route and the `path: "*"` 404 catch-all
- Navigate between pages with `<Link to="/katalog">` from `@tanstack/react-router`. Do NOT fake routing with `useState` tabs.
- If the brief calls for a shared header/footer, add it in `src/routes/__root.tsx` but keep `<Outlet />`.

Otherwise keep the single composed page.

### Step 4: Compose UI with Tailwind + shadcn

- Use shadcn components (Button, Card, Badge, Input, Label, Separator) as building blocks
- Use Tailwind CSS v4 utility classes inline in the TSX for layout, spacing, styling
- Use `cn()` from `@/lib/utils` for conditional class merging
- Use design tokens via Tailwind utilities: `bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `bg-muted`, `text-muted-foreground`, `bg-accent`, `text-accent-foreground`, `border-border`, `ring-ring`
- Mobile-first responsive: base styles mobile, `sm:` / `md:` / `lg:` prefixes for larger screens
- Use `min-h-dvh` for full-height sections, never `h-screen`
- Do NOT write custom CSS class names (no `.btn-primary` / `.nav-link` / `.hero-section`); do NOT edit `src/index.css`.

### Step 5: Create components in `src/components/custom/`

Create business-specific React components:

- One component per file
- Use TypeScript
- Import business data from `src/content/site.ts`
- Import shadcn primitives from `@/components/ui/`
- Use `lucide-react` icons (already installed)
- Use `cn()` from `@/lib/utils` for classes
- Write extra shadcn primitives (if missing) directly into `src/components/ui/<name>.tsx` (canonical new-york + Tailwind v4 shape, `import cn from "@/lib/utils"`). No CLI.

### Step 6: Validate

Run `check_app` after all writes. It validates platform integrity:

- Resource budget / file size limits
- Generated app manifest present and valid
- Package allowlist + allowed build scripts only (no new deps or patterns)

## Direct tools, not design

Pick pages and sections from the brief — do not force a contact form, footer, or testimonials section the brief did not ask for. Use what the business actually needs (WhatsApp CTA, static catalog, price list, hours). Copy may describe cara bayar (transfer, COD, dll). Do **not** build fake login, checkout carts, payment gateways, member auth, or `fetch('/api/...')` to invented backends. Data lives in `src/content/site.ts` as TS objects — not a database.

## Forbidden

- No real backend, database, authentication, payment-gateway integrations
- No new npm dependencies (package.json is platform-owned)
- No invented API routes or server code
- No `localStorage` for durable business data (except ephemeral drafts)
- No third-party scripts or analytics
- No edits to `src/components/ui/*` (compose, do not rewrite), `src/lib/utils.ts`, `vite.config.ts`, `tsconfig.app.json`, `components.json`, `src/main.tsx`, `src/routes/__root.tsx` beyond a shared layout, `src/router.tsx` beyond route registration, `src/index.css`, `src/content/site.ts`
- No `h-screen` (use `min-h-dvh`)
- No placeholder text like "Lorem ipsum" or "Coming soon"
