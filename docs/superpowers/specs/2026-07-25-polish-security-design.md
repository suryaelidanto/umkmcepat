# Polish + Security Hardening — Design

**Date:** 2026-07-25
**Topic:** 8 of the eight-topic roadmap (see `umkmcepat-eight-topic-roadmap` memory); added late per user's polish + security concerns.
**Status:** Design approved; pending plan + implementation.

## Goal

Polish the app to a consistent dark chrome + SEO-maxed homepage copy + tighten every trust-boundary so no secret, raw backend error, or internal leaks to the browser. One cohesive hardening + polish pass that didn't fit cleanly into the locked 7 topics.

## Why

Five concerns the user raised: (1) the chrome is supposed to be dark `#151515` but the body/NotFound/MainChrome paint cream `#fcfbf8` → a mixed-scheme regression; (2) raw backend errors reach the user in places (OTP routes, Pakasir, preview stream, runtime-events logText) — "filter default just works"; (3) the homepage copy is generic ("AI Website Builder") instead of outcome-led + SEO-maxed; (4) security edge cases (no secret leak, backend-only processing, no network leak) — a full audit was run; (5) docs must be updated last (topic 9).

## Decisions (locked during brainstorming)

### Polish
1. **Roll back TO dark.** Body root (`__root.tsx:103`), `MainChrome.tsx:109,122`, NotFound (`__root.tsx:69`) → dark `#151515` (the established Header/Footer/Hero chrome). The `bg-white` buttons + preview iframe stay (intentional accents). No theme toggle (none exists; not adding one).
2. **Homepage copy = Direction B, SEO-grounded** (built on keyword research, 2026-07-25):
   - **H1:** `Website yang bikin usahamu ketemu pembeli. 100% gratis.` — with an animated gradient underline on `100% gratis` (scroll-in draw) so the freeness visually lands.
   - **Sub:** `Tulis aja usahamu — warung, toko, jasa. AI susun website yang siap dibagikan ke Google & WhatsApp, terima QRIS, dan bikin pelanggan gampang nemu kamu. Tanpa ngoding.` (no "100% gratis" repeat; LSI woven: Google, WhatsApp, QRIS, toko, dibagikan, tanpa ngoding).
   - **`<title>`:** `Buat Website UMKM Gratis – AI 5 Menit | UMKM Cepat` (55 chars ≤58; keyword front-loaded; en-dash; brand last).
   - **Meta description:** `Buat website UMKM gratis yang datangkan pembeli dari Google & WhatsApp, terima QRIS. AI susun 5 menit, tanpa ngoding. Mulai — gratis.` (147 chars ≤152; "gratis" qualified once).
   - **Tagline:** `Website UMKM yang ketemu pembeli.` (outcome-led; for wordmark/footer/social).
   - Primary keyword: `buat website UMKM gratis` (high demand, transactional, less saturated than "jasa website"). Exploitable gap: competitors sell *a website*; UMKM Cepat sells the *outcome* (buyers).
3. **JSON-LD `@graph` upgrade** (replaces the `WebSite`-only block in `__root.tsx`): `Organization` (name, url, logo, sameAs→GitHub) + `WebSite` + `SearchAction` (sitelinks search-box eligibility) + `SoftwareApplication` (operatingSystem:`Web`, applicationCategory:`BusinessApplication`, offers.price:`0`, priceCurrency:`IDR`). **No `aggregateRating` until real reviews exist** (Google manual-penalty risk).
4. **LSI woven, not stuffed:** `UMKM` (title/H1/meta), `gratis` (qualified), `toko` (sub), `pelanggan/pembeli` (H1/sub), `Google` (sub/meta), `WhatsApp` (sub/meta), `QRIS` (sub/meta), `dibagikan` (sub), `tanpa ngoding` (sub/meta), `5 menit` (title/meta), `warung/jasa` (sub examples).

