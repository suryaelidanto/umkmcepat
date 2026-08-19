# AuthButton Disabled While Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AuthButton loading skeleton with disabled Masuk button so first click after ready always opens dialog.

**Architecture:** One-file change in `src/components/common/AuthButton.tsx`. No new components, no state, just render disabled Button when `status === "loading"`. Dialog remains controlled by `loginOpen`.

**Tech Stack:** Bun, TypeScript, React, TanStack Query (useSession), Radix Dialog, Tailwind, Vitest.

## Global Constraints

* No `any`, no `as any`, no `ts-ignore` without one-liner why — `AGENTS.md`
* Code must be self-explanatory, no restating comments — `AGENTS.md`
* `bun run check` must be green (format/lint/typecheck/test/knip/docs) — `AGENTS.md`
* Bun only, `bun.lock` canonical, work from `dev` — `AGENTS.md`
* UI copy Indonesian, dev docs English — `AGENTS.md`

---

## File Structure

- Modify: `src/components/common/AuthButton.tsx:71-93` — loading branch
- Test: `src/components/common/AuthButton.test.tsx` (create if missing, else add case)
- Spec: `docs/superpowers/specs/2026-08-12-auth-button-disabled-design.md` (already written)

---

### Task 1: Replace loading skeleton with disabled Button

**Files:**
- Modify: `src/components/common/AuthButton.tsx:71-78`
- Test: `src/components/common/AuthButton.test.tsx`

**Interfaces:**
- Consumes: `useSession() -> {status: "loading"|"authenticated"|"unauthenticated"}` from `@/lib/auth/auth-client`
- Produces: Disabled `<Button>Masuk</Button>` when loading, enabled when unauthenticated

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/common/AuthButton.test.tsx
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { AuthButton } from "./AuthButton";

vi.mock("@/lib/auth/auth-client", () => ({
  useSession: vi.fn(() => ({ data: null, status: "loading" })),
  signOut: vi.fn(),
}));

test("shows disabled Masuk when session loading", () => {
  render(<AuthButton />);
  const btn = screen.getByRole("button", { name: /masuk/i });
  expect(btn).toBeDisabled();
  expect(btn).toHaveAttribute("aria-busy", "true");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/common/AuthButton.test.tsx -v`
Expected: FAIL — no button found (currently renders div)

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/common/AuthButton.tsx:71-78
if (status === "loading") {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        aria-busy="true"
        aria-label="Memuat..."
        className="rounded-md border border-white/14 bg-transparent px-spacing-7 text-surface-warm-white opacity-50 cursor-not-allowed hover:bg-transparent focus-visible:ring-1 focus-visible:ring-white/50"
      >
        Masuk
      </Button>
      <LoginConsentDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </>
  );
}
```

Keep the rest of the file unchanged (the `!session?.user` branch still returns enabled Masuk).

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/common/AuthButton.test.tsx -v`
Expected: PASS

- [ ] **Step 5: Run full gate**

Run: `bun run check`
Expected: ✓ format ✓ lint ✓ typecheck ✓ test ✓ knip ✓ docs

- [ ] **Step 6: Commit**

```bash
git add src/components/common/AuthButton.tsx docs/superpowers/specs/2026-08-12-auth-button-disabled-design.md docs/superpowers/plans/2026-08-12-auth-button-disabled.md
git commit -m "fix(ui): show disabled Masuk while session loading

- replace loading skeleton div with disabled Button (aria-busy)
- prevents clicks doing nothing, no layout shift, 1st click after ready opens dialog
- keeps LoginConsentDialog mounted"
```

## Self-Review

* Spec coverage: Loading → disabled button, enabled → dialog opens — covered in Task 1.
* No placeholders: Exact file paths, code, commands provided.
* Type consistency: Button props match existing usage (variant outline, size sm).
