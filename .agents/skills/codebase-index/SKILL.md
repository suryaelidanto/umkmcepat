---
name: codebase-index
description: "Build a holistic repo atlas: refresh Graphify, read canonical docs, inspect reusable surfaces, then stop."
disable-model-invocation: true
---

# Codebase Index

Build a fresh **atlas** of the whole repo. Index only; do not implement.

## Steps

1. Read the canonical map:
   - `AGENTS.md`
   - `PRINCIPLES.md`
   - `DEV.md`
   - `DESIGN.md`
   - `docs/architecture.md`
   - `docs/deployment.md`
   - `package.json`
   Completion: project rules, product/code/design bar, architecture, deployment, scripts, and checks known.

2. Refresh Graphify:
   ```bash
   bun run graph:update
   ```
   If Graphify is missing, do not install project deps. Report the missing local tool, then continue with `rg`, `find`, and source reads.
   Completion: graph is current, or fallback path explicitly stated.

3. Navigate the atlas with Graphify first:
   ```bash
   bun run graph:tree
   ```
   Use Graphify/GraphiQL-style queries if available. Read source files behind every important cluster; Graph output is a map, not evidence.
   Completion: major modules, entrypoints, dependencies, and seams are source-confirmed.

4. Inspect reusable surfaces:
   - `src/components/ui`
   - `src/stories`
   - app routes/pages/layouts
   - data/auth/storage/provider/AI modules
   - tests and test utilities
   Completion: existing patterns, primitives, adapters, and checks are known enough to avoid duplicate code.

5. Return a terse atlas note:
   - docs read
   - Graphify status
   - repo shape
   - reusable surfaces
   - important constraints
   - default checks
   Completion: a fresh agent can start work without repeating indexing.

## Rules

- No implementation during indexing.
- Read source before claims; never trust Graphify output alone.
- Reuse/deletion bias: new code must beat existing surfaces.
- Storybook is part of the UI atlas.
- Keep Graphify user-local; never add it as a dependency.
- Do not commit generated/local artifacts: `graphify-out/`, `.pi/`, `.browser/`, `.next/`, `storybook-static/`, logs, screenshots, uploads, secrets.
