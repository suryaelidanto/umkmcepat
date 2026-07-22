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