### Security (audit-driven; the big architecture is sound — no real secret leak found)
5. **No secret leak (confirmed).** All 7 secrets server-only; no `NEXT_PUBLIC_*SECRET*`; build logs scrub secrets (`build-logs.ts:13-21`); no source maps shipped; no IDOR (every project route re-checks ownership); generated sites in prod are static-only (supervisor `noop`, build exec off — zero runtime-escape surface). No action needed beyond keeping it that way.
6. **Error-leak fixes (the real residual leaks):**
   - `api.payment.create.ts:88` — stop echoing raw Pakasir `errorText` → generic Indonesian `Pembayaran gagal. Coba lagi.`, log internally.
   - `api.projects.preview.ts:505` — strip `onError` to a generic Indonesian string in production; AI-SDK stream errors can carry provider internals.
   - `api.auth.otp.send.ts:59` + `api.auth.otp.verify.ts:53` — stop returning raw `result.error`; route through the Indonesian-summary pattern (this overlaps with topic-7's email/OTP plan — do it there to avoid double-touching the routes).
   - `api.projects.$id.runtime-events.ts:40` — stop selecting/serving raw `message`/`logText`; sanitize server-side via `getIndonesianBuildFailureSummary` or omit the field.
7. **Crypto + upload hardening (low-severity, real):**
   - `otp.ts:8` — `Math.random()` → `crypto.randomInt(0, 1_000_000)` for OTP codes (it's a 6-digit auth code).
   - `api.waitlist.ts` image upload — add magic-byte validation (reuse `detectImageFormat`); today it trusts `file.type`.
8. **Generated-site sandbox hardening (theoretical, harden now):**
   - `runtime-proxy.ts:451,461` — `postMessage(..., '*')` → target the control-plane origin.
   - `generated-source.ts:450` — narrow the build child `PATH` to the bun bin dir + system dirs (today it inherits the full `PATH`).
   - `generated-source.ts:370` — enforce `bun install --frozen-lockfile` after validating a lockfile (or enforce lockfile presence).

## Architecture

### Polish pass (dark rollback + copy + schema)
- `src/routes/__root.tsx`: dark body bg; new `<title>`/meta; `@graph` JSON-LD (Organization + WebSite + SearchAction + SoftwareApplication).
- `src/components/common/MainChrome.tsx`: dark bg on the verification-spinner + chrome wrapper.
- `src/routes/_main.index.tsx`: H1 (with the animated `100% gratis` underline) + sub; the wordmark/footer tagline where relevant.
- `src/components/home/HeroContentMotion.tsx` (or the H1's wrapper): the scroll-in gradient-underline animation on `100% gratis`.

### Error-sanitize pass
- A shared Indonesian-error mapper (extend `getIndonesianBuildFailureSummary` or a sibling `mapToUserFacingError`) wired into the 4 leak sites. Fail-closed: any unmapped backend string → a generic Indonesian fallback, never the raw string.

### Hardening pass
- `otp.ts` crypto upgrade; `api.waitlist.ts` magic-byte; `runtime-proxy.ts` postMessage origin; `generated-source.ts` PATH + frozen-lockfile.

## Data flow

N/A — polish + hardening. The only invariant: behavior/output must not change for the happy path; the error paths now return generic Indonesian instead of raw internals (that's an intended behavior improvement, not a regression).

## Error handling

- Every error-leak fix returns a generic Indonesian message + logs the raw error server-side (to `devLog` / `ProjectBuild.logText` for operators, never to the browser).
- Hardening fixes (crypto, magic-byte, PATH, lockfile) are behavior-preserving on the happy path; they only tighten failure modes.

## Testing (TDD)

1. **Unit — `mapToUserFacingError`:** known backend reason → Indonesian; unknown → generic fallback; never the raw string.
2. **Unit — OTP crypto:** `crypto.randomInt` path produces 6-digit codes; old `Math.random` path removed.
3. **Unit — waitlist magic-byte:** a non-image `file.type=image/png` is rejected (magic bytes checked, not the type claim).
4. **Unit — JSON-LD `@graph`:** shape is valid schema (`Organization` + `WebSite`+`SearchAction` + `SoftwareApplication`); no `aggregateRating` field until reviews exist.
5. **Unit — dark bg:** the body/MainChrome/NotFound render `#151515`, not the cream token.
6. **Component — H1 animation:** `100% gratis` has the gradient-underline treatment + scroll-in trigger.

## Out of scope

- A light/dark theme toggle (the chrome is dark by design).
- `aggregateRating` in JSON-LD (until real reviews; manual-penalty risk).
- Re-deriving the whole SEO strategy beyond the homepage copy + schema (the homepage is the SERP entry; deeper SEO is per-route, later).
- The full security re-audit (already done 2026-07-25; this spec implements its fixes).

## Open questions for implementation

- Confirm the exact H1 component + how the scroll-in underline animation hooks in (Framer Motion `whileInView`, already a dep).
- Confirm whether the runtime-events `message` field is consumed by any client (the audit found none today; safe to omit/sanitize, but verify at impl).
