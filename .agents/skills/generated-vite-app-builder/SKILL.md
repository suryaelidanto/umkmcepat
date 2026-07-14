---
name: generated-vite-app-builder
description: Build or edit UMKM Cepat generated Vite apps safely inside generated project files only. Use when working on generated React/Vite/TanStack source, source snapshots, app-builder prompts, generated-file tool rules, runtime profile `vite-react-tanstack-v1`, preview-ready wiring, or generated static frontend constraints.
---

# Generated Vite App Builder

Use when creating or editing UMKM Cepat generated apps.

Rules:
- Work inside generated project files only. No path escape.
- Runtime profile: `vite-react-tanstack-v1`.
- Starter mirrors `npm create vite@latest -- --template react-ts --eslint --no-immediate`, plus TanStack Router, manifest, preview helper.
- Static frontend only. No backend, DB, auth, fake checkout/payment, fake booking persistence, browser automation, native deps.
- User-facing copy: Indonesian. Code/docs/errors: English.
- Prefer custom CSS. No Tailwind unless profile changes.
- Allowed default deps only: React, React DOM, TanStack Router, TanStack Query, lucide-react, clsx; Vite/TS/ESLint tooling.
- Before coding, turn conversation answers into an implementation brief: audience, offer, CTA, visual direction, layout intent, proof points, and source shape. The coding agent should receive this brief, not raw Q&A only.
- Create business-specific routes/components/content/styles. Do not dump raw brief answers. Do not reuse one generic landing structure.
- Keep `usePreviewReady()` wired after render.
- Run `check_app` after writes. Build must pass before success.
