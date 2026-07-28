# Production Security Hardening & VPS Deployment — Design

**Date:** 2026-07-28
**Status:** Approved design, ready for implementation planning
**Scope:** Close verified security gaps, make the CD pipeline actually deploy, and stand up Cloudflare Tunnel ingress on the existing VPS.

---

## 1. Context

UMKM Cepat is ready to go to production on a VPS the maintainer already owns. Before that happens we need three things that do not exist today:

1. A **grounded** security audit (see §2 — the two existing security specs are not).
2. A CD pipeline that **works** (the current one cannot push its image or deploy it).
3. Production ingress with TLS.

This design covers all three. Every finding below was verified against the code at commit `de1ccb6` by reading the relevant file, not inferred from patterns.

---

## 2. Prior specs are unreliable and must be deleted

Two documents in this repository describe security work for a **different application**:

- `docs/superpowers/specs/2026-07-27-comprehensive-security-hardening.md`
- `docs/superpowers/specs/2026-07-27-security-hardening-spec.md`

Their central claims were checked and are false:

| Claim | Verification | Result |
| --- | --- | --- |
| GraphQL introspection enabled; needs depth/complexity limits | `git grep -i graphql -- src package.json` | No GraphQL in the project |
| 3 endpoints use `$queryRawUnsafe`; CVSS 9.8 SQLi | `git grep queryRawUnsafe\|Prisma.raw -- src` | Zero hits; all raw SQL is tagged-template parameterized |
| 4 locations use `exec()` with user input; 2 use `shell: true` | `git grep child_process -- src` | Zero `exec()`; only `spawn()` with argument arrays |
| bcrypt cost factor 10; migrate to Argon2id | `git grep -i bcrypt\|argon2` | No password authentication exists (Google OAuth + OTP) |
| Shared Redis cache leaks across tenants | `git grep -i redis -- src` | Redis is an unused enum value in `provider-registry.ts:10` |
| OTP is 4-digit, plaintext, compared with `===` | `src/lib/otp.ts:2,8,12,15,101` | Already 6-digit, `randomInt`, SHA-hashed at rest, `timingSafeEqual` |
| Files `src/services/user.service.ts`, `src/routes/auth.otp.ts` | filesystem | Neither exists; `src/services/` is not a directory in this repo |

They also cite a non-existent advisory ("CVE-2025-55182: React2Shell").

**Action:** delete both files in Phase 1. Leaving them risks a future agent spending weeks on phantom vulnerabilities — exactly the failure mode `AGENTS.md` warns about ("optimize for the next capable agent with zero session context").

This spec records its evidence inline so it can be re-verified rather than trusted.

---

## 3. Verified findings

Severity reflects impact **for this application**, not generic CVSS.

### 3.1 Critical

**F1 — `@auth/core@0.34.3` homoglyph email bypass, on an email-allowlist admin model**

- Advisory: `GHSA-7rqj-j65f-68wh` — the email normalizer validates the address before Unicode normalization, permitting a homoglyph `@` bypass.
- Why it matters here specifically: administrative authorization is an email allowlist. `requireAdmin()` (`src/lib/auth-admin.ts:27`) calls `isAdminEmail()` (`src/lib/waitlist.ts:32`), which does a lowercase string comparison against `ADMIN_EMAILS`. A normalization bypass is therefore a candidate **admin privilege-escalation** path, not just a login nuisance.
- Same package, same version: `GHSA-xmf8-cvqr-rfgj` (uncaught exception on malformed Bearer header → DoS) and `GHSA-x445-f3h2-j279` (OAuth state/nonce/PKCE cookies not bound to the issuing provider).
- Fixed in `@auth/core >= 0.41.3`. Currently pinned to `0.34.3` in `package.json`. `0.41.3` is also the latest published version, so the upgrade target is unambiguous.

### 3.2 High — the CD pipeline cannot deploy

