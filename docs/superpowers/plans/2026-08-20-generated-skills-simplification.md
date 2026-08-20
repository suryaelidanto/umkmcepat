# Generated skills simplification implementation plan

> **For agentic workers:** Use `writing-skills` while editing each skill. This plan changes Markdown only. Do not wire the skills into the engine or add runtime QA services. Steps use checkbox syntax for tracking.

**Goal:** Refine the five existing project-local skills into compact, source-informed guidance for UMKM Cepat without changing generation behavior, runtime security, or browser qualification.

**Architecture:** Keep one skill per concern. `impeccable-craft` owns creative direction and anti-slop. `vercel-web-design` owns interface and applicable static React quality. `emil-motion` stays conditional. `indonesian-umkm` owns factual Indonesian copy. `shadcn-ui` owns composition within the locked source-copied scaffold. No coordinator or browser-qa skill is added.

**Tech Stack:** Markdown, YAML frontmatter, Prettier, Bun verification scripts, existing Vite + React + TanStack Router + Tailwind CSS v4 + shadcn source scaffold.

## Global constraints

- Modify only the five files listed in this plan.
- Preserve the existing skill directory names.
- Do not modify `agentic-generator.ts`, any system prompt, any tool definition, browser gates, visual critic, package files, or generated-site source.
- Do not add Browserbase, BrowserStack, MCP, Storybook, Lighthouse, axe-core, `world-class-web`, or a TDD framework.
- Keep user-facing generated copy Indonesian and developer-facing documentation English.
- Facts and customer-facing values come from `@/content/site`; the skills cannot authorize invented facts.
- Use semantic Tailwind tokens and the existing scaffold conventions.
- Do not copy complete upstream skill repositories. Keep only relevant rules and attribute the sources.
- Do not add new dependencies or edit `bun.lock`.
- Do not stage `.env`, `.data`, private evidence, screenshots, logs, or generated artifacts.

---

### Task 1: Rewrite `impeccable-craft` as the sole creative governor

**Files:**
- Modify: `src/lib/projects/skills/impeccable-craft/SKILL.md`

**Interfaces:**
- Produces the visual-direction and anti-slop guidance that later engine wiring may load.
- Consumes accepted project context from `PRODUCT.md`, `DESIGN.md`, and `src/content/site.ts`.
- Does not expose tools or change source files by itself.

- [ ] **Step 1: Record the baseline contract failure**

Run:

```bash
bun -e 'import { readFileSync } from "node:fs"; const text = readFileSync("src/lib/projects/skills/impeccable-craft/SKILL.md", "utf8"); if (!/^description:\s*Use when/m.test(text)) { console.error("baseline: description does not use the skill discovery form"); process.exit(1); }'
```

Expected: FAIL because the current description does not start with `Use when...`.

- [ ] **Step 2: Replace the document**

Write a concise `agentskills.io` document with:

- `name: impeccable-craft`;
- a `Use when...` description containing design, anti-slop, hierarchy, landing page, responsive, and critique triggers;
- a short operating posture that makes Impeccable the only creative governor;
- a context-first sequence: read product/design/facts, choose a direction, craft, critique, harden, audit, polish;
- explicit source-of-truth rules for `@/content/site`;
- the current anti-slop rules for fake state, fake claims, nested cards, generic gradients, excessive sections, technical copy, and decorative noise;
- typography, contrast, line-length, density, and mobile hierarchy rules;
- a concise “never override” section for facts, routes, platform-owned files, and accepted contracts;
- source references to Impeccable without copying its full CLI or detector catalog.

- [ ] **Step 3: Format and inspect the document**

Run:

```bash
bunx prettier --write src/lib/projects/skills/impeccable-craft/SKILL.md
rg -n "Use when|src/content/site|fake|nested|gradient|critique|harden|PRODUCT.md|DESIGN.md" src/lib/projects/skills/impeccable-craft/SKILL.md
```

Expected: the frontmatter is valid, the required terms appear, and no external tool workflow is presented as an engine capability.

---

### Task 2: Expand `vercel-web-design` for the locked static React stack

**Files:**
- Modify: `src/lib/projects/skills/vercel-web-design/SKILL.md`

