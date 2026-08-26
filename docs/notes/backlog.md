---

kanban-plugin: board

---

## Backlog

- [ ] 📜 **[#26] [P1] Backlog Card Formatting, Contextual Icon, and Skill Standardization**: Standardize all task cards with single contextual icon, priority indicator [P0..P3], @author, created date, and clean spacing across Obsidian Kanban board, updating triage-ideas, add-backlog, and add-do-backlog skills #skills #backlog #ux @suryaelidanto 2026-08-26



## In Progress



## Needs Revision / Check Again



## Ready for Review

- [ ] 🔄 **[#27] [P0] Instant Snapshot History Checkout & Automatic Preview Reload**: Fix 409 plan mismatch blocker in snapshot restore route so selecting previous versions activates immediately and automatically reloads the live preview iframe without requiring manual user refreshes #workspace #history #preview #engine @suryaelidanto 2026-08-26

- [ ] 💬 **[#23] [P1] Relentless Multi-Tier Fact Gathering & Anti-Premature Build Guard**: Enforce rigorous sequential probing across Tier 1, Tier 2 (pricing, photos via image_upload, location, USP), and Tier 3 (testimonials, certifications, promo) in discuss prompts and intercept premature build_recommendation cards unless Tier 2 is fully probed or user explicitly triggers manual build #engine #discuss #brief @suryaelidanto 2026-08-26

- [ ] 🎨 **[#22] [P1] Workspace Composer Visual Polish & Card Switcher**: Provide bidirectional switcher between card options and free typing separated above the card, distinct input affordance across light/dark mode, and harmonic rounded corners across all chat timeline elements #ui #ux #workspace @suryaelidanto 2026-08-26

- [ ] ⚡ **[#17] [P1] Fast Surgical Site Updates & Autonomous AI Palette Judgment**: Distinguish first-time builds from subsequent site updates by passing existing component manifest for fast 2-3 step surgical edits, and remove prescriptive color seed overrides to restore pure AI creative palette judgment #engine #generator #design @suryaelidanto 2026-08-26

- [ ] 🧭 **[#15] [P1] Tiered Brief Priority & Proactive Enrichment**: Structure brief fact-gathering into 3 tiers (Tier 1 Core Required, Tier 2 Medium High-Value Enrichment like products/location/photos, Tier 3 Polish) so the AI proaktif asks enrichment questions before triggering build readiness while allowing users to force-build once Tier 1 is satisfied #engine #discuss #brief @suryaelidanto 2026-08-26

- [ ] 🛡️ **[#12] [P1] Anti-Slop Directive & Section Heading Badge Ban**: Enforce strict prompt directives in English banning repetitive badge/pill chips above section headings (max 1 in hero), and embed unslop principles into core generator prompts #engine #prompts #unslop @suryaelidanto 2026-08-26

- [ ] 📜 **[#10] [P2] High-Signal Snapshot History UX**: Upgrade snapshot changelog summaries to 1-2 sentence AI-generated commit notes, replace static "Pembuatan Awal" with descriptive action titles, and display file modification counts instead of total project files #ux #workspace #history @suryaelidanto 2026-08-26

- [ ] 🤖 **[#05] [P1] Guaranteed Build Recommendation Tool Call**: Add server-side fallback to emit `build_recommendation` card when brief is complete #discuss #ai @suryaelidanto 2026-08-26

- [ ] ✍️ **[#07] [P2] Prevent Placeholder Dummy Copy**: Fail generator check if banned dummy copy appears in generated files, and ensure chat streams preambles before cards #engine #quality @suryaelidanto 2026-08-26

- [ ] 📸 **[#08] [P1] Photo Upload MVP Stabilization**: Stabilize photo upload pipeline and storage client with static public image output while keeping visual-edit experimental #media #upload @suryaelidanto 2026-08-26

- [ ] 🎨 **[#06] [P2] Dynamic Color Seed Nuance**: Derive distinct OKLCH palettes per niche and support custom user brand color overrides #design #palette @suryaelidanto 2026-08-26

- [ ] 🔒 **[#03] [P1] High & Medium Security Audit**: Audit tenant isolation, project deletion authorization, auth headers, and prompt injection defense #security #audit @suryaelidanto 2026-08-26

- [ ] 🧩 **[#02] [P2] Modular Contributor SKILL.md Dropzone**: Decouple and organize engine skill dropzone for plug-and-play community skills #engine #architecture @suryaelidanto 2026-08-26



## Done

- [ ] 📸 **[#24] [P0] Permanent Asset Claiming on Send & Global Upload Anti-Abuse Quotas**: Automatically claim and move temporary image uploads to permanent ProjectAsset storage upon send, ensure inlineChatAssetFileParts resolves both temp and permanent buffers as valid data URIs for AI vision turns without relative URL crashes, enforce strict quotas (max 20 assets / 50MB per project, 6 per turn, 3 per ticket message), and unblock project cmt9nb8e200lh4ldw9igj432a #media #upload #security #engine @suryaelidanto 2026-08-26

- [ ] 🧪 **[#25] [P0] TDD Standard Reinforcement & Comprehensive High-Signal Test Audit**: Merge writing-good-tests directly into test-driven-development SKILL.md while preserving Obra Superpowers core structure, codify The Unbreakable Bar and Iron Law of deterministic mechanical testing across AGENTS.md and DEV.md, and audit the 267 test files across the codebase to prune shallow formality assertions and reinforce high-signal boundary contracts #engine #testing #principles #architecture @suryaelidanto 2026-08-26

- [ ] 🔄 **[#19] [P1] Project Status Reconciliation & Realtime Sync**: Reconcile project `buildStatus`, `status`, and latest deployment status so that when a build or edit succeeds, dashboard cards and workspace topbar immediately clear stale failure states and reflect `ready`/`Berhasil` #data #workspace #dashboard @suryaelidanto 2026-08-26

- [ ] 🌐 **[#21] [P1] Preview Iframe Browser History Isolation**: Isolate live preview iframe routing to in-memory/replaceState navigation to prevent iframe sub-page and anchor clicks from polluting the parent window history, ensuring the browser back button always returns to the dashboard #workspace #preview #ux @suryaelidanto 2026-08-26

- [ ] 📜 **[#20] [P1] Snapshot History Checkout & Iframe Reload**: Fix snapshot checkout button in Workspace History Drawer (`WorkspaceHistoryDrawer.tsx`) to properly activate the selected snapshot and reload the live preview iframe with the checked-out version #workspace #history #preview @suryaelidanto 2026-08-26

- [ ] 💬 **[#09] [P1] Non-Misleading WhatsApp CTA & Copy**: Audit marketing copy, step instructions, and generator prompts to eliminate misleading "pesan langsung" payment gateway claims, ensuring all commerce flows clearly guide visitors to direct WhatsApp orders and consultations #copy #engine #conversion @suryaelidanto 2026-08-26

- [ ] 📱 **[#16] [P2] Mobile Workspace Topbar & Discuss Polish**: Remove duplicate project title header in mobile discuss mode, hook up hamburger sheet menu in discuss topbar, and polish build recommendation card padding/typography for mobile viewport #ui #ux #workspace @suryaelidanto 2026-08-26

- [ ] 📜 **[#11] [P2] Default Scaffold Smooth Scroll**: Configure `html { scroll-behavior: smooth; }` and navbar scroll offset (`scroll-pt-24`) in starter scaffold CSS to ensure smooth navigation anchor jumps across generated sites #scaffold #css #navigation @suryaelidanto 2026-08-26

- [ ] ⚡ **[#04] [P2] TanStack Mutation Ergonomics**: Standardize workspace API calls and state invalidations using TanStack Query #architecture #data @suryaelidanto 2026-08-26

- [ ] 💬 **[#01] [P1] Contextual WhatsApp CTA Copy**: Fix hardcoded `?text=Halo` to generate rich contextual WhatsApp prefilled messages based on business name and offering #engine #conversion #whatsapp @suryaelidanto 2026-08-26

- [ ] 🚀 **[#14] [P1] Persistent Workspace Composer Action Button**: Add persistent primary build/update action button in the chat composer bar (e.g. `[🚀 Buat Website]` pre-build and `[✨ Perbarui Website]` post-build) with pre-flight readiness checks that guide users to missing core facts if clicked prematurely #ux #workspace #chat @suryaelidanto 2026-08-26

- [ ] ⚡ **[#18] [P1] Admin Users Energy Column & Top-Up Fix**: Add current live energy balance column in `/admin/users` table, display remaining/granted balance clearly, and fix the grant energy mutation endpoint to eliminate the "gagal add energy" error #admin #energy #data @suryaelidanto 2026-08-26



## Future / Icebox

- [ ] 🖼️ **[#13] [P3] Workspace Media Gallery Tab**: Research and design a dedicated workspace media tab (Tampilan / Kode / Media) allowing users to inspect uploaded project assets, usage status, and asset identifiers #workspace #media #future @suryaelidanto 2026-08-26




%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[]}
```
%%
