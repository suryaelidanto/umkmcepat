---
name: shadcn-ui
description: Use when composing shadcn/ui source components, Radix primitives, Tailwind v4 tokens, buttons, cards, overlays, grouped controls, or generated responsive UI.
metadata:
  source: https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/SKILL.md
  docs: https://ui.shadcn.com/docs/skills
  adaptation: UMKM Cepat locked Vite scaffold
---

# shadcn/ui composition

The generated project owns copied component source. `components.json`, the pre-seeded scaffold, and the local component registry are ground truth. Do not assume a component exists because it appears in an upstream example.

## Inspect before composing

- Use the generator's `list_files` to see the current project and available component sources.
- Use `read_file` for `components.json`, the seeded Button/Card source, or a bundled component before importing it.
- When a bundled component is needed, write its source into the generated project's `src/components/ui/<name>.tsx` before importing it. Keep imports and dependencies consistent with the source returned by the tool.
- Compose existing components before writing a custom primitive. Use a custom component only when it expresses a real repeated pattern the registry does not cover.
- The runtime has no shadcn CLI, MCP, registry fetch, or network access. Do not describe those capabilities as available.

## Styling rules

- Use semantic tokens: `bg-background`, `text-foreground`, `bg-card`, `text-card-foreground`, `bg-primary`, `text-primary-foreground`, `bg-muted`, `text-muted-foreground`, `border-border`, `ring-ring`.
- Use `cn()` for conditional classes. Prefer component variants over one-off color or typography overrides.
- Use `gap-*` instead of `space-x-*` or `space-y-*`.
- Use `size-*` when width and height are equal. Use `truncate` for intentional single-line truncation and `min-w-0` for flex children that must wrap.
- Keep Tailwind CSS v4 CSS-first tokens in the platform-owned stylesheet. Do not add a `tailwind.config.js`, custom global class system, or raw palette literals.
- Do not manually add dark-mode color overrides. The generated scaffold is light-only unless the accepted contract changes it.

## Component structure

- Use built-in variants and `asChild`/Slot composition for custom links and triggers.
- Keep items inside their required groups: select items in a select group when the primitive requires it, menu items in menu groups, and command items in command groups.
- Give Dialog, Sheet, Drawer, AlertDialog, and Command overlays an accessible title and description where the primitive expects them, even when the title is visually hidden.
- Let overlay primitives own stacking, focus trapping, escape, and outside-click behavior. Do not add manual z-index or ad hoc focus management.
- Use semantic HTML around components. A Card is a surface, not a reason to nest another Card inside it.

## Hit areas and icons

- Give the interactive parent a minimum 44px hit area, usually `min-h-11 min-w-11` or a full-size link/button wrapper.
- Keep inner Lucide icons at `size-4` or `size-5` with `shrink-0`. Never put the 44px minimum on the SVG itself.
- When a primitive owns icon sizing, do not fight its selector with a larger child class.
- Icon-only actions need an Indonesian accessible name; decorative icons use `aria-hidden="true"`.

## Boundaries

Never edit `src/content/site.ts`, `src/index.css`, `src/main.tsx`, `src/router.tsx`, `src/routes/__root.tsx`, `src/lib/preview-ready.ts`, `src/lib/utils.ts`, or pre-seeded component files through the agentic write tool. Never add a dependency, modify package/config files, or create a fake backend to support a component.

## Source note

Adapted from the official shadcn project-context, composition, styling, and accessibility guidance. CLI and MCP instructions are replaced by UMKM Cepat's bundled source registry and narrow local tools.
