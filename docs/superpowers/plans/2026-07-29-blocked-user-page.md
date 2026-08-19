# Blocked-user page + sign-in ban enforcement — implementation plan

Spec: `docs/superpowers/specs/2026-07-29-blocked-user-page.md`

3 atomic commits. ~120 lines added, ~10 removed. 5 new files, 8 modified. No new dependencies.

## Commit 1: Auth helpers + sign-in callback (foundation)

### `src/lib/auth.ts` — add `getAuthState()` and `requireNotBanned()`

After the existing `auth()` function (line 103), add:

```ts
export type AuthState = {
  session: Session | null;
  banned: boolean;
};

// Auth state with explicit ban flag. Banned users have a valid session cookie
// but their User.bannedAt is set; they are NOT guests. Use this when you need
// to distinguish the two (e.g. route gates that should redirect banned users
// to /blocked rather than treating them as anonymous).
export async function getAuthState(): Promise<AuthState> {
  const request = getRequest();
  if (!request) {
    return { session: null, banned: false };
  }
  const session = await auth();
  if (!session?.user?.id) {
    return { session: null, banned: false };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { bannedAt: true },
  });
  return { session, banned: Boolean(user?.bannedAt) };
}

// Defense-in-depth: throw a redirect to /blocked if the session belongs to a
// banned user. Call this in routes that read User rows directly (without a
// follow-up ownership check that would already 404 the row) so a future
// refactor that drops the auth() gate still blocks banned users.
export async function requireNotBanned(session: Session | null) {
  if (!session?.user?.id) return;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { bannedAt: true },
  });
  if (user?.bannedAt) {
    throw redirect({ to: "/blocked" });
  }
}
```

Add import at top: `import { redirect } from "@tanstack/react-router";`

### `src/lib/auth-config.ts` — no change

The original spec called for adding a `signIn` callback that rejects banned users at sign-in. After user feedback, the desired behavior is: banned users complete sign-in normally; the existing gate (which checks `bannedAt` on every request via `getAuthState()`) redirects them to `/blocked` on their first page load. The `signIn` callback is NOT added. Removing it also avoids a pre-existing `applySecurityHeaders` bug in `src/lib/security-headers.ts` (immutable `Headers` object on error responses) that surfaces when Auth.js renders the AccessDenied page.

### `src/lib/auth.test.ts` — extend

Add a new `describe("getAuthState")` block with 3 cases:
- `auth() === null` → returns `{ session: null, banned: false }`
- `auth() === session`, `bannedAt === null` → returns `{ session, banned: false }`
- `auth() === session`, `bannedAt === Date` → returns `{ session, banned: true }`

Add a new `describe("requireNotBanned")` block with 3 cases:
- null session → does not throw
- non-banned session → does not throw
- banned session → throws redirect to `/blocked`

`prisma` is already mocked at the top. Reuse the same mock helpers.

## Commit 2: Route gate wiring (uses the helpers)

### `src/routes/_main.tsx` — banned branch in `checkRouteGates`

Change import at line 7: replace `import { auth } from "@/lib/auth/auth";` with `import { getAuthState } from "@/lib/auth/auth";`.

In the handler (line 14), replace the session check (lines 20-24):

```ts
const { session, banned } = await getAuthState();

if (banned) {
  throw redirect({ to: "/blocked" });
}

if (!session?.user?.id) {
  return { ok: true as const };
}
```

Update `isPublicRoute` (line 15-18) to include `/verify`:

```ts
const isPublicRoute =
  pathname === "/waitlist" ||
  pathname === "/verify" ||
  pathname === "/privacy" ||
  pathname === "/terms";
```

(The `/verify` add fixes the logic bug where a verified-approved user navigating to `/verify` would be redirected to `/waitlist` instead of seeing the form. Drive-by fix.)

### `src/routes/_main.profile.tsx` — explicit banned check

Change the loader (line 8-27):

```ts
const loadProfile = createServerFn({ method: "GET" }).handler(async () => {
  const { session, banned } = await getAuthState();

  if (banned) {
    throw redirect({ to: "/blocked" });
  }

  if (!session?.user?.id) {
    throw redirect({ to: "/" });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true },
  });

  if (!user) {
    throw redirect({ to: "/" });
  }

  return {
    initialName: user.name || session.user.name || "",
  };
});
```

Add `getAuthState` import alongside the existing `auth` import (or replace `auth` with `getAuthState` — only `getAuthState` is used after the change).

### Defense-in-depth on direct user-row reads

For each of the 3 routes, add `requireNotBanned()` call right after the `auth()` check. Pattern:

```ts
const session = await auth();
if (!session?.user?.id) { /* existing 401 */ }
await requireNotBanned(session);
```

