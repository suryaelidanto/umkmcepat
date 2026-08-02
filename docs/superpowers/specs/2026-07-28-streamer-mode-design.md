# Streamer Mode

## Problem

When the admin is broadcasting a screen-share (livestream, screencast, tutorial recording), the `/admin/*` UI exposes PII: user names, emails, phone numbers, business names, payment order IDs, transaction amounts. Leaks go beyond the immediate viewer: streams are recorded, indexed, watched by anyone the streamer did not vet, and a single leaked email is permanent public data on the internet.

Streamer mode is the **defense-in-depth** layer for this — a global privacy gate on the admin surface. Toggled via the existing `AppSetting` DB config registry, default ON so a forgetful streamer is still protected.

## Scope (what streamer mode masks)

`/admin/*` only — the admin surface. Workspace, public site, builder, and generated projects are out of scope (no admin PII there).

### `/admin` overview
- recent-waitlist row: **business name** masked
- recent-transactions row: **orderId + amount** masked; status kept

### `/admin/users`
- row: **name** masked
- row: **email** masked
- search input: still works against the *real* value (server-side); only the visual masked render changes
- pagination label, action buttons, project count: not masked

### `/admin/waitlist`
- card: **business name**, **email**, **phone** masked
- card: story (free text), business type + city: kept (not PII/confidential)
- detail image `alt`: stays (text only, screen-reader only — not a leak path)

### `/admin/transactions`
- row: **orderId, paymentNumber, amount (energy), email** masked
- row: status kept
- search input: same as users (server uses real values, UI renders masked)

