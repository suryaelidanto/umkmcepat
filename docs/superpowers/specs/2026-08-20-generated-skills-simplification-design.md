# Generated skills simplification

**Date:** 2026-08-20  
**Status:** Approved for documentation-only implementation  
**Scope:** Five project-local skill documents under `src/lib/projects/skills/`  
**Supersedes:** The earlier proposal to add `browser-qa`, `world-class-web`, `vercel-react-performance`, and external QA services  
**Preserves:** Existing engine behavior, local browser gates, visual critic, source/build guardrails, and standalone generated output

## Decision

Keep the skill layer small. Update the five existing skills in place and do not add a coordinator or a browser-testing skill yet.

The skills will be source-informed adaptations, not literal copies of upstream repositories. Upstream guidance supplies useful rules and vocabulary. UMKM Cepat's product, generated-app contract, Indonesian copy rules, and existing deterministic gates remain authoritative.

No skill is wired into the generation engine in this phase. The system prompt, `read_skill`, agent tools, generated-site browser runner, visual critic, and build worker remain unchanged.

## Why this is the right size

The platform already has:

- source and package policy for generated projects;
- a protected Vite + React + TanStack Router + Tailwind CSS v4 scaffold;
- local Playwright-based browser qualification;
- deterministic checks for route loading, console errors, links, overflow, contrast, focus, media, and touch targets;
- a screenshot-based visual critic for the professional generation path;
- existing unit tests and repository quality checks.

Adding Browserbase, BrowserStack, MCP, Storybook, Lighthouse, axe-core, a second coordinator, or a new TDD framework would increase operational surface before the current skill documents are even consumed by the engine. That work is deferred until evidence shows a real gap.

TDD remains a development practice for future code changes. This phase does not add a TDD runtime, test harness, or agent workflow.

## Skill boundaries

The five skills have one primary authority each:

| Skill | Responsibility | Must not do |
| --- | --- | --- |
| `impeccable-craft` | Creative direction, visual hierarchy, anti-slop, critique, hardening | Replace the accepted business contract or invent facts |
| `vercel-web-design` | Interface quality, intrinsic responsive layout, accessibility, and applicable React performance rules | Choose the business's visual identity or require Next.js-only patterns |
| `emil-motion` | Purposeful motion, easing, duration, interruption, and reduced motion | Add motion where no user benefit exists |
| `indonesian-umkm` | Indonesian customer copy, trust, local operations, and WhatsApp actions | Fill missing facts or make unsupported promises |
| `shadcn-ui` | Source-copied component composition, semantic tokens, and accessible primitives | Require CLI, MCP, network access, or unavailable components |

Impeccable is the only creative governor. Vercel is a standards reviewer. Emil is dormant unless the output contains motion. The domain skill controls copy truth. shadcn controls component composition.

## Changes to the five documents

### `impeccable-craft/SKILL.md`

Expand the short anti-slop list into a compact art-direction contract:

- read `PRODUCT.md`, `DESIGN.md`, and `src/content/site.ts` before composing;
- shape the page around the business job and accepted facts;
- use a small number of useful sections instead of filler;
- avoid fake calculators, fake progress, invented testimonials, fabricated metrics, card soup, nested cards, generic gradients, and decorative UI state;
- treat typography, hierarchy, spacing, contrast, and content density as the main craft decisions;
- use a direction, craft, critique, harden, audit, and polish sequence when the skill is eventually invoked;
- allow restraint and sparse layouts when the brief is sparse;
- never let a visual reference introduce identity, copy, price, address, or claims.

The document will not reproduce Impeccable's full CLI, hook system, 23-command catalogue, or 59 detector implementation. Those belong to the upstream project and are not needed inside a generated site.

### `vercel-web-design/SKILL.md`

Expand the current layout subset with the relevant Web Interface Guidelines:

- semantic HTML and correct action/link elements;
- accessible names, labels, focus-visible states, heading order, and skip navigation where appropriate;
- long-content, empty-state, image dimension, alt-text, and text-wrapping rules;
- explicit animation properties and reduced-motion handling;
- touch, safe-area, modal, drawer, and overscroll behavior;
- locale-aware dates and numbers when generated output contains them;
- intrinsic Grid/Flexbox layout with `minmax`, `min`, `max`, `clamp`, `min-w-0`, and content-driven breakpoints;
- one coordinated responsive navigation boundary rather than mismatched visibility ranges;
- applicable Vercel React performance rules for small Vite sites, including avoiding unnecessary effects, layout reads, unbounded lists, and needless client work.

