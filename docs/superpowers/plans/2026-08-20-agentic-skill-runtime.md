# Agentic skill runtime and build outcome implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `test-driven-development` before every production behavior change. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle the five grounded project skills into the agentic generator, enforce their read-before-write contract, correct the system prompt and component guidance, and verify failed, succeeded, and timed-out builds without introducing a new timeout status.

**Architecture:** Raw `SKILL.md` files are imported through `src/lib/projects/skills/skill-registry.ts`, so the runtime bundle carries the exact local adaptations. `runAgenticGenerate` exposes one enum-bounded `read_skill` tool, protects scaffold writes until core skills are read, and requires a successful `check_app` before returning. Generated build timeout is a DB/env-overridable runtime setting with a 90-second default based on the requested project's seven completed-build history; timeout remains a classified failed build.

**Tech Stack:** Bun, TypeScript, Vitest, Vite raw Markdown imports, AI SDK `tool`, Zod, Prisma-backed app settings, existing generated Vite + React + TanStack Router + Tailwind v4 scaffold.

## Global Constraints

- Keep `ProjectBuild.status` backward-compatible: timeout is `"failed"` plus `BuildFailureReason = "timeout"`.
- Core skills are exactly `impeccable-craft`, `vercel-web-design`, `indonesian-umkm`, and `shadcn-ui`; `emil-motion` is conditional.
- Generated customer-facing values come only from `src/content/site.ts` and accepted contract data.
- Generated output remains static and portable. No backend, checkout, login, persistence, external URLs, invented claims, or fake interactive state.
- The agent cannot edit protected scaffold files, install packages, run a CLI, invoke MCP, or fetch a registry.
- User-facing progress and copy stay Indonesian; code, prompts, tests, logs, and docs stay English.
- No `any`, `as any`, `ts-ignore`, `eslint-disable`, or new dependency.
- No Browserbase, BrowserStack, Storybook, Lighthouse, axe-core, or new QA framework.
- Do not log secrets, raw environment values, private evidence, or owner-sensitive data.
- Preserve last-known-good preview and Production behavior on failed or timed-out candidates.
- Modify only the files listed in the tasks plus the approved spec/plan and canonical docs required by the behavior change.

---

### Task 1: Refresh the five local skills from their actual upstream contracts

**Files:**
- Modify: `src/lib/projects/skills/impeccable-craft/SKILL.md`
- Modify: `src/lib/projects/skills/vercel-web-design/SKILL.md`
- Modify: `src/lib/projects/skills/emil-motion/SKILL.md`
- Modify: `src/lib/projects/skills/indonesian-umkm/SKILL.md`
- Modify: `src/lib/projects/skills/shadcn-ui/SKILL.md`
- Test: Markdown frontmatter and content contract in Task 2

**Interfaces:**
- These Markdown files are the canonical skill sources consumed by the raw-import registry.
- They must describe available runtime tools truthfully and must not imply external commands are available.

- [ ] **Step 1: Replace `impeccable-craft/SKILL.md`**

Keep the `name: impeccable-craft` frontmatter and rewrite the description to begin with `Use when...`. Adapt the upstream Impeccable 4.1.1 posture:

- context first: read `PRODUCT.md`, `DESIGN.md`, and `src/content/site.ts`;
- choose the surface mode and business job before styling;
- use the smallest matching sequence: direction, craft, critique, harden, audit, polish;
- preserve the brief and incumbent identity during refinement; treat redesign as a deliberate replacement;
- make typography, hierarchy, spacing, contrast, density, and responsive behavior carry the craft;
- ban fake metrics, testimonials, calculators, carts, state, claims, card soup, nested cards, generic gradients, and decorative noise;
- let a sparse brief produce a sparse page;
- never let a reference add facts, identity, prices, contact details, or claims;
- state that the runtime has no Impeccable CLI or detector and relies on existing local gates.

Add a short attribution section naming `pbakaus/impeccable` and the adapted source path.

- [ ] **Step 2: Replace `vercel-web-design/SKILL.md`**

Adapt the official Web Interface Guidelines and the Vercel React Best Practices subset for this Vite output:

- semantic elements, action/link correctness, accessible names, labels, heading order, skip navigation, and focus-visible states;
- forms, errors, autocomplete, input types, paste, long text, image dimensions, alt text, empty states, locale-aware values, dialogs, sheets, and overscroll;
- intrinsic Grid/Flexbox using `minmax`, `clamp`, `min-w-0`, `gap-*`, and one coordinated navigation breakpoint;
- 44px parent controls without enlarging inner SVGs;
- explicit animation properties and reduced-motion fallback;
- avoid unnecessary effects, layout reads, unstable component definitions, unbounded lists, and needless client work;
- review output as terse file/line findings when used as an audit, but do not fetch remote rules at generation time;
- explicitly exclude Next-only server components, server actions, SWR, and remote Vercel tooling.

Add attribution to `vercel-labs/agent-skills` web-design-guidelines and react-best-practices.

- [ ] **Step 3: Replace `emil-motion/SKILL.md`**

Adapt the upstream Emil review/advisor rules:

- ask whether motion should exist, using frequency as the first filter;
- name a purpose: feedback, spatial continuity, state indication, or preventing a jarring change;
- prefer CSS transitions for simple state changes;
- use transform/opacity, correct origin, interruptible transitions, symmetric exits, explicit easing, and sub-300ms UI timing;
- never animate layout properties by default and never use `scale(0)` entrances;
- gate hover effects to fine pointers and honor `prefers-reduced-motion`;
- allow springs only for gesture-like movement; do not make bounce the house style;
- recommend deleting motion that has no job.

Add attribution to `emilkowalski/skills` and the cited animation principles.

- [ ] **Step 4: Replace `indonesian-umkm/SKILL.md`**

Keep the local domain rules and make them explicit:

- plain, warm, restrained Indonesian;
- facts only from `site.*` and the accepted brief;
- render address, hours, delivery, payment, testimonials, social links, and promotions only when supplied;
- choose CTAs from the visitor job and use an accepted contact value for WhatsApp links;
- never fabricate prices, guarantees, reviews, awards, urgency, stock, location, or operational promises;
- reject technical/internal copy in customer-facing headings.

Add a short attribution note that this is a UMKM Cepat adaptation, not a literal upstream copy.

- [ ] **Step 5: Replace `shadcn-ui/SKILL.md`**

Adapt the official shadcn project-context and composition rules to the locked local registry:

- `components.json` and the local source registry are ground truth;
- inspect existing source with `list_files`/`read_file` before composing;
- copy source into the generated project when a component is needed, rather than importing an unavailable package;
- compose existing primitives and built-in variants;
- use semantic tokens, `cn()`, `gap-*`, `size-*`, `truncate`, and `min-w-0`;
- keep grouped items inside their group and give Dialog/Sheet/Drawer content an accessible title;
- preserve 44px parent hit areas while keeping inner icons at `size-4`/`size-5`;
- no CLI, MCP, registry fetch, network, new dependency, or protected scaffold edits;
- distinguish the pre-seeded Button/Card from components that can be copied from the bundled registry.

Add attribution to `shadcn-ui/ui/skills/shadcn` and the local scaffold.

- [ ] **Step 6: Format the five documents**

Run:

```bash
bunx prettier --write src/lib/projects/skills/impeccable-craft/SKILL.md src/lib/projects/skills/vercel-web-design/SKILL.md src/lib/projects/skills/emil-motion/SKILL.md src/lib/projects/skills/indonesian-umkm/SKILL.md src/lib/projects/skills/shadcn-ui/SKILL.md
```

Expected: exit code 0 and no generated runtime files changed.

---

### Task 2: Add the bundled skill registry and its contract tests

**Files:**
- Create: `src/lib/projects/skills/skill-registry.ts`
- Create: `src/lib/projects/skills/skill-registry.test.ts`

**Interfaces:**
- Produces typed skill names and raw Markdown content for the agentic tool.
- Consumes the five colocated `SKILL.md` files through `?raw` imports.

- [ ] **Step 1: Write the failing registry tests**