### `/admin/settings`
- nothing masked — `entry.label`, value, source, fallback are not PII (they're public config; the page itself is the PII-free surface where the toggle lives)

### Header account menu (visible on every page, not only admin)
- admin's own name + email: masked when streamer mode is ON
- rationale: an admin screen-sharing anything, even non-admin pages, would otherwise leak their own identity

### Not in scope (never masked)
Counts, dates, statuses ("completed"/"pending"), categories, free-text descriptions (waitlist story), settings labels/values/source/fallback, action button labels, search placeholders.

## Storage

One new entry in `APP_SETTINGS` (the existing registry in `src/lib/app-settings-registry.ts`):

```ts
{
  key: "feature.streamer_mode",
  category: "feature_flag",
  type: "boolean",
  label: "Streamer mode (mask PII in admin)",
  fallback: true,
}
```

Auto-appears on the existing admin Settings tab under "Feature Flag" — no new admin page, no new toggle UI, no new cache logic. Toggling = existing PUT `/api/admin/settings`. Reads use existing `getSetting("feature.streamer_mode", true)` (async) and `getSettingSync(...)` (sync, with 5-second cache; first sync read may briefly see the fallback until primed).

### Env override — by design, none
No `STREAMER_MODE` env override. The DB row is the source of truth. Rationale: env vars on a deployed server can't be flipped mid-stream without a redeploy; the whole point of streamer mode is one-click reversibility. If the row is missing, the **registry `fallback: true`** wins (masked = safe default).

## Resolution — when does the flag refresh?

Same 5s TTL the existing `getSetting` uses (`src/lib/app-settings.ts:7`). After admin saves the toggle, worst-case 5 seconds before new requests see the new value. Existing `invalidateSettingCache()` is called from the settings PUT handler (`_main.admin.settings.tsx` save mutation) so the next read after save sees the new value immediately, matching the pattern the rest of the feature-flag settings already use.

## Mask rendering

Partial mask + reveal link, applied as a single reusable client component:

```text
suryaelidanto@gmail.com  →  s•••••••••@gmail.com   [ tampilkan ]
0812-3456-7890           →  081•••••89             [ tampilkan ]
Toko Sumber Rezeki       →  Toko S•••••Rezeki      [ tampilkan ]
INV-2026-07-15-000123    →  INV-••••••23           [ tampilkan ]
```

Rules:
- Show first 1–3 characters, optionally last 1–2 characters, `•••••` middle.
- `email`: keep first char + domain (`s•••@gmail.com`).
- `phone`: keep first 3 + last 2 digits.
- `businessName`: keep first word's first letter + last word's first letter (`Toko S•••••Rezeki`) — falls back to first+last 2 chars if single-word.
- `orderId`/`paymentNumber`: keep prefix + last 2 chars; `INV-2026-07-15-000123` → `INV-•••23`.
- `amount`: not partial — masked amount defeats the purpose; **show as `••••••••`** (admin opens the detail panel if they need exact value during masked state).

Rule: mask **PII and confidential** fields only (email, phone, name/business name, orderId, paymentNumber, amount). Free-text descriptions (e.g. waitlist story) and non-identifying metadata stay fully visible.

The mask function is pure (server + client both safe); takes the raw value + a `kind: "email" | "phone" | "name" | "orderId" | "amount"` and returns `{ masked: string; revealable: boolean }` where `revealable=false` for amounts and `true` everywhere else.

Reveal behavior (UX):
- `[ tampilkan ]` is a real `<button type="button">`, not a div — keyboard accessible.
- Click reveals the value **for the current session only** (component-local state); does not bypass streamer mode globally. Once revealed, the button label becomes `[ sembunyikan ]`. Click to re-mask.
- Auto-re-mask **on route change** (TanStack Router location change effect) — leaving /admin/transactions and coming back resets all local reveals. Streamers who forgot will get the safe mask back next page.
- During reveal, append a small inline `Dilihat` indicator with a tooltip "Sedang ditampilkan tanpa masker — pikirkan sebelum screenshare" so a streamer who navigates back on a revealed field is reminded of the risk.
- Selectable/copyable: revealed values ARE selectable (admin needs to use them); masked values are NOT selectable (CSS `user-select: none` + `aria-hidden="false"` for screen readers so users with assistive tech can still know there's content).
- Keyboard: `Tab` reaches the reveal button (focus-visible ring per existing tokens); `Enter` / `Space` toggles.
- `prefers-reduced-motion`: instant transition, no fade.

Server-side: even the masked form should never include the full value in the rendered HTML when streamer mode is ON. The Mask component receives the raw value as a prop, but its **default rendered output contains only the partial form**; the raw value lives in a hidden `data-full` attribute only after client-side reveal (set via DOM ref), not in initial SSR HTML. This means even a "view source" on a streamer-mode-on page shows the masked form.

## Where the flag is read

Add one async helper next to the existing helpers in `src/lib/config.ts`:

```ts
export async function isStreamerModeEnabled(): Promise<boolean> {
  return getSetting("feature.streamer_mode", true);
}
```

Sync helper (5s cache, same `getSettingSync` ceiling that `isGeneratedBuildExecutionEnabled` already carries per `src/lib/config.ts:25-31`):

```ts
export function isStreamerModeEnabledSync(): boolean {
  return getSettingSync("feature.streamer_mode", true);
}
```

Sync is used by route loaders to decide whether the admin server-fn payload should already strip the raw PII (so SSR HTML never contains it). Async is used by client-side renderers that already have a loader-issued initial flag in window context (we'll wire an initial-payload field to avoid a client flash).

## Server-side: don't ship the raw values in SSR either

When streamer mode is ON, the existing admin endpoints (`/api/admin/users`, `/api/admin/transactions`, `/api/admin/waitlist`, `/api/admin/overview`'s `recentWaitlist` + `recentTransactions`) continue to return raw values, BUT the admin route loaders consume them and serve the client a sanitized payload where each PII field is replaced with `{ masked, kind, ... }` (kind is needed so the client Mask component knows what shape to render; original raw string is omitted from the loader payload entirely when revealed=false).

Rationale: keeping the raw values in the API response is fine because `/api/admin/*` is `requireAdmin`-gated. But the SSR HTML for admin *pages* must not embed raw values when streamer mode is ON, otherwise `view-source` leaks. Two pathways:

1. **Server functions** used by loaders (the `createServerFn` pattern in `_main.admin.tsx:8-14`): transform before returning to the client.
2. **Direct `fetchJson`** calls in route components (`_main.admin.index.tsx:38`, `_main.admin.users.tsx`, etc.) that bypass a server loader: each component reads the flag via `useStreamerMode()` (a TanStack Router context) and conditionally renders `<SensitiveText>` instead of `{value}` — server still gets raw, but the rendered string is the masked form.

Concrete decisions:
- Add a small server function `loadAdminContext` that returns `{ streamerMode: boolean }` (already-cache), consumed by the admin shell loader.
- Pass `streamerMode` via React context from `<AdminShell>` to descendants. Each admin route reads it via `useStreamerMode()` hook.
- Default behavior when flag is OFF: components render `{value}` directly (no Mask component).
- Default behavior when flag is ON: components render `<SensitiveText kind="email" value={u.email} />` instead.

## Files to add / modify

**Add:**
- `src/components/admin/SensitiveText.tsx` — the mask component (client). Pure-ish: takes `value` + `kind`; server never serializes `value` to the client when flag is ON (component only renders masked form).
- `src/components/admin/streamer-mode-context.tsx` — React context + `useStreamerMode()` hook + provider mounted in `AdminShell`.
- `src/lib/mask.ts` — pure masking functions (server + client safe). Unit tests in `mask.test.ts`.
- `src/server/streamer-mode-loaders.ts` (or extend `_main.admin.tsx` loader) — server function returning `{ streamerMode: boolean }`.

**Modify:**
- `src/lib/app-settings-registry.ts` — add the one `APP_SETTINGS` entry (shown above). Done in this diff.
- `src/lib/config.ts` — add `isStreamerModeEnabled`/`isStreamerModeEnabledSync`.
- `src/routes/_main.admin.tsx` — load `streamerMode` in the loader, mount provider, pass through context.
- `src/routes/_main.admin.index.tsx` — use `SensitiveText` for masked fields (per table above).
- `src/routes/_main.admin.users.tsx` — same.
- `src/routes/_main.admin.waitlist.tsx` — same.
- `src/routes/_main.admin.transactions.tsx` — same.
- `src/components/common/Header.tsx` (account menu) — wrap admin's name + email with `SensitiveText` (only when `streamerMode === true`; reads from context).

## Out of scope (explicit)

- **Public surfaces** — `/`, `/auth`, generated project routes. No PII there.
- **Workspace / builder** — admin shows their own data there (`/projects/<id>`). Workspace is the *streamer's own* experience; if you stream your own workspace you're consenting to expose your own data. Out of scope. Could be a future extension if needed.
- **Audit log of who toggled it on/off** — the existing `AppSetting.updatedBy` field already records who saved the row. No new audit table.
- **Auto-detection of streaming software** — explicitly not in scope; the flag is human-driven. Tempting, but unreliable and adds platform-specific code.
- **Per-field override** — one global flag only. Per-field "always show" / "always mask" would balloon complexity for marginal benefit; the reveal link handles the common need.
- **Loadable in `getSettingSync` first-call** — the existing 5s cache ceiling already applies; documented in the spec, same code path as the other feature flags.

## Verification

- Unit tests for `mask.ts` — every kind, plus edge cases (empty string, single-char, all-`•`-incompatible chars).
- Storybook entry for `SensitiveText` per KIND × state (masked / revealed) — required by DESIGN.md for any reusable UI.
- Manual: dev server, toggle Settings → Streamer mode, refresh /admin/*, verify mask. Toggle off, verify raw values return. Toggle on, click reveal, verify raw appears, navigate away and back, verify remasked. `view-source` during ON: confirm raw values absent from HTML.
- `bun run check` (format/lint/typecheck/test:changed/Knip) green.
