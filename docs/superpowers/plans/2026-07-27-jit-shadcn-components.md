# JIT shadcn Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship only the shadcn components the AI actually uses, by giving the generation/repair agent a `copy_component` tool that pulls a component from an in-process registry on demand, with a `check_app` auto-resolve safety net so a missing component can never survive into a build.

**Architecture:** The `SHADCN_COMPONENT_FILES` array becomes a name→source registry (`SHADCN_COMPONENT_BY_NAME`). The starter stops wholesale-seeding all 45 components and seeds only `utils.ts`, `components.json`, `button`, `card`. A new `copy_component` agent tool copies a registry component + its transitive ui→ui deps into the in-memory file list. `check_app` mechanically auto-copies any `@/components/ui/<name>` import whose file is missing, before validation — a backstop that runs on both generate and repair passes.

**Tech Stack:** TypeScript, Vitest, the `ai` SDK `ToolLoopAgent`, Bun. No new deps.

## Global Constraints

- Use Bun only. Run tests with `bun run test` or `bunx vitest`.
- Surgical edits only — touch only what each task requires. Match surrounding style.
- User-facing copy (skill doc prose shown to the AI is developer-facing) uses English; the AI's generated UI copy stays Indonesian.
- Never bypass a failing gate. After each task run the targeted test file; before handoff run `bun run check`.
- No new dependencies. No shell on the AI agent. No `delete_file` tool.
- Keep `SHADCN_COMPONENT_FILES` (the 45-entry array) unchanged — it is the registry source of truth. The lean seed re-exports named entries from the same file.
- Pre-commit runs `bun run check:commit` (format/lint on staged only). Do not commit `.env` or build artifacts.
- Conventional Commits for every commit.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/projects/scaffold/shadcn-components.ts` | Registry source of truth; name→file map; transitive-dep resolver | Modify (add exports) |
| `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts` | Assemble the starter file list | Modify line 197 (lean seed) |
| `src/lib/projects/agent-tool-runner.ts` | Agent tool command handler; `copy_component` handler; `check_app` auto-resolve | Modify |
| `src/lib/projects/custom-source-generator.ts` | Agent tool definitions; system prompt | Modify |
| `src/lib/projects/skills/shadcn-ui.md` | AI-facing component catalog + instructions | Rewrite |
| `src/lib/projects/scaffold/scaffold.test.ts` | Scaffold tests | Modify (lean-seed assertions) |
| `src/lib/projects/scaffold/shadcn-components.test.ts` | Registry + resolver tests | Create |
| `src/lib/projects/agent-tool-runner.test.ts` | `copy_component` + auto-resolve tests | Modify (add tests) |
| `docs/architecture.md` | Canonical doc | Update component-shipping line |

---

## Task 1: Registry map + transitive-dep resolver

**Files:**
- Modify: `src/lib/projects/scaffold/shadcn-components.ts` (append after line 233)
- Create: `src/lib/projects/scaffold/shadcn-components.test.ts`
- Test: `src/lib/projects/scaffold/shadcn-components.test.ts`

**Interfaces:**
- Produces: `SHADCN_COMPONENT_BY_NAME: Map<string, GeneratedProjectFile>` — key is the bare component name (e.g. `"dialog"`), value is the `{ path, content }` entry. Only `src/components/ui/*.tsx` entries are keyed (not `utils.ts` / `components.json`).
- Produces: `resolveShadcnDeps(file: GeneratedProjectFile, present: GeneratedProjectFile[]): GeneratedProjectFile[]` — returns the transitive closure of `@/components/ui/<name>` imports reachable from `file.content`, excluding any file already in `present` (matched by `path`). Cycle-safe. Order: dependency-first (deps appear before the component that imports them).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/projects/scaffold/shadcn-components.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  resolveShadcnDeps,
  SHADCN_COMPONENT_BY_NAME,
  SHADCN_COMPONENT_FILES,
} from "./shadcn-components";

describe("SHADCN_COMPONENT_BY_NAME", () => {
  it("keys every src/components/ui/*.tsx entry by bare name", () => {
    const uiFiles = SHADCN_COMPONENT_FILES.filter((f) =>
      f.path.startsWith("src/components/ui/"),
    );
    expect(SHADCN_COMPONENT_BY_NAME.size).toBe(uiFiles.length);
    for (const f of uiFiles) {
      const name = f.path.replace("src/components/ui/", "").replace(/\.tsx$/, "");
      expect(SHADCN_COMPONENT_BY_NAME.get(name)).toBe(f);
    }
  });

  it("does not key utils.ts or components.json", () => {
    expect(SHADCN_COMPONENT_BY_NAME.has("utils")).toBe(false);
  });

  it("looks up dialog", () => {
    expect(SHADCN_COMPONENT_BY_NAME.get("dialog")?.path).toBe(
      "src/components/ui/dialog.tsx",
    );
  });
});

describe("resolveShadcnDeps", () => {
  const get = (name: string) => SHADCN_COMPONENT_BY_NAME.get(name)!;
  const paths = (files: { path: string }[]) => files.map((f) => f.path).sort();

  it("returns empty for a component with no ui deps", () => {
    const separator = get("separator");
    expect(resolveShadcnDeps(separator, [])).toEqual([]);
  });

  it("pulls a direct ui dep (alert-dialog → button)", () => {
    const alertDialog = get("alert-dialog");
    const button = get("button");
    const deps = resolveShadcnDeps(alertDialog, []);
    expect(paths(deps)).toContain("src/components/ui/button.tsx");
  });

  it("excludes deps already present", () => {
    const alertDialog = get("alert-dialog");
    const button = get("button");
    const deps = resolveShadcnDeps(alertDialog, [button]);
    expect(paths(deps)).not.toContain("src/components/ui/button.tsx");
  });

  it("resolves transitively (toggle-group → toggle)", () => {
    const toggleGroup = get("toggle-group");
    const toggle = get("toggle");
    const deps = resolveShadcnDeps(toggleGroup, []);
    expect(paths(deps)).toContain("src/components/ui/toggle.tsx");
    // toggle must appear before toggle-group (dep-first order)
    const toggleIdx = deps.findIndex((f) => f.path === toggle.path);
    const groupIdx = deps.findIndex((f) => f.path === toggleGroup.path);
    expect(toggleIdx).toBeGreaterThanOrEqual(0);
    expect(groupIdx).toBeGreaterThanOrEqual(0);
    expect(toggleIdx).toBeLessThan(groupIdx);
  });

  it("is cycle-safe", () => {
    // No real shadcn cycle exists; guard against a hypothetical self-import.
    const self = {
      content: 'import { X } from "@/components/ui/self"',
      path: "src/components/ui/self.tsx",
    };
    expect(() => resolveShadcnDeps(self, [])).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/lib/projects/scaffold/shadcn-components.test.ts`
Expected: FAIL — `resolveShadcnDeps` and `SHADCN_COMPONENT_BY_NAME` not exported.

- [ ] **Step 3: Implement the map + resolver**

Append to `src/lib/projects/scaffold/shadcn-components.ts` (after line 233, the closing `];`):

```ts
const UI_PATH_PREFIX = "src/components/ui/";
const UI_IMPORT_RE = /from\s+["']@\/components\/ui\/([a-z0-9-]+)["']/g;

export const SHADCN_COMPONENT_BY_NAME = new Map<string, GeneratedProjectFile>(
  SHADCN_COMPONENT_FILES.flatMap((file) => {
    if (!file.path.startsWith(UI_PATH_PREFIX) || !file.path.endsWith(".tsx")) {
      return [];
    }
    const name = file.path.slice(UI_PATH_PREFIX.length, -".tsx".length);
    return [[name, file] as const];
  }),
);

/**
 * Transitive closure of `@/components/ui/<name>` imports reachable from `file`.
 * Excludes files already in `present` (matched by path). Cycle-safe via a
 * visited set. Returns deps-first order: a dependency appears before the
 * component that imports it.
 */