**Interfaces:**
- Provides post-direction interface review and implementation rules.
- Covers relevant Vercel Web Interface Guidelines plus a small Vite-compatible React performance subset.
- Does not require Next.js, server actions, server components, SWR, MCP, or remote services.

- [ ] **Step 1: Record the baseline contract failure**

Run:

```bash
bun -e 'import { readFileSync } from "node:fs"; const text = readFileSync("src/lib/projects/skills/vercel-web-design/SKILL.md", "utf8"); const required = ["forms", "focus-visible", "images", "reduced-motion", "min-w-0"]; const missing = required.filter((term) => !text.includes(term)); if (missing.length) { console.error(`baseline missing: ${missing.join(", ")}`); process.exit(1); }'
```

Expected: FAIL because the current document covers only navigation, touch targets, and a few layout rules.

- [ ] **Step 2: Replace the document**

Add:

- `Use when...` discovery metadata for responsive UI, accessibility, interface review, and React/Vite performance;
- semantic HTML, labels, accessible names, headings, skip navigation, and link/action rules;
- visible focus, focus order, sticky content, dialogs, sheets, and overscroll behavior;
- form autocomplete, input types, inline errors, and paste behavior;
- image dimensions, alt text, lazy loading, and long-content handling;
- explicit animation properties, reduced-motion, hover gating, and touch behavior;
- safe-area, locale, number/date, dark-mode, and hydration guidance only where applicable;
- intrinsic layout using Grid/Flexbox, `minmax`, `clamp`, `min-w-0`, and content-driven breakpoints;
- one synchronized mobile/desktop navigation boundary without mandating `md` as the breakpoint;
- applicable static React performance rules: avoid unnecessary effects, layout reads in render, unbounded large lists, unstable inline components, and avoidable client work;
- a review checklist that runs after Impeccable direction instead of replacing it;
- source references to Vercel Web Interface Guidelines and React Best Practices.

Keep the document tailored to Vite + React static output. Remove or exclude Next-only server guidance.

- [ ] **Step 3: Format and inspect the document**

Run:

```bash
bunx prettier --write src/lib/projects/skills/vercel-web-design/SKILL.md
rg -n "Use when|forms|focus-visible|images|reduced-motion|min-w-0|clamp|Vite|React|Next.js" src/lib/projects/skills/vercel-web-design/SKILL.md
```

Expected: the document contains the relevant review categories and explicitly excludes server-only assumptions.

---

### Task 3: Harden `emil-motion` without making motion mandatory

**Files:**
- Modify: `src/lib/projects/skills/emil-motion/SKILL.md`

**Interfaces:**
- Activates only when a generated interface contains or requests motion.
- Supplies motion review rules, not a required animation library.
- May recommend deleting motion and must not change business facts.

- [ ] **Step 1: Record the baseline contract failure**

Run:

```bash
bun -e 'import { readFileSync } from "node:fs"; const text = readFileSync("src/lib/projects/skills/emil-motion/SKILL.md", "utf8"); const required = ["purpose", "interrupt", "transform-origin", "hover", "prefers-reduced-motion"]; const missing = required.filter((term) => !text.includes(term)); if (missing.length) { console.error(`baseline missing: ${missing.join(", ")}`); process.exit(1); }'
```

Expected: FAIL because the current document lacks purpose, interruption, origin, and pointer-gating rules.

- [ ] **Step 2: Replace the document**

Add:

- `Use when...` metadata for animation, transition, drawer, dialog, dropdown, hover, motion review, and reduced-motion triggers;
- the animate-or-not gate based on interaction frequency;
- named purposes such as feedback, spatial continuity, state indication, and preventing a jarring change;
- cheapest-tool guidance, preferring CSS transitions for simple UI state;
- transform/opacity preference, no `scale(0)`, correct trigger origin, interruption, and matching exits;
- exact project motion tokens and bounded duration ranges;
- reduced-motion and fine-pointer hover rules;
- controlled spring use for gestures only, without making bounce a default;
- a short review checklist and source reference to Emil Kowalski’s skills.

- [ ] **Step 3: Format and inspect the document**

Run:

