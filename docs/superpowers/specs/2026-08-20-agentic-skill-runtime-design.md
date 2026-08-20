# Agentic skill runtime and build outcome contract

**Date:** 2026-08-20  
**Status:** Approved for implementation  
**Supersedes:** The documentation-only boundary in `2026-08-20-generated-skills-simplification-design.md`  
**Project under verification:** `cmt0psnpm000d4l6g17qd4gfs`

## Decision

Wire the five project-local skills into the existing agentic generator through one bounded `read_skill` tool. Keep the skills as imported Markdown assets so the tool works in the production Nitro bundle without reading source files from disk at runtime.

The agent must read the four core skills before it can write or check generated source:

- `impeccable-craft`
- `vercel-web-design`
- `indonesian-umkm`
- `shadcn-ui`

It reads `emil-motion` when the planned interface contains motion or a motion-capable component. The runtime records every skill read in the operation trace and fails closed if the core set was not read, no custom source was written, or the final agent-side `check_app` did not pass.

The generated site remains a static Vite + React + TanStack Router + Tailwind CSS v4 application. The skills govern decisions; they do not add network access, shell access, MCP, Browserbase, BrowserStack, Storybook, Lighthouse, axe-core, or new generated dependencies.

Build outcome taxonomy stays backward-compatible. A build that exceeds the execution deadline persists as `ProjectBuild.status = "failed"`, with `classifyBuildFailure(log) = "timeout"` and the existing Indonesian timeout summary. No new `timed_out` database enum or status migration is needed.

## Why the runtime must bundle Markdown

The current Docker runner copies the Nitro output, public assets, Prisma files, and thumbnail script. It does not copy `src/lib/projects/skills/`. Reading Markdown with a runtime filesystem path would therefore work locally and fail after deployment.

`src/lib/projects/skills/skill-registry.ts` imports each `SKILL.md` through Vite's `?raw` asset loader and exposes a typed registry. The generated server bundle carries the same source-informed skill text that reviewers inspect in the repository.

## Skill source and adaptation policy

The local documents are tailored adaptations of the primary sources, not hidden copies presented as original work:

- Impeccable: `pbakaus/impeccable/.claude/skills/impeccable/SKILL.md`, version 4.1.1 at audit time. Keep the context gate, mode selection, command/workflow routing, design authority, and bounded verification posture. Remove CLI execution and upstream detector claims because this runtime has neither.
- Vercel Web Interface Guidelines: `vercel-labs/agent-skills/skills/web-design-guidelines/SKILL.md` plus the referenced live guidelines. Keep audit posture and terse correctness rules. Apply them to generated Vite output instead of requiring a remote fetch or a Next.js runtime.
- Vercel React Best Practices: the applicable client/rendering/bundle rules from `vercel-labs/agent-skills/skills/react-best-practices/SKILL.md`. Exclude server-only Next.js rules.
- Emil Kowalski: `emilkowalski/skills/skills/review-animations/SKILL.md`, `improve-animations/SKILL.md`, and the cited animation principles. Keep purpose, frequency, easing, duration, origin, interruptibility, GPU properties, and reduced-motion rules. The runtime uses the document as an advisor, not as a source-editing command.
- shadcn: `shadcn-ui/ui/skills/shadcn/SKILL.md` and `ui.shadcn.com/docs/skills`. Keep project-context discovery, source ownership, composition, semantic tokens, and component structure. Replace CLI/MCP/registry calls with the pre-seeded local source registry and `read_file`/`write_file` composition.

Each local skill contains an attribution/reference section and project-specific rules from `PRODUCT.md`, `DESIGN.md`, and the locked scaffold. No upstream license text is copied into generated project output.

## Runtime interfaces

### Skill registry

`src/lib/projects/skills/skill-registry.ts` exports:

- `PROJECT_SKILL_NAMES`, a readonly tuple of the five names;
- `PROJECT_CORE_SKILL_NAMES`, a readonly tuple of the four mandatory names;
- `ProjectSkillName`, the union of those names;
- `readProjectSkill(name)`, returning `{ name, content }` from the raw imported Markdown registry.

The registry has no user-provided path resolution, no network access, and no fallback prose. An unknown name is rejected by the Zod tool schema and by the registry type boundary.

### `read_skill` tool

`runAgenticGenerate` registers a `read_skill` AI SDK tool with:

- `name`: an enum of `PROJECT_SKILL_NAMES`;
- optional `label` and `detail` fields for Indonesian progress events;
- an execution result containing the requested skill name and full Markdown content;
- an operation trace entry with `type: "read_skill"`, the skill name, and `state: "succeeded"`.

The tool has no write side effect. It may be called repeatedly; the trace records the first read for each name and does not duplicate the skill content in progress persistence.

### Protected writes

The agentic `write_file` tool rejects platform-owned scaffold paths, including `src/content/site.ts`, `src/index.css`, `src/main.tsx`, `src/router.tsx`, `src/routes/__root.tsx`, `src/lib/preview-ready.ts`, `src/lib/utils.ts`, and the seeded component paths. It also rejects writes until the four core skills have been read.

The model may read the starter and available shadcn sources, then write new route or component files under `src/` and public assets under `public/` subject to the existing generated path and build policy. It cannot install packages or edit configuration.

