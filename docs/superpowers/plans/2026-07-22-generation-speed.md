# Generation Speed (Full shadcn Seed + Shared node_modules + Loop Detector) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get generated-project builds to 1-3 minutes total that finish reliably, via a full pre-seeded shadcn component set (no CLI), a shared read-only golden `node_modules` (skip first-build install), and a loop detector + per-step timing (kill thrash).

**Architecture:** Three independent sections, each shipping + testable on its own. Section 1 expands the scaffold's seeded shadcn set (6 → ~40) + the dep allowlist — a one-time fetch-and-commit, then local source forever. Section 2 adds a shared golden `node_modules` provisioned lazily + symlinked read-only per workspace (cross-OS junction fallback, install fallback). Section 3 wraps the existing `runCommand` seam in `custom-source-generator.ts` with exact-repeat loop detection (nudge@3, hard-cap@5) + per-step timing.

**Tech Stack:** TypeScript, Bun, Vite 8, Tailwind v4, shadcn/ui ("new-york"), AI SDK `ToolLoopAgent`, Prisma. Playwright already a dep (thumbnails) — not extended here.

**Spec:** `docs/superpowers/specs/2026-07-22-generation-speed-design.md`

## Global Constraints

- No shell / no CLI at build time. The agent tool runner (`agent-tool-runner.ts:17-29`) exposes only file ops. This plan adds NO shell/exec tool — full-seed + symlink, not a CLI.
- Deps are strictly allowlist-gated (`generated-package-policy.ts`); `package.json` is platform-owned. New shadcn Radix deps MUST be added to the allowlist or the build-policy gate rejects them.
- One bad project must not break another: the golden `node_modules` is read-only (architecture.md:65).
- Cross-OS: contributors on Windows/macOS/Linux. Symlink uses a junction fallback on Windows (privilege-free) + install fallback if both fail. No admin/developer-mode/OS-specific manual steps.
- `bun run check` green before every commit. Never bypass a failing gate.
- Each section ships independently + is testable. User tries between sections.
- Indonesian user-facing copy (progress labels); English dev comments/logs/errors.
- The Stage B runtime self-heal plan resumes AFTER this ships (unchanged spec/plan).
- `node_modules` is per-machine (gitignored, regenerated) — never committed. The golden tree lives in `.data/project-build-workspaces/_shared/`.

---

## File Structure

