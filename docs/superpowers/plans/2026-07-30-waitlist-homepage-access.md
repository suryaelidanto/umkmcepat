# Waitlist Homepage Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let waitlisted users open `/` and leave the waitlist success screen without logging out, while product routes stay blocked.

**Architecture:** Treat `/` as a marketing-public route for waitlisted users (same as `/terms`/`/privacy`). Stop client chrome from redirecting waitlisted users off those pages. Homepage switches to limited marketing mode when waitlist status is not approved. Success screen gains `Lihat beranda`.

**Tech Stack:** TanStack Router/Start, React Query, Vitest, existing waitlist status APIs.

## Global Constraints

- User-facing copy is Indonesian.
- Developer-facing docs/code/logs/errors are English.
- Stay logged in; do not make logout the primary exit.
- Product routes remain blocked for waitlisted users.
- Banner copy exact: `Kamu masih dalam antrean. Kami hubungi lewat email.`
- Banner link exact: `Cek status antrean`
- Success secondary CTA exact: `Lihat beranda`
- Phase 1 first (gate + homepage CTA disable + success button). Phase 2 limited chrome. Phase 3 polish only if needed.
- Bun only. Commit one logical unit at a time to `dev`.
- Focused tests during work; `bun run check` before handoff.

**Spec:** `docs/superpowers/specs/2026-07-30-waitlist-homepage-access-design.md`

---

## File Map

- Modify: `src/server/loaders/check-route-gates.ts` — allow `/` for waitlisted users.
- Modify: `src/server/loaders/check-route-gates.test.ts` — gate tests.
- Modify: `src/components/common/MainChrome.tsx` — stop client bounce from marketing-public routes.
- Modify: `src/routes/_main.index.tsx` — homepage waitlisted mode + banner.
- Modify: `src/routes/_main.waitlist.tsx` — success `Lihat beranda`.
- Modify: `src/components/common/Header.tsx` — hide energy for waitlisted (phase 2).
- Modify: `src/components/common/MobileNav.tsx` — limited items for waitlisted (phase 2).
- Create or modify: small waitlist-access helper only if homepage/chrome share status checks cleanly; otherwise inline with existing `/api/user/waitlist` query.

---

### Task 1: Server gate allows homepage for waitlisted users

**Files:**
- Modify: `src/server/loaders/check-route-gates.ts`
- Modify: `src/server/loaders/check-route-gates.test.ts`

**Interfaces:**
- Consumes: existing `checkRouteGates(pathname: string)`
- Produces: `/` treated as public for gate purposes; waitlisted users no longer redirected away from `/`

- [ ] **Step 1: Write failing tests**

Add to `src/server/loaders/check-route-gates.test.ts`:

```ts
it("allows waitlisted users on homepage", async () => {
  getAuthStateMock.mockResolvedValue({
    session: { user: { id: "u-1", email: "user@example.com" } },
    banned: false,
  });
  isUserVerifiedMock.mockResolvedValue(true);
  isWaitlistEnabledMock.mockResolvedValue(true);
  isWaitlistApprovedMock.mockResolvedValue(false);
  resolveUserWaitlistStatusMock.mockReturnValue({ status: "pending" });

  await expect(checkRouteGates("/")).resolves.toEqual({ ok: true });
});

it("still redirects waitlisted users away from product routes", async () => {
  getAuthStateMock.mockResolvedValue({
    session: { user: { id: "u-1", email: "user@example.com" } },
    banned: false,
  });
  isUserVerifiedMock.mockResolvedValue(true);
  isWaitlistEnabledMock.mockResolvedValue(true);
  isWaitlistApprovedMock.mockResolvedValue(false);
  resolveUserWaitlistStatusMock.mockReturnValue({ status: "pending" });

  await expect(checkRouteGates("/projects")).rejects.toBeInstanceOf(Response);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `bun test src/server/loaders/check-route-gates.test.ts`

Expected: FAIL — homepage still redirects waitlisted users.

- [ ] **Step 3: Minimal implementation**

In `src/server/loaders/check-route-gates.ts`, add `/` to public routes:

```ts
const isPublicRoute =
  pathname === "/" ||
  pathname === "/blocked" ||
  pathname === "/waitlist" ||
  pathname === "/verify" ||
  pathname === "/privacy" ||
  pathname === "/terms" ||
  pathname.startsWith("/booster/success/");
