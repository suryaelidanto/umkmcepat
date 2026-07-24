# Email + OTP Adapters — Design

**Date:** 2026-07-25
**Topic:** 7 of the eight-topic roadmap (see `umkmcepat-eight-topic-roadmap` memory)
**Status:** Design approved; pending plan + implementation. Standalone (no dependency on other topics).

## Goal

Stand up a transactional-email adapter (Resend) behind an env-driven boundary, and fix + harden the existing WhatsApp-OTP adapter (OTPSpace): correct the endpoint, implement the documented mock mode, and enforce that mock mode is impossible in production. Both verified working live (2026-07-24: email to `suryaelidanto@gmail.com`, OTP to `+6287877618724`).

## Why

- **Email:** no `src/lib/email.ts` adapter exists. Any future transactional email (welcome, waitlist decisions, receipts) needs a boundary. Resend is locked (free, $0, simplest DX; self-hosted email is non-viable in 2026 — IP-rep + DKIM warmup). Creds in `.env` (`RESEND_API_KEY`).
- **OTP:** `src/lib/otp.ts` exists but has two bugs: (1) it calls `https://api.otpspace.com/v1/otp/send` but the live API we verified is `/v1/send` (the test that succeeded used `/v1/send`); (2) `.env.example` documents "mock mode logs OTP to console" but `otp.ts` doesn't implement it — it returns `success:false` when the key is empty, blocking dev. Plus the mock-mode-must-be-impossible-in-prod rule from `DEV.md` isn't enforced.

## Decisions (locked; minimal forks)

1. **Email = Resend behind an env-driven adapter.** New `src/lib/email.ts`: `sendEmail({to, subject, html, text})`. Reads `RESEND_API_KEY`; empty + non-production → mock mode (logs the email to console, returns success); empty + production → hard-fail (never fabricate success at a trust boundary, per `DEV.md`). Uses Resend's REST API (`POST https://api.resend.com/emails`, `Authorization: Bearer re_...`). No new dependency (plain `fetch`; the Resend SDK is optional — lean plain fetch to match the OTPSpace pattern).
2. **OTP endpoint fix.** `sendOtpViaSms` calls `https://api.otpspace.com/v1/send` (the verified endpoint), not `/v1/otp/send`. Also use the verified request body shape (`{phone, app_name}`) rather than the current `{to, message, channel}` — confirm which the live API accepts at impl (the successful test used `{phone, app_name}`).
3. **OTP mock mode implemented.** When `OTP_SPACE_API_KEY` is empty + non-production → log the code to console + return `success:true` (dev-bypass, matches the documented `.env.example` behavior). Empty + production → hard-fail.
4. **Mock-impossible-in-prod enforced for both.** A startup check (or per-call guard) asserts: in `NODE_ENV=production`, `RESEND_API_KEY` and `OTP_SPACE_API_KEY` MUST be set — a missing key in prod throws loudly at startup, never silently returns mock-success. This is the `DEV.md` trust-boundary rule.
5. **Budget awareness.** OTPSpace is 1-credit-per-OTP (9 left); Resend is 3K/mo + 100/day. Mock mode in dev is the default to avoid burning credits on tests. Real sends only at wire-up verification (done) or in prod.
6. **No new dependency.** Plain `fetch` for both adapters (matches OTPSpace's existing pattern; the Resend SDK is not needed for a thin wrapper).

## Architecture

### Email adapter — `src/lib/email.ts`

- `sendEmail({to, subject, html?, text}): Promise<{success, error?}>`.
- Reads `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_BASE_URL` (empty = `https://api.resend.com`).
- Mock mode: `!RESEND_API_KEY && !isProduction` → `console.log("[email] mock", {to, subject})` + `success:true`. `!RESEND_API_KEY && isProduction` → throw.
- Real: `POST {RESEND_BASE_URL}/emails` with `{from: RESEND_FROM_EMAIL, to, subject, html, text}` + `Authorization: Bearer`.

### OTP adapter — `src/lib/otp.ts` (fix + harden)

- Fix the endpoint + body shape to the verified `/v1/send` + `{phone, app_name}` (or whichever the live API accepts — confirm at impl).
- Implement mock mode: `!OTP_SPACE_API_KEY && !isProduction` → `console.log("[otp] mock", {phone, code})` + `success:true`. Empty + prod → throw.
- Keep the existing `generateOtpCode` / `createOtpRequest` / `verifyOtp` (DB-backed) unchanged.

### Startup guard — both adapters

A shared `src/lib/provider-startup-check.ts` (or extend the existing `src/lib/instrumentation.ts` startup validation): in production, assert `RESEND_API_KEY` + `OTP_SPACE_API_KEY` are set; throw with a clear message if not. This makes mock-impossible-in-prod a boot-time guarantee, not a per-call hope.

## Data flow

**Email (mock, dev):** `sendEmail({to, subject})` → no key + dev → console log + success.
**Email (real, prod):** `sendEmail` → `POST api.resend.com/emails` → Resend delivers.
**OTP (mock, dev):** `sendOtpViaSms` → no key + dev → console log + success (no credit spent).
**OTP (real, prod):** `sendOtpViaSms` → `POST api.otpspace.com/v1/send` → WhatsApp delivered (1 credit).
**Startup (prod):** boot check asserts both keys set → throws if missing.

## Error handling

- Mock mode in prod = impossible (startup guard throws). Never fabricated success.
- Resend/OTPSpace non-2xx → `{success:false, error}` (honest); the caller (auth flow) surfaces an Indonesian error to the user. No silent retry storms (OTPSpace credits are finite).
- Network failure → `{success:false}`; caller offers a user-triggered retry (bounded).

## Testing (TDD)

1. **Unit — email adapter:** mock mode (no key, dev) → logs + success; real mode → asserts the fetch is called with the right `from`/`to`/`Authorization`; prod + no key → throws.
2. **Unit — OTP adapter:** mock mode (no key, dev) → logs + success; real → asserts `/v1/send` + `{phone, app_name}` + `Bearer`; prod + no key → throws.
3. **Unit — startup guard:** prod + missing key → throws; dev + missing key → no throw; prod + both set → no throw.
4. **Integration (env-gated, credits-aware):** `EMAIL_LIVE_TEST=1` → `sendEmail` to the account email once (verifies Resend); `OTP_LIVE_TEST=1` → `sendOtpViaSms` once (already done 2026-07-24; re-run only on adapter changes). Self-cleans (no state).

## Out of scope

- The Resend SDK (plain fetch suffices).
- Email templates / HTML design (just the adapter; templates when a feature needs them).
- Self-hosted email (non-viable in 2026; ruled out).
- Surfacing OTPSpace credit count to the admin UI (the admin page is topic 3; a credit-reminder is a later enhancement).
- Live tier-number re-verification (Firecrawl scrape still down 2026-07-25, but **search works** and confirmed: Resend Free = $0, 3,000/mo, 100/day, 1 domain; Pro = $20/mo. Matches the spec. No further re-check needed — creds already verified working.)

## Open questions for implementation

- Confirm the exact OTPSpace `/v1/send` body shape (`{phone, app_name}` worked in the test; the current code uses `{to, message, channel}` — one is wrong; verify against the live API + fix).
- Confirm `src/lib/instrumentation.ts` is the right home for the startup guard (or a new `provider-startup-check.ts`).
