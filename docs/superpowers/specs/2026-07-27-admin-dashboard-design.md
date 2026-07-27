# Admin Dashboard (DB-Config + Management + Analytics) — Design

**Date:** 2026-07-27
**Status:** Spec written; pending implementation plan.
**Sibling collab:** Tracked sibling `wZ:p1` (Umami/Kuma provisioning). Overlap only on `.env`/`.env.example`/`package.json` if my plan needs new env vars/deps — current plan needs neither (DB-config keeps existing env as fallback; sonner/prisma/tanstack already installed). Re-coordinate before any such edit.

## Goal

One admin area at `/admin` with a tabbed shell covering: simple analytics overview, user management, waitlist management (existing, relocated), Pakasir transaction management, and a DB-driven settings editor that overrides `.env` at runtime — so config changes ship without a rebuild or `.env` edit. Admin detection stays `ADMIN_EMAILS` env-allowlist (no DB role column).

## Why

Today config changes require editing `.env` + redeploying — slow for a single maintainer tuning flags/prices/rate-limits during a pilot. The `/admin` route exists but only shows the waitlist queue; there's no user/transaction/settings surface. This spec adds the missing surfaces and makes runtime config a first-class DB-overridable layer.

## Decisions (locked during brainstorming)

1. **Admin role = keep `ADMIN_EMAILS` env-allowlist.** No DB `role` column. `requireAdmin()` (`src/lib/auth-admin.ts`) already works, tested, deliberately documented "no Role model, no migration." Single-maintainer pilot; config (frequent change) moves to DB, but admin membership (rare change) stays env — the one-time redeploy cost for adding an admin doesn't recur. Env is also safer: not exfiltrable via a config API or SQL injection. Upgrade trigger: ≥2 admins AND can't tolerate a redeploy → add the column then. Reaffirms the `2026-07-25-waitlist-admin-design.md` decision.
2. **DB-config scope = non-secret only.** Secrets (`PAKASIR_API_KEY`, `GOOGLE_CLIENT_*`, `NEXTAUTH_*`, `S3_*` credentials, `TURNSTILE_SECRET_KEY`, `NINE_ROUTER_API_KEY`) stay in `.env` forever. Three classes can't move to DB: DB-bootstrap vars (`DATABASE_URL`, `POSTGRES_*`) — circular; boot-time crypto (`NEXTAUTH_SECRET`) — signs sessions before any DB read; client-baked `NEXT_PUBLIC_*` — compiled into the JS bundle, can't change without rebuild. The DB-config layer only knows the non-secret keys it's called with.
3. **Single generic `AppSetting` table.** `{ key PK, category, value Json, updatedAt, updatedBy }`. New config = new row, not a migration. DB row wins; if missing/invalid JSON, fall back to `process.env`; if neither, hardcoded default. One table per the user's ask.
4. **Config categories:** `feature_flag` (waitlist gate, generated-build/public-execution toggles), `booster` (4 pack prices/energy, today hardcoded in `pakasir.ts`), `rate_limit` (5 scopes × requests/window), `ai` (timeouts + default model — optional).
5. **Tabbed shell, flat `_main.*` routes.** `_main.admin.tsx` becomes a layout shell (sticky tab bar + `<Outlet/>`); waitlist UI moves into `_main.admin.waitlist.tsx`. 5 sub-routes. Indonesian tab labels: Ringkasan · Pengguna · Antrean · Transaksi · Pengaturan.
6. **Overview analytics = pure DB counts.** No chart library, no fabricated trends. 5 stat tiles + 2 recent lists. Honesty over decoration.
7. **User management: list/search + ban/unban only.** New `User.bannedAt DateTime?` column (one nullable timestamp = the only mutation; no role/status enum). Banned users rejected at the `auth()` boundary + existing gate checks. No admin-edit of arbitrary user fields (user-owned).
8. **Transactions: list/filter + Verify.** Reads existing `Payment` table. Per-row Verify calls existing `verifyPakasirTransaction()` (needed — Pakasir webhooks are unsigned, so manual re-verify is the trust source). No refund button — Pakasir refund flow absent from `pakasir.ts`; adding it is a separate scope decision (YAGNI now).
9. **Settings: typed forms per category, not a JSON textarea.** Registry (`app-settings-registry.ts`) lists every key with `{ key, category, type, label, fallback }` — the UI renders from it, the read layer validates against it. "Reset to fallback" deletes the row. Save per category. `PUT` invalidates the in-process cache (5s TTL) so changes are live app-wide within 5s — no rebuild, no restart.
10. **Toasts via `sonner`** (already installed) — replaces current `window.alert`/`window.prompt` in the waitlist page.

