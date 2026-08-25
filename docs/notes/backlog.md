---
kanban-plugin: basic
---

## Backlog

- [ ] **Prevent Placeholder Dummy Copy**: Strict mechanical verification against placeholder text or dummy copy in generated outputs #engine #quality
- [ ] **Discuss Tool Call Retries**: Ensure `build_recommendation` and discuss tool calls are reliably invoked on state changes #discuss #ai
- [ ] **Decouple Workspace Back Button**: Decouple top-level navigation back button from inner preview history #ux #workspace
- [ ] **Perbarui Sekarang CTA Behavior**: Decide and refine "Perbarui sekarang" CTA button state in chat composer #ux #chat
- [ ] **Modular Contributor SKILL.md Dropzone**: Organize engine skill system so future open-source contributors can easily drop in new `SKILL.md` rules #engine #architecture
- [ ] **Minimum Build Requirement Policy**: Review whether to remove or adjust minimum step requirements during generation #engine #policy
- [ ] **Energy Pricing & Calibration**: Optimize energy metering and per-step token deduction to make runs affordable #pricing #energy
- [ ] **Security Audit & Boundary Scans**: Perform high/critical vulnerability audit across auth boundaries, project deletion, tenant isolation, and prompt injection #security #audit
- [ ] **Dynamic Color Seed Variation**: Investigate and fix why palette seeds feel repetitive across runs #design #palette
- [ ] **WhatsApp Lead Generation Engine**: Implement high-converting landing page layouts routing directly to dynamic WhatsApp leads (`wa.me`) #conversion #whatsapp
- [ ] **Initial Creation History Tracking**: Ensure complete version history and snapshots are tracked from the very first generation #history #workspace
- [ ] **TanStack Mutation Ergonomics**: Standardize data mutation patterns and cache invalidation across workspace API routes #architecture #data
- [ ] **Evaluate External Taste Skills**: Audit curated niche skills from `/mnt/data/code/side/taste-skill/.agents/skills/` for dynamic engine injection #design #impeccable
- [ ] **Multi-Route Site Generation**: Enable TanStack Router sub-routes (e.g. `/menu`, `/tentang`) when explicitly requested in brief #generator #routing
- [ ] **Photo Upload Feature Flag & Visual Edit**: Stabilize photo upload feature flag and finish direct visual edit integration #media #upload
- [ ] **User & Platform Analytics**: Implement click tracking, bounce rates, and CSV export for UMKM business owners and platform admin #analytics #reporting

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
{"kanban-plugin":"basic"}
```

%%
