# Creative Unbound Generation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade UMKM Cepat's generation engine from producing rigid, generic 5/10 templates to crafting bespoke 9–10/10 creative landing page masterpieces with rich Bento grids, interactive components, micro-highlights, and Lucide icons, while maintaining fast single-shot streaming and 100% deterministic build pass rates.

**Architecture:** Embed pre-bundled 21st.dev/shadcn creative primitives directly into the project scaffold (`src/lib/projects/scaffold/generated-site-primitives.ts`), enrich writer prompts (`batched-prompt.ts`) with anti-template directives and high-fidelity layout compositions, and adapt AST source gates (`generated-site-gates.ts`) to validate and heal rich component hierarchies.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Lucide React, Radix UI, Vite, Vitest, Playwright.

---

## Tasks

- [ ] **Task 1: Expand Scaffold with 21st.dev Creative Primitives**
  - [ ] Update `src/lib/projects/scaffold/generated-site-primitives.ts` to export:
    - `BentoGrid`, `BentoCard` (supporting responsive `colSpan`, `rowSpan`, `variant`, `glow`, `badge`)
    - `StatCounter` / `MetricPill` (compact stat callouts with icon and label)
    - `BadgePill` (glassmorphism / tinted chip tags)
    - `FeatureSpotlight` (highlight card with icon badge and micro-details)
    - `TestimonialCard` (quote, author, rating, verified pill)
    - `MenuCard` / `PricingCard` (price callouts, feature lists, tag ribbons)
  - [ ] Add unit tests in `src/lib/projects/scaffold/generated-site-primitives.test.ts`
  - [ ] Run `bun test src/lib/projects/scaffold/generated-site-primitives.test.ts`
  - [ ] Commit changes: `git commit -m "feat(scaffold): add 21st-dev creative component primitives"`

- [ ] **Task 2: Upgrade Creative Writer Prompts & Anti-Template Directives**
  - [ ] Update `src/lib/projects/batched-prompt.ts`:
    - Inject comprehensive guidance on composing bespoke, non-templated layouts using Bento grids, Lucide icons, stat counters, and card hierarchies.
    - Provide rich, modern few-shot code examples utilizing `BentoGrid`, `BentoCard`, `Card`, `Badge`, `Accordion`, and `lucide-react` icons.
    - Explicit anti-template directives forbidding repetitive 2-column wireframes or boring text dumps.
  - [ ] Update prompt unit tests in `src/lib/projects/batched-prompt.test.ts`
  - [ ] Run `bun test src/lib/projects/batched-prompt.test.ts`
  - [ ] Commit changes: `git commit -m "feat(prompt): enrich writer with creative layout compositions and anti-template guidance"`

- [ ] **Task 3: Adapt Source Gates & AST Normalizers for Creative Primitives**
  - [ ] Update `src/lib/projects/generated-site-gates.ts` to ensure all new primitives (`BentoGrid`, `BentoCard`, `StatCounter`, `BadgePill`, `FeatureSpotlight`, Lucide icons) pass AST and taste gates cleanly without false positives.
  - [ ] Run `bun test src/lib/projects/generated-site-gates.test.ts`
  - [ ] Commit changes: `git commit -m "fix(gates): adapt AST gates and normalizers for creative primitives"`

- [ ] **Task 4: End-to-End Simulation & Visual Review Across 5 UMKM Niches**
  - [ ] Run automated E2E generator across 5 project niches (Sepatu Express, Warung Sate Solo, Service AC Bandung, Batik Daniswara, Bimbel Prestasi).
  - [ ] Capture full-page Playwright preview screenshots in `.data/audit-artifacts/`.
  - [ ] Inspect visual hierarchy, contrast, color accents, and responsiveness.
  - [ ] Verify `bun run check` exits 0.
  - [ ] Commit changes: `git commit -m "test(e2e): verify 5 project variants with creative masterpiece engine"`
