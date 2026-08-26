---

kanban-plugin: board

---

## Backlog



## In Progress



## Needs Revision / Check Again



## Ready for Review

- [ ] **[#22] Workspace Composer Visual Polish & Card Switcher**: Provide bidirectional switcher between card options and free typing separated above the card, distinct input affordance across light/dark mode, and harmonic rounded corners across all chat timeline elements #ui #ux #workspace
- [ ] **[#17] Fast Surgical Site Updates & Autonomous AI Palette Judgment**: Distinguish first-time builds from subsequent site updates by passing existing component manifest for fast 2-3 step surgical edits, and remove prescriptive color seed overrides to restore pure AI creative palette judgment #engine #generator #design
- [ ] **[#15] Tiered Brief Priority & Proactive Enrichment**: Structure brief fact-gathering into 3 tiers (Tier 1 Core Required, Tier 2 Medium High-Value Enrichment like products/location/photos, Tier 3 Polish) so the AI proaktif asks enrichment questions before triggering build readiness while allowing users to force-build once Tier 1 is satisfied #engine #discuss #brief
- [ ] **[#12] Anti-Slop Directive & Section Heading Badge Ban**: Enforce strict prompt directives in English banning repetitive badge/pill chips above section headings (max 1 in hero), and embed unslop principles into core generator prompts #engine #prompts #unslop
- [ ] **[#10] High-Signal Snapshot History UX**: Upgrade snapshot changelog summaries to 1-2 sentence AI-generated commit notes, replace static "Pembuatan Awal" with descriptive action titles, and display file modification counts instead of total project files #ux #workspace #history
- [ ] **[#05] Guaranteed Build Recommendation Tool Call**: Add server-side fallback to emit `build_recommendation` card when brief is complete #discuss #ai
- [ ] **[#07] Prevent Placeholder Dummy Copy**: Fail generator check if banned dummy copy appears in generated files, and ensure chat streams preambles before cards #engine #quality
- [ ] **[#08] Photo Upload MVP Stabilization**: Stabilize photo upload pipeline and storage client with static public image output while keeping visual-edit experimental #media #upload
- [ ] **[#06] Dynamic Color Seed Nuance**: Derive distinct OKLCH palettes per niche and support custom user brand color overrides #design #palette
- [ ] **[#03] High & Medium Security Audit**: Audit tenant isolation, project deletion authorization, auth headers, and prompt injection defense #security #audit
- [ ] **[#02] Modular Contributor SKILL.md Dropzone**: Decouple and organize engine skill dropzone for plug-and-play community skills #engine #architecture


## Done

- [ ] **[#19] Project Status Reconciliation & Realtime Sync**: Reconcile project `buildStatus`, `status`, and latest deployment status so that when a build or edit succeeds, dashboard cards and workspace topbar immediately clear stale failure states and reflect `ready`/`Berhasil` #data #workspace #dashboard
- [ ] **[#21] Preview Iframe Browser History Isolation**: Isolate live preview iframe routing to in-memory/replaceState navigation to prevent iframe sub-page and anchor clicks from polluting the parent window history, ensuring the browser back button always returns to the dashboard #workspace #preview #ux
- [ ] **[#20] Snapshot History Checkout & Iframe Reload**: Fix snapshot checkout button in Workspace History Drawer (`WorkspaceHistoryDrawer.tsx`) to properly activate the selected snapshot and reload the live preview iframe with the checked-out version #workspace #history #preview
- [ ] **[#09] Non-Misleading WhatsApp CTA & Copy**: Audit marketing copy, step instructions, and generator prompts to eliminate misleading "pesan langsung" payment gateway claims, ensuring all commerce flows clearly guide visitors to direct WhatsApp orders and consultations #copy #engine #conversion
- [ ] **[#16] Mobile Workspace Topbar & Discuss Polish**: Remove duplicate project title header in mobile discuss mode, hook up hamburger sheet menu in discuss topbar, and polish build recommendation card padding/typography for mobile viewport #ui #ux #workspace
- [ ] **[#11] Default Scaffold Smooth Scroll**: Configure `html { scroll-behavior: smooth; }` and navbar scroll offset (`scroll-pt-24`) in starter scaffold CSS to ensure smooth navigation anchor jumps across generated sites #scaffold #css #navigation
- [ ] **[#04] TanStack Mutation Ergonomics**: Standardize workspace API calls and state invalidations using TanStack Query #architecture #data
- [ ] **[#01] Contextual WhatsApp CTA Copy**: Fix hardcoded `?text=Halo` to generate rich contextual WhatsApp prefilled messages based on business name and offering #engine #conversion #whatsapp
- [ ] **[#14] Persistent Workspace Composer Action Button**: Add persistent primary build/update action button in the chat composer bar (e.g. `[🚀 Buat Website]` pre-build and `[✨ Perbarui Website]` post-build) with pre-flight readiness checks that guide users to missing core facts if clicked prematurely #ux #workspace #chat
- [ ] **[#18] Admin Users Energy Column & Top-Up Fix**: Add current live energy balance column in `/admin/users` table, display remaining/granted balance clearly, and fix the grant energy mutation endpoint to eliminate the "gagal add energy" error #admin #energy #data


## Future / Icebox

- [ ] **[#13] Workspace Media Gallery Tab**: Research and design a dedicated workspace media tab (Tampilan / Kode / Media) allowing users to inspect uploaded project assets, usage status, and asset identifiers #workspace #media #future




%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[]}
```
%%