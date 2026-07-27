# JIT shadcn Components — Pull on Demand, Not Wholesale Seed

**Status:** Design — awaiting approval.
**Date:** 2026-07-27.
**Author:** brainstorming session.

## Context

Every generated UMKM Cepat project is born with 45 shadcn "new-york" v4 components source-copied verbatim into `src/components/ui/`. The wholesale seed happens at `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts:197` via `...SHADCN_COMPONENT_FILES`. The starter's own example routes (`routes/index.tsx`, `routes/not-found.tsx`) import only **2** of those 45 — `button` and `card`. The other 43 ship as dead source in every project the user receives and inspects.

Vite tree-shakes unused components out of the final `dist/` bundle, so the *deployed* bundle is unaffected. The cost is repo bloat in the generated source the user inspects/edits, plus a misleading signal: "you have 45 components available" when really each project uses a handful.

The component sources already live in-process as `SHADCN_COMPONENT_FILES` (`src/lib/projects/scaffold/shadcn-components.ts:182`) — a 45-entry array of `{ path, content }`. This is the natural registry. The AI generation agent (`ToolLoopAgent` in `src/lib/projects/custom-source-generator.ts`) already has `write_file`/`replace_in_file` tools into `src/**`, plus a post-edit `check_app` validator and a build-log-driven repair pass (`repairGeneratedProjectFiles`, line 2147) that reuses the same toolset. No shell, no `delete_file`.

## Goal

Ship only the components the AI actually uses. Give the AI a tool to pull a component from the in-process registry just-in-time, instead of pre-seeding all 45. Make the pull self-healing so a missing component cannot survive into a build.

## Non-goals

- **No per-component `package.json` dep pruning.** The 25 `@radix-ui/*` + helper deps stay in the generated `package.json`. Vite already strips unused ones from the bundle; pruning the dep list per-component is plumbing with no real win. `ponytail:` revisit if `bun install` latency becomes a problem.
- **No new dependency, no shell on the AI, no delete tool.**
- **No migration of existing generated projects.** Only newly-scaffolded projects get the lean seed.

## Design

### The registry (existing, extended)

`src/lib/projects/scaffold/shadcn-components.ts` keeps `SHADCN_COMPONENT_FILES` as the source of truth. Add:

- `SHADCN_COMPONENT_BY_NAME: Map<string, GeneratedProjectFile>` — name → file, for O(1) lookup by the new tool.
- `resolveShadcnDeps(file, present): GeneratedProjectFile[]` — static-scans `file.content` for `from "@/components/ui/<name>"`, returns the transitive closure of ui→ui deps not already in `present`. Cycle-safe via a visited set. Pure, no agent-tool-runner dependency, unit-testable in isolation.

`utils.ts` + `components.json` are always seeded (every project needs `cn()` and the shadcn config). `button` + `card` are seeded because the starter's own example routes import them.

### The tool: `copy_component(name)`

New agent tool, defined in `createAgentTools` (`custom-source-generator.ts:435`) and handled in `runGeneratedAppAgentTools` (`agent-tool-runner.ts:79`).

- **Input:** `{ name: string }`. Name is sanitized to `[a-z0-9-]`.
- **Behavior:** look up `SHADCN_COMPONENT_BY_NAME.get(name)`. If missing → tool error (unknown component). If the file is already in the project → idempotent no-op, return `already-present`. Otherwise copy the file **and** its `resolveShadcnDeps` into the in-memory file list via `upsertFile`. Marks `changedSinceLastCheck = true`.
- **Path guard:** none needed — `src/components/ui/*` is not platform-owned (`isPlatformOwnedGeneratedPath` only guards `components.json`, `package.json`, manifest, vite config). The AI could already `write_file` there; `copy_component` just makes it not hand-write.

New command variant in the `GeneratedAppAgentToolCommand` union: `{ name: string; type: "copy_component" }`.

### The safety net: `check_app` auto-resolve