Files:
- `src/routes/api.profile.ts` (after line 18)
- `src/routes/api.user.credits.ts` (after line 17)
- `src/routes/api.user.energy-ledger.ts` (after line 20)

Add `requireNotBanned` import to each.

Note: today these routes already 401 banned users (because `auth()` returns null for them). The `requireNotBanned` calls are no-ops in current code; they only matter if a future refactor changes `auth()` semantics or if a code path adds a direct user-row read without `auth()`. Documented as defense-in-depth in spec acceptance criterion 7.

## Commit 3: `/blocked` page + tests

### `src/routes/_main.blocked.tsx` — new file

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { getAuthState } from "@/lib/auth/auth";
import { signOut } from "@/lib/auth/auth-client";

const loadBlocked = createServerFn({ method: "GET" }).handler(async () => {
  const { session, banned } = await getAuthState();

  if (!session?.user?.id || !banned) {
    throw redirect({ to: "/" });
  }

  return { ok: true as const };
});

export const Route = createFileRoute("/_main/blocked")({
  loader: () => loadBlocked(),
  headers: () => ({
    "Cache-Control": "no-store, no-cache, must-revalidate",
  }),
  component: BlockedPage,
});

function BlockedPage() {
  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-[#151515] px-4 py-spacing-12 text-surface-warm-white sm:px-spacing-9 lg:px-spacing-10">
      <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-spacing-8 text-center">
        <h1 className="font-heading text-3xl font-semibold sm:text-4xl">
          Akun Anda diblokir
        </h1>
        <p className="text-base text-surface-warm-white/80 sm:text-lg">
          Akun Anda diblokir. Hubungi admin di{" "}
          <a
            href="mailto:hello@umkmcepat.com"
            className="underline underline-offset-4 hover:text-surface-warm-white"
          >
            hello@umkmcepat.com
          </a>{" "}
          untuk info lebih lanjut.
        </p>
        <button
          type="button"
          onClick={() => {
            void signOut({ callbackUrl: "/" });
          }}
          className="rounded-md border border-white/20 bg-white/5 px-spacing-6 py-spacing-3 text-sm font-medium text-surface-warm-white transition hover:bg-white/10"
        >
          Keluar
        </button>
      </section>
    </main>
  );
}
```

Notes:
- `signOut` from `auth-client.tsx` is a client function. The button's `onClick` is fine because the route component is rendered client-side. `signOut()` does a form-submit to `/api/auth/signout` then navigates to `callbackUrl`. No API call needed.
- `Cache-Control: no-store` is set via the route's `headers` option (TanStack Start supports this on `createFileRoute`). Verify the exact API name in TanStack Start docs; if `headers` is not a valid option, fall back to setting the header in a middleware or in `_main.tsx`'s `beforeLoad` based on pathname.
- Styling matches `_main.profile.tsx:38-44` and existing warm-white theme. No new design tokens.

### `src/routes/_main.blocked.test.ts` — new file, 4 cases

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAuthStateMock = vi.fn();

vi.mock("@/lib/auth/auth", () => ({
  getAuthState: (...args: unknown[]) => getAuthStateMock(...args),
}));

describe("/blocked route", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("redirects guests to /", async () => {
    getAuthStateMock.mockResolvedValue({ session: null, banned: false });
    // ... assert redirect to /
  });

  it("redirects non-banned signed-in users to /", async () => {
    getAuthStateMock.mockResolvedValue({
      session: { user: { id: "u1" } },
      banned: false,
    });
    // ... assert redirect to /
  });

  it("renders the page for banned users", async () => {
    getAuthStateMock.mockResolvedValue({
      session: { user: { id: "u1", email: "banned@example.com" } },
      banned: true,
    });
    // ... render the route, assert the message and the Keluar button are present
  });

  it("sets Cache-Control: no-store on the response", async () => {
    // ... assert header
  });
});
```

### `src/lib/auth-config.test.ts` — no file

The original plan called for a new test file exercising the `signIn` callback. Since the `signIn` callback was removed (see `src/lib/auth-config.ts` note), no test file is needed.

## Verification

After each commit:
```bash
bun run check
```

Before final handoff:
```bash
bun run verify
```

If `verify` passes, push and let CI run the full suite (Storybook, build, Chromatic).

## Out of scope (reminder)

- Preview-asset-token bypass in `src/routes/api.projects.$id.assets.$.ts:84-91` is **not** fixed. Document in PR description: "A banned user can keep loading their own generated preview assets for up to 15 min after ban, scoped to their own deployment, served from a sandboxed runtime. No cross-user data leak. Accepted behavior."
- Ban by email — future spec.
- IP/UA binding — future spec.
- Audit log of ban events — out of scope.
- Email notification to banned user — out of scope.