## Architecture

### `AppSetting` table (Prisma migration)

```prisma
model AppSetting {
  key       String   @id @db.VarChar(160)  // "booster.starter.amount"
  category  String   @db.VarChar(32)        // feature_flag|booster|rate_limit|ai
  value     Json                            // typed at read layer
  updatedAt DateTime @updatedAt
  updatedBy String?  @db.VarChar(160)        // admin email
}
```

### Config registry (`src/lib/app-settings-registry.ts`, new)

Typed object literal — source of truth for configurable keys:

```ts
type SettingType = "boolean" | "number" | "string";
type ConfigEntry = {
  key: string;
  category: "feature_flag" | "booster" | "rate_limit" | "ai";
  type: SettingType;
  label: string;
  fallback: boolean | number | string;
};
export const APP_SETTINGS: ConfigEntry[] = [
  { key: "feature.waitlist_enabled", category: "feature_flag", type: "boolean", label: "Waitlist onboarding gate", fallback: true },
  { key: "feature.generated_build_execution", category: "feature_flag", type: "boolean", label: "Generated build execution", fallback: false },
  { key: "feature.generated_public_execution", category: "feature_flag", type: "boolean", label: "Generated public execution", fallback: false },
  { key: "booster.pocket.amount", category: "booster", type: "number", label: "Pocket — amount (Rp)", fallback: 2900 },
  { key: "booster.pocket.energy", category: "booster", type: "number", label: "Pocket — energy", fallback: 50000 },
  // … starter / popular / max …
  { key: "ratelimit.global_ip.requests", category: "rate_limit", type: "number", label: "Global IP — requests", fallback: 300 },
  { key: "ratelimit.global_ip.window_seconds", category: "rate_limit", type: "number", label: "Global IP — window (s)", fallback: 60 },
  // … ai_user / ai_ip / build_user / build_ip …
  { key: "ai.timeout.moderation_ms", category: "ai", type: "number", label: "AI — moderation timeout (ms)", fallback: 30000 },
  // … other timeouts, ai.models_default …
];
```

Fallback values mirror current `.env`/hardcoded defaults so behavior is preserved when no DB row exists. Adding a configurable later = one entry here; it auto-appears in the Settings UI.

### Read layer (`src/lib/app-settings.ts`, new)

```ts
export async function getSetting<T extends boolean | number | string>(
  key: string,
  fallback: T,
): Promise<T>
// 1. check in-process cache (Map<string, {value, expiresAt}>, 5s TTL)
// 2. prisma.appSetting.findUnique({where:{key}})
//    → row & JSON valid & matches expected type? row.value : env-fallback
// 3. process.env[key as uppercased] parseable to T? env value : fallback
// 4. cache + return

export function invalidateSettingCache(key?: string): void  // PUT calls this
```

Secrets are never queried — `getSetting` is only ever called with registry keys.

### Call-site migration (behavior-preserving)

~5 existing reads swap `process.env` (or hardcoded) for `await getSetting(key, currentDefault)`:

- `src/lib/waitlist-enabled.ts` → `getSetting("feature.waitlist_enabled", true)` (replaces the current env read). Note: code default when unset stays `true` (fail-safe, per the existing spec).
- `src/lib/pakasir.ts` → `BOOSTER_PACKS` reads `getSetting` per field at use-time (amount/energy). Hardcoded object becomes the fallback.
- `src/lib/rate-limit.ts` → each scope reads `getSetting` for requests + window.
- `src/lib/config.ts` → `getCapabilityFlag` reads `getSetting` for the two feature flags.
- (optional) AI timeout reads in `src/lib/ai-timeouts.ts`.

Env still works if no DB row — zero behavior change unless an admin sets an override.

### Admin tabbed shell

