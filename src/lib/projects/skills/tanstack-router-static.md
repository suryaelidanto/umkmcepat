---
name: tanstack-router-static
description: TanStack Router conventions for static multi-page UMKM Cepat apps — hash history, route files, <Link>, 404 catch-all.
---

# TanStack Router — static frontend (UMKM Cepat)

- Router uses **hash history** (`createHashHistory()`) because the app is served inside a sandboxed iframe via relative asset URLs.
- Routes are file-based under `src/routes/`. `index.tsx` → `/`. In the contract-driven V2 path, the platform derives and compiles `src/router.tsx` from the accepted route list; the writer emits one file per accepted extra page (for example `src/routes/katalog.tsx`) and never emits the protected router.
- Navigate between pages with `<Link to="/katalog">` from `@tanstack/react-router`. **Do not** fake routing with `useState` tabs — use real routes when the brief has distinct sections.
- In-page section links (anchor scroll within one page) use `<Link to="/" hash="sectionId">`, targeting `<section id="sectionId">`. **Never** use raw `<a href="#id">`: with hash history the hash is the route path, so `#id` resolves to no route and hits the 404 catch-all — the jump glitches (first click re-renders/scrolls to top, only works on the second). `<Link to="/" hash="...">` renders `#/id` and uses TanStack's native hash-scroll. Add `scroll-mt-*` to each `id` target so a fixed header does not cover it.
- `src/routes/__root.tsx` is the layout wrapper (`<Outlet />`). Put shared header/footer there if the brief calls for them.
- A `path: "*"` catch-all 404 route is pre-wired. Keep it.
- **Do not edit** `src/main.tsx`, the protected `src/router.tsx`, or `src/routes/__root.tsx` beyond adding a layout.
- Every page component calls `usePreviewReady()` (from `@/lib/preview-ready`) so the preview iframe knows rendering finished.
- Read business data via `import { site } from "@/content/site"`.
