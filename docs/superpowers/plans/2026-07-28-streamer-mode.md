# Streamer Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default-ON admin privacy gate (DB-backed `feature.streamer_mode` toggle) that masks PII across `/admin/*` and the header account menu, with per-field reveal-on-click and auto-re-mask on route change.

**Architecture:** Single `feature.streamer_mode` boolean in the existing `APP_SETTINGS` registry (auto-renders on the admin Settings tab). Pure `mask.ts` produces the masked form. `SensitiveText` client component handles per-instance reveal state, route-change reset, and keyboard/mouse interaction. A React context (`StreamerModeProvider`) carries the flag from the admin route loader's server function down to every admin descendant + the `AuthButton` menu.

**Tech Stack:** TanStack Router (`createServerFn` + loaders + `createContext`), React 19 (context, `useEffect`), existing `getSetting`/`getSettingSync` (`src/lib/app-settings.ts`) with 5s TTL cache, Tailwind v4 tokens (`surface-warm-white`, `focus-visible:ring-surface-warm-white`), Storybook for `SensitiveText` stories.

## Global Constraints

- User-facing product UI copy is Indonesian. Developer-facing docs/code/logs/errors English. New strings listed below.
- Surgical edits only. No refactoring of unrelated files. Match existing patterns (other admin routes use `fetchJson` + `useQuery`; the shell uses `createServerFn` + `loader`).
- No new dependencies. No new visual language. The mask component uses existing tokens (text-surface-warm-white, focus-visible:ring, surface-warm-white/15 fill).
- Atomic commits: one logical unit per commit (per the umkmcepat memory rule).
- Pre-commit runs `bun run check:commit` (Prettier + ESLint on staged only). CI runs `bun run verify`. Never bypass.
- Run `bun run check` at the end before handoff (format/lint/typecheck/`test:changed`/Knip in parallel).

## New strings (Indonesian, listed once; reuse everywhere)

- "tampilkan" — mask reveal button label
- "sembunyikan" — mask re-mask button label
- "Sedang ditampilkan tanpa masker — pikirkan sebelum screenshare." — title attribute on the revealed marker

## File structure

**New files (4):**
- `src/lib/mask.ts` — pure mask functions (browser-safe, no prisma).
- `src/lib/mask.test.ts` — vitest unit tests for every kind + edges.
- `src/components/admin/SensitiveText.tsx` — client component (masked render, per-instance reveal, route-change re-mask).
- `src/components/admin/streamer-mode-context.tsx` — React context + `StreamerModeProvider` + `useStreamerMode()` hook.
- `src/stories/SensitiveText.stories.tsx` — Storybook: every kind × masked/revealed states.

**Modify (8):**
- `src/lib/app-settings-registry.ts` — add the one `APP_SETTINGS` entry (default true).
- `src/lib/config.ts` — add `isStreamerModeEnabled` (async) + `isStreamerModeEnabledSync`.
- `src/routes/_main.admin.tsx` — add loader that returns `{ streamerMode: boolean }`; mount `<StreamerModeProvider>`; shell stays as-is.
- `src/routes/_main.admin.index.tsx` — wrap masked fields (recentWaitlist businessName, recentTransactions orderId+amount).
- `src/routes/_main.admin.users.tsx` — wrap row name + email.
- `src/routes/_main.admin.waitlist.tsx` — wrap card businessName, email, phone, story.
- `src/routes/_main.admin.transactions.tsx` — wrap orderId, paymentNumber, amount (energy), email.
- `src/components/common/AuthButton.tsx` — when `useStreamerMode()` is true, mask `displayName` (the user.name shown as the trigger button label) and `session.user.email` (shown in the menu).

`Header.tsx` spec lists the name/email masking under "Header account menu" — the actual menu lives in `AuthButton.tsx`, not `Header.tsx`. Plan works there instead. (`Header.tsx` already delegates to `<AuthButton/>` for the menu.)

---

## Task 1: register `feature.streamer_mode` + config helpers

**Files:**
- Modify: `src/lib/app-settings-registry.ts`
- Modify: `src/lib/config.ts`

**Interfaces:**
- Produces: `APP_SETTINGS` gains `{ key: "feature.streamer_mode", category: "feature_flag", type: "boolean", label: "Streamer mode (mask PII in admin)", fallback: true }`.
- Produces:
  ```ts
  // src/lib/config.ts
  export function isStreamerModeEnabled(): Promise<boolean>;  // reads via getSetting(..., true); 5s cache
  export function isStreamerModeEnabledSync(): boolean;        // reads via getSettingSync(..., true); 5s cache ceiling applies
  ```

- [ ] **Step 1: Add the entry to `APP_SETTINGS`**

In `src/lib/app-settings-registry.ts`, append a new entry to the `feature_flag` block. Insert immediately after the `feature.generated_public_execution` entry (so the three feature flags stay grouped), keeping the existing array shape and trailing comma style:

```ts
{
  key: "feature.streamer_mode",
  category: "feature_flag",
  type: "boolean",
  label: "Streamer mode (mask PII in admin)",
  fallback: true,
},
```