Create tests with these exact behaviors:

```ts
import { describe, expect, it } from "vitest";

import {
  PROJECT_CORE_SKILL_NAMES,
  PROJECT_SKILL_NAMES,
  readProjectSkill,
} from "./skill-registry";

describe("project skill registry", () => {
  it("bundles every local skill with valid frontmatter and non-empty content", () => {
    for (const name of PROJECT_SKILL_NAMES) {
      const skill = readProjectSkill(name);
      expect(skill.name).toBe(name);
      expect(skill.content).toMatch(/^---\n[\s\S]+\n---\n/);
      expect(skill.content.length).toBeGreaterThan(400);
    }
  });

  it("keeps the four core skills separate from conditional motion guidance", () => {
    expect(PROJECT_CORE_SKILL_NAMES).toEqual([
      "impeccable-craft",
      "vercel-web-design",
      "indonesian-umkm",
      "shadcn-ui",
    ]);
    expect(PROJECT_SKILL_NAMES).toContain("emil-motion");
    expect(PROJECT_CORE_SKILL_NAMES).not.toContain("emil-motion");
  });
});
```

Run:

```bash
bunx vitest run --project unit src/lib/projects/skills/skill-registry.test.ts
```

Expected: RED because `skill-registry.ts` does not exist.

- [ ] **Step 2: Implement the minimal raw-import registry**

Create a module with this public shape:

```ts
import impeccableCraft from "./impeccable-craft/SKILL.md?raw";
import vercelWebDesign from "./vercel-web-design/SKILL.md?raw";
import emilMotion from "./emil-motion/SKILL.md?raw";
import indonesianUmkm from "./indonesian-umkm/SKILL.md?raw";
import shadcnUi from "./shadcn-ui/SKILL.md?raw";

export const PROJECT_SKILL_NAMES = [
  "impeccable-craft",
  "vercel-web-design",
  "emil-motion",
  "indonesian-umkm",
  "shadcn-ui",
] as const;

export const PROJECT_CORE_SKILL_NAMES = [
  "impeccable-craft",
  "vercel-web-design",
  "indonesian-umkm",
  "shadcn-ui",
] as const;

export type ProjectSkillName = (typeof PROJECT_SKILL_NAMES)[number];

const SKILLS: Record<ProjectSkillName, string> = {
  "impeccable-craft": impeccableCraft,
  "vercel-web-design": vercelWebDesign,
  "emil-motion": emilMotion,
  "indonesian-umkm": indonesianUmkm,
  "shadcn-ui": shadcnUi,
};

export function readProjectSkill(name: ProjectSkillName) {
  return { content: SKILLS[name], name };
}
```

Do not add filesystem reads, user paths, network fetches, fallback text, or a second copy of the Markdown.

- [ ] **Step 3: Run the registry tests**

Run the same focused command. Expected: PASS.

- [ ] **Step 4: Run TypeScript for the new module**

Run:

```bash
bunx tsc --noEmit --pretty false
```

Expected: PASS.

---

### Task 3: Make the component prompt reflect the actual local scaffold

**Files:**
- Modify: `src/lib/projects/scaffold/component-catalog.ts`
- Test: `src/lib/projects/scaffold/component-catalog.test.ts`

**Interfaces:**
- `getFormattedShadcnRegistryPrompt()` must list only source files available from `SHADCN_COMPONENT_BY_NAME` and the pre-seeded Button/Card.
- Later agentic tools use `read_file` to inspect a component source before writing it.

- [ ] **Step 1: Write the failing catalog tests**

Create colocated tests:

```ts
import { describe, expect, it } from "vitest";

import { getFormattedShadcnRegistryPrompt } from "./component-catalog";


describe("generated component catalog prompt", () => {
  it("describes the local source registry instead of fictional layout primitives", () => {
    const prompt = getFormattedShadcnRegistryPrompt();
    expect(prompt).toContain("src/components/ui/button.tsx");
    expect(prompt).toContain("src/components/ui/card.tsx");
    expect(prompt).toContain("read_file");
    expect(prompt).toContain("write_file");
    expect(prompt).not.toContain("All 45+ components and layout primitives are pre-installed");
    expect(prompt).not.toContain("@/components/site/layout");
  });
});
```

