---
name: emil-motion
description: Emil Kowalski motion principles for smooth, hardware-accelerated, purposeful animations and accessible transitions. Use when animating drawers, dialogs, dropdowns, accordions, and hover states.
---

# Emil Kowalski Motion Principles

Construct purposeful, performant animations that feel instant, natural, and never sluggish.

## Core Rules

1. **Hardware-Accelerated Properties Only**:
   - Animate `transform` and `opacity` only. They skip layout and paint and run directly on the GPU.
   - Never animate `width`, `height`, `margin`, `padding`, `top`, or `left` (except CSS height in Radix accordion where necessary).
2. **Never `scale(0)` on Entrance**:
   - Start entrance animations from `scale(0.95)` to `scale(1)` with `opacity: 0` to `opacity: 1`. Nothing in the real world pops into existence from zero.
3. **Snappy Durations (Under 300ms)**:
   - Button hover/press: `100–160ms`.
   - Tooltips, dropdowns, menus: `150–200ms`.
   - Modals, drawers, mobile sheets: `200–250ms`.
4. **Easing Curves**:
   - Use `cubic-bezier(0.23, 1, 0.32, 1)` for standard UI entrances (`ease-out`).
   - Never use `ease-in` on UI elements (feels unresponsive to the user).
   - Never use bouncy or elastic springs on professional business interfaces.
5. **Full `prefers-reduced-motion` Compliance**:
   - Always provide a reduced motion alternative (subtle crossfade without transform shift) or disable motion under `@media (prefers-reduced-motion: reduce)`.
