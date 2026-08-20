---
name: vercel-web-design
description: Vercel Web Interface Guidelines tailored for responsive navigation, intrinsic layout, sticky header coordination, touch targets, and accessibility. Use when building navigation bars, layouts, headers, and responsive views.
---

# Vercel Web Interface & Intrinsic Layout Guidelines

Review and construct layouts that respond seamlessly across all resolutions (mobile 390px, tablet 768px, desktop 1280px+).

## Responsive Navigation & Breakpoint Contract

1. **Unified Breakpoint Synchronization**:
   - Always coordinate desktop nav and mobile hamburger button on the EXACT same breakpoint:
     - Desktop Nav: `hidden md:flex`
     - Mobile Hamburger Button: `flex md:hidden`
   - NEVER mix `sm:hidden` with `lg:flex` (which creates an invisible button zone on tablets 640px–1024px).
2. **Sticky Header Coordination**:
   - If using a top announcement banner, ensure it is part of a single coordinated `<header className="sticky top-0 z-40">`.
   - Never create two independent sticky headers that overlap or hide each other on scroll.
   - Use `scroll-margin-top: 5rem` or `scroll-pt-20` on section anchors so fixed headers don't occlude section titles when jumping.

## Touch Targets & Accessibility (WCAG 2.2 AA)

1. **44px Minimum Touch Targets**:
   - Every clickable link (`<a>`), button (`<button>`, `<Button>`), and mobile menu toggle must meet `min-h-11 min-w-11` (44x44px).
   - Inner SVG icons must keep their natural size (`size-4` / `size-5` = 16–20px) and NOT inherit the 44px parent button target height.
2. **Icon & Element Accessibility**:
   - Icon-only buttons must have `aria-label="Buka menu navigasi"`.
   - Decorative icons must have `aria-hidden="true"`.
   - Modals and mobile sheets must trap focus and close cleanly on click or escape.

## Intrinsic Fluid Layouts

- Prefer CSS Grid with `minmax()` and Flexbox with `flex-wrap` over rigid pixel widths.
- Use `min-w-0` on flex children to allow text truncation without blowing out container width.
- Containers must never horizontal-scroll accidentally (`overflow-x-hidden` on main shell).
