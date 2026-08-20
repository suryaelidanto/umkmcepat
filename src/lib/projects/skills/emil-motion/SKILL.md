---
name: emil-motion
description: Use when a generated interface contains or requests animation, transitions, drawers, dialogs, dropdowns, accordions, hover feedback, or motion review.
license: MIT
metadata:
  source: https://github.com/emilkowalski/skills/tree/main/skills/review-animations
  advisor_source: https://github.com/emilkowalski/skills/tree/main/skills/improve-animations
  adaptation: UMKM Cepat static-site runtime
---

# Motion with restraint

Use this skill only when motion has a real job. It is a motion reviewer, not a license to animate every surface. The goal is a fast, calm interface that explains state or preserves spatial continuity.

## Decide whether to animate

Ask "why does this animate?" before choosing an effect.

- Keyboard-initiated and very frequent actions should be instant or nearly instant.
- Frequent actions deserve subtle, quick feedback.
- Occasional actions can use a standard transition.
- Rare, first-use moments may carry more character if they never block reading or action.
- Delete motion when its only reason is that the page feels empty.

Name the purpose: feedback, spatial continuity, state indication, or preventing a jarring change. "It looks cool" is not a purpose.

## Implementation rules

- Prefer CSS transitions for simple state changes. Use the smallest suitable tool.
- Animate `transform` and `opacity` before layout properties. Do not animate `width`, `height`, `margin`, `padding`, `top`, or `left` unless a component primitive requires it and the tradeoff is explicit.
- Never enter from `scale(0)`. Use a small scale such as `0.96` with opacity, or no scale at all.
- Popovers, tooltips, dropdowns, and menus originate from their trigger through the primitive's transform-origin token. Centered modals may stay centered.
- Use ease-out or a deliberate custom curve for entrances. Do not use ease-in for a UI element the user is waiting to see.
- Keep common control feedback around 140–220ms and UI transitions below 300ms unless the movement represents a larger spatial change.
- Make rapid transitions interruptible. CSS transitions or retargetable springs are safer than keyframes that restart from zero.
- Match exits to the entry so an object does not disappear through a different physical rule.
- Use springs only for gesture-like or deliberately interruptible movement. Bounce is not the default for this product.

## Accessibility and input

- Add a `prefers-reduced-motion: reduce` alternative for automatic, scroll-linked, or repeated motion. A crossfade or instant state is usually enough.
- Do not hide essential content behind an entrance animation or delay a CTA until motion finishes.
- Gate hover-only motion with a fine-pointer query. Touch and keyboard users need the same meaning without hover.
- Preserve focus and the user's current state when an animated panel opens or closes.

## Review checklist

For each motion moment, record its purpose, frequency, trigger, property set, origin, duration, easing, interruption behavior, exit behavior, and reduced-motion result. If one of those is missing, simplify or remove the animation before adding more code.

The runtime has no external motion audit command. Existing source, typecheck, build, and browser gates are the evidence surface.

## Source note

Adapted from Emil Kowalski's animation review/advisor skills and animation principles. The project keeps the frequency rule, purposeful motion, physical correctness, performance, and reduced-motion guidance while leaving implementation to the local CSS and component primitives.
