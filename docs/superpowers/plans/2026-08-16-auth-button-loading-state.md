# Auth Button Loading State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the disabled public `Masuk` control visibly communicate only unresolved auth with a stable skeleton state.

**Status:** Implemented and verified with `bun run check`.

**Architecture:** Keep the existing `AuthButton` session state and GitHub contributor query independent. Until the first client effect confirms hydration, or when `useSession().status` is `loading`, render the existing `Button` as a disabled, fixed-width control with an accessible Indonesian loading label and an aria-hidden pulsing skeleton; render resolved signed-out and signed-in branches after hydration.

**Tech Stack:** React 19, TanStack Query, `react-dom/server` SSR tests, Vitest, Tailwind utility classes, Bun.

## Global Constraints

- User-facing copy remains Indonesian.
- The auth-loading control remains a real disabled button with `aria-busy="true"`; it must not become a fake link or page overlay.
- The resolved signed-out branch must not render an enabled-looking control
  before React attaches its click handler.
- GitHub contributor loading must not be added as a login prerequisite.
- Reuse existing UMKM Cepat dark-header tokens, button component, spacing, and motion conventions.
- No `any`, `as any`, `ts-ignore`, or new dependency.
- Run the focused test first, then `bun run check` before handoff.

---

### Task 1: Lock the loading-state contract with an SSR regression test

**Files:**
- Create: `src/components/common/AuthButton.test.ts`

**Interfaces:**
- Consumes: `AuthButton` and its existing `useSession()` loading branch.
- Produces: a focused rendered-markup contract for the disabled loading control.

- [x] **Step 1: Write the failing test**

Create a server-render test with mocked auth, navigation, query, and dialog dependencies:

```tsx
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const sessionState = vi.hoisted(() => ({
  data: null,
  status: "loading" as const,
}));

vi.mock("@/lib/auth/auth-client", () => ({
  signOut: vi.fn(),
  useSession: () => sessionState,
}));
vi.mock("@/lib/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined }),
}));
vi.mock("@/components/admin/streamer-mode/streamer-mode-context", () => ({
  useStreamerMode: () => false,
}));
vi.mock("@/components/common/LoginConsentDialog", () => ({
  LoginConsentDialog: () => null,
}));
vi.mock("@/components/payment/EnergyBoosterModal", () => ({
  EnergyBoosterModal: () => null,
}));

import { AuthButton } from "./AuthButton";

describe("AuthButton", () => {
  it("renders an accessible disabled skeleton while auth hydrates", () => {
    const markup = renderToStaticMarkup(createElement(AuthButton));

    expect(markup).toMatch(/<button[^>]*disabled/);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('aria-label="Memuat akses masuk"');
    expect(markup).toContain("animate-pulse");
    expect(markup).toContain("min-w-[4.75rem]");
    expect(markup).not.toMatch(/>Masuk<\/button>/);
  });
});
```

- [x] **Step 2: Run the focused test to verify it fails**

Run:

```bash
bunx vitest run src/components/common/AuthButton.test.ts
```

Expected: the test fails because the current loading branch still renders the
visible `Masuk` text and does not contain the requested skeleton width/class.

### Task 2: Render the stable loading skeleton and verify the change

**Files:**
- Modify: `src/components/common/AuthButton.tsx:72-91`
- Test: `src/components/common/AuthButton.test.ts`

**Interfaces:**
- Consumes: `status === "loading"` from `useSession()`.
- Produces: a disabled `Button` while auth is loading, with
  `aria-busy`, `aria-label="Memuat akses masuk"`, stable `min-w-[4.75rem]`, and
  an aria-hidden pulsing skeleton span before hydration or while auth is
  loading.

- [x] **Step 1: Keep the loading branch scoped to unresolved auth**

Use the existing button and dark-header styling, changing its contents to:

```tsx
<Button
  type="button"
  variant="outline"
  size="sm"
  disabled
  aria-busy="true"
  aria-label="Memuat akses masuk"
  className="min-w-[4.75rem] rounded-md border border-white/14 bg-transparent px-spacing-7 text-surface-warm-white opacity-50 cursor-not-allowed hover:bg-transparent focus-visible:ring-1 focus-visible:ring-white/50"
>
  <span
    aria-hidden="true"
    className="h-3.5 w-10 animate-pulse rounded bg-surface-warm-white/35"
  />
</Button>
```

Keep the existing `LoginConsentDialog` render and leave the authenticated and
resolved unauthenticated branches unchanged. Use
`if (!hydrated || status === "loading")` for the loading branch so the visible
`Masuk` button is only rendered after its React click handler can be attached.

- [x] **Step 2: Run the focused regression test**

Run:

```bash
bunx vitest run src/components/common/AuthButton.test.ts
```

Expected: one test file passes with one test passing.

- [x] **Step 3: Run the nearest related UI tests**

Run:

```bash
bunx vitest run src/components/common/AuthButton.test.ts src/components/community/WhatsAppCommunityInvite.test.ts src/lib/home-access-state.test.ts
```

Expected: all selected tests pass with zero failures.

- [x] **Step 4: Run the repository fast gate**

Run:

```bash
bun run check
```

Expected: format, lint, typecheck, tests, Knip, and docs all report success.

- [x] **Step 5: Commit the implementation**

Run:

```bash
git add src/components/common/AuthButton.tsx src/components/common/AuthButton.test.ts
git commit -m $'fix(auth): show loading state on login button\n\nCo-Authored-By: Claude <noreply@anthropic.com>'
```
