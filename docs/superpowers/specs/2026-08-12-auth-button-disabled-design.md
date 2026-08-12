# AuthButton Disabled State — Design Spec

**Date:** 2026-08-12
**Author:** Muse Code
**Status:** Approved (user selected Disabled Masuk)

## Goal

Make the navbar "Masuk" button disabled (not a gray skeleton) while `useSession` status is `loading`, so the first click after it becomes enabled always opens the `LoginConsentDialog` immediately. No layout shift, accessible.

## Context

`src/components/common/AuthButton.tsx:71` currently returns a skeleton `<div className="h-9 w-20 ...">` when `status === "loading"`. User reports clicking during that window does nothing; needs 2-3 clicks after the button appears. The dialog itself is fine (`LoginConsentDialog` handles `canContinue`/`isVerifying`).

## Design

**File to change:** `src/components/common/AuthButton.tsx:71-94`

* Replace:

```tsx
if (status === "loading") {
  return <div className="h-9 w-20 rounded-radius-lg bg-surface-warm-white/8" aria-hidden="true" />;
}
```

* With:

```tsx
if (status === "loading") {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled
      aria-busy="true"
      aria-label="Memuat..."
      className="rounded-md border border-white/14 bg-transparent px-spacing-7 text-surface-warm-white opacity-50 cursor-not-allowed hover:bg-transparent"
    >
      Masuk
    </Button>
  );
}
```

* Keep `LoginConsentDialog` mounted (not open) so `open` state is stable.
* No new deps, no layout shift (same `h-9`/`px` as enabled button), `disabled` prevents click, `aria-busy` announces loading, `cursor-not-allowed` visual cue.

**Accessibility:** `disabled` + `aria-busy="true"` + `aria-label`. No focus trap change.

**Testing:** `bun run check` (format/lint/typecheck/test/knip/docs) + manual: load page, observe disabled Masuk during load, becomes enabled, 1st click opens dialog.

**Out of scope:** Turnstile loading inside dialog (already handled by `canContinue`), streamer mode, etc.

## Alternatives Considered

1. **Keep skeleton with transition** — more code, layout shift risk.
2. **Ignore clicks when loading** — no feedback, worse a11y.

## Constraints

* Follow `AGENTS.md` god-tier: no `any`, no restating comments, small surgical, `bun run check` green.
* Bun only, `bun.lock` canonical, Indonesian UI copy, dev docs English.