```bash
bunx prettier --write src/lib/projects/skills/emil-motion/SKILL.md
rg -n "Use when|purpose|interrupt|transform-origin|hover|prefers-reduced-motion|scale\(0\)|CSS" src/lib/projects/skills/emil-motion/SKILL.md
```

Expected: motion remains optional and all required safety rules are visible.

---

### Task 4: Tighten `indonesian-umkm` around accepted facts

**Files:**
- Modify: `src/lib/projects/skills/indonesian-umkm/SKILL.md`

**Interfaces:**
- Converts accepted business facts into plain Indonesian customer copy.
- Consumes only fields present in `@/content/site`.
- Does not invent operational details, claims, guarantees, prices, or contact values.

- [ ] **Step 1: Record the baseline contract failure**

Run:

```bash
bun -e 'import { readFileSync } from "node:fs"; const text = readFileSync("src/lib/projects/skills/indonesian-umkm/SKILL.md", "utf8"); if (!text.includes("only when") && !text.includes("if supplied")) { console.error("baseline: optional business facts are described as mandatory"); process.exit(1); }'
```

Expected: FAIL because the current document says operational details should always be displayed.

- [ ] **Step 2: Replace the document**

Add:

- `Use when...` metadata for Indonesian copy, UMKM, WhatsApp CTA, local trust, and business details;
- plain, warm, restrained voice rules;
- a fact gate requiring every customer-facing value to come from `site.*`;
- conditional rendering of hours, address, delivery area, payment methods, testimonials, and social links;
- CTA selection based on the accepted visitor job;
- safe WhatsApp URL construction from the accepted contact number;
- examples that use schema field names, not invented customer facts;
- a ban on fake awards, reviews, urgency, guarantees, quality claims, and unsupported payment or delivery promises.

- [ ] **Step 3: Format and inspect the document**

Run:

```bash
bunx prettier --write src/lib/projects/skills/indonesian-umkm/SKILL.md
rg -n "Use when|site\.|only when|if supplied|wa\.me|invent|fake|unsupported" src/lib/projects/skills/indonesian-umkm/SKILL.md
```

Expected: optional facts are conditional and WhatsApp guidance remains grounded.

---

### Task 5: Align `shadcn-ui` with the source-copied scaffold

**Files:**
- Modify: `src/lib/projects/skills/shadcn-ui/SKILL.md`

**Interfaces:**
- Guides composition of the existing shadcn source registry and Tailwind CSS v4 scaffold.
- Keeps the generated project offline and dependency-locked.
- Does not require shadcn CLI, MCP, a community registry, or unavailable components.

- [ ] **Step 1: Record the baseline contract failure**

Run:

```bash
bun -e 'import { readFileSync } from "node:fs"; const text = readFileSync("src/lib/projects/skills/shadcn-ui/SKILL.md", "utf8"); const required = ["components.json", "copy", "DialogTitle", "gap-", "cn()", "Use when"]; const missing = required.filter((term) => !text.includes(term)); if (missing.length) { console.error(`baseline missing: ${missing.join(", ")}`); process.exit(1); }'
```

Expected: FAIL because the current document lacks the locked scaffold, complete overlay composition, and current spacing rules.

- [ ] **Step 2: Replace the document**

Add:

- `Use when...` metadata for shadcn, Radix, Tailwind v4, components, dialogs, sheets, buttons, and semantic tokens;
- compose existing source-copied components before writing custom markup;
- inspect the available component registry before importing a component;
- semantic color tokens, `cn()`, `gap-*`, `size-*`, `truncate`, `min-w-0`, and no arbitrary palette utilities;
- complete grouping rules for menu/select/tab components;
- accessible titles for dialog, sheet, and drawer content;
- parent 44px touch targets with natural inner icon dimensions;
- the distinction between primitive-owned icon sizing and raw Lucide markup;
- no CLI, MCP, registry fetch, new dependency, or platform-owned file edits in generated output;
- source references to the official shadcn skill and the local `DESIGN.md` scaffold contract.

Correct the existing example so it does not imply that the generated agent can run a CLI or use fields that may not exist in the current site schema.

- [ ] **Step 3: Format and inspect the document**

