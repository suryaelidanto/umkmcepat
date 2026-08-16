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

Keep auth loading and GitHub contributor loading as independent states. Until
the client has hydrated, or while `useSession().status` is `loading`,
`AuthButton` will render a disabled button that preserves the normal `Masuk`
dimensions and uses a compact skeleton label with a subtle loading indicator.
The control will keep `aria-busy="true"`, an Indonesian accessible label such
as `Memuat akses masuk`, and disabled pointer and keyboard behavior. Once the
client has hydrated and auth is resolved, the existing signed-out `Masuk`
button or signed-in account control returns. No contributor request gates it.

This keeps the header stable, explains why clicking is unavailable, and avoids
making login depend on the unrelated contributor API request.

## Scope and behavior

- Change only the public `AuthButton` loading/signed-out branches and their
  focused tests.
- Reuse the existing button component, spacing, border, and dark header
  treatment; do not introduce a new visual language or page overlay.
- Use a fixed-width skeleton treatment so the header does not shift when the
  text changes from loading to `Masuk`.
- Keep the server-rendered and pre-hydration control in the loading state. An
  enabled-looking React button before its `onClick` handler is attached is
  misleading; the skeleton makes the unavailable interaction explicit.
- Respect reduced motion by relying on the existing pulse utility behavior and
  ensuring the loading state remains understandable without animation.
- Do not change session fetching, contributor fetching, login dialog behavior,
  or the authenticated account menu.

## Accessibility and failure behavior

- The auth-loading control remains a real disabled button, not a fake link.
- `aria-busy` and an explicit accessible label communicate the state to assistive
  technology.
- The loading state has sufficient contrast against the dark header and keeps a
  stable hit area for layout consistency.
- If session loading fails and resolves to unauthenticated, the normal `Masuk`
  button appears after hydration; no contributor request can block it.

## Verification

- The focused component test covers disabled state, `aria-busy`, the accessible
  loading label, and the immediate resolved signed-out branch.
- Run the focused test, `bun run check`, and the relevant Storybook/build checks
  only if the changed surface requires them under the repository gate.
