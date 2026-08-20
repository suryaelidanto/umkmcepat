---
name: vercel-web-design
description: Use when reviewing or building generated Vite React interfaces for responsive layout, accessibility, interaction quality, and applicable client-side performance.
license: MIT
metadata:
  source: https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines
  react_source: https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices
  adaptation: UMKM Cepat static Vite output
---

# Web interface correctness

Review the chosen visual direction without replacing it. This skill is the correctness reviewer for the generated Vite + React + TanStack Router site. It does not choose the business identity, invent copy, or require a Next.js runtime.

## Structure and semantics

- Use `header`, `nav`, `main`, `section`, `footer`, headings, lists, and buttons for their actual meaning.
- Use links for navigation and buttons for actions. Give every action an accessible name that says what it does.
- Keep one logical heading order. Do not make a visual label a heading unless it structures the page.
- Add a skip link when the page has a persistent navigation region and enough content to justify it.
- Give dialogs, sheets, drawers, menus, tabs, and grouped controls the labels and relationships their primitives expect.
- Keep error, loading, empty, and success states visible and honest. Do not hide a failed action behind a decorative state.

## Focus, touch, and interaction

- Every interactive parent must provide at least a 44px hit area. Use `min-h-11 min-w-11` or an equivalent layout; keep inner SVGs at their natural `size-4` or `size-5`.
- Preserve keyboard order and show a strong `:focus-visible` state. Never make focus depend on color alone.
- Icon-only actions need an Indonesian `aria-label`. Decorative icons need `aria-hidden="true"`.
- Do not make hover the only way to discover or use an action. Gate hover-only effects to fine pointers.
- Keep sticky headers coordinated. A single header owns the announcement, navigation, and z-index; anchor targets need `scroll-margin-top`.
- Let dialogs and sheets close through their primitive's escape and outside-click behavior. Do not recreate focus trapping with ad hoc state.
- Avoid accidental horizontal scroll. Use `min-w-0`, wrapping, and content-driven widths before clipping.

## Forms and content

- Use the correct input type, `autocomplete`, label, and `aria-invalid` state when a form exists.
- Put validation near the field, explain what happened and how to fix it, and preserve pasted input.
- Let real Indonesian copy wrap. Use `max-w-prose`/`max-w-xl`, `break-words`, and `truncate` only when truncation is an intentional choice.
- Give every real image dimensions and useful alt text. Decorative images use empty alt text. Do not add remote or placeholder images to fill space.
- Render dates and numbers with the appropriate locale when the brief provides them. Never invent a date, count, price, or status.
- Check the longest accepted label, offer, address, and CTA at mobile widths, not only the sample text.

## Intrinsic responsive layout

- Prefer Grid with `minmax(0, 1fr)` and Flexbox with `flex-wrap` over fixed page widths.
- Use `clamp()`, `min()`, `max()`, `min-w-0`, and `gap-*` to let content define layout pressure.
- Choose one navigation boundary from the actual layout, then switch desktop navigation and its mobile control at that same boundary. Do not combine unrelated `sm`, `md`, and `lg` visibility ranges.
- Test the chosen boundary, 390px mobile, 768px tablet, and a wide desktop. A page that works only at the endpoints is not responsive.
- Preserve safe-area padding for edge-to-edge mobile controls when the layout reaches device edges.
- Keep overlay and drawer content within the viewport and respect overscroll behavior.

## Motion and performance

- Declare the properties being transitioned. Prefer transform and opacity for movement and honor `prefers-reduced-motion`.
- Avoid unnecessary effects, effects that only derive render data, layout reads during render, unstable component definitions, unbounded lists, and needless client work.
- Keep static content static. Do not add a client state machine or data-fetching layer for a page that has no backend.
- Avoid loading a component or dependency when a small local primitive solves the supported job.
- Never add Next.js-only server components, server actions, route handlers, SWR, or remote review commands to a Vite output.

## Review output

When auditing source, report concrete `path:line` findings with the violated rule and the smallest fix. A clean review means the source and existing local gates provide evidence. Do not claim that Vercel's live guideline fetch, a remote browser, Lighthouse, or an accessibility service ran.

## Source note

Adapted from Vercel's Web Interface Guidelines and React Best Practices. Server-only and Next.js-specific rules are intentionally excluded; the generated project is a static Vite application with local build and browser gates.