export function resolveShadcnDeps(
  file: GeneratedProjectFile,
  present: GeneratedProjectFile[],
): GeneratedProjectFile[] {
  const presentPaths = new Set(present.map((f) => f.path));
  const ordered: GeneratedProjectFile[] = [];
  const visited = new Set<string>();

  function visit(current: GeneratedProjectFile) {
    if (visited.has(current.path)) {
      return;
    }
    visited.add(current.path);
    for (const match of current.content.matchAll(UI_IMPORT_RE)) {
      const depName = match[1];
      const dep = SHADCN_COMPONENT_BY_NAME.get(depName);
      if (!dep || presentPaths.has(dep.path) || dep.path === current.path) {
        continue;
      }
      visit(dep);
    }
    if (!presentPaths.has(current.path) && current.path !== file.path) {
      ordered.push(current);
    }
  }

  visit(file);
  return ordered;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/lib/projects/scaffold/shadcn-components.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/scaffold/shadcn-components.ts src/lib/projects/scaffold/shadcn-components.test.ts
git commit -m "feat(scaffold): add SHADCN_COMPONENT_BY_NAME map + resolveShadcnDeps resolver"
```

---

## Task 2: Lean seed in the starter

**Files:**
- Modify: `src/lib/projects/scaffold/shadcn-components.ts` (add named re-exports)
- Modify: `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts:1,197`
- Modify: `src/lib/projects/scaffold/scaffold.test.ts:169-208` (the `SHADCN_COMPONENT_FILES` block stays; the starter-seed test changes)
- Test: `src/lib/projects/scaffold/scaffold.test.ts`

**Interfaces:**
- Produces: `SHADCN_UTILS_FILE`, `SHADCN_COMPONENTS_JSON_FILE`, `SHADCN_BUTTON_FILE`, `SHADCN_CARD_FILE` — re-exported `GeneratedProjectFile` entries the starter imports by name.

- [ ] **Step 1: Write the failing test**

In `src/lib/projects/scaffold/scaffold.test.ts`, add a new `describe` block after the existing `SHADCN_COMPONENT_FILES` block (keep the existing block unchanged — it still tests the registry array):

```ts
describe("starter lean seed (JIT)", () => {
  it("seeds only utils, components.json, button, card from shadcn", () => {
    const files = createViteTanStackShadcnStarterFiles("proj_jit", schema());
    const uiFiles = files
      .filter((f) => f.path.startsWith("src/components/ui/"))
      .map((f) => f.path)
      .sort();
    expect(uiFiles).toEqual(
      ["src/components/ui/button.tsx", "src/components/ui/card.tsx"].sort(),
    );
    expect(files.map((f) => f.path)).toContain("src/lib/utils.ts");
    expect(files.map((f) => f.path)).toContain("components.json");
  });
});
```

Ensure `createViteTanStackShadcnStarterFiles` is imported at the top of the file (check existing imports; if only `SHADCN_COMPONENT_FILES` is imported, add the starter import). If a `schema()` helper is not already defined in this file, use the existing fixture pattern — search for the function the existing tests use to build a schema and reuse it.

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/projects/scaffold/scaffold.test.ts -t "starter lean seed"`
Expected: FAIL — starter still seeds all 45 components (`uiFiles` length 45, not 2).

- [ ] **Step 3: Add named re-exports to the registry**

In `src/lib/projects/scaffold/shadcn-components.ts`, after the `SHADCN_COMPONENT_FILES` array (and the new exports from Task 1), add:

```ts
export const SHADCN_UTILS_FILE = SHADCN_COMPONENT_FILES.find(
  (f) => f.path === "src/lib/utils.ts",
)!;
export const SHADCN_COMPONENTS_JSON_FILE = SHADCN_COMPONENT_FILES.find(
  (f) => f.path === "components.json",
)!;
export const SHADCN_BUTTON_FILE = SHADCN_COMPONENT_BY_NAME.get("button")!;
export const SHADCN_CARD_FILE = SHADCN_COMPONENT_BY_NAME.get("card")!;
```

- [ ] **Step 4: Replace the wholesale spread in the starter**

In `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts`:

Change the import at line 1 from:
```ts
import { SHADCN_COMPONENT_FILES } from "./shadcn-components";
```
to:
```ts
import {
  SHADCN_BUTTON_FILE,
  SHADCN_CARD_FILE,
  SHADCN_COMPONENTS_JSON_FILE,
  SHADCN_UTILS_FILE,
} from "./shadcn-components";
```

Replace line 197 `...SHADCN_COMPONENT_FILES,` with:
```ts
    SHADCN_UTILS_FILE,
    SHADCN_COMPONENTS_JSON_FILE,
    SHADCN_BUTTON_FILE,
    SHADCN_CARD_FILE,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx vitest run src/lib/projects/scaffold/scaffold.test.ts`
Expected: PASS — lean-seed test green, existing registry tests still green.

- [ ] **Step 6: Run the broader package-policy regression test**

Run: `bunx vitest run src/lib/projects/generated-package-policy.test.ts`
Expected: PASS — the policy test iterates the unchanged `SHADCN_COMPONENT_FILES` array, unaffected.

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/scaffold/shadcn-components.ts src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts src/lib/projects/scaffold/scaffold.test.ts
git commit -m "feat(scaffold): seed only utils/components.json/button/card, drop wholesale shadcn spread"
```

---

## Task 3: `copy_component` agent tool — command type + handler

**Files:**
- Modify: `src/lib/projects/agent-tool-runner.ts:17-34` (command union), `49-55` (output type), `270-370` (handler, insert after `write_file` block)
- Modify: `src/lib/projects/agent-tool-runner.ts` imports (add `SHADCN_COMPONENT_BY_NAME`, `resolveShadcnDeps`)
- Test: `src/lib/projects/agent-tool-runner.test.ts` (add tests)

**Interfaces:**
- Produces (command type): `{ name: string; type: "copy_component" }` added to `GeneratedAppAgentToolCommand`.
- Produces (handler behavior): on unknown name → `{ error: "Unknown shadcn component: <name>", type: "copy_component" }` + `hasToolError = true` + `emitFailed`. On already-present → `{ result: "already-present", type: "copy_component" }`, no file change, no `changedSinceLastCheck`. On success → copies `file` + `resolveShadcnDeps(file, currentFiles)` via `upsertFile`, sets `changedSinceLastCheck = true`, pushes `sideEffects` for each copied path, emits one success op, returns `{ result: "copied: <name>, <depNames...>", type: "copy_component" }`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/projects/agent-tool-runner.test.ts`, add (reuse the existing `createFixtureFiles` helper that returns the starter file set — verify it exists; the tests below assume `runGeneratedAppAgentTools({ commands, files })` returns `{ files, outputs, ok }`):

```ts
import { SHADCN_COMPONENT_BY_NAME } from "@/lib/projects/scaffold/shadcn-components";

describe("copy_component command", () => {
  it("copies a leaf component with no deps (separator)", () => {
    const { files, outputs } = runGeneratedAppAgentTools({
      commands: [{ name: "separator", type: "copy_component" }],
      files: createFixtureFiles(),
    });
    expect(files.map((f) => f.path)).toContain(
      "src/components/ui/separator.tsx",
    );
    expect(outputs.at(-1)?.result).toContain("copied: separator");
  });

  it("copies a component and its transitive dep (alert-dialog → button is already seeded, but dialog → no extra; use form which needs label)", () => {
    const { files } = runGeneratedAppAgentTools({
      commands: [{ name: "alert-dialog", type: "copy_component" }],
      files: createFixtureFiles(),
    });
    // alert-dialog imports button (already seeded) — only alert-dialog added
    const ui = files.filter((f) => f.path.startsWith("src/components/ui/"));
    expect(ui.map((f) => f.path)).toContain("src/components/ui/alert-dialog.tsx");
  });

  it("pulls a missing transitive dep (toggle-group → toggle)", () => {
    const { files } = runGeneratedAppAgentTools({
      commands: [{ name: "toggle-group", type: "copy_component" }],
      files: createFixtureFiles(),
    });
    expect(files.map((f) => f.path)).toContain(
      "src/components/ui/toggle-group.tsx",
    );
    expect(files.map((f) => f.path)).toContain("src/components/ui/toggle.tsx");
  });

  it("is idempotent — second copy is a no-op", () => {
    const once = runGeneratedAppAgentTools({
      commands: [{ name: "separator", type: "copy_component" }],
      files: createFixtureFiles(),
    });
    const twice = runGeneratedAppAgentTools({
      commands: [{ name: "separator", type: "copy_component" }],
      files: once.files,
    });
    expect(twice.outputs.at(-1)?.result).toBe("already-present");
    expect(twice.files).toEqual(once.files);
  });

  it("errors on an unknown component name", () => {
    const { outputs, ok } = runGeneratedAppAgentTools({
      commands: [{ name: "nope-not-real", type: "copy_component" }],
      files: createFixtureFiles(),
    });
    expect(ok).toBe(false);
    expect(outputs.at(-1)?.error).toContain("Unknown shadcn component");
  });

  it("sanitizes the name (rejects path traversal)", () => {
    const { outputs, ok } = runGeneratedAppAgentTools({
      commands: [{ name: "../../etc/passwd", type: "copy_component" }],
      files: createFixtureFiles(),
    });
    expect(ok).toBe(false);
    expect(outputs.at(-1)?.error).toContain("Unknown shadcn component");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/lib/projects/agent-tool-runner.test.ts -t "copy_component"`
Expected: FAIL — `copy_component` not a known command type / handler missing.

- [ ] **Step 3: Add the command type + output type**

In `src/lib/projects/agent-tool-runner.ts`:

Add to the import block at the top (after the existing `@/lib/projects/...` imports):

```ts
import {
  resolveShadcnDeps,
  SHADCN_COMPONENT_BY_NAME,
} from "@/lib/projects/scaffold/shadcn-components";
```

Add a new variant to the `GeneratedAppAgentToolCommand` union (after the `read_skill` line, before the closing `;`):

```ts
  | { name: string; type: "copy_component" }
```

- [ ] **Step 4: Implement the handler**

In `runGeneratedAppAgentTools` (inside the `for (const command of commands)` loop), insert a new block immediately after the `write_file` block (which ends around line 304 with `continue;`) and before the `replace_in_file` block:

```ts
    if (command.type === "copy_component") {
      const name = command.name.replace(/[^a-z0-9-]/g, "");
      const file = SHADCN_COMPONENT_BY_NAME.get(name);

      if (!file) {
        hasToolError = true;
        const error = `Unknown shadcn component: ${command.name}`;
        emitFailed("Komponen tidak ditemukan", error, command.type);
        outputs.push({ error, type: command.type });
        continue;
      }

      if (currentFiles.some((f) => f.path === file.path)) {
        emit({
          detail: `Komponen "${name}" sudah ada.`,
          path: file.path,
          state: "succeeded",
          title: "Menyalin komponen",
          type: command.type,
        });
        outputs.push({ result: "already-present", type: command.type });
        continue;
      }

      const toAdd = [file, ...resolveShadcnDeps(file, currentFiles)];
      for (const component of toAdd) {
        currentFiles = upsertFile(currentFiles, component);
        sideEffects.push({ path: component.path, type: command.type });
      }
      changedSinceLastCheck = true;
      const names = toAdd
        .map((f) => f.path.replace("src/components/ui/", "").replace(/\.tsx$/, ""))
        .join(", ");
      emit({
        detail: `Menyalin komponen: ${names}`,
        state: "succeeded",
        title: "Menyalin komponen",
        type: command.type,
      });
      outputs.push({ result: `copied: ${names}`, type: command.type });
      continue;
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx vitest run src/lib/projects/agent-tool-runner.test.ts`
Expected: PASS — all 6 new tests green, existing tests still green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/agent-tool-runner.ts src/lib/projects/agent-tool-runner.test.ts
git commit -m "feat(agent-tools): add copy_component command that pulls a shadcn component + deps"
```

---

## Task 4: Expose `copy_component` to the AI

**Files:**
- Modify: `src/lib/projects/custom-source-generator.ts:435-482` (`createAgentTools`)
- Test: `src/lib/projects/agent-tool-runner.test.ts` (the tool surface is exercised via `runGeneratedAppAgentTools`; add one assertion that the tool is wired if a direct test is feasible, otherwise rely on Task 3's tests)

**Interfaces:**
- Produces: a `copy_component` tool on the `ToolLoopAgent` tools object with `inputSchema: z.object({ name: z.string() })` that calls `runCommand({ name, type: "copy_component" })`.

- [ ] **Step 1: Write the failing test**

In `src/lib/projects/agent-tool-runner.test.ts`, add a test that exercises the tool through the agent path is not unit-testable without an LLM; instead assert the tool wiring indirectly. Skip a new test here — Task 3 already covers command handling. The wiring is verified by the build in Task 7's end-to-end check. Add a lightweight type-level check instead: a test that imports `createAgentTools` is impractical (needs a `RunCommand`). Rely on the typecheck step below.

> If a direct unit test for the tool definition is desired, the `RunCommand` type can be faked: `const runCommand = (c) => runGeneratedAppAgentTools({ commands: [c], files: [] }).outputs.at(-1)!`. Add this test:

```ts
// At top, add to imports:
import { describe, expect, it } from "vitest";
// (already imported in this file)

describe("copy_component tool wiring", () => {
  it("is exposed on the writable agent tools", async () => {
    const { createAgentTools } = await import("@/lib/projects/custom-source-generator");
    const runCommand = (c: any) =>
      runGeneratedAppAgentTools({ commands: [c], files: createFixtureFiles() }).outputs.at(-1)!;
    const tools = createAgentTools(runCommand as never, "proj_test");
    expect(tools.copy_component).toBeDefined();
    const out = await tools.copy_component.execute({ name: "separator" });
    expect((out as { result?: string }).result).toContain("copied: separator");
  });
});
```

> Check whether `createAgentTools` is exported from `custom-source-generator.ts`. If it is not exported, export it (add `export` to `function createAgentTools`). This is the minimal change to make it testable; it does not widen the public API in a meaningful way because the module already exports many helpers.

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/projects/agent-tool-runner.test.ts -t "copy_component tool wiring"`
Expected: FAIL — `copy_component` undefined on tools.

- [ ] **Step 3: Add the tool definition**

In `src/lib/projects/custom-source-generator.ts`, in `createAgentTools` (line 435), add `copy_component` to the returned object, after `write_file` and before `replace_in_file`:

```ts
    copy_component: tool({
      description:
        "Add a shadcn/ui component into src/components/ui/ from the platform registry. Use this instead of hand-writing component source. Pulls transitive ui deps automatically. Idempotent. Available names: accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, calendar, carousel, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, skeleton, slider, sonner, spinner, switch, table, tabs, textarea, toggle, toggle-group, tooltip.",
      inputSchema: z.object({ name: z.string() }),
      execute: ({ name }) => runCommand({ name, type: "copy_component" }),
    }),
```

- [ ] **Step 4: Export `createAgentTools` if not already exported**

In `src/lib/projects/custom-source-generator.ts`, change `function createAgentTools(` to `export function createAgentTools(` if it is not already exported.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx vitest run src/lib/projects/agent-tool-runner.test.ts -t "copy_component tool wiring"`
Expected: PASS.

Run the typecheck: `bunx tsc --noEmit -p tsconfig.json` (or the repo's typecheck script — check `package.json` for the exact script name, likely `bun run typecheck`).
Expected: PASS — no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/custom-source-generator.ts src/lib/projects/agent-tool-runner.test.ts
git commit -m "feat(agent): expose copy_component tool to generation + repair agents"
```

---

## Task 5: `check_app` auto-resolve safety net

**Files:**
- Modify: `src/lib/projects/agent-tool-runner.ts:439` (`checkGeneratedApp`)
- Test: `src/lib/projects/agent-tool-runner.test.ts` (add tests)

**Interfaces:**
- Produces: `checkGeneratedApp` now auto-copies any `@/components/ui/<name>` import whose file is missing from the project (and that name exists in `SHADCN_COMPONENT_BY_NAME`), including transitive deps, before running the existing validators. Returns the auto-resolved file list (callers already use the return value's `files`).

- [ ] **Step 1: Write the failing tests**

In `src/lib/projects/agent-tool-runner.test.ts`, add:

```ts
describe("check_app auto-resolves missing shadcn imports", () => {
  it("copies a missing component referenced by a src file", () => {
    const fixture = createFixtureFiles();
    // Add a src file that imports dialog without calling copy_component
    const filesWithMissingImport = [
      ...fixture,
      {
        content:
          'import { Dialog } from "@/components/ui/dialog";\nexport const X = () => null;',
        path: "src/routes/test.tsx",
      },
    ];
    const { files } = runGeneratedAppAgentTools({
      commands: [{ type: "check_app" }],
      files: filesWithMissingImport,
    });
    expect(files.map((f) => f.path)).toContain(
      "src/components/ui/dialog.tsx",
    );
  });

  it("does not touch a src file that imports only already-seeded components", () => {
    const fixture = createFixtureFiles();
    const before = fixture;
    const { files } = runGeneratedAppAgentTools({
      commands: [{ type: "check_app" }],
      files: [
        ...before,
        {
          content:
            'import { Button } from "@/components/ui/button";\nexport const X = () => null;',
          path: "src/routes/test.tsx",
        },
      ],
    });
    // No new ui file added (button already present)
    const uiCount = files.filter((f) =>
      f.path.startsWith("src/components/ui/"),
    ).length;
    expect(uiCount).toBe(
      before.filter((f) => f.path.startsWith("src/components/ui/")).length,
    );
  });

  it("ignores imports of components not in the registry (AI hand-written)", () => {
    const fixture = createFixtureFiles();
    const { files } = runGeneratedAppAgentTools({
      commands: [{ type: "check_app" }],
      files: [
        ...fixture,
        {
          content:
            'import { Thing } from "@/components/ui/custom-thing";\nexport const X = () => null;',
          path: "src/routes/test.tsx",
        },
      ],
    });
    expect(files.map((f) => f.path)).not.toContain(
      "src/components/ui/custom-thing.tsx",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/lib/projects/agent-tool-runner.test.ts -t "check_app auto-resolves"`
Expected: FAIL — `check_app` does not copy missing components yet.

- [ ] **Step 3: Implement auto-resolve in `checkGeneratedApp`**

In `src/lib/projects/agent-tool-runner.ts`, modify `checkGeneratedApp` (line 439). It currently takes `files` and returns `{ issues, ok }`. Change it to also return the (possibly augmented) file list and resolve imports first.

Replace the `checkGeneratedApp` function with:

```ts
const UI_IMPORT_RE = /from\s+["']@\/components\/ui\/([a-z0-9-]+)["']/g;

function autoResolveShadcnImports(
  files: GeneratedProjectFile[],
): GeneratedProjectFile[] {
  const presentPaths = new Set(files.map((f) => f.path));
  let resolved = files;
  let changed = true;
  // Iterate until fixpoint: a newly-copied component may itself import another
  // missing component (transitive), and copy_component's dep resolver already
  // handles one level — loop to cover the full closure.
  while (changed) {
    changed = false;
    const referenced = new Set<string>();
    for (const file of resolved) {
      if (!file.path.startsWith("src/") || !file.path.endsWith(".tsx")) {
        continue;
      }
      for (const match of file.content.matchAll(UI_IMPORT_RE)) {
        referenced.add(match[1]);
      }
    }
    for (const name of referenced) {
      const target = SHADCN_COMPONENT_BY_NAME.get(name);
      if (!target || presentPaths.has(target.path)) {
        continue;
      }
      const toAdd = [target, ...resolveShadcnDeps(target, resolved)];
      for (const component of toAdd) {
        if (presentPaths.has(component.path)) {
          continue;
        }
        resolved = upsertFile(resolved, component);
        presentPaths.add(component.path);
        changed = true;
      }
    }
  }
  return resolved;
}

function checkGeneratedApp(
  files: GeneratedProjectFile[],
): { files: GeneratedProjectFile[]; issues: string[]; ok: boolean } {
  const resolvedFiles = autoResolveShadcnImports(files);
  try {
    assertGeneratedResourceBudget(resolvedFiles, "source");
  } catch (error) {
    return {
      files: resolvedFiles,
      issues: [
        error instanceof Error
          ? error.message
          : "Generated source exceeds platform limits.",
      ],
      ok: false,
    };
  }

  const manifestResult = validateGeneratedAppManifest(resolvedFiles);

  if (!manifestResult.ok) {
    return { files: resolvedFiles, issues: manifestResult.issues, ok: false };
  }

  const buildPolicyResult = validateGeneratedBuildPolicy(
    resolvedFiles,
    manifestResult.manifest.runtimeProfile,
  );

  if (!buildPolicyResult.ok) {
    return { files: resolvedFiles, issues: buildPolicyResult.issues, ok: false };
  }

  const designIssues = getGeneratedDesignIssues(resolvedFiles);

  if (designIssues.length) {
    return { files: resolvedFiles, issues: designIssues, ok: false };
  }

  return { files: resolvedFiles, issues: [], ok: true };
}
```

Then update the single call site in `runGeneratedAppAgentTools` (around line 399):

```ts
    check = checkGeneratedApp(currentFiles);
    currentFiles = check.files;
    changedSinceLastCheck = false;
    sideEffects.push({ type: command.type });
    emit({
      detail: check.ok
        ? "Manifest dan package policy valid."
        : check.issues.join("\n"),
      state: check.ok ? "succeeded" : "failed",
      title: check.ok ? "Mengecek app" : "Check app gagal",
      type: command.type,
    });
    outputs.push({
      result: check.ok ? "passed" : check.issues.join("\n"),
      type: command.type,
    });
```

Check `checkGeneratedApp` is not called from anywhere else (`grep -n "checkGeneratedApp" src/lib/projects/agent-tool-runner.ts`). If the final post-loop check (line 416) or the return statement references `check`, ensure `files: currentFiles` in the return uses the updated list (it already does — `currentFiles` is reassigned above).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/lib/projects/agent-tool-runner.test.ts`
Expected: PASS — all new auto-resolve tests green, all existing tests green (the `check` shape change is internal; existing tests that call `check_app` still get `outputs`/`files` back).

If an existing test asserts `checkGeneratedApp`'s return shape directly, update it to read `.files` from the new return. Search: `grep -rn "checkGeneratedApp\|check\.files\|\.ok" src/lib/projects/agent-tool-runner.test.ts` — only fix tests that break.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/agent-tool-runner.ts src/lib/projects/agent-tool-runner.test.ts
git commit -m "feat(agent-tools): check_app auto-copies missing shadcn imports before validation"
```

---

## Task 6: Rewrite the AI-facing skill doc + system prompt

**Files:**
- Modify: `src/lib/projects/skills/shadcn-ui.md` (rewrite)
- Modify: `src/lib/projects/custom-source-generator.ts:2128` (system prompt line)

**Interfaces:**
- Produces: updated `shadcn-ui.md` describing JIT semantics + the full available-names list; updated prompt line instructing `copy_component`.

- [ ] **Step 1: Rewrite the skill doc**

Replace the entire contents of `src/lib/projects/skills/shadcn-ui.md` with:

```md
---
name: shadcn-ui
description: shadcn/ui conventions for UMKM Cepat generated apps — pull components on demand with copy_component, cn() helper, no CLI.
---

# shadcn/ui (UMKM Cepat)

- Components live in `src/components/ui/`. Only `button` and `card` are pre-seeded (plus `cn()` in `src/lib/utils.ts` and `components.json`).
- To use any other shadcn primitive, call `copy_component("name")`. It writes the canonical shadcn "new-york" + Tailwind v4 source into `src/components/ui/<name>.tsx` and pulls any other components it depends on automatically. Idempotent — safe to call repeatedly.
- After copying, import as normal: `import { Dialog } from "@/components/ui/dialog"`.
- Available names (call copy_component with one of these):
  - **forms**: `button` (seeded), `input`, `label`, `checkbox`, `select`, `form`, `radio-group`, `switch`, `textarea`
  - **overlays**: `dialog`, `sheet`, `drawer`, `popover`, `hover-card`, `dropdown-menu`, `context-menu`, `menubar`
  - **navigation**: `navigation-menu`, `breadcrumb`, `pagination`, `tabs`, `accordion`, `collapsible`, `command`
  - **data-display**: `table`, `card` (seeded), `badge`, `avatar`, `separator`, `scroll-area`, `skeleton`, `progress`, `aspect-ratio`
  - **feedback**: `sonner`, `alert`, `alert-dialog`, `tooltip`, `spinner`
  - **extras**: `slider`, `carousel`, `toggle`, `toggle-group`, `input-otp`, `calendar`, `resizable`
- **Use these. Do not hand-roll custom widgets** (no custom `.btn`, no hand-written dropdowns). Call `copy_component` then compose the primitive.
- **Do NOT run a CLI** (no `npx shadcn add`, no `bunx`). If a component you need is not in the list above, write its source into `src/components/ui/<name>.tsx` per the canonical shadcn "new-york" + Tailwind v4 shape: import `cn` from `@/lib/utils`, use Radix primitives, style with Tailwind utilities + theme vars.
- Styling is Tailwind utility classes + `bg-background`/`text-foreground`/`bg-primary` vars. Never custom CSS classes.
- `cn()` merges classes conditionally — use it for variants: `className={cn("base classes", isActive && "active classes")}`.
```

- [ ] **Step 2: Update the system prompt line**

In `src/lib/projects/custom-source-generator.ts`, line 2128, replace:

```
- If you need a shadcn component not pre-seeded, write its source into src/components/ui/<name>.tsx (canonical new-york + Tailwind v4 shape, import cn from "@/lib/utils"). No CLI at build time.
```

with:

```
- Only button + card are pre-seeded. If you need any other shadcn component, call copy_component("name") — it writes the canonical new-york + Tailwind v4 source + transitive deps into src/components/ui/. Do not hand-write component source when copy_component covers it. No CLI at build time.
```

- [ ] **Step 3: Verify the skill loads**

Run: `bunx vitest run src/lib/projects/agent-tool-runner.test.ts -t "read_skill"` (if a read_skill test exists; otherwise skip — the doc is plain markdown with no runtime behavior).
Expected: PASS or no matching test (acceptable).

Run the full project test suite to confirm no regression: `bunx vitest run src/lib/projects/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/projects/skills/shadcn-ui.md src/lib/projects/custom-source-generator.ts
git commit -m "feat(skills): rewrite shadcn-ui doc + prompt for JIT copy_component"
```

---

## Task 7: Docs + final gate

**Files:**
- Modify: `docs/architecture.md:172` (the shadcn shipping line)
- Test: full gate

- [ ] **Step 1: Update the architecture doc**

In `docs/architecture.md`, find the line describing shadcn shipping (around line 172, per the audit: "shadcn/ui 'new-york' components, source-copied verbatim from the canonical shadcn registry into `src/components/ui/*` at scaffold time (button, card, badge, input, label, separator)..."). Update it to reflect JIT:

```
- shadcn/ui "new-york" components are source-copied verbatim from the canonical shadcn registry into `src/components/ui/*`. Only `button`, `card`, `src/lib/utils.ts`, and `components.json` are seeded at scaffold time; every other component is pulled just-in-time by the generation/repair agent via the `copy_component` tool (`src/lib/projects/agent-tool-runner.ts`), which reads from the in-process `SHADCN_COMPONENT_BY_NAME` registry (`src/lib/projects/scaffold/shadcn-components.ts`). `check_app` auto-copies any `@/components/ui/<name>` import whose file is missing, so a missing component cannot survive into a build. No shadcn CLI runs at build time.
```

Search `docs/architecture.md` and `DESIGN.md` for any other mention of "pre-seeded" shadcn components and align them. If `DESIGN.md` line ~254 says "pre-seeded primitives are `button`, `card`, `badge`, `input`, `label`, `separator`", update to: "pre-seeded primitives are `button` and `card`; every other shadcn component is pulled on demand via `copy_component`."

- [ ] **Step 2: Run the full project test suite**

Run: `bunx vitest run src/lib/projects/`
Expected: PASS — all green.

- [ ] **Step 3: Run the full quality gate**

Run: `bun run check`
Expected: PASS — format/lint/typecheck/affected tests/Knip all green.

If Knip reports an unused export (e.g. `SHADCN_UTILS_FILE` is used only in the starter; `createAgentTools` is now exported), confirm each new export has a consumer. If Knip flags `createAgentTools` as unused (only the test imports it), Knip's test-awareness should cover it — verify by running Knip; if it complains, the test import counts as a consumer.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture.md DESIGN.md
git commit -m "docs(architecture): document JIT shadcn component pulling via copy_component"
```

---

## Self-Review

**Spec coverage:**
- Registry map + resolver → Task 1. ✓
- Lean seed → Task 2. ✓
- `copy_component` tool (command + handler) → Task 3. ✓
- Expose tool to AI → Task 4. ✓
- `check_app` auto-resolve safety net → Task 5. ✓
- Skill doc + prompt rewrite → Task 6. ✓
- Architecture doc → Task 7. ✓
- Repair-path coverage: the repair agent reuses `createAgentTools` (Task 4's tool is shared) and `check_app` (Task 5 runs on every check, generate or repair) — covered by design, no separate task needed. ✓
- No `package.json` dep pruning — explicit non-goal, no task. ✓
- Coexistence (old projects untouched) — no migration task needed; lean seed only affects new scaffolds. ✓

**Placeholder scan:** No TBD/TODO/"implement later". Every code step shows full code. The Task 4 test note about exporting `createAgentTools` is conditional on its current visibility — that's a concrete instruction ("if not already exported, export it"), not a placeholder.

**Type consistency:** `SHADCN_COMPONENT_BY_NAME`, `resolveShadcnDeps`, `SHADCN_UTILS_FILE`, etc. are named identically across tasks. `checkGeneratedApp` return shape change (`{ files, issues, ok }`) is reflected in the updated call site. Command variant `{ name: string; type: "copy_component" }` matches the handler's `command.name` access. `copy_component` tool name matches across definition, prompt, and skill doc.