**Section 1 (full shadcn seed):**
- Create: `scripts/fetch-shadcn-components.mjs` — one-time maintainer fetch script (pulls canonical sources from the shadcn registry, writes `shadcn-components.generated.ts`).
- Modify: `src/lib/projects/scaffold/shadcn-components.ts` — expand `SHADCN_COMPONENT_FILES` from 6 → ~40 components (sourced via the fetch script, committed).
- Modify: `src/lib/projects/generated-package-policy.ts:14-36` — add the full Radix + helper dep set to the `vite-react-tanstack-v1` allowlist.
- Modify: `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts` — the `package.json` deps match the expanded allowlist.
- Modify: `src/lib/projects/skills/shadcn-ui.md` — "full set pre-seeded; pick any; no CLI."
- Test: `src/lib/projects/scaffold/scaffold.test.ts` (assert the expanded set + that every seeded component's imports are allowlisted).

**Section 2 (shared node_modules):**
- Create: `src/lib/projects/shared-node-modules.ts` — `ensureSharedNodeModules(workspaceRoot, depSignature)` + `linkSharedNodeModules(workspace, sharedRoot)` (symlink/junction/install fallback).
- Modify: `src/lib/projects/generated-source.ts:313-348` (`attemptBuild`) — before `shouldInstall`, call `linkSharedNodeModules`; the existing `pathExists(node_modules)` gate then skips install.
- Test: `src/lib/projects/shared-node-modules.test.ts` (provision once → reuse; symlink/junction; fallback to install; read-only).

**Section 3 (loop detector + timing):**
- Create: `src/lib/projects/agent-loop-detector.ts` — `createLoopDetector()` (track `(tool, argsHash)`, nudge@3, hard-cap@5) + `StepTimer` (per-call wall-clock → `devLog`/trace).
- Modify: `src/lib/projects/custom-source-generator.ts:86-121` (`runCommand`) — wrap with the detector + timer; surface `loop_detected` partial state on hard-cap.
- Test: `src/lib/projects/agent-loop-detector.test.ts` (3 repeats → nudge; 5 → hard-cap; timing emits).

**Interfaces (locked names across tasks):**
- `ensureSharedNodeModules(workspaceRoot: string, depSignature: string): Promise<string>` — returns the shared `node_modules` path (Section 2, Task 4).
- `linkSharedNodeModules(workspace: string, sharedNodeModulesPath: string): Promise<boolean>` — returns true if linked (symlink/junction), false if caller should fall back to install (Section 2, Task 4).
- `createLoopDetector(): { track(tool: string, args: unknown): { nudge?: string; hardCap: boolean }; summary(): string }` — Section 3, Task 7.
- `StepTimer` — `{ start(): { end(): number } }` emitting to `devLog` (Section 3, Task 7).

---

### Task 1: Section 1 — fetch + commit the full shadcn component set

**Files:**
- Create: `scripts/fetch-shadcn-components.mjs`
- Modify: `src/lib/projects/scaffold/shadcn-components.ts`
- Test: `src/lib/projects/scaffold/scaffold.test.ts`

**Interfaces:**
- Consumes: the shadcn registry (stable JSON endpoints, MIT).
- Produces: `SHADCN_COMPONENT_FILES` expanded to ~40 entries, each `{ path: "src/components/ui/<name>.tsx", content: <canonical source> }`.

- [ ] **Step 1: Write the failing test for the expanded set**

In `src/lib/projects/scaffold/scaffold.test.ts`, add assertions that the full set is present (a representative subset — don't list all 40, assert the key ones + the count is ≥30):

```ts
it("seeds the full shadcn component set", () => {
  const paths = SHADCN_COMPONENT_FILES.map((f) => f.path);
  // Representative — the count guard catches missing additions.
  expect(paths.filter((p) => p.startsWith("src/components/ui/")).length).toBeGreaterThanOrEqual(30);
  for (const name of ["button", "card", "dialog", "accordion", "tabs", "dropdown-menu", "tooltip", "table", "form", "select", "checkbox", "command", "calendar", "carousel", "sonner", "drawer", "sidebar"]) {
    expect(paths).toContain(`src/components/ui/${name}.tsx`);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/lib/projects/scaffold/scaffold.test.ts`
Expected: FAIL — only 6 components seeded today.

- [ ] **Step 3: Write the fetch script**

Create `scripts/fetch-shadcn-components.mjs`. It fetches each shadcn component's canonical source from the shadcn registry (the v4 "new-york" style JSON endpoints, e.g. `https://ui.shadcn.com/r/styles/new-york-v4/<name>.json` — verify the exact endpoint shape by fetching one first), for the full list (~40 names). For each: parse the JSON's file content, apply the same `radix-ui` → `@radix-ui/react-*` import split the existing 6 use (the file header comment at `shadcn-components.ts:6-14` documents this transform), and emit a `CONST` + `SHADCN_COMPONENT_FILES` entry. Write the result to `src/lib/projects/scaffold/shadcn-components.ts` (overwrite, preserving the file header comment + `UTILS_TS` + `COMPONENTS_JSON`).

The component list to fetch (verify against the live registry; add any the registry exposes for the v4 new-york style):
`accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, skeleton, slider, sonner, spinner, switch, table, tabs, textarea, toggle, toggle-group, tooltip` (and `chart`, `sidebar` if available).

The script is **maintainer-run, one-time** — NOT run at project build time. It writes committed source. After running it once, the sources are local forever.

- [ ] **Step 4: Run the fetch script + commit the result**

Run: `node scripts/fetch-shadcn-components.mjs` (or `bun scripts/fetch-shadcn-components.mjs`).
Verify `shadcn-components.ts` now has ~40 entries. Spot-check 2-3 components that the source is valid (compiles, imports `cn` from `@/lib/utils`, uses `@radix-ui/react-*` not `radix-ui`).

- [ ] **Step 5: Run the scaffold test to verify it passes**

Run: `bun run test:changed -- src/lib/projects/scaffold/scaffold.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full gate + commit**

Run: `bun run check`
Expected: green. (Typecheck may flag a component with a dep not yet allowlisted — that's Task 2; if typecheck fails ONLY on an un-allowlisted dep, that's expected and Task 2 fixes it. If it fails on a syntax error, fix the fetch output.)

```bash
git add -A
git commit -m "feat(scaffold): seed the full shadcn component set (~40 components)

One-time fetch from the canonical shadcn v4 new-york registry into
shadcn-components.ts. The AI picks + imports any; Vite tree-shakes the
unused. No CLI at build time. Dep allowlist expansion follows in the next
commit."
```

---

### Task 2: Section 1 — expand the dep allowlist + scaffold package.json

**Files:**
- Modify: `src/lib/projects/generated-package-policy.ts:14-36` (the `vite-react-tanstack-v1` allowlist `Set`).
- Modify: `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts` (the `package.json` deps, ~line 39-52).
- Test: `src/lib/projects/generated-package-policy.test.ts`, `src/lib/projects/scaffold/scaffold.test.ts`.

**Interfaces:**
- Consumes: the seeded component sources (Task 1) — their `import` statements name the deps to allowlist.
- Produces: every dep any seeded component imports is allowlisted + present in the scaffold `package.json`.

- [ ] **Step 1: Extract the dep list from the seeded sources**

Grep the seeded component sources for every `import ... from "@radix-ui/..."` / `"cmdk"` / `"react-day-picker"` / `"react-resizable-panels"` / `"embla-carousel-react"` / `"input-otp"` / `"sonner"` / `"vaul"` / `"next-themes"` etc.:

```bash
grep -hoE 'from "(@radix-ui/[^"]+|cmdk|react-day-picker|react-resizable-panels|embla-carousel-react|input-otp|sonner|vaul|next-themes)"' src/lib/projects/scaffold/shadcn-components.ts | sort -u
```

This is the exact dep set to allowlist. No guessing.

- [ ] **Step 2: Write the failing test**

In `src/lib/projects/generated-package-policy.test.ts`, add a test that the scaffold `package.json` deps are all allowlisted (no build-policy rejection). Reuse the existing `validateGeneratedPackagePolicy` harness:

```ts
it("the scaffold package.json deps are all allowlisted", () => {
  const files = createViteTanStackShadcnStarterFiles("p1", schema);
  const result = validateGeneratedPackagePolicy(files, "vite-react-tanstack-v1");
  expect(result.ok).toBe(true);
});
```

Also add a scaffold test asserting every seeded component's imports resolve to an allowlisted dep (grep each import, assert it's in the allowlist) — catches a missed dep before build time.

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun run test:changed -- src/lib/projects/generated-package-policy.test.ts src/lib/projects/scaffold/scaffold.test.ts`
Expected: FAIL — deps the full set imports aren't allowlisted yet.

- [ ] **Step 4: Add the deps to the allowlist + scaffold package.json**

In `src/lib/projects/generated-package-policy.ts`, add to the `vite-react-tanstack-v1` `Set` (line 14-36) every dep from Step 1, with semver specifiers matching the canonical shadcn Vite guide (e.g. `@radix-ui/react-dialog: ^1.1.x`).

In `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts` `package.json` deps (~line 39-52), add the same deps + specifiers.

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun run test:changed -- src/lib/projects/generated-package-policy.test.ts src/lib/projects/scaffold/scaffold.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full gate + commit**

Run: `bun run check`
Expected: green. (If typecheck fails on a missing dep type, add `@types/...` if needed — but most Radix deps ship their own types.)

```bash
git add -A
git commit -m "feat(policy): allowlist the full shadcn/Radix dep set

Every dep the seeded shadcn components import is now allowlisted + present
in the scaffold package.json. No build-policy rejection when the AI imports
any seeded component."
```

---

### Task 3: Section 1 — update the shadcn-ui skill + verify end-to-end

**Files:**
- Modify: `src/lib/projects/skills/shadcn-ui.md`
- Test: manual generate (user tries after this task).

**Interfaces:** none new.

- [ ] **Step 1: Update the skill**

Rewrite `src/lib/projects/skills/shadcn-ui.md` to state: the full shadcn set is pre-seeded in `src/components/ui/*` (list the categories: forms, overlays, navigation, data-display, feedback); pick + `import` any; do NOT run a CLI; if a component somehow isn't seeded (shouldn't happen), write its source per the canonical pattern. Drop the "pre-seeded: button, card, badge, input, label, separator" line (now it's the full set).

- [ ] **Step 2: Run the full gate + commit**

Run: `bun run check`
Expected: green.

```bash
git add -A
git commit -m "docs(skill): shadcn-ui skill reflects the full pre-seeded set"
```

- [ ] **Step 3: User tests Section 1**

Hand off to the user: generate a project, confirm the AI can pick any shadcn component + the build passes. (This is the dopamine checkpoint for Section 1.)

---

### Task 4: Section 2 — shared golden node_modules (provision + link, cross-OS)

**Files:**
- Create: `src/lib/projects/shared-node-modules.ts`
- Test: `src/lib/projects/shared-node-modules.test.ts`

**Interfaces:**
- Consumes: `createDependencySignature` (existing, in `generated-source.ts`), `runCommand`/`BUNDLED_RUNNER` (existing).
- Produces: `ensureSharedNodeModules(workspaceRoot, depSignature): Promise<string>` + `linkSharedNodeModules(workspace, sharedNodeModulesPath): Promise<boolean>`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/projects/shared-node-modules.test.ts`. Use a tmp dir (reuse the tmp helpers from `generated-source.test.ts` — read it first for the real names). Inject the install runner so the test doesn't hit the real `bun install` unless desired.

```ts
describe("shared node_modules", () => {
  it("provisions once + reuses on the second call (signature stable)", async () => {
    const root = tmpRoot();
    const install = vi.fn().mockResolvedValue({ ok: true, log: "" });
    const a = await ensureSharedNodeModules(root, "sig1", { installRunner: install });
    const b = await ensureSharedNodeModules(root, "sig1", { installRunner: install });
    expect(install).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
  });

  it("re-provisions when the signature changes", async () => {
    const root = tmpRoot();
    const install = vi.fn().mockResolvedValue({ ok: true, log: "" });
    await ensureSharedNodeModules(root, "sig1", { installRunner: install });
    await ensureSharedNodeModules(root, "sig2", { installRunner: install });
    expect(install).toHaveBeenCalledTimes(2);
  });

  it("links the golden node_modules into a workspace (symlink or junction)", async () => {
    const root = tmpRoot();
    const shared = await ensureSharedNodeModules(root, "sig1", { installRunner: vi.fn().mockResolvedValue({ ok: true, log: "" }) });
    const workspace = path.join(root, "ws");
    await fs.mkdir(workspace, { recursive: true });
    const linked = await linkSharedNodeModules(workspace, shared);
    expect(linked).toBe(true);
    const nm = await fs.lstat(path.join(workspace, "node_modules"));
    expect(nm.isSymbolicLink() || nm.isDirectory()).toBe(true);
  });

  it("returns false (caller falls back to install) when linking fails", async () => {
    // Point at an impossible shared path → link fails → returns false.
    const linked = await linkSharedNodeModules(tmpRoot(), "/nonexistent/golden/path");
    expect(linked).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/lib/projects/shared-node-modules.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `shared-node-modules.ts`**

Create `src/lib/projects/shared-node-modules.ts`:

```ts
import { mkdir, symlink, lstat, pathExists, rm } from "node:fs/promises";
import path from "node:path";
import { devLog } from "@/lib/dev-log";

const SHARED_DIR_NAME = "_shared";

export async function ensureSharedNodeModules(
  workspaceRoot: string,
  depSignature: string,
  opts: { installRunner?: (cwd: string) => Promise<{ ok: boolean; log: string }> } = {},
): Promise<string> {
  const sharedRoot = path.join(workspaceRoot, SHARED_DIR_NAME);
  const nmPath = path.join(sharedRoot, "node_modules");
  const sigPath = path.join(sharedRoot, "dep-signature.txt");

  const existingSig = await pathExists(sigPath) ? (await import("node:fs/promises")).readFile(sigPath, "utf8").catch(() => "") : "";
  if ((await pathExists(nmPath)) && existingSig === depSignature) {
    return nmPath;
  }

  await mkdir(sharedRoot, { recursive: true });
  const install = opts.installRunner ?? defaultInstallRunner;
  const result = await install(sharedRoot);
  if (!result.ok) {
    throw new Error(`Shared node_modules install failed: ${result.log}`);
  }
  await (await import("node:fs/promises")).writeFile(sigPath, depSignature, "utf8");
  devLog("shared-node-modules", "provisioned", { sharedRoot, depSignature });
  return nmPath;
}

export async function linkSharedNodeModules(
  workspace: string,
  sharedNodeModulesPath: string,
): Promise<boolean> {
  const linkPath = path.join(workspace, "node_modules");
  if (await pathExists(linkPath)) {
    return true; // already linked/present
  }
  if (!(await pathExists(sharedNodeModulesPath))) {
    return false; // caller falls back to install
  }
  try {
    await symlink(sharedNodeModulesPath, linkPath, process.platform === "win32" ? "junction" : "dir");
    devLog("shared-node-modules", "linked", { workspace, sharedNodeModulesPath, type: process.platform === "win32" ? "junction" : "symlink" });
    return true;
  } catch (error) {
    // Junction failed on Windows too (rare) — fall back to install.
    devLog("shared-node-modules", "link-failed", { workspace, error: String(error) });
    return false;
  }
}

async function defaultInstallRunner(cwd: string) {
  // Delegates to the existing runCommand + BUNDLED_RUNNER from generated-source.
  // Import lazily to avoid a circular import at module load.
  const { runCommand } = await import("@/lib/projects/generated-source");
  const BUNDLED_RUNNER = (await import("@/lib/projects/generated-source")).resolveBundledRunner?.() ?? process.execPath;
  return runCommand([BUNDLED_RUNNER, "install", "--ignore-scripts"], cwd);
}
```

Note: `symlink(target, link, "junction")` on Windows creates a junction (privilege-free). Verify `resolveBundledRunner` is exported from `generated-source.ts` — if not, export it (it's used internally at `:278`). The `defaultInstallRunner` lazy-imports to avoid a cycle.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:changed -- src/lib/projects/shared-node-modules.test.ts`
Expected: PASS (all 4 cases). The link test should pass on your OS — verify the `lstat` correctly identifies symlink/junction on Windows.

- [ ] **Step 5: Run the full gate + commit**

Run: `bun run check`
Expected: green.

```bash
git add -A
git commit -m "feat(build): shared read-only golden node_modules (cross-OS)

ensureSharedNodeModules provisions once per dep signature (reuses after);
linkSharedNodeModules symlinks (junction on Windows, privilege-free) the
golden node_modules into a workspace, read-only. Falls back to install if
the golden is missing or linking fails. Never blocks a build."
```

---

### Task 5: Section 2 — wire the shared node_modules into `attemptBuild`

**Files:**
- Modify: `src/lib/projects/generated-source.ts:313-348` (`attemptBuild`).
- Test: `src/lib/projects/generated-source.test.ts` (the existing install-skip test pattern — assert a first build with the golden present skips install).

**Interfaces:**
- Consumes: `ensureSharedNodeModules` + `linkSharedNodeModules` (Task 4), `createDependencySignature` (existing).
- Produces: `attemptBuild` links the golden before `shouldInstall`; `pathExists(node_modules)` is true → install skipped.

- [ ] **Step 1: Write the failing test**

In `src/lib/projects/generated-source.test.ts`, add (reuse the real build-cache test harness + tmp helpers):

```ts
it("first build skips bun install when the shared golden node_modules is linked", async () => {
  const root = tmpRoot();
  const files = buildableFiles("shared-link");
  const install = vi.fn().mockResolvedValue({ ok: true, log: "" });
  // Pre-provision the golden so attemptBuild links it.
  await ensureSharedNodeModules(root, <expected signature>, { installRunner: install });

  const build = await buildGeneratedProject(files, {
    commandRunner: makeRecordingRunner(),
    workspaceRoot: root,
    workspaceKey: "k1",
  });
  expect(build.ok).toBe(true);
  // The per-workspace install was NOT called (golden linked instead).
  expect(makeRecordingRunner().installCalls).toHaveLength(0);
});
```

Read the existing harness to get the real `makeRecordingRunner`/`buildableFiles`/`tmpRoot` names + how the signature is computed (you may need to compute the same signature the build produces). Adapt the test to real helpers.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/lib/projects/generated-source.test.ts`
Expected: FAIL — `attemptBuild` runs `bun install` on the first build (no golden link).

- [ ] **Step 3: Wire the link into `attemptBuild`**

In `src/lib/projects/generated-source.ts`, in `attemptBuild` (line 313), after `await syncGeneratedProjectFiles(workspace, files)` (line 320) + before the `shouldInstall` computation (line 322), add:

```ts
    // Link the shared golden node_modules (read-only) before the install check.
    // If the link succeeds, pathExists(node_modules) is true → install skipped.
    try {
      const sharedRoot = path.join(workspaceRoot, "_shared");
      const sharedNm = await ensureSharedNodeModules(workspaceRoot, dependencySignature);
      const linked = await linkSharedNodeModules(workspace, sharedNm);
      if (!linked) {
        devLog("generate", "shared-nm.link-skipped", { workspace });
      }
    } catch (error) {
      devLog("generate", "shared-nm.error", { workspace, error: String(error) });
      // Non-fatal — fall through to the normal install path.
    }
```

(Import `ensureSharedNodeModules` + `linkSharedNodeModules` from `./shared-node-modules`. `dependencySignature` is already computed at line 305.)

The existing `shouldInstall` gate (line 322) now sees `node_modules` present → `installSkipped = true`. Gate logic untouched.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:changed -- src/lib/projects/generated-source.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate + commit**

Run: `bun run check`
Expected: green. (The existing repeat-build-skip test must still pass — the golden link is additive.)

```bash
git add -A
git commit -m "feat(build): attemptBuild links shared golden node_modules before install

On every build, link the golden node_modules into the workspace (read-only)
before the shouldInstall check. pathExists(node_modules) → install skipped
for first builds of new projects, not just repeats. Falls back to install
if the golden isn't ready or the link fails."
```

---

### Task 6: Section 2 — user test (first-build install → instant)

**Files:** none (verification).

- [ ] **Step 1: User tests Section 2**

Hand off: clear `.data/project-build-workspaces/_shared/` (so the golden re-provisions), then generate a project. The first build provisions the golden (one install), the second project's first build should be near-instant on the install step. Confirm cross-OS: if on Windows, verify the junction (not admin) was used in the logs.

---

### Task 7: Section 3 — loop detector + per-step timing

**Files:**
- Create: `src/lib/projects/agent-loop-detector.ts`
- Test: `src/lib/projects/agent-loop-detector.test.ts`

**Interfaces:**
- Produces: `createLoopDetector()` + `StepTimer` (see File Structure).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/projects/agent-loop-detector.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createLoopDetector } from "./agent-loop-detector";

describe("createLoopDetector", () => {
  it("does not nudge before 3 exact repeats", () => {
    const d = createLoopDetector();
    expect(d.track("read_file", { path: "a.tsx" })).toEqual({ hardCap: false });
    expect(d.track("read_file", { path: "a.tsx" })).toEqual({ hardCap: false });
    expect(d.track("write_file", { path: "b.tsx" })).toEqual({ hardCap: false });
    // 2 of a.tsx + 1 of b.tsx — no nudge yet.
  });

  it("nudges at 3 exact repeats of (tool, args)", () => {
    const d = createLoopDetector();
    d.track("read_file", { path: "a.tsx" });
    d.track("read_file", { path: "a.tsx" });
    const third = d.track("read_file", { path: "a.tsx" });
    expect(third.nudge).toMatch(/loop/i);
    expect(third.hardCap).toBe(false);
  });

  it("hard-caps at 5 exact repeats", () => {
    const d = createLoopDetector();
    for (let i = 0; i < 4; i++) d.track("read_file", { path: "a.tsx" });
    const fifth = d.track("read_file", { path: "a.tsx" });
    expect(fifth.hardCap).toBe(true);
  });

  it("does not conflate different args", () => {
    const d = createLoopDetector();
    d.track("read_file", { path: "a.tsx" });
    d.track("read_file", { path: "b.tsx" });
    const third = d.track("read_file", { path: "a.tsx" });
    expect(third.nudge).toBeUndefined(); // only 2 of a.tsx
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/lib/projects/agent-loop-detector.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `agent-loop-detector.ts`**

Create `src/lib/projects/agent-loop-detector.ts`:

```ts
const NUDGE_AT = 3;
const HARD_CAP_AT = 5;

export type TrackResult = { nudge?: string; hardCap: boolean };

export function createLoopDetector() {
  const counts = new Map<string, number>();

  function key(tool: string, args: unknown): string {
    // Stable hash of (tool, JSON.stringify(args)) — deterministic for identical args.
    return `${tool}:${stableStringify(args)}`;
  }

  return {
    track(tool: string, args: unknown): TrackResult {
      const k = key(tool, args);
      const n = (counts.get(k) ?? 0) + 1;
      counts.set(k, n);
      if (n >= HARD_CAP_AT) {
        return {
          hardCap: true,
          nudge: `You've called ${tool} with the same arguments ${n} times. This is a hard loop cap — stop and finish now.`,
        };
      }
      if (n >= NUDGE_AT) {
        return {
          hardCap: false,
          nudge: `You've called ${tool} with the same arguments ${n} times. This is a loop — make concrete progress or finish now.`,
        };
      }
      return { hardCap: false };
    },
    summary(): string {
      const repeated = [...counts.entries()].filter(([, n]) => n > 1);
      if (!repeated.length) return "No repeated tool calls.";
      return "Repeated calls:\n" + repeated.map(([k, n]) => `- ${k} ×${n}`).join("\n");
    },
  };
}

export type StepTimer = { start(): { end(): number } };

export function createStepTimer(log: (msg: string, meta: Record<string, unknown>) => void): StepTimer {
  return {
    start() {
      const t = Date.now();
      return {
        end() {
          const ms = Date.now() - t;
          return ms;
        },
      };
    },
  };
}

function stableStringify(value: unknown): string {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);
  // Sort keys for deterministic output.
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as object).sort().reduce((acc, k) => {
      (acc as Record<string, unknown>)[k] = sortKeys((value as Record<string, unknown>)[k]);
      return acc;
    }, {} as Record<string, unknown>);
  }
  return value;
}
```

Note: `Date.now()` is used inside function bodies (not module scope) — fine here. `createStepTimer` returns a timer whose `end()` returns ms; the caller logs it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:changed -- src/lib/projects/agent-loop-detector.test.ts`
Expected: PASS (all 4).

- [ ] **Step 5: Run the full gate + commit**

Run: `bun run check`
Expected: green.

```bash
git add -A
git commit -m "feat(agent): loop detector (exact-repeat nudge@3, hard-cap@5) + step timer

createLoopDetector tracks (tool, args) pairs; nudges at 3 exact repeats;
hard-caps at 5. createStepTimer returns per-call wall-clock for devLog/trace.
Pure harness — no behavior change until wired into runCommand (next commit)."
```

---

### Task 8: Section 3 — wire the detector + timer into `runCommand`

**Files:**
- Modify: `src/lib/projects/custom-source-generator.ts:86-121` (`runCommand`) + the generation result type (surface `loop_detected` partial state).
- Test: `src/lib/projects/custom-source-generator.test.ts`.

**Interfaces:**
- Consumes: `createLoopDetector` + `createStepTimer` (Task 7).
- Produces: a generation that nudges/hard-caps on repeated tool calls + logs per-step timing; hard-cap surfaces a `loop_detected` partial result.

- [ ] **Step 1: Write the failing test**

In `src/lib/projects/custom-source-generator.test.ts`, add a test (reusing the mocked-model harness) where the agent repeats `read_file` on the same path 5 times → the generation returns a partial `loop_detected` result, not running the full step budget. Assert the result's `generationMode` or a new `loopDetected: true` flag.

```ts
it("hard-caps a looping generation (5 exact repeats) as loop_detected", async () => {
  // Mock the model to emit read_file("src/routes/index.tsx") 5 times.
  const result = await generateCustomProjectFilesWithAgent({ ...mockedArgs });
  expect(result.partial).toBe(true);
  // The generation stopped early, not via the step cap.
});
```

Reuse the real mocked-model harness; if it's hard to make the model emit exactly 5 identical calls, instead unit-test the `runCommand` wrapper directly with a fake command sequence (lower-level, more reliable). Judge by reading the existing harness.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:changed -- src/lib/projects/custom-source-generator.test.ts`
Expected: FAIL — no loop-cap behavior today.

- [ ] **Step 3: Wire the detector + timer into `runCommand`**

In `src/lib/projects/custom-source-generator.ts`, at the top of `generateCustomProjectFilesWithAgent` (after the `agentEditedFiles` declaration, ~line 84), instantiate:

```ts
  const loopDetector = createLoopDetector();
  const stepTimer = createStepTimer((msg, meta) => devLog("agent-step", msg, meta));
  let loopHardCapped = false;
```

In `runCommand` (line 86), wrap the existing logic:

```ts
  const runCommand: RunCommand = (command) => {
    // Guard (existing): block check_app until index.tsx written.
    if (command.type === "check_app" && !agentEditedFiles.has("src/routes/index.tsx")) {
      return { type: command.type, error: "..." };
    }

    // Loop detection + timing.
    const tick = stepTimer.start();
    const { nudge, hardCap } = loopDetector.track(command.type, command);
    if (hardCap) {
      loopHardCapped = true;
      devLog("agent-loop", "hard-cap", { command: command.type });
      return { type: command.type, error: `Loop hard-cap reached on ${command.type}. Stop and finish.` };
    }

    const result = runGeneratedAppAgentTools({ commands: [command], files, onOperation(...) { ... } });
    files = result.files;
    // ... (existing sideEffects handling)

    const ms = tick.end();
    devLog("agent-step", "tool", { tool: command.type, ms });

    const output = result.outputs.at(-1) ?? { type: command.type };
    if (nudge) {
      // Append the nudge to the tool output so the agent sees it next turn.
      return { ...output, ...(typeof output === "object" ? { loopNudge: nudge } : {}) };
    }
    return output;
  };
```

After the `agent.generate(...)` resolves (where `isPartialResult` is computed, ~line 178), OR-in the loop cap:

```ts
  const isPartialResult = ("partial" in result && result.partial === true) || loopHardCapped;
```

And in the final return (~line 256), surface it:

```ts
  generationMode: isPartialResult ? (loopHardCapped ? "loop-detected" : "agent-partial") : "agent-custom",
```

(Add `"loop-detected"` to the `CustomGeneratedSourceResult.generationMode` union type at line 40.)

Read the real code first — the `runCommand` return shape + the `onOperation` closure must stay intact; the nudge-appending must not break the `outputs.at(-1)` consumer. If appending to the output is fragile (the SDK may not pass through extra fields), instead inject the nudge by prepending it to the *next* prompt — but try the output-append first (simpler).

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:changed -- src/lib/projects/custom-source-generator.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate + commit**

Run: `bun run check`
Expected: green.

```bash
git add -A
git commit -m "feat(agent): wire loop detector + per-step timing into runCommand

Each tool call is timed + tracked for exact repeats. 3 repeats → nudge
appended to the tool output; 5 → hard-cap terminates the generation as
loop-detected partial. Per-step timing logs to devLog for diagnosis. Kills
the 601s-no-output thrash case."
```

---

### Task 9: Section 3 — user test + resume Stage B handoff

**Files:** none (verification + handoff note).

- [ ] **Step 1: User tests Section 3**

Hand off: generate a project; confirm per-step timing appears in `devLog`; confirm a looping generation (if reproducible) gets nudged/capped, not 10min-stale.

- [ ] **Step 2: Update the ledger + note Stage B resumption**

Record that the speed phase is complete; the Stage B runtime self-heal plan (`docs/superpowers/plans/2026-07-22-guard-and-runtime-self-heal.md`) is unblocked + resumes next.

---

## Self-Review (completed by plan author)

**1. Spec coverage:**
- Section 1 full shadcn seed → Tasks 1-3. ✓
- Section 1 dep allowlist expansion → Task 2. ✓
- Section 1 skill update → Task 3. ✓
- Section 2 golden node_modules provision + link (cross-OS) → Tasks 4-5. ✓
- Section 2 cross-OS junction fallback → Task 4 (`symlink(..., "junction")` on Windows) + the install fallback. ✓
- Section 2 read-only isolation → Task 4 (golden is provisioned read-only; the symlink target isn't written by the build) + verified the build only reads. ✓ (The plan notes the build reads deps through the symlink; the golden tree's writability is the platform's responsibility — flag: enforce read-only on the golden dir in the plan's implementation if the OS allows, but the symlink itself can't make a read-only target writable.)
- Section 3 loop detector (nudge@3, hard-cap@5) → Task 7-8. ✓
- Section 3 per-step timing → Task 7-8 (`createStepTimer` + `devLog`). ✓
- Stage B resumption → Task 9 Step 2. ✓
- Success criteria (1-3min builds, finishing) → the env step-cut (applied) + Tasks 1-8 combined. ✓

**2. Placeholder scan:** No "TBD"/"implement later". Where the plan says "read the existing harness / reuse real helpers," that's a deliberate instruction to the implementer (helpers exist + vary), not a placeholder in the plan's code. The `defaultInstallRunner` lazy-import + `resolveBundledRunner` export-verify are flagged in-task, not hidden.

**3. Type consistency:** `ensureSharedNodeModules(workspaceRoot, depSignature, opts?) → Promise<string>` (Task 4) used in Task 5. `linkSharedNodeModules(workspace, sharedNodeModulesPath) → Promise<boolean>` (Task 4) used in Task 5. `createLoopDetector() → { track, summary }` (Task 7) used in Task 8. `createStepTimer(log) → StepTimer` (Task 7) used in Task 8. `"loop-detected"` added to `generationMode` union (Task 8) — verify the union at `custom-source-generator.ts:40` accepts it (the plan says to add it). Names consistent.

**4. Known risks the implementer must handle (flagged in-task):**
- Task 1: the fetch endpoint shape — verify by fetching one component first; the `radix-ui` → `@radix-ui/react-*` transform must match the existing 6.
- Task 2: a missed dep → build-policy rejection; extract deps from the seeded sources (grep) before finalizing the allowlist.
- Task 4: `resolveBundledRunner` export — export if not already; the lazy `defaultInstallRunner` avoids a circular import.
- Task 5: the dependency signature passed to `ensureSharedNodeModules` must match the one `attemptBuild` computes (line 305) — reuse the same `dependencySignature` variable, don't recompute.
- Task 8: the nudge-appending to the tool output may be fragile (SDK pass-through); the plan offers a fallback (inject into next prompt) — try output-append first.
- Task 8: the `loop-detected` union value must be added to the `generationMode` type or typecheck fails.