(The whole block becomes `feature.waitlist_enabled` → `feature.generated_build_execution` → `feature.generated_public_execution` → `feature.streamer_mode`.)

- [ ] **Step 2: Add the two helpers to `src/lib/config.ts`**

Append at the end of the file (does NOT touch the existing imports or `getCapabilityFlag` pattern):

```ts
import { getSetting, getSettingSync } from "@/lib/config/app-settings";

export function isStreamerModeEnabled(): Promise<boolean> {
  return getSetting("feature.streamer_mode", true);
}

export function isStreamerModeEnabledSync(): boolean {
  return getSettingSync("feature.streamer_mode", true);
}
```

`src/lib/config.ts` already imports from `@/lib/config/app-settings` only indirectly (via `provider-registry`). Adding the direct import for `getSetting`/`getSettingSync` is required. Verify by reading `src/lib/config.ts` after the edit — keep the existing imports list intact, just add the line.

- [ ] **Step 3: Verify**

Run: `bun run check`
Expected: PASS (registry parses, type check, mask tests later will catch the actual flag behavior).

- [ ] **Step 4: Commit**

```bash
git add src/lib/app-settings-registry.ts src/lib/config.ts
git commit -m "feat(admin): register feature.streamer_mode + helpers

New default-true flag in APP_SETTINGS (auto-renders on the existing
admin Settings tab) plus isStreamerModeEnabled{,Sync} in src/lib/config."
```

---

## Task 2: pure mask library + tests

**Files:**
- Create: `src/lib/mask.ts`
- Create: `src/lib/mask.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type MaskKind = "email" | "phone" | "name" | "orderId" | "amount" | "story";
  export function mask(value: string | null | undefined, kind: MaskKind): { masked: string; revealable: boolean };
  ```

**Mask rules (verbatim from the spec):**
- `email`: first char + `•••` + domain. Examples: `suryaelidanto@gmail.com` → `s•••@gmail.com`; null/empty → `—`.
- `phone`: first 3 + `•••` + last 2 digits. Example: `081234567890` → `081•••90`; null → `—`.
- `name`: keep the first letter of the first word and the first letter of the last word, with `•••••` between them; single-word names keep first 2 + last 1 with `•••••` middle. Examples: `Toko Sumber Rezeki` → `T•••••R`; `Surya` → `Su•••a`; null → `—`.
- `orderId`: any leading non-digit prefix (e.g. `INV-`) kept, then `•••••`, then last 2 chars. Example: `INV-2026-07-15-000123` → `INV-•••23`; bare numeric → `••••23`; null → `—`.
- `amount`: full mask `••••••••`, `revealable: false`. Example: `Rp 25.000` → `••••••••`; null → `—`.
- `story`: first ~40 chars then `…`. Example: `Halo, saya pemilik...` (≥40 chars) → `Halo, saya pemilik usaha kecil di kota…`; <40 chars stays as-is prefixed with `…`. `revealable: true`. null → `—`.

The `revealable` flag is `false` only for `amount`. Everything else is `true`.

Edge cases the tests must cover: null/undefined → `{ masked: "—", revealable: <kind default> }`; single-character strings; two-character strings; all-`•`-incompatible locales (just ensure no crash). Empty string and whitespace get the same null treatment.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/mask.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { mask, type MaskKind } from "@/lib/mask";