In `checkGeneratedApp` (`agent-tool-runner.ts:439`), before manifest validation: scan every `src/**/*.tsx` for `from "@/components/ui/<name>"`. For any `<name>` that is in `SHADCN_COMPONENT_BY_NAME` but whose file is not in the project, auto-copy it (plus deps). This runs on **both** generate and repair passes.

This converts "the AI probably calls `copy_component`" into "the system mechanically guarantees the file exists before any build." The repair loop (`repairGeneratedProjectFiles`) only fires for real errors, not missing-component noise.

### Stopping the wholesale seed

`vite-tanstack-shadcn-starter.ts:197` replaces `...SHADCN_COMPONENT_FILES` with the 4 always-needed files: `src/lib/utils.ts`, `components.json`, `src/components/ui/button.tsx`, `src/components/ui/card.tsx`. These are re-exported from `shadcn-components.ts` so the starter imports them by name, not by reaching into the array.

### AI-facing docs + prompt

- `src/lib/projects/skills/shadcn-ui.md` rewritten: state that only `button` + `card` are pre-seeded, list all 43 other available names, instruct the AI to call `copy_component("<name>")` instead of hand-writing source. No `list_files` round-trip needed.
- `src/lib/projects/custom-source-generator.ts:2128` system prompt line: replace "write its source into `src/components/ui/<name>.tsx`" with "call `copy_component("name")`".

### Repair behavior (the user's explicit concern)

The repair loop already reuses `createAgentTools` (line 2207) — the repair AI has `copy_component`. If a build fails with `Cannot find module '@/components/ui/dialog'`, the repair AI sees that error and can call `copy_component("dialog")`. Combined with the `check_app` auto-resolve running on the repair pass too, a missing component cannot survive: either the repair AI calls the tool, or `check_app` copies it mechanically. Belt + suspenders.

## Coexistence / migration

Old generated projects (already built with all 45 seeded) are untouched — they keep their files. Only newly-scaffolded projects get the lean seed. No DB migration, no re-build of existing projects.

## Risks

- **AI hand-writes instead of calling the tool.** Mitigated by the skill doc rewrite + prompt line change + `check_app` auto-resolve (mechanical backstop).
- **Transitive dep missed.** Mitigated by `resolveShadcnDeps` static scan + the auto-resolve using the same resolver.
- **Repair AI misdiagnoses missing-module error.** Mitigated by `check_app` auto-resolve — the missing file is copied before the repair AI even sees the build log on its next `check_app` call.
- **Registry drift.** If a future shadcn component adds a new cross-dep not in the current set, `resolveShadcnDeps` handles it automatically (it scans source, not a hardcoded dep table). The package-policy test already asserts every registry import is in the scaffold `package.json` — that stays valid since the registry array is unchanged.

## Test strategy

- Unit: `SHADCN_COMPONENT_BY_NAME` lookup; `resolveShadcnDeps` transitive closure + cycle safety; `copy_component` handler (idempotent, unknown-name error, transitive copy).
- Integration: `runGeneratedAppAgentTools` with a `copy_component` command against a minimal fixture; assert the file + deps land in the output file list.
- `check_app` auto-resolve: a fixture that imports `@/components/ui/dialog` without calling `copy_component` → after `check_app`, `dialog.tsx` is present.
- Scaffold: assert the starter now seeds exactly `utils.ts`, `components.json`, `button.tsx`, `card.tsx` (and the rest are absent).
- Regression: the existing `generated-package-policy.test.ts` "every import in seeded component sources is in scaffold package.json" still passes — it iterates the unchanged `SHADCN_COMPONENT_FILES` array.

## Out of scope (deliberate simplifications)

- Per-component dependency pruning in `package.json`. `ponytail:` revisit if install latency matters.
- A separate JSON component manifest. `SHADCN_COMPONENT_FILES` is the registry; no second source of truth.
- Deleting stale registry components an earlier AI decision pulled but a later edit stopped importing. Matches today's behavior (no delete tool); acceptable. `ponytail:` add a `check_app` prune step if the source repo must be fully clean.