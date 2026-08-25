---
kanban-plugin: board
---

## Backlog

## In Progress

## Needs Revision / Check Again

## Ready for Review

- [ ] **[#16] Mobile Workspace Topbar & Discuss Polish**: Remove duplicate project title header in mobile discuss mode, hook up hamburger sheet menu in discuss topbar, and polish build recommendation card padding/typography for mobile viewport #ui #ux #workspace

- [ ] **[#14] Persistent Workspace Composer Action Button**: Add persistent primary build/update action button in the chat composer bar (e.g. `[🚀 Buat Website]` pre-build and `[✨ Perbarui Website]` post-build) with pre-flight readiness checks that guide users to missing core facts if clicked prematurely #ux #workspace #chat
- [ ] **[#15] Tiered Brief Priority & Proactive Enrichment**: Structure brief fact-gathering into 3 tiers (Tier 1 Core Required, Tier 2 Medium High-Value Enrichment like products/location/photos, Tier 3 Polish) so the AI proaktif asks enrichment questions before triggering build readiness while allowing users to force-build once Tier 1 is satisfied #engine #discuss #brief

- [ ] **[#01] Contextual WhatsApp CTA Copy**: Fix hardcoded `?text=Halo` to generate rich contextual WhatsApp prefilled messages based on business name and offering #engine #conversion #whatsapp
- [ ] **[#02] Modular Contributor SKILL.md Dropzone**: Decouple and organize engine skill dropzone for plug-and-play community skills #engine #architecture
- [ ] **[#03] High & Medium Security Audit**: Audit tenant isolation, project deletion authorization, auth headers, and prompt injection defense #security #audit
- [ ] **[#08] Photo Upload MVP Stabilization**: Stabilize photo upload pipeline and storage client with static public image output while keeping visual-edit experimental #media #upload
- [ ] **[#04] TanStack Mutation Ergonomics**: Standardize workspace API calls and state invalidations using TanStack Query #architecture #data
- [ ] **[#05] Guaranteed Build Recommendation Tool Call**: Add server-side fallback to emit `build_recommendation` card when brief is complete #discuss #ai
- [ ] **[#06] Dynamic Color Seed Nuance**: Derive distinct OKLCH palettes per niche and support custom user brand color overrides #design #palette
- [ ] **[#07] Prevent Placeholder Dummy Copy**: Fail generator check if banned dummy copy appears in generated files, and ensure chat streams preambles before cards #engine #quality
- [ ] **[#09] Non-Misleading WhatsApp CTA & Copy**: Audit marketing copy, step instructions, and generator prompts to eliminate misleading "pesan langsung" payment gateway claims, ensuring all commerce flows clearly guide visitors to direct WhatsApp orders and consultations #copy #engine #conversion
- [ ] **[#10] High-Signal Snapshot History UX**: Upgrade snapshot changelog summaries to 1-2 sentence AI-generated commit notes, replace static "Pembuatan Awal" with descriptive action titles, and display file modification counts instead of total project files #ux #workspace #history
- [ ] **[#11] Default Scaffold Smooth Scroll**: Configure `html { scroll-behavior: smooth; }` and navbar scroll offset (`scroll-pt-24`) in starter scaffold CSS to ensure smooth navigation anchor jumps across generated sites #scaffold #css #navigation
- [ ] **[#12] Anti-Slop Directive & Section Heading Badge Ban**: Enforce strict prompt directives in English banning repetitive badge/pill chips above section headings (max 1 in hero), and embed unslop principles into core generator prompts #engine #prompts #unslop

## Done

## Future / Icebox

- [ ] **[#13] Workspace Media Gallery Tab**: Research and design a dedicated workspace media tab (Tampilan / Kode / Media) allowing users to inspect uploaded project assets, usage status, and asset identifiers #workspace #media #future