Run:

```bash
bunx prettier --write src/lib/projects/skills/shadcn-ui/SKILL.md
rg -n "Use when|components\.json|source-copied|DialogTitle|gap-|size-|cn\(\)|MCP|CLI|44" src/lib/projects/skills/shadcn-ui/SKILL.md
```

Expected: the document describes the offline project registry and does not require external tooling.

---

### Task 6: Run the documentation gate and commit the approved docs

**Files:**
- Modify: none beyond Tasks 1-5
- Test: all five `SKILL.md` files and repository documentation checks

**Interfaces:**
- The five files are the only implementation output.
- Existing engine and QA files must remain absent from the diff.

- [ ] **Step 1: Run the shared frontmatter/content contract check**

Run:

```bash
bun - <<'BUN'
import { readFileSync } from "node:fs";

const paths = [
  "src/lib/projects/skills/impeccable-craft/SKILL.md",
  "src/lib/projects/skills/vercel-web-design/SKILL.md",
  "src/lib/projects/skills/emil-motion/SKILL.md",
  "src/lib/projects/skills/indonesian-umkm/SKILL.md",
  "src/lib/projects/skills/shadcn-ui/SKILL.md",
];

const names = new Set<string>();
for (const path of paths) {
  const text = readFileSync(path, "utf8");
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) throw new Error(`${path}: missing frontmatter`);
  const name = frontmatter[1].match(/^name:\s*([a-z0-9-]+)$/m)?.[1];
  const description = frontmatter[1].match(/^description:\s*(.+)$/m)?.[1] ?? "";
  if (!name) throw new Error(`${path}: invalid name`);
  if (names.has(name)) throw new Error(`${path}: duplicate name ${name}`);
  names.add(name);
  if (!/^Use when\b/.test(description)) {
    throw new Error(`${path}: description must start with Use when`);
  }
  if (frontmatter[1].length > 1024) {
    throw new Error(`${path}: frontmatter exceeds 1024 characters`);
  }
  if (/(?:npx|bunx|npm|pnpm).*?(?:browserbase|browserstack|lighthouse|axe-core|world-class-web)|mcp\s+init|BROWSERBASE_API_KEY/i.test(text)) {
    throw new Error(`${path}: deferred runtime tooling was made executable`);
  }
}
BUN
```

Expected: PASS.

- [ ] **Step 2: Check stale references and formatting**

Run:

```bash
rg -n "skills/(anti-slop|design-quality|generated-app-builder|indonesian-business|tailwind-v4|tanstack-router-static|shadcn-ui)\.md|browser-qa|world-class-web" src AGENTS.md DEV.md PRODUCT.md DESIGN.md || true
bun scripts/check-doc-links.ts
bun run format:check
```

Expected: no stale deleted-skill references, documentation links pass, and all files are formatted.

- [ ] **Step 3: Run repository verification**

Run:

```bash
bun run verify
```

Expected: exit code 0. Existing unrelated failures must be reported with their command output and not hidden.

- [ ] **Step 4: Review the diff boundary**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Confirm the diff contains only the five skill documents plus the approved spec and plan. Confirm no engine, prompt, tool, package, QA, generated artifact, secret, or private evidence file changed.

- [ ] **Step 5: Commit the documentation update**

```bash
git add docs/superpowers/specs/2026-08-20-generated-skills-simplification-design.md docs/superpowers/plans/2026-08-20-generated-skills-simplification.md src/lib/projects/skills/impeccable-craft/SKILL.md src/lib/projects/skills/vercel-web-design/SKILL.md src/lib/projects/skills/emil-motion/SKILL.md src/lib/projects/skills/indonesian-umkm/SKILL.md src/lib/projects/skills/shadcn-ui/SKILL.md
git commit -m "docs(skills): simplify project-local guidance"
```

Expected: one local atomic commit containing the decision trail and five updated skill documents.

- [ ] **Step 6: Stop before engine integration**

Do not modify `src/lib/projects/agentic-generator.ts`, `src/lib/projects/batched-prompt.ts`, any tool schema, or any runtime/browser file. Report the commit, verification output, and the unchanged engine boundary.
