# Changelog

Short, plain-English daily updates. Keep entries general, one line each, and useful for internal tracking or lightweight customer reporting later.

## 2026-07

### 2026-07-28 — Phase 1 security correctness

- **Auth.js upgrade**: `@auth/core` 0.34.3 → 0.41.3, `@auth/prisma-adapter` 2.11.2 → 2.11.3. Closes critical homoglyph email bypass (admin allowlist is an email match, so this was a privilege-escalation path), plus the getToken() DoS and PKCE-cookie binding advisories. JWT session round-trip after upgrade: **PENDING MANUAL VERIFICATION** (sign in, restart dev server without clearing cookies, confirm still signed in — record any forced re-login).
- **Payment webhook race fix**: claim is now a single conditional `updateMany` on `Payment.status = "PENDING" → "COMPLETED"`. Exactly one concurrent delivery per `orderId` can grant energy; replaces the read-then-update that took no lock and could double-grant.
- **Energy deduction race fix**: per-user `pg_advisory_xact_lock(hashtext(userId))` before the daily-cap `SUM` + `INSERT`. Advisory lock is transaction-scoped, releases on commit/rollback, and serializes only the per-user hot path (no cross-user contention).
- **Real-DB integration test project**: new `tests/integration/**/*.itest.ts` (`.itest.ts` so the `unit` project doesn't pick them up) with a `resetDatabase` + `createTestUser` harness. CI step added to `quality.yml`. Mocked-Prisma unit suite cannot express READ COMMITTED semantics, so the race tests must hit a real Postgres.
- **Production preflight**: `TURNSTILE_SECRET_KEY` now required alongside `OTP_SPACE_API_KEY` in `assertProductionConfigReady()`. Without it, the production boot preflight fails loudly rather than silently breaking every Turnstile-protected form. `docs/deployment.md` "Minimum production env" updated.
- **Dependency hygiene**: `bun update` across 109 packages. 0 critical, 0 moderate advisories remain. Residual 7 high advisories are all transitive dev/build-path (fast-uri, brace-expansion, postcss, js-yaml) and are not reachable from production runtime.
- **Docs**: removed two fabricated security specs (`2026-07-27-comprehensive-security-hardening.md`, `2026-07-27-security-hardening-spec.md`) that described a different application; corrected `ADMIN_EMAILS` comment in `.env.example` to state the allowlist is fail-closed (empty grants nobody, in every environment).

### 2026-07-25 — 9-topic batch

- **R2 display-media storage**: shared `r2-client.ts` (consolidated Sig V4 from two dup copies); `PROJECT_ASSET_STORAGE_PROVIDER` (local|r2); `ProjectAsset.publicUrl`; serve-route 302→R2; live round-trip verified against `umkmcepat-dev`.
- **Photo-upload → generation + published site**: composer attachment strip (blob previews, cap 6, X-remove); upload-on-send to R2; VL agent places images via `/media/<assetId>`; "Ubah"/"Komentar"/"Ganti gambar" labels; image-replace reliability fix (capture `element.src`).
- **Waitlist admin + toggle**: `/admin` dashboard (approve/decline, mobile-first); `WAITLIST_ENABLED` env gate (replaces implicit `NODE_ENV`); pre-fill last submission on rejection.
- **Mobile everywhere (foundation)**: `MobileNav` bottom-nav + `mobile-sheet` primitive; tier-1 audit helpers (touch/font/overflow); tier-2 device-capture suite. Per-route polish + workspace gestures pending live-render iteration.
- **Prettier-on-gen**: `formatGeneratedSource` helper (cached, fire-and-forget); wired into generate + edit post-commit sweeps.
- **Codebase cleanliness**: `DEV.md` Cleanliness contract (behavior-preserving refactors, comment hygiene); Graphify live.
- **Email + OTP adapters**: Resend adapter + hardened OTP (`/v1/send`, mock-in-dev/throw-in-prod, `crypto.randomInt`); production startup guard.
- **Polish + security**: dark chrome rollback; SEO-maxed homepage copy + JSON-LD `@graph`; error-leak fixes (`mapToUserFacingError`); waitlist magic-byte; postMessage origin; Umami + Uptime Kuma; per-page published-site SEO head + sitemap expansion.
- **Docs sync**: architecture/deployment/README/CLAUDE/CHANGELOG reconciled to shipped reality; `.env`/`.env.example` 1:1.

## 2026-06

### 2026-06-26

- Made Storybook and shared dialog/login-consent surfaces dark-first to match the current product chrome.
- Added a docs-as-part-of-the-change rule so future behavior/setup/env/architecture/provider/storage/deployment/UI/product-flow changes update canonical docs or explicitly state no doc change is needed.
- Simplified project docs around `PRINCIPLES.md`, two active topic docs, slim agent/dev onboarding, removed stale manual index docs, and aligned Docker/CI storage env names.

### 2026-06-25

- Redesigned the signed-in homepage project list with a calmer recent-work layout and local abstract project marks.
- Added a design governance rule requiring new reusable or repeated UI patterns to land in Storybook with the change.
- Added shared avatar/surface primitives and wired profile/legal/account UI to the atomic Storybook catalog.
- Simplified Storybook into an atomic design-system catalog with foundations, reusable atoms/molecules/organisms, component tests, and optional Chromatic wiring.
- Added login consent with Cloudflare Turnstile support and canonical Terms/Privacy agreement before Google sign-in.
- Added a Terms clause clarifying service availability and the optional paid Energy Booster.
- Added local-first object storage for profile avatars, with env placeholders for future Cloudflare R2.
- Added an account dropdown, dark profile page, editable display name/avatar, and personalized homepage greeting for signed-in users.
- Changed primary chat composers to send with Enter while keeping Shift+Enter for new lines.
- Fixed guided discussion memory so option-card answers update the project brief before AI asks the next question.
- Polished the workspace busy and question composer states so AI work feels like a native status flow instead of a generic warning card.
- Tightened discussion mode so unclear briefs produce UI choices by default, with per-question custom answers when presets do not fit.
- Added a strict discussion-turn contract so AI chat text, brief updates, and UI option cards are produced as one coherent response without duplicate option text.
- Added hidden project chat memory with summary/facts compaction so long workspace conversations stay continuous without exposing context internals.
- Added an optional local Graphify workflow so AI-agent users can generate and query a codebase graph without committing generated artifacts.

### 2026-06-24

- Added a shared codebase overview so fresh agents can understand the project faster.
- Added repo rules to keep project context notes and change logs updated when meaningful changes happen.