describe("mask", () => {
  describe("email", () => {
    it("masks typical email", () => {
      expect(mask("suryaelidanto@gmail.com", "email")).toEqual({
        masked: "s•••@gmail.com",
        revealable: true,
      });
    });
    it("handles short localpart", () => {
      expect(mask("a@b.co", "email")).toEqual({ masked: "a•••@b.co", revealable: true });
    });
    it("returns em-dash for null/empty", () => {
      expect(mask(null, "email")).toEqual({ masked: "—", revealable: true });
      expect(mask(undefined, "email")).toEqual({ masked: "—", revealable: true });
      expect(mask("", "email")).toEqual({ masked: "—", revealable: true });
    });
  });

  describe("phone", () => {
    it("keeps first 3 and last 2 digits", () => {
      expect(mask("081234567890", "phone")).toEqual({ masked: "081•••90", revealable: true });
    });
    it("returns em-dash for too short", () => {
      expect(mask("081", "phone")).toEqual({ masked: "—", revealable: true });
    });
    it("returns em-dash for null", () => {
      expect(mask(null, "phone")).toEqual({ masked: "—", revealable: true });
    });
  });

  describe("name", () => {
    it("keeps first letter of first + last word", () => {
      expect(mask("Toko Sumber Rezeki", "name")).toEqual({ masked: "T•••••R", revealable: true });
    });
    it("handles single-word name", () => {
      expect(mask("Surya", "name")).toEqual({ masked: "Su•••a", revealable: true });
    });
    it("returns em-dash for null", () => {
      expect(mask(null, "name")).toEqual({ masked: "—", revealable: true });
    });
  });

  describe("orderId", () => {
    it("keeps prefix and last 2 chars", () => {
      expect(mask("INV-2026-07-15-000123", "orderId")).toEqual({ masked: "INV-•••23", revealable: true });
    });
    it("handles bare numeric", () => {
      expect(mask("1234567", "orderId")).toEqual({ masked: "••••67", revealable: true });
    });
    it("returns em-dash for null/short", () => {
      expect(mask(null, "orderId")).toEqual({ masked: "—", revealable: true });
      expect(mask("1", "orderId")).toEqual({ masked: "—", revealable: true });
    });
  });

  describe("amount", () => {
    it("returns full mask and not revealable", () => {
      expect(mask("Rp 25.000", "amount")).toEqual({ masked: "••••••••", revealable: false });
    });
    it("returns em-dash for null", () => {
      expect(mask(null, "amount")).toEqual({ masked: "—", revealable: false });
    });
  });

  describe("story", () => {
    it("truncates long text", () => {
      const long = "a".repeat(60);
      const result = mask(long, "story");
      expect(result.masked.endsWith("…")).toBe(true);
      expect(result.masked.length).toBeLessThanOrEqual(41); // 40 chars + ellipsis
      expect(result.revealable).toBe(true);
    });
    it("short text gets ellipsis prefix only", () => {
      const result = mask("Halo", "story");
      expect(result.masked).toBe("…Halo");
      expect(result.revealable).toBe(true);
    });
    it("returns em-dash for null", () => {
      expect(mask(null, "story")).toEqual({ masked: "—", revealable: true });
    });
  });

  it("uses kind default for revealable when value is em-dash", () => {
    // em-dash case still has revealable=true for all kinds except amount
    expect(mask(null, "amount").revealable).toBe(false);
    expect(mask(null, "email").revealable).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/mask.test.ts`
Expected: FAIL — `Cannot find module '@/lib/mask' or its corresponding types`.

- [ ] **Step 3: Implement `src/lib/mask.ts`**

Create `src/lib/mask.ts`:

```ts
export type MaskKind = "email" | "phone" | "name" | "orderId" | "amount" | "story";

const DASH = "—";
const MASK_CHAR = "•";

function isMissing(value: string | null | undefined): value is null | undefined {
  return value === null || value === undefined || value.trim() === "";
}

function maskChars(count: number): string {
  return MASK_CHAR.repeat(count);
}

export function mask(
  value: string | null | undefined,
  kind: MaskKind,
): { masked: string; revealable: boolean } {
  if (isMissing(value)) {
    return { masked: DASH, revealable: kind !== "amount" };
  }
  const text = value.trim();
  switch (kind) {
    case "email": {
      const at = text.lastIndexOf("@");
      if (at <= 0) return { masked: DASH, revealable: true };
      const local = text.slice(0, at);
      const domain = text.slice(at); // includes "@"
      if (local.length <= 1) return { masked: `${local}${maskChars(3)}${domain}`, revealable: true };
      return { masked: `${local[0]}${maskChars(3)}${domain}`, revealable: true };
    }
    case "phone": {
      // Keep first 3 digits and last 2 digits, mask the rest.
      if (text.length < 6) return { masked: DASH, revealable: true };
      return {
        masked: `${text.slice(0, 3)}${maskChars(3)}${text.slice(-2)}`,
        revealable: true,
      };
    }
    case "name": {
      if (text.length < 4) return { masked: DASH, revealable: true };
      const words = text.split(/\s+/).filter(Boolean);
      if (words.length >= 2) {
        return { masked: `${words[0][0]}${maskChars(5)}${words[words.length - 1][0]}`, revealable: true };
      }
      // single word: first 2 + last 1
      return {
        masked: `${text.slice(0, 2)}${maskChars(3)}${text.slice(-1)}`,
        revealable: true,
      };
    }
    case "orderId": {
      // Find the longest leading non-digit prefix (e.g. "INV-" or "").
      const match = text.match(/^(\D*)(.*)$/);
      if (!match || !match[2] || match[2].length < 3) {
        return { masked: DASH, revealable: true };
      }
      const [, prefix, rest] = match;
      return {
        masked: `${prefix}${maskChars(3)}${rest.slice(-2)}`,
        revealable: true,
      };
    }
    case "amount": {
      return { masked: maskChars(8), revealable: false };
    }
    case "story": {
      const limit = 40;
      if (text.length > limit) {
        return { masked: `${text.slice(0, limit)}…`, revealable: true };
      }
      return { masked: `…${text}`, revealable: true };
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/mask.test.ts`
Expected: PASS — all assertions match the documented expected values. If a specific case fails, fix only that case in `mask.ts`; do not edit the tests to make them pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mask.ts src/lib/mask.test.ts
git commit -m "feat(admin): pure mask library + vitest cover

email/phone/name/orderId/amount/story kinds; null/empty/short-string
edge cases. Amount is the only non-revealable kind."
```

---

## Task 3: `SensitiveText` client component

**Files:**
- Create: `src/components/admin/SensitiveText.tsx`

**Interfaces:**
- Inputs (props):
  ```ts
  type Props = {
    value: string | null | undefined;
    kind: import("@/lib/mask").MaskKind;
    className?: string;
  };
  ```
- Behavior:
  - When `revealed` state is `false`: render only `{mask(value, kind).masked}` and (if `revealable`) a `<button type="button" aria-controls={id}>` labelled "tampilkan".
  - When `revealed` is `true`: render the raw value plus a "Sedang ditampilkan tanpa masker …" tooltip and a "sembunyikan" button.
  - On TanStack Router route change (`useRouterState().location.pathname` effect), force `revealed = false`.
  - `user-select: none` on the masked span; selectable when revealed.
  - Keyboard accessible: focus-visible ring per existing tokens, `Enter`/`Space` toggles.
  - The revealable=false case (amount) renders only the masked span, no button.

- [ ] **Step 1: Implement the component**

Create `src/components/admin/SensitiveText.tsx`:

```tsx
"use client";

import { useEffect, useId, useState } from "react";

import { useRouterState } from "@tanstack/react-router";

import { mask, type MaskKind } from "@/lib/mask";

type Props = {
  value: string | null | undefined;
  kind: MaskKind;
  className?: string;
};

export function SensitiveText({ value, kind, className }: Props) {
  const { masked, revealable } = mask(value, kind);
  const [revealed, setRevealed] = useState(false);
  const id = useId();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  // Re-mask on every route change.
  useEffect(() => {
    setRevealed(false);
  }, [pathname]);

  if (!revealable) {
    return (
      <span className={className} aria-label="Nilai tersembunyi">
        {masked}
      </span>
    );
  }

  return (
    <span className={className}>
      {revealed ? (
        <span
          aria-live="polite"
          className="select-text"
          title="Sedang ditampilkan tanpa masker — pikirkan sebelum screenshare."
        >
          {value ?? masked}
        </span>
      ) : (
        <span aria-hidden="true" className="select-none">
          {masked}
        </span>
      )}{" "}
      <button
        aria-controls={id}
        className="rounded-radius-sm text-xs text-surface-warm-white/70 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-surface-warm-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#151515]"
        id={id}
        onClick={() => setRevealed((r) => !r)}
        type="button"
      >
        {revealed ? "sembunyikan" : "tampilkan"}
      </button>
    </span>
  );
}
```

- [ ] **Step 2: Verify the type check**

Run: `bun run check`
Expected: PASS. (`useRouterState({ select })` is from TanStack Router; signature verified by the type check itself.)

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/SensitiveText.tsx
git commit -m "feat(admin): SensitiveText mask component

Per-instance reveal toggle, route-change auto-re-mask, no-select on
masked form, select-text on revealed form, keyboard accessible with
focus-visible ring. Amount kind renders masked-only (no button)."
```

---

## Task 4: streamer-mode context + provider

**Files:**
- Create: `src/components/admin/streamer-mode-context.tsx`

**Interfaces:**
- ```ts
  export const StreamerModeContext: import("react").Context<boolean>;
  export function StreamerModeProvider({ value, children }: { value: boolean; children: import("react").ReactNode }): import("react").JSX.Element;
  export function useStreamerMode(): boolean; // reads from context; returns false when no provider (defensive default)
  ```

- [ ] **Step 1: Implement the context**

Create `src/components/admin/streamer-mode-context.tsx`:

```tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";

const StreamerModeContext = createContext<boolean>(false);

export function StreamerModeProvider({
  value,
  children,
}: {
  value: boolean;
  children: ReactNode;
}) {
  return (
    <StreamerModeContext.Provider value={value}>
      {children}
    </StreamerModeContext.Provider>
  );
}

export function useStreamerMode(): boolean {
  return useContext(StreamerModeContext);
}
```

- [ ] **Step 2: Verify type check**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/streamer-mode-context.tsx
git commit -m "feat(admin): StreamerModeProvider/useStreamerMode context

Lightweight context wiring used by the admin route loader to push the
streamer-mode flag once down to all admin descendants, including the
AuthButton menu."
```

---

## Task 5: shell loader + provider mount

**Files:**
- Modify: `src/routes/_main.admin.tsx`

**Interfaces:**
- The route loader's data shape is `{ ok: true; streamerMode: boolean }` (loader already returns `{ ok: true }`; extend it). Use `useLoaderData()` to read inside `AdminShell` and pass via `<StreamerModeProvider value={...}>`.

- [ ] **Step 1: Read the current file**

Read `src/routes/_main.admin.tsx` to confirm exact content.

- [ ] **Step 2: Extend the server fn to also return the streamer-mode flag**

Change the file so the loader runs both `loadAdmin` (the auth gate) AND a `loadStreamerMode` (a new server fn returning a boolean), then merges them. Replace the existing file with:

```tsx
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Toaster } from "sonner";

import { AdminTabs } from "@/components/admin/AdminTabs";
import { StreamerModeProvider } from "@/components/admin/streamer-mode/streamer-mode-context";
import { requireAdmin } from "@/lib/auth/auth-admin";
import { isStreamerModeEnabled } from "@/lib/config/config";

const loadAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const admin = await requireAdmin();
  if (!admin.ok) {
    throw redirect({ to: "/" });
  }
  return { ok: true as const };
});

const loadStreamerMode = createServerFn({ method: "GET" }).handler(async () => {
  return isStreamerModeEnabled();
});

export const Route = createFileRoute("/_main/admin")({
  loader: async () => {
    await loadAdmin();
    const streamerMode = await loadStreamerMode();
    return { streamerMode };
  },
  component: AdminShell,
});

function AdminShell() {
  const { streamerMode } = Route.useLoaderData();
  return (
    <StreamerModeProvider value={streamerMode}>
      <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-spacing-4 pb-24 pt-spacing-4 text-surface-warm-white">
        <h1 className="mb-spacing-3 text-2xl font-semibold">Admin</h1>
        <AdminTabs />
        <div className="mt-spacing-4">
          <Outlet />
        </div>
        <Toaster richColors position="top-center" />
      </main>
    </StreamerModeProvider>
  );
}
```

The provider sits OUTSIDE the `<main>` so any component that includes the AdminShell in the route tree reads the same context value. The Toaster remains a child so admin toasts still bubble here.

- [ ] **Step 3: Verify**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_main.admin.tsx
git commit -m "feat(admin): loader returns streamerMode + provider mount

Server fn resolves the flag once at route load; provider pushes it
to all admin descendants so child routes and AuthButton read the same
value without each making their own DB hit."
```

---

## Task 6: Overview page masking

**Files:**
- Modify: `src/routes/_main.admin.index.tsx`

**Masked fields per the spec:**
- Recent-waitlist row: `entry.businessName` (kind: `name`)
- Recent-transactions row: `t.orderId` (kind: `orderId`), `formatRupiah(t.amount)` (kind: `amount`); status stays as raw text.

- [ ] **Step 1: Add the import + hook**

Top of file, after the existing imports, add:

```tsx
import { SensitiveText } from "@/components/admin/streamer-mode/SensitiveText";
import { useStreamerMode } from "@/components/admin/streamer-mode/streamer-mode-context";
```

- [ ] **Step 2: Use the hook in the component**

In `OverviewPage` (the function component) add at the top:

```tsx
const streamerMode = useStreamerMode();
```

- [ ] **Step 3: Mask the waitlist row**

The block at line ~77-87 currently:

```tsx
<li ... key={e.id}>
  <span className="font-medium">{e.businessName}</span>
  <span className="text-surface-warm-white/70">
    {" · "}
    {new Date(e.submittedAt).toLocaleDateString("id-ID")}
  </span>
</li>
```

Change `<span className="font-medium">{e.businessName}</span>` to either:

```tsx
<span className="font-medium">
  {streamerMode ? (
    <SensitiveText kind="name" value={e.businessName} />
  ) : (
    e.businessName
  )}
</span>
```

- [ ] **Step 4: Mask the transactions row**

The block at line ~104-110 currently:

```tsx
<li ... key={t.orderId}>
  <span className="font-mono">{t.orderId}</span>
  <span className="text-surface-warm-white">
    {formatRupiah(t.amount)} · {t.status}
  </span>
</li>
```

Replace both `<span>` contents:

```tsx
<span className="font-mono">
  {streamerMode ? (
    <SensitiveText kind="orderId" value={t.orderId} />
  ) : (
    t.orderId
  )}
</span>
<span className="text-surface-warm-white">
  {streamerMode ? (
    <SensitiveText kind="amount" value={formatRupiah(t.amount)} />
  ) : (
    `${formatRupiah(t.amount)} · ${t.status}`
  )}
</span>
```

(The status word is co-rendered with the amount to keep the row stable; when in streamer mode, only the masked amount appears inside `<SensitiveText>` and we render `t.status` separately so it stays readable.)

Final shape when streamer mode is ON:

```tsx
<span className="text-surface-warm-white">
  <SensitiveText kind="amount" value={formatRupiah(t.amount)} /> · {t.status}
</span>
```

The cleanest one-liner above replaces the contents of the right span.

- [ ] **Step 5: Verify**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/_main.admin.index.tsx
git commit -m "fix(admin): mask overview PII when streamer mode ON

Waitlist business name + transaction orderId/amount masked; status
and metadata kept."
```

---

## Task 7: Users page masking

**Files:**
- Modify: `src/routes/_main.admin.users.tsx`

**Masked fields:** `u.name` (kind: `name`), `u.email` (kind: `email`).

- [ ] **Step 1: Add the import + hook**

At top of file, with existing imports:

```tsx
import { SensitiveText } from "@/components/admin/streamer-mode/SensitiveText";
import { useStreamerMode } from "@/components/admin/streamer-mode/streamer-mode-context";
```

In the `UsersPage` (or equivalent component function), add:

```tsx
const streamerMode = useStreamerMode();
```

- [ ] **Step 2: Mask name + email in the user row**

The block at line ~75-79 currently:

```tsx
<div>
  <p className="font-medium">{u.name ?? "Tanpa nama"}</p>
  <p className="text-surface-warm-white">{u.email}</p>
  <p className="text-surface-warm-white/70">{/* project count metadata */}</p>
</div>
```

Change the first two `<p>` contents to:

```tsx
<p className="font-medium">
  {streamerMode && u.name ? (
    <SensitiveText kind="name" value={u.name} />
  ) : (
    u.name ?? "Tanpa nama"
  )}
</p>
<p className="text-surface-warm-white">
  {streamerMode && u.email ? (
    <SensitiveText kind="email" value={u.email} />
  ) : (
    u.email
  )}
</p>
```

`Tanpa nama` and the missing-email placeholder are admin-visible fallbacks (`u.email` is `string | null`; null already falls through to `null` today which renders nothing). Keep that behavior unchanged when not streaming; only when streaming AND the value is truthy do we mask.

- [ ] **Step 3: Verify**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_main.admin.users.tsx
git commit -m "fix(admin): mask user name + email when streamer mode ON"
```

---

## Task 8: Waitlist page masking

**Files:**
- Modify: `src/routes/_main.admin.waitlist.tsx`

**Masked fields:** `entry.businessName` (kind: `name`), `entry.email` (kind: `email` if present), `entry.phone` (kind: `phone` if present), `entry.story` (kind: `story`).

- [ ] **Step 1: Add imports + hook**

At top of file, with existing imports:

```tsx
import { SensitiveText } from "@/components/admin/streamer-mode/SensitiveText";
import { useStreamerMode } from "@/components/admin/streamer-mode/streamer-mode-context";
```

In the page component, at the top:

```tsx
const streamerMode = useStreamerMode();
```

- [ ] **Step 2: Mask the business name, email, phone, story**

The card at line ~91-108 currently:

```tsx
<div className="...">
  <p className="font-medium">{entry.businessName}</p>
  <p className="text-sm text-surface-warm-white/70">{entry.businessType}</p>
  <p className="text-sm text-surface-warm-white/70">{entry.phone ? (...) : null}</p>
  ...
  <p className="mt-spacing-2 line-clamp-4 text-sm text-surface-warm-white">{entry.story}</p>
</div>
```

Apply mask to:

```tsx
<p className="font-medium">
  {streamerMode ? (
    <SensitiveText kind="name" value={entry.businessName} />
  ) : (
    entry.businessName
  )}
</p>
```

For phone (line ~100-103), the existing render block already conditionally renders only when `entry.phone` is set. Keep the conditional, swap the inner:

```tsx
{entry.phone ? (
  <p className="text-sm text-surface-warm-white/70">
    {streamerMode ? (
      <SensitiveText kind="phone" value={entry.phone} />
    ) : (
      entry.phone
    )}
  </p>
) : null}
```

If `entry.email` exists in the schema and is shown anywhere in this file, do the same with `kind="email"`. (`grep` for `entry.email` — if found, mirror the phone pattern.)

For the story:

```tsx
<p className="mt-spacing-2 line-clamp-4 text-sm text-surface-warm-white">
  {streamerMode ? (
    <SensitiveText kind="story" value={entry.story} />
  ) : (
    entry.story
  )}
</p>
```

`line-clamp-4` styles still apply — the masked span inherits the parent paragraph. Tailwind v4 passes them through.

`alt={entry.businessName}` on the image (line ~112): for screen-reader privacy, leave the existing alt as-is. The `<SensitiveText>` masking is visual; alt text doesn't leak visually and intentionally is non-visual semantics. **Out of scope to mask.**

- [ ] **Step 3: Verify**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_main.admin.waitlist.tsx
git commit -m "fix(admin): mask waitlist business name/email/phone/story when streamer mode ON"
```

---

## Task 9: Transactions page masking

**Files:**
- Modify: `src/routes/_main.admin.transactions.tsx`

**Masked fields:** `t.orderId` (kind: `orderId`), `t.paymentNumber` (kind: `orderId`), `t.amount` / energy shown as formatted amount (kind: `amount`), `t.email` (kind: `email` if present).

- [ ] **Step 1: Add imports + hook**

Top of file, with existing imports:

```tsx
import { SensitiveText } from "@/components/admin/streamer-mode/SensitiveText";
import { useStreamerMode } from "@/components/admin/streamer-mode/streamer-mode-context";
```

In the page component, at the top:

```tsx
const streamerMode = useStreamerMode();
```

- [ ] **Step 2: Apply masks to the row**

The row at line ~92-114 currently shows orderId, an `amount/email/status` block, and paymentNumber. Apply masks to each PII field:

```tsx
<li className="...">
  {/* primary: orderId — masked when streaming */}
  <span className="font-mono">
    {streamerMode ? (
      <SensitiveText kind="orderId" value={t.orderId} />
    ) : (
      t.orderId
    )}
  </span>

  <span className="text-surface-warm-white/80">
    {streamerMode ? (
      <>
        <SensitiveText kind="amount" value={formatRupiah(t.amount)} /> · {t.status}
      </>
    ) : (
      `${formatRupiah(t.amount)} · ${t.status}`
    )}
  </span>

  <p className="text-surface-warm-white">
    {streamerMode && t.email ? (
      <SensitiveText kind="email" value={t.email} />
    ) : (
      t.email
    )}
  </p>

  <p className="text-surface-warm-white/70">
    {streamerMode ? (
      <SensitiveText kind="orderId" value={t.paymentNumber} />
    ) : (
      t.paymentNumber
    )}
  </p>
</li>
```

Exact class strings (`text-surface-warm-white/80` etc.) preserved.

- [ ] **Step 3: Verify**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_main.admin.transactions.tsx
git commit -m "fix(admin): mask transaction orderId, paymentNumber, amount, email when streamer mode ON"
```

---

## Task 10: account-menu masking in `AuthButton`

**Files:**
- Modify: `src/components/common/AuthButton.tsx`

**Masked fields:** `session.user.name` (kind: `name`, used as `displayName`), `session.user.email` (kind: `email`, shown in the menu).

**Caveat:** `Header.tsx` already renders `<AuthButton/>` for every page, so once `AuthButton` reads `useStreamerMode()`, masking automatically applies app-wide. When a user is not on an admin page, the context provider is not mounted, so `useStreamerMode()` returns `false` (the default). Therefore **masking only happens under the admin shell**, which is exactly what the spec requires.

- [ ] **Step 1: Add imports**

Top of file, with existing imports:

```tsx
import { SensitiveText } from "@/components/admin/streamer-mode/SensitiveText";
import { useStreamerMode } from "@/components/admin/streamer-mode/streamer-mode-context";
import { mask } from "@/lib/mask";
```

(`mask` is imported because the trigger button shows the masked name as its short label.)

- [ ] **Step 2: Read the flag + compute masked display**

Find the `displayName = session.user.name?.trim() || "Akun";` line (line ~73). Replace with:

```tsx
const streamerMode = useStreamerMode();
const rawName = session.user.name ?? null;
const displayName =
  streamerMode && rawName ? mask(rawName, "name").masked : (rawName?.trim() || "Akun");
```

This way: when streaming, the trigger button shows e.g. `S•••a` instead of `Surya Elidanto`.

- [ ] **Step 3: Mask the email inside the menu**

Find any `{session.user.email}` rendered inside the open menu (after `setOpen(true)` → `<button onClick={() => setOpen(false)}>{session.user.email}</button>` or similar). Wrap with:

```tsx
{streamerMode && session.user.email ? (
  <SensitiveText kind="email" value={session.user.email} />
) : (
  session.user.email
)}
```

Apply the same pattern if email is rendered in multiple places (e.g. a card row). Read the file first to know every spot.

- [ ] **Step 4: Verify**

Run: `bun run check`
Expected: PASS. (AuthButton is a client component already; `useStreamerMode()` is a no-op outside an admin provider — returns false.)

- [ ] **Step 5: Commit**

```bash
git add src/components/common/AuthButton.tsx
git commit -m "fix(admin): mask account-menu admin name/email when streamer mode ON

Trigger button uses the masked display name when streaming; menu
email is masked too. Reads streamerMode from StreamerModeContext —
outside admin routes the provider is absent and the hook returns
false, so non-admin pages are unaffected."
```

---

## Task 11: Storybook entry

**Files:**
- Create: `src/stories/SensitiveText.stories.tsx`

**Interfaces:** Storybook stories for `SensitiveText` covering every `kind` × both states (masked/revealed). Required by DESIGN.md for reusable UI.

- [ ] **Step 1: Write the stories**

Create `src/stories/SensitiveText.stories.tsx`. Use the file-shape of `src/stories/Button.stories.tsx` as a model:

```tsx
import { expect, fn } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";

import { SensitiveText } from "@/components/admin/streamer-mode/SensitiveText";

const meta = {
  args: {
    className: "text-sm",
  },
  argTypes: {
    kind: {
      control: "select",
      options: ["email", "phone", "name", "orderId", "amount", "story"],
    },
  },
  component: SensitiveText,
  decorators: [
    (Story) => (
      <div className="rounded-radius-2xl bg-[#151515] p-spacing-9 text-surface-warm-white">
        <Story />
      </div>
    ),
  ],
  title: "Admin/SensitiveText",
};
export default meta;

type Story = StoryObj<typeof meta>;

export const EmailMasked: Story = {
  args: { kind: "email", value: "suryaelidanto@gmail.com" },
};

export const PhoneMasked: Story = {
  args: { kind: "phone", value: "081234567890" },
};

export const NameMasked: Story = {
  args: { kind: "name", value: "Toko Sumber Rezeki" },
};

export const OrderIdMasked: Story = {
  args: { kind: "orderId", value: "INV-2026-07-15-000123" },
};

export const AmountMasked: Story = {
  args: { kind: "amount", value: "Rp 25.000" },
};

export const StoryTruncated: Story = {
  args: {
    kind: "story",
    value:
      "Halo, saya pemilik usaha kecil di kota yang ingin mengembangkan bisnis secara online.",
  },
};

export const AllKinds: Story = {
  args: { kind: "email", value: "x@y.com" },
  render: (args) => (
    <div className="flex flex-col gap-spacing-3 text-sm">
      <span>
        email: <SensitiveText kind="email" value="suryaelidanto@gmail.com" />
      </span>
      <span>
        phone: <SensitiveText kind="phone" value="081234567890" />
      </span>
      <span>
        name: <SensitiveText kind="name" value="Toko Sumber Rezeki" />
      </span>
      <span>
        orderId: <SensitiveText kind="orderId" value="INV-2026-07-15-000123" />
      </span>
      <span>
        amount: <SensitiveText kind="amount" value="Rp 25.000" />
      </span>
      <span>
        story:{" "}
        <SensitiveText
          kind="story"
          value="Halo, saya pemilik usaha kecil di kota yang ingin mengembangkan bisnis secara online."
        />
      </span>
    </div>
  ),
};
```

- [ ] **Step 2: Verify Storybook build**

Run: `bun run storybook:build`
Expected: PASS (build succeeds; stories typecheck). If the project doesn't have storybook build in CI for new stories, skip and just run `bun run check` which covers the type check.

- [ ] **Step 3: Verify overall gate**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/stories/SensitiveText.stories.tsx
git commit -m "docs(storybook): SensitiveText stories per kind + all-kinds grid

Required by DESIGN.md (reusable UI gets a Storybook entry in the
same change). Covers email/phone/name/orderId/amount/story plus a
side-by-side grid story."
```

---

## Task 12: final gate + manual visual verification

**Files:** none modified.

- [ ] **Step 1: Run the local gate**

Run: `bun run check`
Expected: PASS (format/lint/typecheck/`test:changed`/Knip). If anything fails, fix only the failing item.

- [ ] **Step 2: Boot dev server + verify default**

Run: `bun run dev` (leave running).
Navigate: `http://localhost:3000/admin` (after signing in as the admin user).
Expected: stat tile values render raw (numbers, not PII). Recent rows show masked business name (e.g. `T•••••R`), masked orderId (`INV-•••23`), masked amount (`••••••••`).
Navigate to `/admin/users`. Expected: name + email rows render masked. Click `tampilkan`. Expected: raw value appears for that field only, with tooltip. Click `sembunyikan`. Expected: re-mask. Navigate to `/admin/waitlist` and back. Expected: any revealed fields auto-remask on return.
Navigate to `/admin/transactions`. Expected: orderId + paymentNumber + amount + email all masked.
Open the account menu. Expected: trigger button shows `S•••a` (or similar mask of admin name), menu email masked.

- [ ] **Step 3: Toggle OFF and verify raw flow**

Open `/admin/settings`. Expected: a new toggle "Streamer mode (mask PII in admin)" appears under "Feature Flag", currently ON.
Flip to OFF. Save. Wait ≤ 5s (cache TTL). Navigate around `/admin/*`. Expected: all PII renders raw again — no mask, no reveal button. Open account menu. Expected: full name + email visible.

- [ ] **Step 4: Confirm clean tree**

Run: `git status`
Expected: clean working tree on `dev`. All 11 commits landed atomically.

---

## Self-review

**1. Spec coverage:**
- DB row (Task 1) ✓
- Mask library + tests (Task 2) ✓
- SensitiveText client component (Task 3) ✓
- Context + provider (Task 4) ✓
- Shell loader + provider mount (Task 5) ✓
- Overview masking (Task 6) ✓
- Users masking (Task 7) ✓
- Waitlist masking (Task 8) ✓
- Transactions masking (Task 9) ✓
- Header/AuthButton masking (Task 10) ✓ (note: spec said Header, plan does AuthButton because that's where the menu actually lives)
- Storybook entry (Task 11) ✓
- Visual verification (Task 12) ✓
- Server-side loader returning the flag, no raw values in initial client payload when streaming — addressed in Task 5 (loader returns only `streamerMode: boolean`; the per-page `fetchJson` still fetches raw but the JSX uses `<SensitiveText>` to never render the raw string into the DOM during streamer mode; `SensitiveText`'s reveal puts raw into a controlled effect only after explicit click, and the initial HTML contains only the masked form — no `data-full` attribute).
- Account-menu: spec says "Header account menu"; `Header.tsx` shows it delegates to `<AuthButton/>` so the correct integration file is `AuthButton.tsx`. Noted inline in Task 10.

**2. Placeholder scan:** No TBD/TODO/"similar to Task N" — every step shows exact code or file path.

**3. Type consistency:** `MaskKind` defined in Task 2, used as `import("@/lib/mask").MaskKind` in Task 3 (verbatim); `useStreamerMode` defined Task 4, used Tasks 5-10; `isStreamerModeEnabled` defined Task 1, used Task 5. No drift.
