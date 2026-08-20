# Visual Edit Domain Isolation & Naming Harmonization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harmonize the visual preview annotation / direct-edit domain by renaming the ambiguous `/api/projects/:id/edit` to `/api/projects/:id/visual-edit`, updating the feature flag to `feature.visual_edit_enabled`, and updating the UI label from "Ubah" to "Tunjuk & Ubah" for transparent user understanding.

**Architecture:**
- API Layer: Rename `src/routes/api.projects.$id.edit.ts` to `src/routes/api.projects.$id.visual-edit.ts` with backward-compatible 307 redirect / fallback if called on legacy path.
- Config/Admin: Rename `feature.direct_edit_enabled` to `feature.visual_edit_enabled` in `app-settings-registry.ts` and feature flag keys, with backward-compatible key lookup.
- Frontend/UI: Update `WorkspaceShell.tsx` and `WorkspacePrimitives.tsx` to call `/api/projects/:id/visual-edit` and display the Indonesian label "Tunjuk & Ubah" / "Mode Tunjuk & Ubah Aktif".
- Tests: Update all route tests and unit tests to verify `/visual-edit` and feature flag gating.

**Tech Stack:**
- React 19, TanStack Router/Start, TypeScript, Tailwind CSS v4, Vitest.

## Global Constraints
- Keep all internal logic, developer docs, and prompt rules in English.
- Keep user-facing copy in clean Indonesian ("Tunjuk & Ubah").
- Pass all quality gates (`bun run check`, `bun run verify`).
- Do not break existing snapshot restoration or BullMQ worker queues.

---

### Task 1: Update Feature Flag & App Settings Registry

**Files:**
- Modify: `src/lib/config/feature-flags-keys.ts`
- Modify: `src/lib/config/use-feature-flag.ts`
- Modify: `src/lib/config/app-settings-registry.ts`
- Modify: `src/lib/config/app-settings-registry.test.ts`
- Modify: `src/lib/config/feature-flags.test.ts`
- Modify: `src/routes/-api.flags.test.ts`

- [ ] **Step 1: Update feature flag key to `feature.visual_edit_enabled` (with fallback for legacy key)**
- [ ] **Step 2: Update `app-settings-registry.ts` entry label and key**
- [ ] **Step 3: Run feature flag unit tests to verify**

---

### Task 2: Update Route Handler to `/api/projects/$id/visual-edit`

**Files:**
- Create: `src/routes/api.projects.$id.visual-edit.ts`
- Create: `src/routes/-api.projects.$id.visual-edit.test.ts`
- Modify: `src/routes/api.projects.$id.edit.ts` (redirect or delegate to visual-edit for safety)
- Test: `src/routes/-api.projects.$id.visual-edit.test.ts`

- [ ] **Step 1: Create `src/routes/api.projects.$id.visual-edit.ts` handler**
- [ ] **Step 2: Create unit tests in `src/routes/-api.projects.$id.visual-edit.test.ts`**
- [ ] **Step 3: Keep lightweight delegation in `src/routes/api.projects.$id.edit.ts` for safety**
- [ ] **Step 4: Run route unit tests**

---

### Task 3: Update Workspace UI ("Tunjuk & Ubah")

**Files:**
- Modify: `src/components/projects/workspace/WorkspacePrimitives.tsx`
- Modify: `src/components/projects/workspace/WorkspaceShell.tsx`
- Modify: `src/components/projects/workspace/WorkspaceShell.test.ts`

- [ ] **Step 1: Update `WorkspacePrimitives.tsx` toolbar button label to "Tunjuk & Ubah"**
- [ ] **Step 2: Update `WorkspaceShell.tsx` to use `/api/projects/${projectId}/visual-edit`**
- [ ] **Step 3: Run workspace unit tests**

---

### Task 4: Full Verification & Release to Main

- [ ] **Step 1: Run `bun run check` and `bun run verify`**
- [ ] **Step 2: Run `push-dev` and verify CI on dev**
- [ ] **Step 3: Create PR and execute `push-main` workflow**
