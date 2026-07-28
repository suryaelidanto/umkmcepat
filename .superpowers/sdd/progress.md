# Phase 2 progress

## Constraints
- Plan: docs/superpowers/plans/2026-07-28-prod-hardening-phase-2-image-headers-streaming.md
- Branch: dev
- Phase 1 complete (CI green)
- Other agents active on dev (admin-dashboard, photo-upload, roadmap-thinking, support-ticket). Phase 2 file boundary verified safe.
- HSTS value: max-age=63072000; includeSubDomains (no preload)
- Docker may be unavailable on this host; implementer must surface and fall back.

## Tasks
- [x] Task 1: .dockerignore exclusions (commit ffa56e1, review clean)
- [x] Task 2: prod-deps stage (commit 4f24b50, review clean)
- [x] Task 3: HSTS (commit ace96f9, review clean)
- [x] Task 4: CSP report-only (commit 065154d, review clean)
- [x] Task 5: /edit SSE conversion (commit cc39211/9ab1289, review clean)
- [x] Task 6: CSP enforce (commit 1c87ce3, review clean)
- [x] Task 7: Phase gate (commit pending, review clean)

## Current plan: 2026-07-28-admin-settings-dirty-sync
- [x] Task 1: dirty-key helper (commits 9aff574 + 83c264a fix, vitest 9/9 pass, review clean)
- [x] Task 2: wire into route (commit b8fa9e0, bun run check green, review clean)
- [x] Task 3: manual smoke — deferred to user (browser-bound; reviewer covered behavioral diff + bun run check green)

## Current plan: 2026-07-28-upload-consistency-and-moderation
- [x] Task 1: Shared image-format detection module (commit b596e16, review clean)
- [x] Task 2: Re-export format detection from project-assets.ts (commit 57c47dc, review clean)
- [x] Task 3: 8-char minimum prompt length (commit 144877e, review clean)
- [x] Task 4: Extend moderateProjectRequest to accept images + retry-once (commit c8e7228, review clean)
- [x] Task 5: Replace bare `catch {}` with structured logging at the three moderation call sites (commit ab00fcc, review clean)
- [x] Task 6: Workspace upload gets image-only moderation (commit 56c0b91, review clean)
- [x] Task 7: Support ticket upload — fix S3 key bug + use magic-byte detection (commit ff678e6, review clean)
- [x] Task 8: Home create-project becomes multipart + persists files in one handler (commit b29e3b9, vitest 17/17 pass, review clean)
- [x] Task 9: HomePromptForm switches to multipart, deletes the client upload loop (commit 032cc21)
- [x] Task 10: Delete the sessionStorage handoff in WorkspaceShell (commit 3b451fc)
- [x] Task 11: Final gate (bun run check: 2 pre-existing DB-first test failures unrelated to this plan)

## Current plan: 2026-07-28-admin-settings-db-first
- Plan: docs/superpowers/plans/2026-07-28-admin-settings-db-first.md
- Spec: docs/superpowers/specs/2026-07-28-admin-settings-db-first-design.md
- Branch: dev (shared with other agents — stage named files only, never `git add -A`)
- Baseline commit before Task 1: 90ffa12
- Pre-flight decisions (user-approved):
  - Task 9 EXTENDS the existing `src/routes/-_main.admin.settings.helpers.ts` (leading `-`
    is TanStack's route-exclusion prefix; already imported by the settings route). Widen
    its `SettingEntry`, append `groupByTier`. Do NOT create an unprefixed duplicate.
  - Proceed on dev with per-task commits; no worktree.
- Goal: AppSetting (DB) always beats .env. 58 registry entries across 7 categories,
  basic/advanced tiering, no-TTL snapshot primed in start.ts middleware.

- [x] Task 1: registry schema fields (tier/env/min/max/requiresRestart) (commit 44c4742, review clean)
- [x] Task 2: env + bounds on existing 25 entries (commit e553e2f, review clean)
- [x] Task 3: no-TTL snapshot layer + primeSettingCache (commit a06cfc2, review clean)
- [x] Task 4: prime in start.ts middleware (commit 453bd64, review clean)
- [x] Task 5: unify admin env map + bounds validation (commit 7f59f50, review clean)
- [x] Task 6: ai category (12 new) + rewire consumers (commit 633e0a8, review clean)
- [x] Task 7: economics category (7 new) + rewire user-credits (commit 902b7fd, review clean)
- [x] Task 8: runtime + limits categories (13 new) + rewire consumers (commit 6e4c64f, review clean)
- [x] Task 9: admin UI tier split + disclosure + restart badge (commit 22f6333, review clean)
- [x] Task 10: docs, env drift, final gate (commit aa05d8a, review clean)