```

Do not change product-route behavior.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `bun test src/server/loaders/check-route-gates.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/loaders/check-route-gates.ts src/server/loaders/check-route-gates.test.ts
git commit -m "fix(waitlist): allow homepage for waitlisted users in route gate"
```

---

### Task 2: MainChrome stops bouncing waitlisted users off marketing pages

**Files:**
- Modify: `src/components/common/MainChrome.tsx`

**Interfaces:**
- Consumes: waitlist status query already in MainChrome
- Produces: waitlisted users may stay on `/`, `/terms`, `/privacy` without client redirect

- [ ] **Step 1: Identify current bounce**

Current logic in `MainChrome`:

```ts
if (
  isVerified &&
  waitlistQuery.isSuccess &&
  waitlistQuery.data.status !== "approved"
) {
  router.replace("/waitlist");
}
```

This runs for any non-waitlist/non-verify page, including `/` and `/terms`.

- [ ] **Step 2: Write a focused regression note via existing test style if present**

If there is no MainChrome test file, skip new harness; cover via gate tests + manual checklist. Do not invent a large browser test framework.

If a small unit-extract is natural, prefer:

```ts
export function shouldRedirectWaitlistedToQueue(pathname: string): boolean {
  if (
    pathname === "/" ||
    pathname === "/waitlist" ||
    pathname === "/verify" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/blocked" ||
    pathname.startsWith("/booster/success/")
  ) {
    return false;
  }
  return true;
}
```

Put in `src/lib/waitlist-route-access.ts` only if used by both gate and chrome. Otherwise keep local helper in MainChrome and mirror public-route list carefully.

Recommended: extract shared helper so server/client stay aligned.

Create `src/lib/waitlist-route-access.ts`:

```ts
export function isWaitlistMarketingPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/blocked" ||
    pathname === "/waitlist" ||
    pathname === "/verify" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname.startsWith("/booster/success/")
  );
}
```

Refactor `check-route-gates.ts` to use it. Then MainChrome uses:

```ts
if (
  isVerified &&
  waitlistQuery.isSuccess &&
  waitlistQuery.data.status !== "approved" &&
  !isWaitlistMarketingPublicPath(pathname)
) {
  router.replace("/waitlist");
}
```

Also enable waitlist status query on homepage when verified, so chrome/header can know status later:

Keep query enabled for verified users except pure verify page if needed. Current:

```ts
enabled: isVerified && !isVerifyPage && !isWaitlistPage,
```

Change to:

```ts
enabled: isVerified && !isVerifyPage,
```

so homepage can read waitlist status without only relying on page-local fetch.

- [ ] **Step 3: Add helper tests**

Create `src/lib/waitlist-route-access.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { isWaitlistMarketingPublicPath } from "./waitlist-route-access";

