# Auth button loading state

**Date:** 2026-08-16
**Status:** Ready for implementation

## Problem

On the public homepage, the `Masuk` control is intentionally disabled while
the client finishes hydrating the auth session. The current spinner leaves the
control looking like a broken or unresponsive button, especially while the
independent GitHub contributor section is still loading.

## Decision

Keep auth hydration and GitHub contributor loading as independent states. While
`useSession().status` is `loading`, `AuthButton` will render a disabled button
that preserves the normal `Masuk` dimensions and uses a compact skeleton label
with a subtle loading indicator. The control will keep `aria-busy="true"`, an
Indonesian accessible label such as `Memuat akses masuk`, and disabled pointer
and keyboard behavior. Once auth resolves, the existing signed-out `Masuk`
button or signed-in account control returns unchanged.

This keeps the header stable, explains why clicking is unavailable, and avoids
making login depend on the unrelated contributor API request.

## Scope and behavior

- Change only the public `AuthButton` loading branch and its focused tests.
- Reuse the existing button component, spacing, border, and dark header
  treatment; do not introduce a new visual language or page overlay.
- Use a fixed-width skeleton treatment so the header does not shift when the
  text changes from loading to `Masuk`.
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
- If session hydration fails and resolves to unauthenticated, the normal
  clickable `Masuk` button appears; no contributor request can block it.

## Verification

- Add a focused component test covering disabled state, `aria-busy`, accessible
  loading label, and the absence of the clickable login handler while loading.
- Run the focused test, `bun run check`, and the relevant Storybook/build checks
  only if the changed surface requires them under the repository gate.
