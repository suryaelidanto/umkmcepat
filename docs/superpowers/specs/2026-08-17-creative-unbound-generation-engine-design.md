# Creative Unbound Generation Engine Design

**Date:** 2026-08-17  
**Status:** Approved design spec  
**Goal:** Elevate UMKM Cepat generated landing page designs from 5/10 (plain, rigid template-ish) to 9–10/10 (bespoke, creative, high-converting masterpiece) while preserving sub-20s single-shot streaming performance and deterministic reliability.

---

## 1. Problem Statement & Root Cause

The existing generation engine is fast (~15s) and functionally reliable, but visual quality suffers from three bottlenecks:
1. **Restricted Layout Primitives**: Layout was constrained to basic `SiteSection`, `SiteSplit`, and `SiteStack` wrappers, forcing every business into a predictable 2-column split with generic geometric SVG line art.
2. **Component Starvation in Prompts**: While the scaffold includes full shadcn components and Lucide icons, the prompt only taught the model to write bare text and plain `<article>` boxes.
3. **Template Monotony**: Every niche generated the exact same macro-structure: Hero split -> 3-card product grid -> 3-point bullet list -> Full-width contrast CTA.

---

## 2. Proposed Architecture: Pre-bundled 21st.dev Component Library & Bounded Creative Writer

Instead of adding runtime dependencies or paid live MCP APIs (which add latency, cost, and failure points), we embed top 21st.dev and shadcn design primitives directly into the local scaffold and prompt the creative writer with dynamic, non-templated compositions.

### 2.1 Rich Scaffold Component Primitives (`src/lib/projects/scaffold/`)
Expand the scaffold building blocks with production-grade components:
- **Bento Layout System**: `BentoGrid` and `BentoCard` supporting variable column/row spans, badge tags, and accent borders.
- **Micro-Highlight Primitives**:
  - `StatCounter` / `MetricPill` (e.g., "1.500+ Alumni", "30 Hari Garansi", "Mulai 35rb").
  - `BadgeRibbon` & `BadgePill` (soft glassmorphism and tinted background pill badges).
  - `TestimonialCard` with avatar initial stacks and star rating indicators.
  - `PricingCard` / `MenuHighlightCard` with clear callout tags.
- **Lucide Icons**: Domain-aware icon imports (`lucide-react`) for visual anchor points instead of empty placeholders.

### 2.2 Bespoke Visual Metaphor Prompting (`src/lib/projects/batched-prompt.ts`)
- Instruct the AI writer to select a creative visual metaphor unique to the UMKM niche (e.g., *Culinary Menu Showcase*, *Technical Service Reliability Matrix*, *Boutique Lookbook*, *Educational Roadmap & Achievement Hub*).
- Forbid formulaic boilerplate (no identical 2-column splits with random abstract line drawings).
- Provide few-shot examples of rich Bento grids, asymmetric layouts, and stat cards.

### 2.3 Fast Bounded Execution Pipeline
- **Step 1 — Creative Single-Shot Stream (~12s)**: Streams bespoke UI code with rich components.
- **Step 2 — Deterministic Self-Heal & Browser Gates (~2s)**: Auto-heals contrast, enforces 44px touch targets, and validates DOM health.
- **Step 3 — Single Targeted Correction (~5s, if needed)**: Only invoked if a machine-verifiable gate fails.
- **Total Latency**: ~15–20s.

---

## 3. Verification & Quality Gates
- **Unit & Integration Suite**: All Vitest unit tests pass (`bun test`).
- **Visual Artifacts**: Capture full-page Playwright screenshots across 5 distinct UMKM niches to confirm rich, creative, non-template layouts.
- **Fast Quality Gate**: `bun run check` exits 0 cleanly.