describe("isWaitlistMarketingPublicPath", () => {
  it("allows marketing and gate pages", () => {
    expect(isWaitlistMarketingPublicPath("/")).toBe(true);
    expect(isWaitlistMarketingPublicPath("/terms")).toBe(true);
    expect(isWaitlistMarketingPublicPath("/privacy")).toBe(true);
    expect(isWaitlistMarketingPublicPath("/waitlist")).toBe(true);
  });

  it("blocks product pages", () => {
    expect(isWaitlistMarketingPublicPath("/projects")).toBe(false);
    expect(isWaitlistMarketingPublicPath("/projects/abc")).toBe(false);
    expect(isWaitlistMarketingPublicPath("/admin")).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests**

Run:

```bash
bun test src/lib/waitlist-route-access.test.ts src/server/loaders/check-route-gates.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/waitlist-route-access.ts src/lib/waitlist-route-access.test.ts src/server/loaders/check-route-gates.ts src/components/common/MainChrome.tsx
git commit -m "fix(waitlist): stop client redirect from marketing pages"
```

---

### Task 3: Homepage waitlisted mode + pending banner

**Files:**
- Modify: `src/routes/_main.index.tsx`
- Optionally modify: `src/components/projects/HomePromptForm.tsx` only if needed to accept disabled/waitlisted prop; prefer page-level replacement over deep form edits.

**Interfaces:**
- Consumes: session + waitlist status (`approved` vs not)
- Produces: waitlisted homepage without create-project primary action

- [ ] **Step 1: Decide homepage mode source**

Use client waitlist status already available via `/api/user/waitlist` on MainChrome, or fetch in homepage.

Minimal: homepage uses `useSession` + `useQuery(queryKeys.waitlistStatus)`.

Mode:

```ts
const waitlisted =
  status === "authenticated" &&
  waitlistStatus != null &&
  waitlistStatus !== "approved";
```

When waitlist gate disabled, API returns approved-equivalent; no special case needed if `resolveUserWaitlistStatus` already does that.

- [ ] **Step 2: Render waitlisted homepage**

In `_main.index.tsx` HomePage:

1. Keep guest marketing content for guests.
2. For waitlisted:
   - show marketing-style hero (same guest headline family, or “Hai, {name}” without create CTA)
   - **do not render** `HomePromptForm`
   - **do not render** `ProjectList`
   - show banner above hero:

```tsx
<div className="mx-auto mb-spacing-6 max-w-3xl rounded-[20px] border border-yellow-500/24 bg-yellow-500/[0.06] px-spacing-6 py-spacing-4 text-center text-sm text-surface-warm-white/82">
  <p>Kamu masih dalam antrean. Kami hubungi lewat email.</p>
  <Link
    href="/waitlist"
    className="mt-spacing-2 inline-block text-surface-warm-white underline-offset-4 hover:underline"
  >
    Cek status antrean
  </Link>
</div>
```

3. For approved signed-in users, keep current product homepage.

Example structure:

```tsx
{waitlisted ? (
  <>
    <WaitlistPendingBanner />
    <HeroMotionItem>
      <h1>...</h1>
      <p className="mt-spacing-4 text-surface-warm-white/62">
        Setelah disetujui, kamu bisa buat website di sini.
      </p>
    </HeroMotionItem>
  </>
) : (
  <>
    <h1>...</h1>
    <HomePromptForm ... />
  </>
)}

{hasUser && !waitlisted ? <ProjectList ... /> : null}
{!hasUser ? <CommunitySection ... /> : null}
```

Use Indonesian only for user-visible strings.

- [ ] **Step 3: Avoid product action leaks**

Confirm waitlisted users do not see:
- prompt form submit
- project list open/delete
- any “buat website” CTA

If `HomePromptForm` still mounts accidentally, that is a bug.

- [ ] **Step 4: Manual smoke checklist (write in commit body / plan notes)**

1. Waitlisted account opens `/` → no redirect loop
2. No create form
3. Banner + `Cek status antrean` works
4. Approved account still sees form + projects
5. Guest still sees marketing + community

- [ ] **Step 5: Commit**

```bash
git add src/routes/_main.index.tsx
git commit -m "feat(waitlist): limited homepage mode for waitlisted users"
```

---

### Task 4: Waitlist success screen “Lihat beranda”

**Files:**
- Modify: `src/routes/_main.waitlist.tsx`

**Interfaces:**
- Consumes: router/Link
- Produces: secondary CTA from success screen to `/`

- [ ] **Step 1: Update SuccessScreen**

In `SuccessScreen`, after the thank-you paragraph, add:

```tsx
<Link
  href="/"
  className="mt-spacing-2 inline-flex items-center justify-center rounded-full bg-surface-warm-white px-spacing-6 py-spacing-3 text-sm font-medium text-[#141413] hover:bg-surface-warm-white/92"
>
  Lihat beranda
</Link>
```

Keep admin self-approve low-emphasis below it.

Import `Link` from existing UI link component if not already imported in this file.

- [ ] **Step 2: Verify no logout primary CTA**

Do not add a primary logout button. Existing account logout remains in header after chrome phase if shown.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_main.waitlist.tsx
git commit -m "feat(waitlist): add Lihat beranda on success screen"
```

---

### Task 5: Phase 2 limited chrome for waitlisted users

**Files:**
- Modify: `src/components/common/Header.tsx`
- Modify: `src/components/common/MobileNav.tsx`
- Modify: `src/components/common/EnergyDisplay.tsx` only if needed for hide prop; prefer conditional render in Header.

**Interfaces:**
- Consumes: waitlist status
- Produces: waitlisted chrome without product nav/energy

- [ ] **Step 1: Header**

In `Header`, read waitlist status (React Query with `queryKeys.waitlistStatus`, enabled when authenticated+verified if needed).

If waitlisted:

- keep logo → `/`
- keep `AuthButton`
- hide `EnergyDisplay`

```tsx
{!waitlisted ? <EnergyDisplay /> : null}
<AuthButton />
```

- [ ] **Step 2: MobileNav**

If waitlisted, only show marketing-safe items:

```ts
const WAITLISTED_ITEMS = [
  { href: "/", icon: Home, label: "Beranda" },
  { href: "/waitlist", icon: User, label: "Antrean" },
] as const;

const WAITLISTED_OVERFLOW = [
  { href: "/privacy", label: "Privasi" },
  { href: "/terms", label: "Syarat" },
] as const;
```

Do not show `/projects`, `/projects/new`, energy wallet, admin unless already admin-approved path; waitlisted non-admin must not get product items.

- [ ] **Step 3: Footer**

If footer already only has terms/privacy/marketing links, leave it. Do not add product links.

- [ ] **Step 4: Commit**

```bash
git add src/components/common/Header.tsx src/components/common/MobileNav.tsx
git commit -m "feat(waitlist): limited navbar for waitlisted users"
```

---

### Task 6: Final verification

**Files:**
- None expected unless route tree regen touches generated files.

- [ ] **Step 1: Run focused tests**

```bash
bun test src/server/loaders/check-route-gates.test.ts src/lib/waitlist-route-access.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck/lint gate**

```bash
bun run check
```

Expected: PASS. If only unrelated dirty files fail, report them; do not “fix” unrelated work.

- [ ] **Step 3: Manual checklist**

- waitlisted → `/` no loop
- waitlisted → `/projects` redirects `/waitlist`
- waitlisted → homepage no create form
- success → `Lihat beranda` → `/`
- approved product homepage unchanged
- guest marketing homepage unchanged
- logout still works from AuthButton

- [ ] **Step 4: Commit only if verification produced code fixes**

```bash
git add <files>
git commit -m "fix(waitlist): polish homepage access edge cases"
```

---

## Spec coverage self-check

| Spec requirement | Task |
|---|---|
| Allow `/` for waitlisted | Task 1 |
| Keep product routes blocked | Task 1 |
| Client chrome no bounce on marketing pages | Task 2 |
| Homepage waitlisted mode | Task 3 |
| Banner copy + status link | Task 3 |
| Success `Lihat beranda` | Task 4 |
| Limited navbar/footer | Task 5 |
| Stay logged in / logout secondary | Tasks 3–5 |
| Tests listed in spec | Tasks 1, 2, 6 |

## Placeholder scan

No TBD/TODO placeholders. Exact copy included. Shared path helper preferred to avoid server/client drift.

## Type consistency

- Helper name: `isWaitlistMarketingPublicPath(pathname: string): boolean`
- Waitlisted condition: status present and not `"approved"`
- CTA labels fixed as above
