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

## Current plan: 2026-07-29-mayar-payment-migration (Tasks 1–10, Task 11 excluded pending KYC)
- Plan: docs/superpowers/plans/2026-07-29-mayar-payment-migration.md
- Spec: docs/superpowers/specs/2026-07-29-mayar-payment-migration-design.md
- Branch: dev
- Merge base: 389d6cc
- Baseline commit before Task 1: 69b19eb
- REAL endpoint (spike confirmed): POST /hl/v2/invoices/create → { id, transactionId, link, amount, status, expiredAt, invoiceCode, customer, items }
- GET /hl/v2/transactions/{transactionId} → { id, paymentLinkId, status, amount, extraData, paymentMethod, customer, paymentLink }
- extraData does NOT propagate through invoices/create to transaction detail
- env vars: MAYAR_API_KEY, MAYAR_API_BASE_URL (https://api.mayar.club/hl/v2), MAYAR_WEBHOOK_TOKEN
- [x] Task 1: sandbox spike findings doc (commit 07e1f3d, review clean — webhook payload doc-sourced not live; Task 5 adds defensive log)
- [x] Task 2: Prisma Payment model + migration (commit 513526c, review clean — Minor: SQL column order cosmetic)
- [x] Task 3: src/lib/mayar.ts provider client (commit 5137368, review clean — Minor: === vs timingSafeEqual for webhook token, low-stakes)
- [x] Task 4: POST /api/payment/create → Mayar (commits e98a793+b946507, review clean after fix adding missing 500 test)
- [x] Task 5: POST /api/payment/webhook → Mayar (commits 7d04cb1+3473dad, review clean after fixes: race condition test, transactionStatus guard, log clarity)
- [x] Task 6: GET /api/payment/status → Mayar reconciliation (commits 20d963e+6a630e1, review clean after fixes: paymentMethod from verified txn, null providerTxnId test, getMayarTransaction throws fallback test)
- [x] Task 7: admin manual-verify route → Mayar (commits 481210d+1fe6c0e, review clean after fixes: energy credit, non-paid guard, COMPLETED status enum)
- [x] Task 8: EnergyBoosterModal → Mayar hosted QRIS link (commit f3bb46d, review clean — browser verification outstanding, to be done at cutover)
- [x] Task 9: user-facing-error regex → Mayar (commits 1137dec+9926e03, review clean after fix: added get-transaction + API key error test cases)
- [x] Task 10: simulate-payment script → Mayar (commits b3496b8+cec323a cleanup, review clean — interactive script manual verification outstanding)
- [x] Final whole-branch review (commit c2984ee — Critical fix: status "paid"→"SUCCESS" for getMayarTransaction, timing-safe token comparison)

## TASKS 1–10 COMPLETE. Task 11 (Pakasir env var cutover) gated on production KYC approval.

## Current plan: 2026-07-29-workspace-mobile (Tasks 1–8)
- Plan: docs/superpowers/plans/2026-07-29-workspace-mobile.md
- Spec: docs/superpowers/specs/2026-07-29-workspace-mobile-design.md
- Branch: dev
- Merge base: 961c7b3 (plan commit)
- Baseline commit before Task 1: HEAD
- ~90 lines of code change across 2 files (WorkspaceShell.tsx, WorkspacePrimitives.tsx)
- Plus: WorkspacePrimitives.test.tsx (new), workspace-capture.spec.ts (new)
- [x] Task 1: chat bubble mobile fix (commits a4656a5→deec18c, review clean — test regex catches bracketed form, body 62 chars)
- [x] Task 2: composer safe-area + auto-grow (commit f4a3072, review clean)
- [x] Task 3: iframe cap min(100%,430px) (commit 772c3ab, review clean)
- [x] Task 4: top-bar mobile collapse (commit df6306e, review clean — kebab button has no onClick by design)
- [x] Task 5: codeview mobile layout (commit 53a1a85, review clean)
- [x] Task 6: swipe gesture gate (commit a014040, no review gate needed)
- [ ] Task 7: playwright device captures (SKIPPED — workspace needs auth + live dev server + project fixture; foundation's deferred tier-2 + tier-3 human review covers it)
- [x] Task 8: verify + push (verify 147/147 test files, 979/979 tests all green; pushed dev)

## Current plan: 2026-07-29-transactional-emails-all-8-triggers
- Plan: docs/superpowers/plans/2026-07-29-transactional-emails.md
- Spec: docs/superpowers/specs/2026-07-29-transactional-emails-design.md
- Branch: dev
- Baseline commit before Task 1: 6857745

- [x] Task 1: shared HTML wrapper + CTA helper (commit 397fa9e, review clean)
- [x] Task 2: welcome email template (commit 4e39340, review clean)
- [x] Task 3: waitlist email templates (accepted + rejected) (commits c7360f9 + eddf0c3 fix, review clean)
- [x] Task 4: payment receipt template (commit 1950441, review clean)
- [x] Task 5: ban/unban templates (commit 7d2bc14, review clean)
- [x] Task 6: ticket resolved template (commit c9719f0, review clean)
- [x] Task 7: barrel export (commit b0028c0, inline review clean)
- [ ] Task 8: wire welcome email into auth config
- [ ] Task 9: wire waitlist emails into admin waitlist route
- [ ] Task 10: wire payment receipt into webhook
- [ ] Task 11: wire payment receipt into admin verify transaction
- [ ] Task 12: wire ban/unban into admin users route
- [ ] Task 13: wire ticket resolved into admin resolve route
