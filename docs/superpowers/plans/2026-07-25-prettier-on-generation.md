# Prettier-on-Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After each successful generation or edit build, run prettier (cached) over the generated source artifact on disk so the code-tab shows polished code — fire-and-forget, never failing the generation turn.

**Architecture:** A `formatGeneratedSource(artifactRef)` helper spawns `prettier --write --cache` scoped to the artifact's `files/` directory; it's added to the existing `Promise.allSettled` post-commit batch (alongside `refreshProjectThumbnail`) in the generate route + the edit route's post-build step. Failures are logged, not thrown.

**Tech Stack:** Bun, TypeScript, `prettier` (already a dep), Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-25-prettier-on-generation-design.md`

## Global Constraints

- Fire-and-forget: a prettier error never fails the generation turn. The sweep's promise is absorbed by `Promise.allSettled`; failures are logged via `devLog`.
- Scoped to the generated source artifact directory only — never the platform repo `src/`. Uses the platform `.prettierrc.json` (the code-tab's expected format).
- Cached: `--cache --cache-location <artifactDir>/.prettiercache` so unchanged files are skipped. The cache is a gitignored build artifact under `.data/project-artifacts/`.
- Bounded: a 30s timeout so a pathological large project can't hang the post-commit side-effect.
- Visible product copy Indonesian; code/comments English. `.env`/`.env.example` 1:1 (no new env vars).

---

## File Structure

- **Create** `src/lib/projects/format-generated-source.ts` — `formatGeneratedSource(artifactRef): Promise<{formatted: number; failed: boolean}>`.
- **Create** `src/lib/projects/format-generated-source.test.ts` — formats a fixture dir, isolates failure, cache-hit fast path.
- **Modify** `src/routes/api.projects.$id.generate.ts` — add `formatGeneratedSource(finalized.sourceRef)` to the post-commit `Promise.allSettled` (~line 1220).
- **Modify** `src/routes/api.projects.$id.edit.ts` — add the same sweep after the edit's build succeeds.

---

### Task 1: formatGeneratedSource helper

**Files:**
- Create: `src/lib/projects/format-generated-source.ts`
- Create: `src/lib/projects/format-generated-source.test.ts`

**Interfaces:**
- Consumes: the artifact directory resolution from `runtime-artifacts.ts` (the `files/` dir under `<PROJECT_ARTIFACT_DIR>/source/<artifactId>/`); the platform `.prettierrc.json` + `.prettierignore`.
- Produces: `formatGeneratedSource(artifactRef: string): Promise<{ formatted: number; failed: boolean }>` — spawns `prettier --write --cache --cache-location <dir>/.prettiercache "**/*.{ts,tsx,js,jsx,css,json,md}"` in the artifact dir; `failed: true` + `formatted: 0` on non-zero exit / timeout / missing dir; never throws.

- [x] **Step 1: Write the failing tests**

Create `src/lib/projects/format-generated-source.test.ts` (temp dir fixture):

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { formatGeneratedSource } from "@/lib/projects/format-generated-source";

function fixtureDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "fmt-gen-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

describe("formatGeneratedSource", () => {
  afterEach(() => {
    // temp dirs auto-cleaned by OS; no manual cleanup needed for the test.
  });

  it("formats unformatted source files", async () => {
    const dir = fixtureDir({ "App.tsx": "const x=(  )=>1" });
    const result = await formatGeneratedSource(dir);
    expect(result.failed).toBe(false);
    expect(result.formatted).toBeGreaterThan(0);
  });

  it("isolates a parse failure (failed=true, never throws)", async () => {
    const dir = fixtureDir({ "bad.tsx": "const =( )=>" });
    const result = await formatGeneratedSource(dir);
    expect(result.failed).toBe(true);
  });

  it("skips unchanged files on the second run (cache)", async () => {
    const dir = fixtureDir({ "App.tsx": "const x = () => 1;\n" });
    await formatGeneratedSource(dir); // warm cache
    const result = await formatGeneratedSource(dir);
    expect(result.formatted).toBe(0);
  });
});
```

Note: the helper takes the **directory path** directly in the test (the route resolves the artifact dir from the ref, then calls the helper with the path). This keeps the helper pure + testable without artifact-ref parsing.

- [x] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/lib/projects/format-generated-source.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement the helper**

Create `src/lib/projects/format-generated-source.ts`:

```ts
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";

import { devLog } from "@/lib/dev-log";

const FORMAT_TIMEOUT_MS = 30_000;

export async function formatGeneratedSource(
  sourceDir: string,
): Promise<{ failed: boolean; formatted: number }> {
  try {
    await mkdir(sourceDir, { recursive: true });
  } catch {
    return { failed: true, formatted: 0 };
  }

  return new Promise((resolve) => {
    const child = spawn(
      process.execPath.replace("bun", "node") === process.execPath
        ? "npx"
        : process.execPath,
      [
        "prettier",
        "--write",
        "--cache",
        "--cache-location",
        `${sourceDir}/.prettiercache`,
        "**/*.{ts,tsx,js,jsx,css,json,md}",
      ],
      { cwd: sourceDir, shell: false },
    );

    let stdout = "";
    child.stdout?.on("data", (d) => (stdout += d.toString()));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      devLog("generate", "prettier-timeout", { sourceDir });
      resolve({ failed: true, formatted: 0 });
    }, FORMAT_TIMEOUT_MS);

    child.on("error", (error) => {
      clearTimeout(timer);
      devLog("generate", "prettier-error", { error: String(error) });
      resolve({ failed: true, formatted: 0 });
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        devLog("generate", "prettier-failed", { code, sourceDir });
        return resolve({ failed: true, formatted: 0 });
      }
      const formatted = (stdout.match(/ms\)/g) ?? []).length;
      resolve({ failed: false, formatted });
    });
  });
}
```