The document must not require Next.js, server components, server actions, SWR, or other server-only Vercel patterns in generated Vite sites. It must not claim that every interface breakpoint must be `md`; it should require the desktop and mobile states to switch at the same chosen boundary and be checked at that boundary.

### `emil-motion/SKILL.md`

Expand the current motion rules with:

- the decision to animate or stay instant based on frequency;
- a named purpose such as feedback, spatial consistency, or state indication;
- the cheapest suitable tool, preferring CSS transitions for simple state changes;
- transform and opacity preference, correct transform origins, interruptibility, and exit symmetry;
- explicit easing and duration ranges;
- pointer/hover gating and reduced-motion alternatives;
- deletion as the first fix when motion has no clear job.

The skill will not prohibit every spring. Springs remain available for gestures or interruptible movement, but bounce is not the default for this trust-first product.

### `indonesian-umkm/SKILL.md`

Keep the local domain skill and correct its boundaries:

- use plain, warm Indonesian without hype or AI phrases;
- write only from accepted `site.*` facts;
- display hours, address, delivery area, payment methods, or social links only when supplied;
- construct WhatsApp links from the accepted contact value and a useful prefilled message;
- choose CTA wording from the actual visitor job, not a fixed universal phrase;
- use concrete benefits only when the brief supports them;
- never turn missing information into a claim, guarantee, price, location, or operating detail.

### `shadcn-ui/SKILL.md`

Align the component guidance with the current official shadcn direction while preserving the generated scaffold:

- compose existing source-copied primitives before writing custom markup;
- use semantic Tailwind tokens and `cn()` for conditional classes;
- use `gap-*`, `size-*`, and `truncate` where appropriate;
- keep dialogs, sheets, drawers, menus, tabs, and grouped items structurally complete and labelled;
- use the project's actual available components and icon library;
- keep 44px hit areas on parent controls without inflating inner icons;
- let component CSS own icon sizing when a primitive provides it;
- never add a runtime dependency, run the shadcn CLI, call MCP, fetch a registry, or edit platform-owned scaffold files during generated-site writing.

The skill will explicitly distinguish parent touch targets from inner SVG dimensions. It will not blindly copy instructions for components absent from the generated scaffold.

## Agentskills format

Each file remains a folder-local `SKILL.md` with YAML frontmatter containing:

- a lowercase hyphenated `name`;
- a concise description beginning with `Use when...` and describing triggers rather than the whole workflow.

The documents will not claim to be the upstream originals. They will name the relevant source projects in a short attribution/reference section without copying large upstream files.

## Security and runtime boundaries

This phase adds no executable code and no network capability.

The following remain unchanged:

- generated package and build allowlists;
- protected Vite configuration;
- no lifecycle scripts during generated installs;
- local browser evidence collection;
- outbound request blocking in the existing browser runner;
- private evidence storage;
- existing visual critic input and output boundaries.

The skill documents are instructions only. They do not grant a generated agent shell access, browser access, registry access, credentials, or deployment authority.

## Verification

The documentation-only change is complete when:

1. all five files have valid frontmatter and unique names;
2. each description begins with `Use when...` and stays within the agentskills metadata limit;
3. the five documents do not require or invoke Browserbase, BrowserStack, MCP, Storybook, Lighthouse, axe-core, or `world-class-web`;
4. generated-site constraints match `PRODUCT.md`, `DESIGN.md`, and the locked scaffold rather than Next.js assumptions;
5. no stale references to deleted loose skill files remain;
6. Prettier passes for all Markdown files;
7. `bun scripts/check-doc-links.ts` passes;
8. `bun run verify` passes;
9. no engine, prompt, tool, package, generated-site gate, or browser-runner file changes are present in the diff.

## Deferred work

The following require a separate approved design and evidence before implementation:

- wiring `read_skill` into the generator;
- changing the generation system prompt;
- adding a coordinator skill;
- adding axe-core or extra browser matrices;
- changing visual-unknown publication semantics;
- adding remote browser or real-device providers;
- adding TDD-specific agent workflows.
