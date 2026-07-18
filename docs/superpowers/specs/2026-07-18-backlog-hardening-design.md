# Design Spec: Backlog Hardening & Core Reliability

**Date:** 2026-07-18  
**Status:** Draft — Pending User Review  
**Author:** Claude  
**Scope:** `docs/prds/`, `src/lib/object-storage.ts`, `src/lib/profile.ts`, `src/lib/query-client.ts`, `src/routes/api.projects.preview.ts`, `src/routes/api.projects.$id.edit.ts`, `src/routes/p.$slug.$.ts`, `src/components/projects/WorkspacePrimitives.tsx`, `src/components/projects/WorkspaceShell.tsx`.

---

## 1. Documentation & PRD Cleanup
- **Goal:** Clean up the codebase from dead PRD specifications that confuse developers and agents.
- **Action:** 
  1. Add `.superpowers/` and `docs/superpowers/` to `.gitignore`.
  2. Remove all outdated files in `docs/prds/`.
  3. Consolidate absolute, active architectural decisions (like scale-to-zero, building timeouts, 9Router mappings) directly into `docs/architecture.md`.

---

## 2. Dynamic R2 & Local Hybrid Storage + Profile Update Fix
- **Goal:** Fix profile photo updates, ensure they match JWT updates, and fully support R2/Local storage switches.
- **Action:**
  1. Fix `toPublicProfileImage` in `src/lib/profile.ts` so that `/api/profile/avatar` doesn't resolve to `""` during session updates.
  2. Implement R2 client inside `src/lib/object-storage.ts` using AWS SDK or HTTP client. When `OBJECT_STORAGE_PROVIDER` is `"r2"`, perform actual uploads instead of throwing an error.
  3. Keep readings fully hybrid based on object prefix: `object:local:` reads local disk uploads, `object:r2:` pulls from R2 container bucket dynamically.

---

## 3. Auto-Invalidation via useCacheMutation
- **Goal:** Eliminate manual page refreshes when creating projects, deleting projects, or updating user profile.
- **Action:**
  1. Replace direct promises and raw `useMutation` hooks with `useCacheMutation` in `HomePromptForm.tsx`, `ProfileNameForm.tsx`, and `ProjectList.tsx`.
  2. Map key invalidations correctly:
     - Deleting a project invalidates `queryKeys.projects`.
     - Editing workspace brief/source invalidates `queryKeys.projectWorkspace(projectId)`.
     - Updating profile invalidates session data.

---

## 4. Progressive Diff Accordion
- **Goal:** Allow users to expand progression cards during code revisions and see file differences (diffs).
- **Action:**
  1. Create a lightweight line-by-line diff generator utility inside `src/lib/projects/diff.ts` (pure JS, ~30 lines, no npm dependencies).
  2. During code edit iterations in `agent-tool-runner.ts`, compute file diffs for `write_file` and `replace_in_file` changes. Store this diff metadata inside `RuntimeEvent.metadata` under `build.progress` events.
  3. Render an Accordion/FAQ style toggle inside `BuildProgressPanel` list items when a diff is present. Clicking it displays green/red line diffs.

---

## 5. Stale Build Hardening & Cancellation
- **Goal:** Prevent permanent lockouts when builds get stuck in a `"running"` or `"building"` state.
- **Action:**
  1. Create route `/api/projects/$id/cancel` to force-kill local build/agent child processes, release workspace leases, and update the database project status to `"canceled"`.
  2. Expose a "Hentikan Build" button in the Workspace UI when `buildStatus === "building"`.
  3. Implement a 3-minute lease threshold check in the workspace API. Stale leases are automatically pruned and updated to `"failed"` or `"canceled"` on new project requests.

---

## 6. Hybrid Auto-Scroll in Build Progress
- **Goal:** Automatically keep build steps in view while allowing manual scrolling.
- **Action:**
  1. Track container scrolling in `BuildProgressPanel`.
  2. If the user is scrolled to the bottom (within `20px` threshold), trigger smooth auto-scroll (`scrollIntoView({ behavior: "smooth" })`) when a new step is loaded.
  3. If they scroll up, temporarily disable auto-scroll.

---

## 7. Energy Billing Try-Finally Guard
- **Goal:** Ensure user energy is always deducted for consumed AI tokens, even if the request times out or is aborted.
- **Action:**
  1. Wrap the tool calling loops in `src/routes/api.projects.$id.edit.ts` and `/api/projects/preview` with `try ... finally` statements.
  2. Perform `chargeEnergyForAiUsage()` inside the `finally` block to process actual token usage under all termination circumstances.

---

## 8. Web Preview Blank Page Fix
- **Goal:** Stop serving raw JSON/blank screens on previews that fail to load or publish.
- **Action:**
  1. Rewrite `/p/$slug` and `/api/projects/$id/preview` error handling.
  2. Instead of returning raw error status, return a clean sandboxed HTML error template that explains what failed and prompts a rebuild.

---

## PROJECT_BUILD_BUN_PATH Local cleanup
- **Note:** `PROJECT_BUILD_BUN_PATH` in `.env` is safe to delete. The runner `resolveBundledRunner` in `generated-source.ts` discovers `bun` dynamically from the user's `PATH`. The explicit env is a purely optional override.