(Confirm `devLog`'s exact signature at impl via `grep -n "export function devLog\|export const devLog" src/lib/dev-log.ts`; the prettier stdout "formatted Xms)" count is a coarse telemetry — refine if a structured `--list-different` pass is cleaner.)

- [x] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run src/lib/projects/format-generated-source.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Commit**

```bash
git add src/lib/projects/format-generated-source.ts src/lib/projects/format-generated-source.test.ts
git commit -m "feat(gen): formatGeneratedSource helper (cached, fire-and-forget)"
```

---

### Task 2: Wire the sweep into the generate route post-commit

**Files:**
- Modify: `src/routes/api.projects.$id.generate.ts` (~line 1220, the `Promise.allSettled([refreshProjectThumbnail(...), ...])` block)

**Interfaces:**
- Consumes: `formatGeneratedSource` (Task 1), `finalized.sourceRef` (the new source artifact ref), the artifact-dir resolution from `runtime-artifacts.ts`.
- Produces: the post-commit `allSettled` batch includes the prettier sweep over the new source artifact's `files/` dir.

- [x] **Step 1: Resolve the artifact dir from the ref + add to allSettled**

In the generate route's post-commit block (~line 1219-1225), extend the existing `Promise.allSettled`:

```ts
const sourceDir = resolveArtifactFilesDir(finalized.sourceRef);
void Promise.allSettled([
  refreshProjectThumbnail({ projectId }),
  formatGeneratedSource(sourceDir),
  // ... any other existing post-commit side-effects
]);
```

`resolveArtifactFilesDir(ref)` — add a small helper to `runtime-artifacts.ts` (or reuse the internal path builder) that returns `<PROJECT_ARTIFACT_DIR>/source/<artifactId>/files` from a `project-artifact:local:source:<id>` ref. (Confirm the ref shape via `writeProjectSourceArtifact`'s output; if the ref is already the dir, skip the resolver.)

- [x] **Step 2: Run the generate-route tests + typecheck**

Run: `bunx vitest run src/routes/-api.projects 2>/dev/null; bunx tsc --noEmit`
Expected: no type errors; existing generate tests still pass.

- [x] **Step 3: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [x] **Step 4: Commit**

```bash
git add src/routes/api.projects.\$id.generate.ts src/lib/projects/runtime-artifacts.ts
git commit -m "feat(gen): prettier sweep in post-commit allSettled (generate)"
```

---

### Task 3: Wire the sweep into the edit route post-build

**Files:**
- Modify: `src/routes/api.projects.$id.edit.ts` (post-build step where the new snapshot + build land)

**Interfaces:**
- Consumes: `formatGeneratedSource` (Task 1), the new edit snapshot's sourceRef, the artifact-dir resolver (Task 2).

- [x] **Step 1: Add the sweep after the edit's build succeeds**

In `api.projects.$id.edit.ts`, after the new `ProjectBuild` succeeds + the new `preview` deployment is created, add:

```ts
const sourceDir = resolveArtifactFilesDir(newSnapshot.sourceRef);
void formatGeneratedSource(sourceDir).catch(() => {});
```

(Fire-and-forget here too — the edit turn already returned; the sweep is best-effort polish for the code tab.)

- [x] **Step 2: Run edit-route tests + typecheck**

Run: `bunx tsc --noEmit && bun run check`
Expected: all green.

- [x] **Step 3: Commit**

```bash
git add src/routes/api.projects.\$id.edit.ts
git commit -m "feat(gen): prettier sweep after edit build"
```

---

### Task 4: Verify the code-tab data source (spec open question)

**Files:**
- Investigate: the code-tab viewer component (find via `grep -rln "source.*files\|snapshot.files\|readProjectSourceArtifact" src/components/projects/`)

**Interfaces:** N/A — a verification step resolving the spec's open question: does the code tab read from the on-disk artifact or the DB `snapshot.files`?

- [x] **Step 1: Find the code-tab data source**

Run: `grep -rln "source.*files\|snapshot.files\|readProjectSourceArtifact\|ProjectSnapshot.*files" src/components/projects/ src/routes/api.projects.\$id.source.ts`
Expected: identify whether the tab reads disk (`readProjectSourceArtifact`) or DB (`snapshot.files`).

- [x] **Step 2: If DB-backed — extend the sweep to also update the snapshot**

If the tab reads `snapshot.files`, the disk sweep alone isn't enough — the DB blob must be re-serialized after formatting. Add to `formatGeneratedSource`: after prettier, read the formatted files back + `prisma.projectSnapshot.update({data:{files}})`. If the tab reads disk, skip (the sweep already covers it).

- [x] **Step 3: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [x] **Step 4: Commit (only if Task 4 Step 2 changed code)**

```bash
git add <files changed>
git commit -m "feat(gen): sweep also syncs DB snapshot files for the code tab"
```

---

### Task 5: Manual E2E

Not committed — verification.

- [x] **Step 1: Generate a project** → after "done", open the code tab → assert the source is prettier-formatted (consistent indentation, semicolons, trailing commas per `.prettierrc.json`).
- [x] **Step 2: Edit the project** ("ubah judul jadi X") → after the rebuild, re-open the code tab → still formatted.
- [x] **Step 3: Confirm no generation-turn failure** when a file is unparseable (prettier logs, turn still succeeds).
- [x] **Step 4: `bun run check`** green.

---

## Post-implementation

- Update `docs/architecture.md` if the post-commit side-effect list changes (add the prettier sweep to the documented post-commit batch).