Run the focused test and expect it to fail against the current fictional catalog wording.

- [ ] **Step 2: Implement the actual catalog**

Use `SHADCN_COMPONENT_BY_NAME` to create stable sorted entries. Describe Button and Card as pre-seeded; describe other components as bundled source that must be read and written into the generated project. Include `components.json`, `cn()`, semantic tokens, and the no-network/no-CLI boundary. Keep `COMPLETE_COMPONENT_REGISTRY` only if a real consumer still imports it; otherwise remove the dead export.

- [ ] **Step 3: Run the focused catalog test**

Run:

```bash
bunx vitest run --project unit src/lib/projects/scaffold/component-catalog.test.ts
```

Expected: PASS.

---

### Task 4: Add `read_skill`, protected writes, and the new system prompt

**Files:**
- Modify: `src/lib/projects/agentic-generator.ts`
- Modify: `src/lib/projects/agentic-generator.test.ts`
- Modify: `src/lib/projects/build-attempt-worker.ts`
- Modify: `src/lib/projects/scaffold/protected-paths.ts`
- Modify: `src/lib/projects/scaffold/scaffold.test.ts`

**Interfaces:**
- `runAgenticGenerate()` returns the existing result plus `skillsRead: ProjectSkillName[]`.
- `read_skill` is model-callable but only accepts the five enum names.
- The worker passes frozen `acceptedHandoff.creativeDirection` as taste-only data when available.

- [ ] **Step 1: Extend the test mock and write RED behavior tests**

Update the AI SDK test mock so tool configurations are retained and the test can call their `execute` functions. Add tests for:

```ts
it("exposes read_skill and returns the selected local document", async () => {
  // Call runAgenticGenerate with a generateText mock that invokes the tool.
  // Assert the returned content contains the selected skill frontmatter and
  // result.skillsRead contains the selected name.
});

it("rejects writes until all core skills have been read", async () => {
  // Invoke the captured write_file tool before the core read_skill calls.
  // Assert an error mentioning the missing core skill names.
});

it("rejects protected scaffold writes", async () => {
  // Read all core skills, then call write_file with src/content/site.ts and
  // src/router.tsx. Assert the security restriction is returned.
});

it("requires the core skills, a write, and a passing check_app before success", async () => {
  // Exercise missing-read, no-write, missing-check, and failed-last-check cases.
  // Each must reject instead of returning a successful generation result.
});

it("builds a fact-grounded system prompt without fabricated defaults", async () => {
  // Capture generateText arguments and assert the prompt contains read_skill,
  // NOT PROVIDED, src/content/site.ts, protected scaffold, and no
  // '08.00-21.00 WIB', 'Indonesia' fallback, or 'Terjangkau' fallback.
});
```

Run:

```bash
bunx vitest run --project unit src/lib/projects/agentic-generator.test.ts
```

Expected: RED for the new behavior.

- [ ] **Step 2: Add typed tool state**

Track:

- `skillsRead` as a `Set<ProjectSkillName>`;
- `checkAppCalls` as a count;
- `lastCheckOk` as `boolean | null`;
- `touched` as the existing custom-file set.

Use `PROJECT_CORE_SKILL_NAMES` for the guard instead of duplicating string literals in multiple functions.

- [ ] **Step 3: Implement `read_skill`**

Import `PROJECT_SKILL_NAMES`, `PROJECT_CORE_SKILL_NAMES`, `ProjectSkillName`, and `readProjectSkill`. Define a Zod enum from the tuple. The tool execution must:

- record the first read in `skillsRead`;
- emit one `operation` event with `type: "read_skill"`, a safe skill path, Indonesian label/detail defaults, and `state: "succeeded"`;
- return `{ name, content }`;
- never expose filesystem resolution or arbitrary paths.

- [ ] **Step 4: Guard `write_file` and `check_app`**