**F2 — GHCR push will fail with 403.** `.github/workflows/deploy.yml:21-22` sets `permissions: contents: read` at workflow level with no job-level override. Pushing to GHCR with `GITHUB_TOKEN` requires `packages: write`.

**F3 — the built image is never deployed.** CI pushes `ghcr.io/suryaelidanto/umkmcepat-app:latest` (`deploy.yml:72`), but `docker-compose.prod.yml:3` declares `image: umkmcepat-app:local` alongside a `build:` block. `docker compose pull app` therefore resolves nothing, and `up -d` **rebuilds from source on the VPS**, discarding the entire build job.

**F4 — that VPS rebuild would send a 3.8 GB build context.** `.dockerignore` does not exclude `.data/` (measured 3.8 GB), `graphify-out/` (38 MB), `.pi-subagents/` (15 MB), `storybook-static/` (8.8 MB), `.superpowers/`, or `.claude/`. The builder stage runs `COPY . .` (`Dockerfile:15`), so local development data — including uploaded assets and generated projects — is copied into the image.

**F5 — no SSH host key verification.** `deploy.yml:87` uses `appleboy/ssh-action@v1` without a `fingerprint` input, so any host key is accepted. All actions use floating tags (`@v1`, `@v3`, `@v4`, `@v5`) rather than commit SHAs.

### 3.3 High — missing production hardening

