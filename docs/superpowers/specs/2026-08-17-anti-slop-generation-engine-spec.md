# Spec: Anti-Slop High-Impact Generation Engine for UMKM Cepat

**Date:** 2026-08-17  
**Status:** Ready for Review  
**Domain:** AI Landing Page Generation Engine, Visual Quality, Design Systems, UMKM Marketing

---

## 1. Executive Summary & Vision

UMKM Cepat's generation engine must produce 9.5+/10 visual quality landing pages and marketing websites for Indonesian micro, small, and medium businesses (UMKM). 

Rather than generating generic "AI slop" (symmetrical identical boxes, crude SVG line drawings, repetitive badges, and robotic copy), the engine enforces human design systems, asymmetrical bento hierarchy, domain-specific visual archetypes, layered surface contrast, and conversion-focused WhatsApp workflows.

---

## 2. Core Pillars of Anti-Slop Design

### 2.1. Asymmetrical Bento Layouts & Visual Hierarchy
- **No Monotonous Grids:** Banish 4 identical rectangular cards.
- **Visual Weight Distribution:** Primary/flagship services receive dominant visual real estate (`col-span-2` or elevated cards).
- **Whitespace with Purpose:** Spacing scales (py-16 to py-28) create breathing room and natural eye flow.

### 2.2. Interactive Value Showcase Cards (Zero Crude Clipart)
- In image-free mode, the right-hand hero panel must NOT contain hand-coded SVG doodle outlines (no fake shoes, cups, tools, or abstract waves).
- Replaced by a rich **Value Showcase Bento**:
  - Live micro-stat counters (`<StatCounter value="Mulai 35rb" label="Harga Awal" />`).
  - Floating status pills and trust markers (`<BadgePill>`).
  - Concrete Lucide icons with subtle tinted background badges (`<Sparkles className="size-5" />`).
  - Quick checklist of top USPs/commitments.

### 2.3. Layered Surface Contrast & Texture Rhythm
- **Base Surface (`bg-background`):** Warm, inviting off-white canvas.
- **Card Surfaces (`bg-card`):** Elevated surfaces with subtle border and 1px ring definition.
- **Muted Section (`bg-muted/40`):** Soft depth for catalog/offerings.
- **Contrast Logistics (`surface="contrast"`):** Deep espresso/dark charcoal with `text-background` for hours, location, and guarantee clarity.

### 2.4. Authentic Indonesian Marketing Copy
- Zero internal evaluative prompt leaks (*"Pilihan utama terlihat jelas"*, *"Detail produk mudah dipahami"*, *"Website usaha"*).
- Punchy, benefit-driven Indonesian marketing copy tailored to the exact UMKM vertical.

### 2.5. Intelligent Page Strategy (Single-Page vs. Multi-Page)
- **Single-Page Landing Page:** High-converting marketing campaign for focused service/product.
- **Multi-Page Website:** Structured site for retail catalogs, multi-branch operations, or extensive course offerings (`/`, `/katalog`, `/tentang`, `/kontak`).

---

## 3. Engine Architecture & Components

```
┌─────────────────────────────────────────────────────────────┐
│                    User Brief & Contract                    │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌───────────────────────────────┐ ┌───────────────────────────┐
│     Niche Layout Strategy     │ │    Design Kit & Tokens    │
│  (Service, F&B, Retail, Corp) │ │ (Editorial, Warm, Craft)  │
└───────────────┬───────────────┘ └─────────────┬─────────────┘
                │                               │
                └──────────────┬────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Batched Prompt Engine                       │
│  - Negative Anti-Slop Constraints                           │
│  - Seeded Shadcn Registry & Primitives                      │
│  - Asymmetrical Bento Blueprint Rules                       │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               Single-Shot Streamed Writer                   │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              AST Gate & Self-Healing Pipeline               │
│  - Contrast Token Normalization                             │
│  - Translucent Background Container Support                 │
│  - Touch-Safe Anchor & Touch Target Enforcement             │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│           Preview Server & Automatic Thumbnails             │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Verification & Quality Gates

1. **Visual Quality Score:** 9.5+/10 evaluated across Playwright full-page screenshots.
2. **Browser Qualification:** 0 computed contrast failures, 0 touch target issues, 0 broken links.
3. **Automated Quality Gates:** `bun run check` exits 0 (100% format, lint, typecheck, unit tests, knip, docs).
4. **Theme Harmonization:** Flawless light and dark mode switching across all workspace controls and preview frames.