Before writing or checking, compute missing core names. Return a bounded error object until the set is complete. Reject `isProtectedScaffoldPath(path)` before mutating `fileMap`. Keep the existing `src/` and `public/` path restriction and content normalization.

`check_app` increments `checkAppCalls`, normalizes cross-file anchor aliases, preflights unknown static anchors and primary-action structure, stores `lastCheckOk`, classifies failed logs with `classifyBuildFailure`, and returns `{ ok, failureReason, errors }` without throwing for an ordinary compile failure.

- [ ] **Step 5: Replace the system prompt and user prompt**

Use one English prompt that states the exact workflow and authority boundaries from the spec. Include the actual component catalog, the protected path list, the skill names, the no-fact-invention rule, and the completion contract.

Build the user prompt from a safe formatter:

- non-empty strings pass through;
- null, undefined, empty strings, and empty arrays become `NOT PROVIDED`;
- structured values use bounded `JSON.stringify` output;
- no fabricated address, hours, price, or target-customer fallback is emitted.

Include `schema` as the authoritative data snapshot and `creativeDirection` under a heading that says it can guide taste but cannot add facts.

- [ ] **Step 6: Enforce the completion contract**

After `generateText` resolves, run one deterministic final `check_app` when the model omitted it, then throw a specific English error if core reads, custom writes, or a passing final check are missing. Return `skillsRead` sorted in the stable registry order. Preserve existing operation trace and energy charging behavior. Use the shared bounded generation-step setting (default 40, range 15–60) rather than a second hardcoded step fallback.

- [ ] **Step 7: Pass frozen creative direction from the worker**

When calling `runAgenticGenerate`, pass `creativeDirection: acceptedHandoff?.creativeDirection ?? null`. Do not pass mutable or unaccepted customer facts from the handoff beyond the existing schema/brief inputs.

- [ ] **Step 8: Run the focused agentic tests**

Run:

```bash
bunx vitest run --project unit src/lib/projects/agentic-generator.test.ts src/lib/projects/build-attempt-worker.test.ts
```

Expected: PASS.

---

### Task 5: Set a measured generated-build timeout and preserve timeout classification

**Files:**
- Modify: `src/lib/config/app-settings-registry.ts`
- Modify: `src/lib/config/app-settings-registry.test.ts`
- Modify: `src/lib/projects/generated-source.ts`
- Modify: `src/lib/projects/generated-source.test.ts`
- Modify: `src/lib/projects/build-logs.test.ts` only if a missing assertion is needed

**Interfaces:**
- New setting: `runtime.generated_build_timeout_ms`, default `90000`, min `30000`, max `180000`, env `PROJECT_GENERATED_BUILD_TIMEOUT_MS`.
- `buildGeneratedProject` accepts an internal `timeoutMs` override for deterministic tests while defaulting to the bounded setting.
- A timeout remains `{ ok: false, distFiles: [], log: ... }` and classifies as `timeout`.

- [ ] **Step 1: Add RED settings assertions**

Add to the registry test:

```ts
it("registers the measured generated build timeout", () => {
  expect(APP_SETTINGS.find((entry) => entry.key === "runtime.generated_build_timeout_ms")).toMatchObject({
    category: "runtime",
    type: "number",
    fallback: 90000,
    env: "PROJECT_GENERATED_BUILD_TIMEOUT_MS",
    min: 30000,
    max: 180000,
  });
});
```

Run the focused registry test. Expected: RED because the entry does not exist.

- [ ] **Step 2: Add the setting entry**

Place it beside runtime build settings with the exact key, label, fallback, env, and bounds above. Do not mark it `requiresRestart`; `getSettingSync` is DB/env resolved per call.

- [ ] **Step 3: Add RED timeout behavior coverage**

Add a generated-source test that passes `timeoutMs: 25` and a command runner that blocks until the timeout boundary. Assert:

- result `ok` is false;
- result `distFiles` is empty;
- log contains `Build timed out.`;
- `classifyBuildFailure(result.log)` is `timeout`.

Also assert invalid configured values clamp to the min/max through the setting resolver or the exported bounded timeout function.