**F6 — no HSTS.** `applySecurityHeaders()` (`src/lib/security-headers.ts:39-103`) sets `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP, and `X-Frame-Options`, but never `Strict-Transport-Security`.

**F7 — CSP has no `default-src`.** The control-plane policy (`security-headers.ts:89-94`) sets only `frame-ancestors`, `object-src`, `base-uri`, and `script-src`. With no `default-src`, the directives `style-src`, `img-src`, `connect-src`, `font-src`, and `frame-src` are entirely unrestricted.

**F8 — production image ships devDependencies.** `Dockerfile:9` installs all dependencies; the runner stage copies `node_modules` wholesale (`Dockerfile:34`) with no production prune. Storybook, Vitest, ESLint, and Playwright ship to production — including `@vitest/browser`, which carries critical advisory `GHSA-p63j-vcc4-9vmv`.

### 3.4 Medium — two race conditions, both with comments asserting they are safe

**F9 — payment webhook double-grant.** `src/routes/api.payment.webhook.ts:81` comments "Re-fetch inside transaction and lock the row to prevent race conditions", but `tx.payment.findUnique()` acquires **no lock**. At PostgreSQL's default READ COMMITTED isolation, two concurrent webhook deliveries for one `orderId` can both observe `status === "PENDING"` and both insert a `UserCredit` row — granting the purchased energy twice. Confirmed there is no `SELECT ... FOR UPDATE` anywhere in the codebase.

**F10 — daily free-energy limit bypass.** `src/lib/user-credits.ts:112` comments "Transaction ensures we safely read and deduct without race conditions". It performs a `SUM` (line 114) and then an `INSERT` (line 140) with no lock and no unique constraint. Concurrent requests read the same `freeUsedToday` and each grant themselves the full remaining free allowance, exceeding `DAILY_ENERGY_LIMIT`.

Both comments are actively misleading and must be corrected alongside the fixes.

### 3.5 Medium — configuration gaps

**F11 — `TURNSTILE_SECRET_KEY` absent from the production preflight.** `assertProductionConfigReady()` (`src/lib/production-config.ts:8-41`) validates URLs, `NEXTAUTH_SECRET`, `OTP_SPACE_API_KEY`, and `DATABASE_URL`, but not Turnstile. `verifyTurnstileToken()` fails closed in production (`src/lib/turnstile.ts:11-17`), so a missing key silently breaks every protected form instead of failing loudly at boot.

**F12 — Umami has no `APP_SECRET`.** `docker-compose.prod.yml:125-134` sets only `DATABASE_URL`. Umami derives a random secret per start, invalidating analytics sessions on every restart.

**F13 — weak Postgres defaults in production Compose.** `docker-compose.prod.yml:107-109` defaults to `postgres`/`postgres`. `assertDatabaseUrl()` correctly rejects those (`production-config.ts:104`), so an incomplete `.env` yields a crash loop rather than a clear configuration error.

**F14 — remaining dependency advisories.** `postcss <=8.5.17` (path traversal, build-time only), `fast-uri` (host confusion, transitive via `ajv` and `@tanstack/react-start`), `cookie <0.7.0` (via `@auth/core`).

### 3.6 Low — operational

**F15 — backups exist but never run.** `scripts/backup-db.sh` is correct (gzip, 7-day retention) but is scheduled nowhere, referenced by no documentation, and writes only to local disk — so a host loss loses the backups too.

**F16 — stale, alarming comment.** `.env.example:78` describes `ADMIN_EMAILS` as "empty = dev-bypass". The implementation is fail-closed (`waitlist.ts:34-36` returns `false`). The comment is wrong and should be corrected.

**F17 — `trustHost: true` requires a trustworthy proxy.** `src/lib/auth-config.ts:94` enables it, which is correct behind TLS termination but means the ingress layer must overwrite rather than forward client-supplied `Host`/`X-Forwarded-Host`.

**F18 — no route-specific rate limits on some endpoints.** `payment.webhook`, `payment.create`, `csp-violation`, and the admin routes have no dedicated limiter. Note this is **partially mitigated**: `src/start.ts:66-77` applies the global per-IP limit (default 300 req/60s) to every `/api/*` request. Out of scope for this pass by decision.

### 3.7 Verified as sound — no action required

Recording these so future audits do not re-litigate them:

- **No secret has ever been committed.** `.env` is untracked, matched by `.gitignore` and `.dockerignore:13-15`. A pattern scan across full history (`git log --all -p`) for OpenAI/Anthropic/Resend/AWS/GitHub/Slack key formats returned nothing. The only matches in the working tree are sanitizer test fixtures in `src/lib/projects/ai-error-log.test.ts`.
- **OTP handling is correct** — 6 digits, `randomInt` CSPRNG, SHA-hashed at rest, `timingSafeEqual` comparison.
- **The payment webhook does not trust its payload.** It re-verifies against Pakasir using the database-stored amount (`api.payment.webhook.ts:64-67`) and short-circuits on non-`PENDING` status. F9 is a concurrency defect within an otherwise sound design.
- **All raw SQL is parameterized** via tagged templates.
- **No shell injection surface** — every `child_process` call is `spawn()` with an argument array; no `exec()`, no `shell: true`.
- **Upload validation is correct** — `api.waitlist.ts` enforces rate limiting, Turnstile, a 5 MB cap, and magic-byte sniffing rather than trusting `file.type`.
- **Dev-only route is gated** — `api.dev.skip-verification.ts:10` returns 403 unless `NODE_ENV === "development"`.
- **Generated-code execution is contained** — prod Compose hardcodes both execution switches to `false` and the supervisor to `noop`; the preflight re-asserts this.
- **Production preflight is genuinely fail-closed** on HTTPS, origin alignment, secret strength, and default DB credentials.
- **Services bind to loopback**, and the container runs as non-root (`Dockerfile:43`).
- **CSRF is enforced** on `/api/*` via origin + `Sec-Fetch-Site` (`security-headers.ts:1-37`) and on server functions via `createCsrfMiddleware` (`start.ts:94-96`).

---

## 4. Non-goals

- Route-specific rate limiting beyond the existing global limiter (F18) — deferred by decision.
- Enabling generated-app build or public execution. Both stay `false`; the isolated-worker gate is unrelated future work.
- Replacing the memory rate-limit provider with Redis.
- Error tracking. `docs/deployment.md:165` records the deliberate choice to omit it.
- Multi-node runtime, job queues, or horizontal scaling.
- PostgreSQL row-level security. Application-level scoping is adequate for a single-tenant-per-user model at this stage.

---

## 5. Design

Three phases. Each is independently reviewable and independently deployable; Phase 1 carries no infrastructure dependency and should land first.

### Phase 1 — Security correctness

**Dependency upgrades.** Raise `@auth/core` from `0.34.3` to `>= 0.41.3`, and update `postcss`, `fast-uri`, `cookie`, and `@vitest/browser`. Re-run `bun audit` and record the residual set.

The `@auth/core` jump spans seven minor versions. `auth-config.ts:15-18` asserts that JWT encryption matches next-auth v5 so pre-migration cookies stay valid; that assertion must be re-tested after the upgrade. If sessions do not survive, the accepted fallback is a one-time forced re-login for all users — acceptable, but it must be a known outcome rather than a production surprise.

**F9 — payment webhook.** Replace the read-then-update sequence with a single conditional update, and gate credit granting on its result:

```ts
const claimed = await tx.payment.updateMany({
  where: { orderId, status: "PENDING" },
  data: { status: "COMPLETED", paymentMethod: verified.payment_method },
});
if (claimed.count !== 1) return null; // another delivery already claimed it
```

`Payment.status` is a `String` (`prisma/schema.prisma:429`), not an enum, so the literal is correct. This is atomic under READ COMMITTED without any explicit lock: exactly one concurrent transaction can observe and transition the row.

**F10 — energy deduction.** Serialize per user by taking a transaction-scoped advisory lock before the `SUM`:

```ts
await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
```

The lock releases automatically at commit or rollback. Preferred over `SERIALIZABLE` isolation because it avoids retry loops, and over `FOR UPDATE` because there is no single row to lock — the constraint is over an aggregate.

**F11.** Add `TURNSTILE_SECRET_KEY` to `assertProductionConfigReady()` via the existing `assertRequiredSecret()` helper.

**F16.** Correct the `ADMIN_EMAILS` comment in `.env.example` to state that the allowlist is fail-closed.

**F9/F10 comments.** Replace both incorrect "this is race-safe" comments with accurate descriptions of the new mechanisms.

**§2.** Delete both fabricated specs.

### Phase 2 — Image, headers, and streaming `/edit`

**F4 — build context.** Extend `.dockerignore` with `.data`, `graphify-out`, `.pi-subagents`, `.superpowers`, `.claude`, `.agents`, `storybook-static`, `.output`, `.nitro`, `.tanstack`, `__captures__`, `.omc`, and `dev.log*`. Verify by measuring the context size reported by `docker build` before and after.

**F8 — production prune.** Add a dedicated production-dependency stage so the runner receives only what it needs:

```dockerfile
FROM docker.io/oven/bun:1.3.9-alpine AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts --production
```

The runner then copies `node_modules` from `prod-deps` instead of `builder`. Prisma Client is generated in `builder`, so its generated output must still be copied across explicitly — this is the one sharp edge in the change and needs an explicit runtime verification step, not just a successful build.

**F6 — HSTS.** Set `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` in `applySecurityHeaders()`, on the control plane only. It must **not** be set on the generated-project origin, whose subdomains we do not control and should not pin.

**F7 — CSP.** Add `default-src 'self'` plus explicit directives. Origins are drawn from actual code references, not guesswork:

| Directive | Value | Why |
| --- | --- | --- |
| `default-src` | `'self'` | baseline |
| `img-src` | `'self' data: blob: https://api.dicebear.com https://api.qrserver.com` + `S3_PUBLIC_BASE_URL` | DiceBear avatars (`profile.ts:9`), payment QR codes (`EnergyBoosterModal.tsx:159`), R2 public media |
| `connect-src` | `'self'` + Umami host | analytics beacon |
| `script-src` | existing nonce policy + Umami script host | `NEXT_PUBLIC_UMAMI_SCRIPT_SRC` |
| `frame-src` | `https://challenges.cloudflare.com` | Turnstile widget |
| `style-src` | `'self' 'unsafe-inline'` | Tailwind injects inline styles |
| `font-src` | `'self' data:` | |

Because `S3_PUBLIC_BASE_URL` and the Umami host are environment-dependent, the policy has to be **built at runtime from config** rather than hardcoded — a change in shape from the current constant strings. `style-src 'unsafe-inline'` is a deliberate, documented concession to Tailwind.

**`/edit` → SSE.** `src/routes/api.projects.$id.edit.ts` (998 lines) currently returns `Response.json()` after up to `AI_TIMEOUT_EDIT_MS` (600 s). Convert it to the SSE pattern already proven in `api.projects.$id.generate.ts:278-1336`:

- Reuse the `encodeEvent` / `send` / `safeClose` scaffolding verbatim.
- Validation failures that occur *before* the stream opens keep returning `Response.json` — HTTP status codes remain meaningful for those.
- Failures *inside* the stream become `send("error", …)` followed by `safeClose()`.
- Emit `progress` events at the existing await boundaries: agent edit (line 456), fallback (473), repair (549), snapshot (639), artifact write (666), build (711), deployment (725).
- The client caller must be updated in lockstep.

This is the largest single change in the plan and the main source of risk. It is required for Cloudflare ingress and independently correct: it replaces a silent ten-minute wait with live progress.

### Phase 3 — Ingress and CD

**Ingress: Cloudflare Tunnel.** Chosen over Caddy/nginx because the project is already on Cloudflare (R2 storage, `media.umkmcepat.com`), it requires **no inbound ports** on the VPS — which composes well with the existing loopback-only bindings — and Cloudflare Access supplies the authentication layer that 9Router, Umami, and Uptime Kuma currently lack. `docs/deployment.md:67` already anticipates protected access for the 9Router dashboard.

- Add a `cloudflared` service to `docker-compose.prod.yml`, authenticated by a tunnel token from `.env`.
- Public route: `umkmcepat.com` → `app:3000`.
- Access-protected routes: 9Router, Umami, Uptime Kuma — reachable only through Cloudflare Access policies, never published to the open internet.
- Per F17, configure the tunnel so the origin receives the canonical public host. `NEXTAUTH_URL` is set explicitly, which Auth.js prefers, but this must be verified against a real OAuth round trip rather than assumed.
- Known constraint: Cloudflare terminates non-streaming requests at ~100 s. `generate` and (after Phase 2) `edit` both stream, so both are safe. **Any future long-running non-streaming endpoint will break under this ingress** — recorded here deliberately.

**Compose changes.**

- Remove the `build:` blocks from `app` and `migrate`; set `image: ghcr.io/suryaelidanto/umkmcepat-app:${APP_IMAGE_TAG}`.
- Add `APP_SECRET` to the Umami service (F12).
- Drop the `:-postgres` credential fallbacks (F13) so misconfiguration fails loudly and immediately.
- Add a healthcheck to the Umami service.

**CD pipeline** (`.github/workflows/deploy.yml`).

- Add `packages: write` to the build job (F2).
- Pin every action to a full commit SHA with a version comment (F5).
- Add the SSH `fingerprint` input (F5).
- Deploy the **immutable `${{ github.sha }}` tag**, not `latest` (F3), so that what CI built is exactly what runs and rollback is a tag change.
- After `up -d`, poll `/api/health/ready`; on failure, redeploy the previous tag and fail the job.
- `.env` stays on the VPS only and is never transmitted through CI.
- Keep `workflow_dispatch` as the trigger initially; enabling `push: [main]` is a follow-up once a manual run has succeeded end-to-end.

**Backups (F15).** Install a systemd timer invoking `scripts/backup-db.sh` daily, and extend the script to upload the gzipped dump to the private R2 bucket so backups survive host loss. Document the restore procedure — an untested backup is not a backup.

---

## 6. Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| `@auth/core` upgrade invalidates existing sessions | Medium | Test JWT decode against a pre-upgrade cookie before deploying; accept one-time re-login as the fallback |
| Production prune breaks Prisma Client resolution at runtime | Medium | Explicitly copy generated client; verify by running the container and hitting `/api/health/ready`, not by build success alone |
| Tightened CSP breaks avatars, Turnstile, analytics, or QR rendering | Medium | Ship `Content-Security-Policy-Report-Only` first, collect via the existing `/api/csp-violation` endpoint, then enforce |
| `/edit` SSE conversion regresses editing | Medium | Largest change; land it alone, with client updated in the same commit |
| Cloudflare `Host` handling breaks OAuth callbacks | Low | Verify a real Google sign-in round trip before cutting DNS over |
| HSTS `preload` is effectively irreversible | Low | Deploy without `preload` first; add it only after the domain is confirmed stable on HTTPS |
| Advisory lock serializes a hot path | Low | Scoped per user via `hashtext(userId)`; no cross-user contention |

---

## 7. Testing

- **Unit.** Extend `security-headers.test.ts` for HSTS presence on the control plane, absence on the generated origin, and each new CSP directive. Extend `production-config.test.ts` for the Turnstile assertion.
- **Concurrency.** Add tests that fire N simultaneous webhook deliveries for one `orderId` and assert exactly one `UserCredit` row; and N simultaneous deductions asserting the daily cap holds. These must fail against the current code — a concurrency test that passes before the fix is not testing anything.
- **Existing gates.** `bun run verify` (format, lint, typecheck, full tests, Knip) plus the CI Storybook and Chromatic steps.
- **Container.** Build the pruned image, run it, and confirm `/api/health/ready` returns 200 — the only real check that the Prisma prune worked.
- **CSP.** Run in report-only mode and confirm zero violations before enforcing.
- **Deployment.** Complete one manual `workflow_dispatch` run end-to-end, verify the running container's image digest matches the CI-built digest, then exercise rollback deliberately.

## 8. Rollback

Every phase is revertible. Phase 3 makes rollback a first-class operation: because deploys are pinned to immutable SHA tags, reverting is `APP_IMAGE_TAG=<previous-sha> docker compose up -d`. Database migrations in this scope are additive only.

## 9. Success criteria

- [ ] `bun audit` reports no critical or high advisory reachable from production runtime code
- [ ] `@auth/core >= 0.41.3`, sign-in verified working
- [ ] Concurrency tests prove single-grant on webhooks and an enforced daily energy cap
- [ ] HSTS present on control-plane responses, absent on the generated origin
- [ ] CSP enforces `default-src` with zero violations reported over a full user journey
- [ ] Docker build context under 50 MB; production image contains no devDependencies
- [ ] `/edit` streams progress and completes past 100 s through Cloudflare
- [ ] A `workflow_dispatch` run builds, pushes, deploys, and health-checks with no manual steps
- [ ] Running image digest matches the CI-built digest
- [ ] Rollback to the previous SHA tag verified by execution
- [ ] Nightly backup lands in R2, and a restore has been performed at least once
- [ ] 9Router, Umami, and Uptime Kuma reachable only through Cloudflare Access
- [ ] Both fabricated specs deleted

## 10. Documentation

Per `AGENTS.md`, docs ship in the same change:

- `docs/deployment.md` — Cloudflare Tunnel ingress, GHCR image flow, rollback, backup schedule and restore procedure, the ~100 s streaming constraint.
- `docs/architecture.md` — `/edit` is now a streaming endpoint.
- `.env.example` — tunnel token, Umami `APP_SECRET`, `APP_IMAGE_TAG`; corrected `ADMIN_EMAILS` comment. Empty values only.
- `CHANGELOG.md` — user-visible security and deployment changes.
