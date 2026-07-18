# Generated App Builder

Development workflow for UMKM Cepat generated Vite React TypeScript TanStack Router apps.

## Architecture

- **Stack:** Vite + React 19 + TypeScript + TanStack Router (hash history)
- **Output:** Static `dist/` files served via iframe preview
- **Constraint:** Frontend only. No backend, API routes, database, auth, payments, checkout, fake persistence, browser automation, or native dependencies.

## File Structure

```
src/
  routes/
    __root.tsx          # Root layout — do not edit unless adding global wrapper
    index.tsx           # Home page — MUST edit this to build the actual app
  components/custom/    # Business-specific React components
  content/site.ts       # Business data (name, contact, hours, etc.)
  styles.css            # All CSS rules — every className in JSX needs a rule here
  lib/preview-ready.ts  # Preview signal — keep usePreviewReady() in rendered route
  main.tsx              # Entry point — do not edit
package.json            # Platform-owned — do not add/remove dependencies
```

## Development Workflow

### Step 1: Read before writing

Read these files to understand the project:

- `PRODUCT.md` — business context and requirements
- `DESIGN.md` — visual direction and design tokens
- `src/content/site.ts` — business data available for use
- `src/styles.css` — existing styles and design tokens
- `src/routes/index.tsx` — current route structure (starter placeholder)
- `src/router.tsx` — router setup (hash history)

### Step 2: Edit src/routes/index.tsx

This is the most important file. Replace the starter placeholder with real JSX.

**Requirements:**

- Import and render components from `src/components/custom/`
- Keep `usePreviewReady()` call — it signals to the parent iframe that the app is ready
- Use business data from `site.ts` (name, contact, hours, etc.)
- Write real Indonesian customer-facing copy, not placeholders

### Step 3: Edit src/content/site.ts

Replace placeholder data with business-specific data from the implementation spec. Use the `site` object in components and routes.

### Step 4: Edit src/styles.css

- Prefer contract classes already in the starter stylesheet: `.page`, `.site-header` (+ BEM pieces), `.hero`, `.section`, `.primary`, `.secondary`, `.fab-wa`, CSS vars `--bg` `--fg` `--muted` `--accent`
- Add CSS rules for **every** className used in JSX
- If you invent new classes, **rewrite** `src/styles.css` fully — never leave starter-only / `.starter-shell`-only CSS after custom components
- Use design tokens from the palette (background, foreground, muted, accent)
- Mobile-first responsive: base styles for mobile, `@media (min-width: 640px)` for larger screens
- No external CSS frameworks — custom CSS only

### Step 5: Create components in src/components/custom/

Create business-specific React components:

- One component per file
- Use TypeScript
- Import business data from `site.ts`
- Use `lucide-react` for icons (already installed)
- Use `clsx` for conditional classes (already installed)

### Step 6: Validate

Run `check_app` after all writes. It validates platform integrity:

- Resource budget / file size limits
- Generated app manifest present and valid
- Package allowlist + allowed build scripts only (no new deps like prisma/express)
- Design policy bans (e.g. gradient-text, h-screen)

It does **not** ban ordinary business words like “payment”, “login”, or “register” in copy.

Post-generation structural checks (separate) also require meaningful edits, routes/content, preview-ready signal (`generated-app-preview-ready` / `usePreviewReady()`), and CSS coverage for classNames.

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
- No Tailwind CSS (custom CSS only)
- No placeholder text like "Lorem ipsum" or "Coming soon"