### Agent completion contract

A successful `runAgenticGenerate` result requires all of the following:

1. all four core skills were read;
2. at least one non-protected source file was written;
3. `check_app` was called at least once;
4. the last `check_app` result was successful.

A missing requirement throws a developer-facing error. The surrounding build worker already converts that error into a failed attempt, preserves any progressive source, and avoids a false success state.

`check_app` returns `ok`, bounded build errors, and a classified failure reason. It does not silently convert a failed or timed-out check into success.

## System prompt contract

Replace the current generic “world-class” prompt with a compact English developer-facing contract that:

- states that the output is a portable static Vite app, not a backend, checkout, login flow, or SaaS dashboard;
- requires `read_skill` for the four core skills before writing and requires `emil-motion` only when motion is needed;
- gives Impeccable final creative authority while Vercel reviews correctness, Indonesian UMKM owns factual copy, shadcn owns composition, and Emil reviews motion only;
- reads `src/content/site.ts` as the only customer-facing fact source;
- treats omitted values as unavailable and never turns defaults into addresses, hours, prices, testimonials, metrics, guarantees, or payment claims;
- preserves the protected scaffold and uses actual component sources returned by `list_files`/`read_file`;
- requires meaningful business-specific sections, direct visitor actions, intrinsic responsive behavior, accessible names/focus, 44px parent hit areas, and reduced motion;
- bans fake interactive state, fake trust, card soup, nested cards, gradient-tech styling, technical headings, starter residue, unapproved temporary media, external URLs, and invented claims;
- requires `list_files`, `read_file`, `read_skill`, `write_file`, and `check_app` in a visible inspect → compose → check → repair sequence;
- tells the agent to repair actual build failures with `write_file` and rerun `check_app` until the completion contract is satisfied, bounded by the existing max-step setting.

The user prompt must stop supplying fabricated values such as `Indonesia`, `08.00-21.00 WIB`, or `Terjangkau`. It labels missing facts as `NOT PROVIDED` and passes the accepted schema and frozen creative direction as data.

## Build timeout contract

Historical local `ProjectBuild` evidence for the requested project before implementation:

- succeeded: 2 builds, mean 19,222 ms, p95 21,846 ms, max 22,138 ms;
- failed: 5 builds, mean 9,161 ms, p95 11,580 ms, max 11,711 ms;
- completed builds observed: 7.

Set the default generated build execution timeout to **90,000 ms**. This is above four times the observed completed-build p95 and leaves room for a cold workspace while preventing a hung command from occupying the worker for three minutes. Keep the setting DB/env-overridable and bounded between 30,000 and 180,000 ms:

- key: `runtime.generated_build_timeout_ms`;
- env: `PROJECT_GENERATED_BUILD_TIMEOUT_MS`;
- default: `90000`;
- min: `30000`;
- max: `180000`.

`STALE_BUILD_TIMEOUT_MS` remains ten minutes so the worker deadline occurs before stale-job recovery. A command timeout emits `Build timed out.`, remains a failed build, and gets `BuildFailureReason = "timeout"`.

## Error and recovery behavior

- Missing or invalid skill names fail at the tool boundary.
- Missing core skill reads fail before source can be written.
- Failed `check_app` results remain visible in the operation trace and return bounded logs to the model.
- A timed-out build kills the child command, resolves once with a sanitized timeout log, and never produces dist artifacts.
- The outer worker keeps existing last-known-good preview/release behavior. A failed candidate never replaces a selected successful snapshot or Production pointer.
- User-facing copy stays Indonesian; prompts, logs, error identifiers, and tests stay English.

## Verification and acceptance

The implementation is complete only when fresh evidence shows:

1. every updated skill has valid agentskills frontmatter, source attribution, project constraints, and no false external-tool capability;
2. `skill-registry.test.ts` proves all five raw documents are bundled and the core tuple is stable;
3. `agentic-generator.test.ts` proves the `read_skill` tool returns the selected document, protects writes until core reads, protects scaffold files, emits skill operations, and rejects missing checks;
4. system-prompt assertions prove the prompt requires the skill workflow, removes fabricated defaults, and preserves the static-site/fact contract;
5. `generated-source.test.ts` proves configurable timeout boundaries and timeout logs through a child command or injectable runner;
6. existing focused tests, `bun run check`, and `bun run verify` pass;
7. the requested project has fresh evidence for all three outcomes: a genuine failed build, a genuine succeeded build, and a timeout build classified as `timeout` with no artifact or false success;
8. a successful candidate remains previewable and the failed/timeout candidates do not replace the selected successful preview;
9. the completion audit maps every requested file, tool, prompt rule, status, timeout, test, and command to evidence;
10. no secrets, live `.data` artifacts, screenshots, or external research cache files are tracked.

## Non-goals

- No new agent coordinator.
- No `read_skill` exposure to the user-facing discuss agent.
- No skill download/install/update service.
- No MCP or remote registry calls during generation.
- No new persisted `timed_out` status.
- No changes to the professional V2 writer protocol or its calibrated visual critic loop beyond sharing the corrected component guidance if required by tests.
- No new browser provider or heavy QA framework.
