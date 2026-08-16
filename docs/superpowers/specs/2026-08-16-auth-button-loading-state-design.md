# Auth button loading state

**Date:** 2026-08-16
**Status:** Implemented

## Problem

On the public homepage, the `Masuk` control was being held behind client
hydration even when the server had already resolved the auth session. The
current spinner leaves the control looking like a broken or unresponsive
button, especially while the independent GitHub contributor section is still
loading.

## Decision

Keep auth loading and GitHub contributor loading as independent states. While
`useSession().status` is `loading`, `AuthButton` will render a disabled button
that preserves the normal `Masuk` dimensions and uses a compact skeleton label
with a subtle loading indicator. The control will keep `aria-busy="true"`, an
Indonesian accessible label such as `Memuat akses masuk`, and disabled pointer
and keyboard behavior. When the server or client has already resolved the
session, the signed-out `Masuk` control renders immediately as a native
`#login` anchor fallback and becomes the existing modal-opening control once
hydrated. The signed-in account control remains unchanged; no hydration flag or
contributor request gates it.

This keeps the header stable, explains why clicking is unavailable, and avoids
making login depend on the unrelated contributor API request.

## Scope and behavior

- Change only the public `AuthButton` loading/signed-out branches and their
  focused tests.
- Reuse the existing button component, spacing, border, and dark header
  treatment; do not introduce a new visual language or page overlay.
- Use a fixed-width skeleton treatment so the header does not shift when the
  text changes from loading to `Masuk`.
- Do not add a client hydration wait to the resolved signed-out branch. The
  server-rendered anchor remains natively clickable before React attaches its
  handler, which is separate from auth or contributor loading.
- Respect reduced motion by relying on the existing pulse utility behavior and
  ensuring the loading state remains understandable without animation.
- Do not change session fetching, contributor fetching, login dialog behavior,
  or the authenticated account menu.

## Accessibility and failure behavior

- The auth-loading control remains a real disabled button, not a fake link.
- The resolved signed-out control is a same-page native anchor so a click is not
  lost before React hydration. Once hydrated, its click handler prevents the
  hash navigation and opens `LoginConsentDialog`; a pre-hydration `#login` hash
  is consumed on mount and opens the same dialog.
- `aria-busy` and an explicit accessible label communicate the state to assistive
  technology.
- The loading state has sufficient contrast against the dark header and keeps a
  stable hit area for layout consistency.
- If session loading fails and resolves to unauthenticated, the normal `Masuk`
  control appears as soon as that auth state is available; no contributor
  request can block it.

## Verification

- The focused component test covers disabled state, `aria-busy`, the accessible
  loading label, and the immediate resolved signed-out branch.
- Run the focused test, `bun run check`, and the relevant Storybook/build checks
  only if the changed surface requires them under the repository gate.
