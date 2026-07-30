# Waitlist Homepage Access Design

## Goal

Let waitlisted users leave `/waitlist` and browse the marketing homepage without logging out, while keeping product actions blocked until approval.

## Problem

Today a signed-in, verified, non-approved user is hard-gated to `/waitlist`.

- `/` redirects back to `/waitlist`
- only free public pages are `/terms`, `/privacy`, `/waitlist`, `/verify`, `/blocked`
- “back to landing” currently means bounce-loop or logout

That feels trapped and makes logout look like the only escape.

## Decision

Waitlisted users stay logged in.

They get **limited marketing access**:

- can open `/`
- can open public info pages (`/terms`, `/privacy`)
- can return to `/waitlist` status
- cannot use product actions until approved

Logout remains available, but secondary.

## User states on homepage `/`

| State | Homepage |
|---|---|
| Guest | marketing + login/signup CTA |
| Waitlisted | marketing + pending banner + product CTA disabled |
| Approved | product home (prompt form / projects) |

## Scope

In:

- route gate change for `/`
- homepage waitlisted mode
- limited navbar/footer chrome for waitlisted users
- waitlist success-screen “Lihat beranda”
- keep product routes blocked

Out:

- redesign whole landing
- waitlist approval flow changes
- email/status notifications
- temporary guest preview of product

## Architecture

### 1. Gate

Update server/client gates so waitlisted users may access:

- `/`
- `/terms`
- `/privacy`
- `/waitlist`
- `/verify`
- `/blocked`

Keep blocked for waitlisted users:

- `/projects/*`
- create/build/edit product routes
- energy/booster product routes
- admin routes
- any other authenticated product surface not listed as public/marketing

### 2. Homepage mode

`/` detects waitlist status for signed-in verified users.

If status is not `approved`:

- render marketing content, not product composer as primary action
- disable create-website / project actions
- show pending banner:
  - Indonesian copy: user is still in queue
  - link back to `/waitlist`
- account menu remains available

If status is `approved`, keep current product homepage.

If guest, keep current marketing homepage.

### 3. Chrome

For waitlisted users:

- keep navbar/footer visible
- show logo, Syarat, Privasi, optional Bantuan
- account menu: email + `Keluar`
- hide or disable product nav items (projects/energy)

For guests and approved users, keep existing chrome behavior.

### 4. Waitlist success screen

On success / still-pending screen:

- keep primary success message
- add secondary CTA: `Lihat beranda` → `/`
- keep links: `Syarat`, `Privasi`
- keep `Keluar` low-emphasis only if already present; do not make logout the primary exit

## Copy

User-facing Indonesian:

- banner: `Kamu masih dalam antrean. Kami hubungi lewat email.`
- banner link: `Cek status antrean`
- success secondary button: `Lihat beranda`

## Error / edge cases

- waitlist gate disabled: existing pass-through remains; approved-equivalent access
- admin users: remain approved/bypass as today
- rejected users: same limited marketing access as pending; `/waitlist` still shows rejection + reapply path
- deep link to product route while waitlisted: redirect to `/waitlist` (or homepage with banner if already product-blocked elsewhere; prefer `/waitlist` for product deep links)

## Testing

- waitlisted user can open `/` without redirect loop
- waitlisted user cannot create project from homepage
- waitlisted user blocked from `/projects/*`
- waitlisted user can open `/terms` and `/privacy`
- success screen has `Lihat beranda` to `/`
- approved user still gets product homepage
- guest still gets marketing homepage
- logout still works

## Deliberate skips

- no new waitlist status page redesign
- no partial product preview for waitlisted users
- no “logout to see landing” flow as primary UX

## Phased delivery

1. open `/` for waitlisted + disable product CTA + success `Lihat beranda`
2. limited navbar/footer for waitlisted
3. polish banner/copy and edge-case redirects

Phase 1 is useful alone. Phase 2 completes the recommended experience.
