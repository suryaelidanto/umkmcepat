---

kanban-plugin: board

---

## Backlog

## In Progress

## Needs Revision / Check Again

## Ready for Review

- [ ] 🔬 **[#53] End-to-End Generator Quality Rollout and Observability**: Introduce the visual-engine changes behind a controlled rollout with per-stage timing, writer and reviewer model IDs, review scores, rejection reasons, revision counts, energy cost, and fallback evidence so quality gains can be measured and rollback remains safe without weakening gates #engine #data

- [ ] 🧪 **[#50] Generated-Site Visual Quality Evaluation Corpus**: Build a versioned corpus of representative Indonesian UMKM briefs with mobile and desktop browser evidence, blind human calibration, category-complete visual ratings, genericity rejection metrics, and prompt/model A/B comparison outside deterministic unit tests #engine #data

- [ ] 🔄 **[#44] Bounded Visual Revision and Re-Review Pass**: Feed low-rated visual-review findings into one bounded revision of the existing candidate, rerun source, build, browser, and final visual checks, forbid post-review mutation, and retain the prior successful version when revision cannot pass #engine #ux #data

- [ ] 👁️ **[#43] Fail-Closed Rendered Visual Review Gate**: Connect mobile and desktop browser evidence to `runOutcomeVisualReview`, require every review category to reach the existing confidence and quality floors before a candidate can become Preview, preserve the last successful Preview on failure, and surface actionable review evidence without changing discuss, card, history, publish, or deployment contracts #engine #ux #data

- [ ] 📚 **[#45] Real Generated-Site Skill Loading Enforcement**: Remove preemptive `skillsRead` bookkeeping, ensure required Impeccable and shadcn guidance actually enters model context before source writes, keep tool progress honest, and preserve current skill registry, energy charging, and write restrictions #engine #security

- [ ] ✂️ **[#46] Outcome-First Generator Prompt Diet**: Audit and surgically reduce duplicated, conflicting, and implementation-prescriptive generator instructions so prompts define accepted facts, visitor jobs, actions, omissions, safety, accessibility, and quality outcomes while restoring agent ownership of composition, typography, palette, rhythm, section order, and component choice #engine #copy

- [ ] 🎞️ **[#47] Progressive-Enhancement Motion Policy**: Remove mandatory repeated `motion/react` reveal recipes, require generated content to remain visible and usable without JavaScript, intersection observers, or animation support, preserve reduced-motion behavior, and test browser evidence against hidden-content and excessive-empty-space regressions #engine #ux #scaffold

- [ ] 🎭 **[#48] Structured Business-Specific Creative Direction Contract**: Replace free-form visual thesis handling with validated structured direction covering visitor tension, accepted business anchors, material vocabulary, character, first-view intent, signature idea, mobile intent, quiet priorities, factual boundaries, and explicit genericity risks without prescribing layouts or implementation values #engine #data

- [ ] 🧭 **[#49] Multi-Direction Creative Exploration and Selection**: Generate three concise, materially distinct creative directions for each new build, rank them against business specificity, customer trust, factual grounding, differentiation, and asset feasibility, select one before implementation, and avoid multiplying full-site generation cost #engine #ux

- [ ] 🛡️ **[#51] Accepted-Fact Claim Provenance Gate**: Trace every generated commercial claim, contact detail, price, date, delivery promise, popularity label, guarantee, and product attribute to accepted contract facts, fail closed on dummy or unsupported values, and preserve concise grounded connective copy #engine #security #copy

- [ ] 🧱 **[#52] Generation Pipeline Non-Regression Contract**: Add deterministic integration coverage for discuss-to-build handoff, workspace cards, protected source boundaries, snapshot creation, Preview preservation, history, surgical edits, publish pointers, energy accounting, and failure recovery before changing generation taste infrastructure #engine #workspace #data

- [ ] 🖱️ **[#29] Visual Edit Iframe Selector & Smart Target Detection**: Overhaul runtime proxy click listeners and bounding box calculation to accurately resolve target elements, prioritizing semantic tags and image containers without getting blocked by transparent overlays #workspace #preview #ux #engine

- [ ] 📜 **[#10] High-Signal Snapshot History UX**: Upgrade snapshot changelog summaries to 1-2 sentence AI-generated commit notes, replace static "Pembuatan Awal" with descriptive action titles, and display file modification counts instead of total project files #ux #workspace #history
- [ ] 🧩 **[#02] Modular Contributor SKILL.md Dropzone**: Decouple and organize engine skill dropzone for plug-and-play community skills #engine #architecture
- [ ] 🔒 **[#03] High & Medium Security Audit**: Audit tenant isolation, project deletion authorization, auth headers, and prompt injection defense #security #audit

## Done

- [ ] 🖼️ **[#41] Media Tab Reference Selection to Chat Prompt**: Allow users to click or drag assets from workspace media gallery directly into chat composer as referenced inputs #workspace #media #ux #future
- [ ] 🎨 **[#40] Symmetrical Upload Loading Spinner & Attachment Deduplication**: Center the upload/send loading spinner symmetrically within the action button and prevent duplicate attachment rendering in composer previews and chat turns #ui #ux #media
- [ ] ⚡ **[#39] Surgical Update Site Preservation & Non-Destructive Generator Policy**: Enforce strict preservation of built components, layouts, and typography during subsequent updates, restricting generator steps to targeted component modifications without full-site regeneration #engine #generator #ai
- [ ] 🧹 **[#38] Purge Casual Build Handoff Slop**: Remove informal slang string `sisanya bisa lo tambahin nanti` from build handoff generator and replace with professional Indonesian acknowledgement #copy #engine #unslop
- [ ] 💬 **[#37] Separate Chat Message Bubbles & Prompt Deduplication**: Split distinct action guiding prompts into standalone chat bubbles with unique keys instead of merging repeated text into a single assistant bubble #workspace #chat #ui #ux
- [ ] ⚡ **[#31] Server-Side WebP Image Optimization Pipeline on Permanent Asset Claim**: Integrate Sharp pipeline to auto-orient, clean EXIF metadata, scale to max 1920px Full HD, and compress all permanent project uploads to high-efficiency WebP format #media #upload #engine #perf
- [ ] ⚡ **[#32] Smart Surgical Update Engine & Pre-Injected Intent Router**: Classify user edit turns into targeted intent categories (media replace, style palette, copy update, full restructure), pre-inject existing component code into prompt context to eliminate read_file overhead, and enforce dynamic 2-3 step execution without rewriting untouched layout files #engine #generator #ai #perf
- [ ] 🖼️ **[#28] Workspace Media Management Tab & AI Asset Context**: Add dedicated workspace media gallery tab (Tampilan / Kode / Media) with live asset cards, active site usage badges, direct image upload/replace/delete, and inject active media manifest into generator prompts so AI accurately updates image slots without guessing #workspace #media #ui #ux #engine
- [ ] 🔄 **[#27] Instant Snapshot History Checkout & Automatic Preview Reload**: Fix 409 plan mismatch blocker in snapshot restore route so selecting previous versions activates immediately and automatically reloads the live preview iframe without requiring manual user refreshes #workspace #history #preview #engine
- [ ] 💬 **[#23] Relentless Multi-Tier Fact Gathering & Anti-Premature Build Guard**: Enforce rigorous sequential probing across Tier 1, Tier 2 (pricing, photos via image_upload, location, USP), and Tier 3 (testimonials, certifications, promo) in discuss prompts and intercept premature build_recommendation cards unless Tier 2 is fully probed or user explicitly triggers manual build #engine #discuss #brief
- [ ] 🎨 **[#22] Workspace Composer Visual Polish & Card Switcher**: Provide bidirectional switcher between card options and free typing separated above the card, distinct input affordance across light/dark mode, and harmonic rounded corners across all chat timeline elements #ui #ux #workspace
- [ ] ⚡ **[#17] Fast Surgical Site Updates & Autonomous AI Palette Judgment**: Distinguish first-time builds from subsequent site updates by passing existing component manifest for fast 2-3 step surgical edits, and remove prescriptive color seed overrides to restore pure AI creative palette judgment #engine #generator #design
- [ ] 🧭 **[#15] Tiered Brief Priority & Proactive Enrichment**: Structure brief fact-gathering into 3 tiers (Tier 1 Core Required, Tier 2 Medium High-Value Enrichment like products/location/photos, Tier 3 Polish) so the AI proaktif asks enrichment questions before triggering build readiness while allowing users to force-build once Tier 1 is satisfied #engine #discuss #brief
- [ ] 🛡️ **[#12] Anti-Slop Directive & Section Heading Badge Ban**: Enforce strict prompt directives in English banning repetitive badge/pill chips above section headings (max 1 in hero), and embed unslop principles into core generator prompts #engine #prompts #unslop
- [ ] 🎨 **[#06] Dynamic Color Seed Nuance**: Derive distinct OKLCH palettes per niche and support custom user brand color overrides #design #palette
- [ ] 🤖 **[#05] Guaranteed Build Recommendation Tool Call**: Add server-side fallback to emit `build_recommendation` card when brief is complete #discuss #ai
- [ ] ✍️ **[#07] Prevent Placeholder Dummy Copy**: Fail generator check if banned dummy copy appears in generated files, and ensure chat streams preambles before cards #engine #quality
- [ ] 📸 **[#08] Photo Upload MVP Stabilization**: Stabilize photo upload pipeline and storage client with static public image output while keeping visual-edit experimental #media #upload
- [ ] 🎯 **[#33] Build Checkpoint State & Intentional Update Guiding Flow**: Track last built message turn checkpoint so clicking Perbarui Website when no pending edits exist guides user with clarifying prompt instead of executing redundant blind builds #workspace #chat #ux #engine
- [ ] ⚡ **[#30] Direct Click-to-Replace Image Popover & Fast Slot Swap**: Connect visual edit image targets to an instant swap popover allowing users to upload or pick replacement assets directly, surgically updating site.ts slot references with immediate preview reload #workspace #media #preview #ux
- [ ] 🖼️ **[#34] Asset Deduplication & Adaptive Unique Gallery Layout Engine**: Enforce strict asset URL deduplication in site.ts and generator prompt directives preventing duplicate image rendering, with adaptive gallery layouts tailored to exact real photo counts #media #engine #generator #ux
- [ ] 💬 **[#36] WhatsApp-First Fact Gathering & Conditional Skip Controls**: Enforce direct WhatsApp number gathering for primary contact without channel picker distractions, mandate 3-4 structured options on target audience and USP cards, and add conditional skip buttons for non-required enrichment tiers #discuss #brief #ux #conversion
- [ ] 🎨 **[#35] Impeccable Craft Engine Integration & Reference-First Loop**: Wire Impeccable Craft reference-first visual loop (art direction, visual thesis, signature moments, anti-default hierarchy) into generator engine, pairing with live browser screenshot critic to eliminate AI slop layouts #engine #design #generator #skills
- [ ] 📜 **[#26] Backlog Card Formatting, Contextual Icon, and Skill Standardization**: Standardize task cards with single contextual icon and clean spacing across Obsidian Kanban board, updating triage-ideas, add-backlog, and add-do-backlog skills #skills #backlog #ux
- [ ] 📸 **[#24] Permanent Asset Claiming on Send & Global Upload Anti-Abuse Quotas**: Automatically claim and move temporary image uploads to permanent ProjectAsset storage upon send, ensure inlineChatAssetFileParts resolves both temp and permanent buffers as valid data URIs for AI vision turns without relative URL crashes, and enforce strict anti-abuse upload quotas #media #upload #security #engine
- [ ] 🧪 **[#25] TDD Standard Reinforcement & Comprehensive High-Signal Test Audit**: Merge writing-good-tests directly into test-driven-development SKILL.md while preserving Obra Superpowers core structure, codify The Unbreakable Bar and Iron Law of deterministic mechanical testing across AGENTS.md and DEV.md, and audit the 267 test files across the codebase to prune shallow formality assertions and reinforce high-signal boundary contracts #engine #testing #principles #architecture
- [ ] 🔄 **[#19] Project Status Reconciliation & Realtime Sync**: Reconcile project `buildStatus`, `status`, and latest deployment status so that when a build or edit succeeds, dashboard cards and workspace topbar immediately clear stale failure states and reflect `ready`/`Berhasil` #data #workspace #dashboard
- [ ] 🌐 **[#21] Preview Iframe Browser History Isolation**: Isolate live preview iframe routing to in-memory/replaceState navigation to prevent iframe sub-page and anchor clicks from polluting the parent window history, ensuring the browser back button always returns to the dashboard #workspace #preview #ux
- [ ] 📜 **[#20] Snapshot History Checkout & Iframe Reload**: Fix snapshot checkout button in Workspace History Drawer (`WorkspaceHistoryDrawer.tsx`) to properly activate the selected snapshot and reload the live preview iframe with the checked-out version #workspace #history #preview
- [ ] 💬 **[#09] Non-Misleading WhatsApp CTA & Copy**: Audit marketing copy, step instructions, and generator prompts to eliminate misleading "pesan langsung" payment gateway claims, ensuring all commerce flows clearly guide visitors to direct WhatsApp orders and consultations #copy #engine #conversion
- [ ] 📱 **[#16] Mobile Workspace Topbar & Discuss Polish**: Remove duplicate project title header in mobile discuss mode, hook up hamburger sheet menu in discuss topbar, and polish build recommendation card padding/typography for mobile viewport #ui #ux #workspace
- [ ] 📜 **[#11] Default Scaffold Smooth Scroll**: Configure `html { scroll-behavior: smooth; }` and navbar scroll offset (`scroll-pt-24`) in starter scaffold CSS to ensure smooth navigation anchor jumps across generated sites #scaffold #css #navigation
- [ ] ⚡ **[#04] TanStack Mutation Ergonomics**: Standardize workspace API calls and state invalidations using TanStack Query #architecture #data
- [ ] 💬 **[#01] Contextual WhatsApp CTA Copy**: Fix hardcoded `?text=Halo` to generate rich contextual WhatsApp prefilled messages based on business name and offering #engine #conversion #whatsapp
- [ ] 🚀 **[#14] Persistent Workspace Composer Action Button**: Add persistent primary build/update action button in the chat composer bar (e.g. `[🚀 Buat Website]` pre-build and `[✨ Perbarui Website]` post-build) with pre-flight readiness checks that guide users to missing core facts if clicked prematurely #ux #workspace #chat
- [ ] ⚡ **[#18] Admin Users Energy Column & Top-Up Fix**: Add current live energy balance column in `/admin/users` table, display remaining/granted balance clearly, and fix the grant energy mutation endpoint to eliminate the "gagal add energy" error #admin #energy #data

## Future / Icebox

- [ ] 🛡️ **[#42] Advanced Prompt Injection & UMKM Domain Scope Detector**: Deep adversarial jailbreak detection and heuristic domain relevance classification for non-business prompts #security #engine #future

%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[],"move-tags":true,"tag-colors":[{"tagKey":"#engine","color":"#c084fc","backgroundColor":"rgba(168, 85, 247, 0.15)"},{"tagKey":"#workspace","color":"#22d3ee","backgroundColor":"rgba(6, 182, 212, 0.15)"},{"tagKey":"#ui","color":"#f472b6","backgroundColor":"rgba(236, 72, 153, 0.15)"},{"tagKey":"#ux","color":"#a78bfa","backgroundColor":"rgba(139, 92, 246, 0.15)"},{"tagKey":"#security","color":"#f87171","backgroundColor":"rgba(239, 68, 68, 0.15)"},{"tagKey":"#media","color":"#2dd4bf","backgroundColor":"rgba(20, 184, 166, 0.15)"},{"tagKey":"#upload","color":"#38bdf8","backgroundColor":"rgba(56, 189, 248, 0.15)"},{"tagKey":"#skills","color":"#fb923c","backgroundColor":"rgba(251, 146, 60, 0.15)"},{"tagKey":"#backlog","color":"#60a5fa","backgroundColor":"rgba(96, 165, 250, 0.15)"},{"tagKey":"#copy","color":"#34d399","backgroundColor":"rgba(52, 211, 153, 0.15)"},{"tagKey":"#scaffold","color":"#f43f5e","backgroundColor":"rgba(244, 63, 94, 0.15)"},{"tagKey":"#data","color":"#e879f9","backgroundColor":"rgba(232, 121, 249, 0.15)"}]}
```
%%
