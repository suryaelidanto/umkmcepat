# Direct Build CTA and Held Notice Dismiss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a fallback "Buat website" action in the chat composer when the AI card is missing/not emitted, auto-dismiss held recommendation banners once a site is built, and provide a clean "Tutup/Abaikan" button on held recommendation notices.

**Architecture:**
- Frontend: Add a contextual "Buat website" fallback action inside the workspace chat composer when no build card is active, no build is running, and the site has not yet been built.
- Notice UI: Enhance `HeldBuildRecommendationNotice` with an optional `onDismiss` (Tutup / ✕) handler and auto-clear held signatures from `localStorage` once the project has a completed build (`buildComplete === true`).
- Backend/Client integration: Ensure direct build triggers smoothly resolve the brief and start the build without requiring the user to type conversational prompts.

**Tech Stack:**
- React 19, TypeScript, Tailwind CSS v4, Lucide React, Vitest.

## Global Constraints
- Do not delete business data or brief from DB when dismissing a card.
- User-facing copy in Indonesian; dev code/docs in English.
- No unrequested dependencies.
- Pass `bun run check` and `bun run verify`.

---

### Task 1: Add dismiss capability and auto-clear to `HeldBuildRecommendationNotice`

**Files:**
- Modify: `src/components/projects/build/BuildNotices.tsx`
- Modify: `src/components/projects/build/BuildNotices.test.ts`
- Modify: `src/components/projects/workspace/WorkspaceShell.tsx`

- [ ] **Step 1: Update `BuildNotices.test.ts` to test dismiss action**
- [ ] **Step 2: Add `onDismiss` prop and close button (`X` icon / Tutup) in `HeldBuildRecommendationNotice`**
- [ ] **Step 3: Wire `onDismiss` in `WorkspaceShell.tsx` to clear held signature in `localStorage` and state**
- [ ] **Step 4: Ensure `WorkspaceShell` clears held signatures whenever `buildComplete` is true**
- [ ] **Step 5: Run tests for `BuildNotices`**

---

### Task 2: Add fallback "Buat website" button in the Workspace Composer

**Files:**
- Modify: `src/components/projects/workspace/WorkspaceShell.tsx`
- Modify: `src/components/projects/workspace/WorkspacePrimitives.tsx`
- Modify: `src/components/projects/workspace/WorkspacePrimitives.test.ts`

- [ ] **Step 1: Add unit test in `WorkspacePrimitives.test.ts` for composer action button**
- [ ] **Step 2: Render a clean, subtle "Buat website" action in the composer toolbar when eligible**
- [ ] **Step 3: Wire clicking the action to `handleStartBuild`**
- [ ] **Step 4: Run unit tests**

---

### Task 3: Full Gate & Verification

- [ ] **Step 1: Run `bun run check` and `bun run verify`**
- [ ] **Step 2: Commit clean changes locally**