**Routes (flat `_main.*` files, existing convention):**

```
src/routes/_main.admin.tsx              # existing → becomes layout shell
src/routes/_main.admin.index.tsx        # Overview (analytics) — landing tab
src/routes/_main.admin.users.tsx        # User management
src/routes/_main.admin.waitlist.tsx     # Waitlist (existing queue UI relocated)
src/routes/_main.admin.transactions.tsx # Pakasir payments
src/routes/_main.admin.settings.tsx     # DB-config editor
```

`_main.admin.tsx`:
- `loader` → `requireAdmin()`; non-admin → `redirect({ to: "/" })`.
- Renders sticky top tab bar (mobile-native: `h-dvh`, safe-area, matches the "mobile everywhere" bar from topic 4) + `<Outlet/>`. Active tab via `useRouterState`.
- Sonner `<Toaster/>` mounted in the shell (one instance, all tabs use it).

The existing `_main.admin.tsx` waitlist queue UI moves verbatim into `_main.admin.waitlist.tsx` (only the loader's `requireAdmin` redirect stays in the shell). This is the spec's one refactor.

### Overview tab (`_main.admin.index.tsx`)

`GET /api/admin/overview` (single round-trip, `requireAdmin()`-guarded):
```ts
{
  stats: {
    users: number;                  // User.count
    waitlistPending: number;        // WaitlistEntry.count where status="pending"
    projects: number;               // Project.count
    paymentsThisMonth: number;      // Payment.count where status="COMPLETED" + createdAt this month
    revenueThisMonth: number;       // sum amount of completed payments this month
  },
  recentWaitlist: PendingEntry[],   // last 5 pending
  recentTransactions: Payment[],    // last 5 payments
}
```

UI: 5 stat tiles (number cards) + 2 lists. Manual refresh button, no polling. Read-only.

### Users tab (`_main.admin.users.tsx`)

**Migration:** add `bannedAt DateTime?` to `User`.

`GET /api/admin/users?q=&page=` → paginated list, each row: name, email, verified (verifiedAt set), phone, projects count, active credits sum (`UserCredit` where `expiresAt > now`), waitlist status (joined by email), joinedAt. Server-paginated.

`GET /api/admin/users/:id` → full detail (projects, payments, credit ledger).

`POST /api/admin/users/:id/ban` + `POST /api/admin/users/:id/unban` → `requireAdmin()`-guarded; set/clear `bannedAt`; audit `updatedBy` email (logged via `AppSetting`-style audit or a console log — see Open questions).

Banned enforcement: `auth()` (in `src/lib/auth.ts`) checks `user.bannedAt` — if set, reject the session. `MainChrome.tsx` gate already redirects on auth failure; no new gate logic. ~2 sites touched.

### Transactions tab (`_main.admin.transactions.tsx`)

`GET /api/admin/transactions?status=&range=&q=&page=` → paginated `Payment` rows. Columns: orderId, user email (joined), amount (`Rp` formatted), energyGranted, status chip (PENDING/COMPLETED/FAILED), paymentMethod, paymentNumber, createdAt, updatedAt. Summary bar: count + sum(amount) of completed in current filter scope.

`POST /api/admin/transactions/:orderId/verify` → calls existing `verifyPakasirTransaction({orderId, amount})`, updates `Payment.status` + `updatedAt`, returns new status. Button only on `PENDING` rows. `requireAdmin()`-guarded.

No new table. Reads existing `Payment`.

### Settings tab (`_main.admin.settings.tsx`)

`GET /api/admin/settings` → returns the registry merged with DB rows: each entry shows `{...ConfigEntry, dbValue?: T, effectiveValue: T, source: "db"|"env"|"fallback"}`.

`PUT /api/admin/settings` body `{ category, values: {key: value} }` → validates each value against the registry type; writes/updates rows in a Prisma transaction; rows set to fallback value are deleted (revert). `requireAdmin()`-guarded. Invalidates the setting cache on success.

UI: typed forms per category (toggles for booleans, number inputs for numbers, text for strings). "Reset to fallback" per field (deletes the row). Save per category. Optimistic + toast. Secrets have no category here and no API path to read/write them.

## Data flow

**Config change (no rebuild):**
1. Admin (email in `ADMIN_EMAILS`) → `/admin/settings` → edits booster.starter.amount → Save.
2. `PUT /api/admin/settings` validates, writes `AppSetting` row, invalidates cache.
3. Next request that calls `getSetting("booster.starter.amount", 8900)` → reads new DB value (within 5s, or immediately post-invalidate). Env fallback no longer hit while the row exists.
4. `pakasir.ts` `createPakasirTransaction` uses the new amount. Live, no restart.

**Admin review (waitlist):** unchanged from `2026-07-25-waitlist-admin-design.md`; just relocated under `/admin/waitlist`.

**User ban:** admin bans user → `bannedAt` set → user's next `auth()` call rejected → session invalid → existing gate redirects to login.

**Transaction verify:** admin clicks Verify on a PENDING row → `verifyPakasirTransaction` fetches live status from Pakasir → `Payment.status` synced → chip updates.

## Error handling

- `requireAdmin()` 401/403 → redirect `/` (existing behavior, unchanged).
- Mutation network failure → toast + keep the row/state (retryable).
- Invalid config value on `PUT` → 400 with the offending key; no partial write (transaction).
- `getSetting` DB error → falls back to env/hardcoded (degrades gracefully; app keeps running with last-known-good config).
- Banned-user session already issued before ban → `auth()` check rejects on next call (bannedAt is checked fresh per session validation).

## Testing (TDD)

1. **Unit — `getSetting`:** row present + valid → row value; row missing → env; env missing → fallback; row present but wrong type → env/fallback (graceful); cache hit vs miss; `invalidateSettingCache` clears.
2. **Unit — registry:** every entry has valid type/label/fallback; no duplicate keys; every key matches a documented call-site.
3. **Unit — `PUT /api/admin/settings`:** valid values write rows; invalid type → 400 + no write; reset-to-fallback deletes row; non-admin → 403; cache invalidated post-write.
4. **Unit — `POST /api/admin/users/:id/ban|unban`:** sets/clears `bannedAt`; `updatedBy` recorded; non-admin → 403.
5. **Unit — banned enforcement:** `auth()` rejects a user with `bannedAt` set; unbanned user passes.
6. **Unit — `POST /api/admin/transactions/:orderId/verify`:** calls `verifyPakasirTransaction`, updates `Payment.status`; PENDING-only guard; non-admin → 403.
7. **Component — admin shell:** 5 tabs render, active tab highlights, mobile `h-dvh` + safe-area; non-admin loader redirects.
8. **Component — Overview:** renders 5 stat tiles + 2 lists from API mock; honest empty states.
9. **Component — Users:** renders paginated list; search updates query; ban mutation toasts + flips row state.
10. **Component — Settings:** renders typed forms per category from registry mock; toggle writes; reset reverts; save per category; secrets category absent.
11. **Integration (config round-trip):** admin sets `feature.waitlist_enabled=false` via PUT → `getSetting` returns false → gate pass-through (mirrors the existing waitlist-enabled test).

## Out of scope

- DB `role` column / RBAC (env-allowlist stays).
- Secrets in the DB-config table (stays env-only).
- `NEXT_PUBLIC_*` runtime override (impossible without rebuild — compiled into bundle).
- Charts/sparklines/trend graphs on Overview (pure counts only).
- Pakasir refund flow (no backend; separate scope).
- Admin editing arbitrary user fields (name/email — user-owned).
- Moving the existing waitlist backend logic (only the UI relocates).

## Open questions for implementation

- Audit log shape for admin mutations (ban/unban, settings writes): a dedicated `AuditLog` table vs. reusing `AppSetting.updatedBy` + console logs. Lean toward the latter for the pilot (YAGNI); add a table if compliance demands it.
- Confirm the exact `auth()` site for the banned check (read `src/lib/auth.ts` before wiring) — the check belongs in session validation, not per-route.
- Confirm `rate-limit.ts` reads are all single-key (some may read multiple env vars per scope) — the call-site migration list assumes one `getSetting` per var; verify before editing.
- Confirm sonner `<Toaster/>` placement (shell vs. `MainChrome`) — one instance globally is enough; placing in the admin shell scopes it but a second in `MainChrome` would double-mount.
