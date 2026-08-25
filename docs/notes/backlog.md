---
kanban-plugin: board
---

## Backlog

- [ ] **Prevent Placeholder Dummy Copy**: Strict mechanical verification against placeholder text or dummy copy in generated outputs #engine #quality
- [ ] **Discuss Tool Call Retries**: Ensure `build_recommendation` and discuss tool calls are reliably invoked on state changes #discuss #ai
- [ ] **Decouple Workspace Back Button**: Decouple top-level navigation back button from inner preview history #ux #workspace
- [ ] **Perbarui Sekarang CTA Behavior**: Decide and refine "Perbarui sekarang" CTA button state in chat composer #ux #chat
- [ ] **Modular Contributor SKILL.md Dropzone**: Organize engine skill system so future contributors can easily drop in new niche skills #engine #architecture
- [ ] **Dynamic Color Seed Variation**: Ensure dynamic OKLCH palette seeds vary predictably across different business niches #design #palette
- [ ] **WhatsApp Lead Generation Engine**: High-converting landing page layouts routing directly to dynamic WhatsApp leads (`wa.me`) #conversion #whatsapp
- [ ] **Initial Creation History Tracking**: Ensure complete version history and snapshots are tracked from the very first generation #history #workspace
- [ ] **TanStack Mutation Ergonomics**: Standardize data mutation patterns and cache invalidation across workspace API routes #architecture #data
- [ ] **Multi-Route Subpage Support**: Generate TanStack Router sub-pages (`/menu`, `/layanan`) when brief calls for it (see [[architecture/ADR-001-multi-route-strategy]]) #engine #routing
- [ ] **Photo Upload & Frontend Image Compression**: Implement client-side image compression and photo upload integration #media #upload
- [ ] **Affiliate & Referral System**: Referral engine with revenue sharing (e.g. 50:50) and bonus generation credits #growth #marketing
- [ ] **Energy Pricing & Calibration**: Optimize energy metering and per-step token deduction for cost efficiency #pricing #energy
- [ ] **Security Audit & Boundary Scans**: Perform high/critical vulnerability audit across auth boundaries, project deletion, tenant isolation, and prompt injection #security #audit
- [ ] **SEO & Local JSON-LD Injection**: Schema.org LocalBusiness JSON-LD and meta tags injection for Indonesian local search ranking #seo #engine
- [ ] **Owner & Business Interaction Analytics**: Simple analytics tracking clicks, bounce rate, and CSV exports for UMKM owners and platform admin #analytics #reporting
- [ ] **Drag and Drop Section Reordering**: Visual section arrangement in workspace canvas #ux #workspace
- [ ] **QRIS Payment & Image Integration**: Direct QRIS payment banner generator for UMKM storefronts #conversion #payment

## In Progress

## Done

- [x] Vendored 61 official shadcn Base Nova UI components #scaffold
- [x] Dynamic OKLCH palette generator per business niche #design
- [x] Sandboxed outcome-directed generation engine #engine
- [x] Two-tier workspace layout with high-contrast active badges #workspace
- [x] Fail-closed energy meter with negative debt tracking #energy
- [x] Zero-tolerance purge of brittle regex gates and style-asserting tests #quality
- [x] Established lean Obsidian documentation hub and triage skill #docs

%% kanban:settings

```
{"kanban-plugin":"board"}
```

%%