Run the focused generated-source test. Expected: RED until the option and setting are implemented.

- [ ] **Step 4: Implement bounded timeout resolution**

Import `getSettingSync`, define the default/min/max constants, and resolve the setting with the same DB/env precedence and clamping style as `getAiTimeoutMs`. Add `timeoutMs?: number` to `BuildGeneratedProjectOptions`. The default command runner must call `runCommand(command, cwd, resolvedTimeoutMs)`. Keep injected command runners unchanged for existing tests.

Ensure `runCommand` resolves once when the timer kills the child, sanitizes the bounded log, and does not collect dist after timeout.

- [ ] **Step 5: Run focused timeout tests**

Run:

```bash
bunx vitest run --project unit src/lib/config/app-settings-registry.test.ts src/lib/projects/generated-source.test.ts src/lib/projects/build-logs.test.ts
```

Expected: PASS.

---

### Task 6: Update the canonical development docs with the runtime contract

**Files:**
- Modify: `DEV.md`
- Modify: `docs/superpowers/specs/2026-08-20-agentic-skill-runtime-design.md`
- Modify: `docs/superpowers/plans/2026-08-20-agentic-skill-runtime.md`

**Interfaces:**
- Documentation must match the implemented setting, tool boundaries, and outcome taxonomy.

- [ ] **Step 1: Add the runtime setting and timeout evidence to `DEV.md`**

Document the setting key, default, bounds, env name, measured source (seven completed builds on the requested project), and the fact that timeout is a failed build with `timeout` failure reason. State that failed candidates preserve the last-known-good preview/Production pointer.

- [ ] **Step 2: Add final implementation notes to the new spec**

Record any deliberate differences from the plan, exact test commands, and the final measured project evidence after Tasks 7-8. Do not put owner values, secrets, or private artifact refs in the doc.

- [ ] **Step 3: Format and check docs**

Run:

```bash
bunx prettier --write DEV.md docs/superpowers/specs/2026-08-20-agentic-skill-runtime-design.md docs/superpowers/plans/2026-08-20-agentic-skill-runtime.md
bun scripts/check-doc-links.ts
```

Expected: PASS.

---

### Task 7: Run full local verification and test the three outcomes on the requested project

**Files:**
- Test: requested project `cmt0psnpm000d4l6g17qd4gfs` through the authenticated HTTP route, BullMQ worker, and local DB/runtime
- Harness: `scripts/trigger-project-build.ts`, `scripts/trigger-project-build.test.ts`, and the `build:trigger` package command
- Evidence: private `/tmp` or `.data` output, never tracked

**Interfaces:**
- Use the real project's existing owner and accepted source/handoff; keep all generated candidates in Preview and capture the WorkspaceShell-compatible SSE stream.
- Do not publish, mutate Production, expose credentials, or commit private evidence.

- [ ] **Step 1: Establish the baseline project evidence**

Run a Bun/Prisma query that prints only the project id, public title, status, buildStatus, generationEngine, and aggregate completed-build counts/timings. Confirm the project exists and that its current successful build remains the selected last-known-good state. Do not print `userId`, raw brief JSON, environment values, or owner contact data.

- [ ] **Step 2: Exercise a genuine failed build**

Trigger a fresh build through `POST /api/projects/:id/generate` and let the queue/worker terminate it with a controlled agent or browser-gate failure. Record the raw SSE terminal event and DB evidence:

- terminal `ProjectBuild.status: failed`;
- no dist artifact;
- a finalized operation token and retryable project state;
- the existing successful Preview/Production pointers remain selected.

Use only private runtime evidence and delete temporary debug harnesses after capture.

- [ ] **Step 3: Exercise a genuine succeeded build**

Run the configurable harness with `PROJECT_ID=<project-id>` so it calls the real authenticated route, BullMQ worker, and SSE channel. Record:

- core skill-read and write/check operation events;
- terminal `done` SSE event;
- `ProjectBuild.status: succeeded`;
- non-empty dist files and artifact write;
- Preview deployment created and resolution points to this candidate;
- no Production pointer change and no active operation remains.

