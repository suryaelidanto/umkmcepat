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
session, the existing signed-out `Masuk` button or signed-in account control
renders immediately; no hydration flag or contributor request gates it.

This keeps the header stable, explains why clicking is unavailable, and avoids
making login depend on the unrelated contributor API request.

## Scope and behavior

- Change only the public `AuthButton` loading branch and its focused tests.
- Reuse the existing button component, spacing, border, and dark header
  treatment; do not introduce a new visual language or page overlay.
- Use a fixed-width skeleton treatment so the header does not shift when the
  text changes from loading to `Masuk`.
- Do not add a client hydration wait to the resolved signed-out branch. The
  server-rendered button may still be non-interactive until React attaches its
  handler, which is inherent to a client-side `onClick` control and is separate
  from auth or contributor loading.
- Respect reduced motion by relying on the existing pulse utility behavior and
  ensuring the loading state remains understandable without animation.
- Do not change session fetching, contributor fetching, login dialog behavior,
  or the authenticated account menu.

## Accessibility and failure behavior

- The control remains a real disabled button, not a fake link.
- `aria-busy` and an explicit accessible label communicate the state to assistive
  technology.
- The loading state has sufficient contrast against the dark header and keeps a
  stable hit area for layout consistency.
- If session loading fails and resolves to unauthenticated, the normal `Masuk`
  button appears as soon as that auth state is available; no contributor
  request can block it.

## Verification

- The focused component test covers disabled state, `aria-busy`, the accessible
  loading label, and the immediate resolved signed-out branch.
- Run the focused test, `bun run check`, and the relevant Storybook/build checks
  only if the changed surface requires them under the repository gate.