- [ ] **Step 4: Exercise the timeout path**

Use the real child-process timeout boundary through `runCommand`/the local build worker with a child that exceeds `25ms`; never lower the persistent production setting. Record:

- `ok: false`;
- log contains `Build timed out.`;
- `classifyBuildFailure(log) === "timeout"`;
- no dist files or artifact;
- persisted status remains `failed`, not a fabricated success or new unsupported status;
- any persisted operation/build attempt is terminal and retryable.

- [ ] **Step 5: Run focused project/build tests**

Run:

```bash
bunx vitest run --project unit scripts/trigger-project-build.test.ts src/lib/projects/skills/skill-registry.test.ts src/lib/projects/scaffold/component-catalog.test.ts src/lib/projects/agentic-generator.test.ts src/lib/projects/generated-site-browser-runner.test.ts src/lib/projects/generated-site-gates.test.ts src/lib/projects/generated-site-qualification.test.ts src/lib/projects/build-attempt-worker.test.ts src/lib/projects/generated-source.test.ts src/lib/projects/stale-builds.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the repository gate**

Run:

```bash
bun run check
bun run verify
```

Expected: both exit 0. Read the full output and record test counts.

- [ ] **Step 7: Build the control-plane application because runtime prompt/assets changed**

Run:

```bash
bun run build
```

Expected: exit 0 and no generated route diff. This is required here because the new raw Markdown imports must be proven to survive the Nitro production bundle.

---

### Task 8: Audit the final diff and commit the implementation

**Files:**
- Review: all modified files from Tasks 1-7

- [ ] **Step 1: Audit the prompt-to-artifact checklist**

Check each explicit request against evidence:

- five source-informed skills updated and bundled;
- `read_skill` tool schema, execution, progress trace, and tests;
- system prompt and user prompt changes;
- no fabricated defaults;
- protected writes and static/portable output;
- failed build;
- successful build;
- timeout boundary based on historical project timings;
- real route/queue/SSE trigger harness without hardcoded project or credentials;
- browser runner resolves Bun/Node correctly and reports browser errors without secrets;
- deterministic anchor/SVG/token normalization preserves browser assertions;
- shadow critic remains advisory after bounded correction while hard browser gates stay blocking;
- last-known-good behavior;
- TDD red/green focused tests;
- `bun run check`, `bun run verify`, and `bun run build` output.

Any missing evidence is a blocker, not a reason to claim completion.

- [ ] **Step 2: Review the diff boundary**

Run:

```bash
git diff --check
git status --short --untracked-files=all
git diff --stat
git diff -- src/lib/projects/agentic-generator.ts src/lib/projects/skills/skill-registry.ts src/lib/projects/generated-source.ts src/lib/config/app-settings-registry.ts DEV.md
```

Confirm no `.env`, `.data`, screenshots, logs, `.firecrawl`, private evidence, or generated junk is tracked.

- [ ] **Step 3: Commit the implementation**

```bash
git add DEV.md package.json docs/superpowers/specs/2026-08-20-agentic-skill-runtime-design.md docs/superpowers/plans/2026-08-20-agentic-skill-runtime.md scripts/trigger-project-build.ts scripts/trigger-project-build.test.ts src/lib/projects/skills src/lib/projects/scaffold src/lib/projects/agentic-generator.ts src/lib/projects/agentic-generator.test.ts src/lib/projects/build-attempt-worker.ts src/lib/projects/build-attempt-worker.test.ts src/lib/projects/generated-source.ts src/lib/projects/generated-source.test.ts src/lib/projects/generated-site-browser-runner.ts src/lib/projects/generated-site-browser-runner.test.ts src/lib/projects/generated-site-gates.ts src/lib/projects/generated-site-gates.test.ts src/lib/projects/generated-site-qualification.ts src/lib/projects/generated-site-qualification.test.ts src/lib/config/app-settings-registry.ts src/lib/config/app-settings-registry.test.ts src/lib/projects/build-logs.test.ts
git commit -m "feat(agentic): enforce grounded skill workflow"
```

Expected: one atomic local commit after all gates pass. Do not push.
