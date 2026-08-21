# Admin Workspace Read-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin non-owners open `/projects/:id` in the same workspace UI as users, read-only.

**Architecture:** Reuse `WorkspaceShell` with a `readOnly` prop. Move access decisions into server helpers. Allow admin non-owner access only to GET/read endpoints; mutation endpoints remain owner-only.

**Tech Stack:** TanStack Router/Start, React Query, AI SDK `useChat`, Prisma, Vitest, Bun.

## Global Constraints

- Project owner: render existing full workspace unchanged.
- Admin non-owner: render same workspace shell in read-only mode.
- Non-owner non-admin: not found.
- Admin read-only may read chat, workspace, runtime, source, preview, thumbnail.
- Admin read-only must not send chat, auto-send prompt, build, retry, stop, publish, rename, edit preview, annotate, attach files, write source, or call POST/PUT/PATCH/DELETE.
- Mutation API routes remain owner-only.
- Indonesian UI copy.
- Run focused tests and `bun run check` before handoff.

---

## File Structure

- Modify `src/lib/admin-project-observer.ts`: keep access-mode loader, add `readOnly` mode data usable by `WorkspaceShell`.
- Modify `src/routes/_main.projects.$id.tsx`: owner and admin both render `WorkspaceShell`; admin passes `readOnly`.
- Modify `src/components/projects/WorkspaceShell.tsx`: add `readOnly?: boolean`, gate side effects and mutating UI/actions.
- Modify GET routes: `api.projects.$id.workspace.ts`, `api.projects.$id.runtime.ts`, `api.projects.$id.source.ts`, `api.projects.$id.preview.$.ts`, `api.projects.$id.thumbnail.ts`, `api.projects.$id.chat.ts` to allow admin reads only.
- Add/modify tests around access helper and read-only behavior.

---

### Task 1: Owner/admin access stays explicit

**Files:**
- Modify: `src/lib/admin-project-observer.ts`
- Modify: `src/lib/admin-project-observer.test.ts`

**Interfaces:**
- Produces: `loadProjectForViewer()` returning `mode: "owner" | "observer" | "denied"` plus `ProjectViewerData`.

- [ ] Run `bun test src/lib/admin-project-observer.test.ts`.
- [ ] Ensure tests assert owner, admin observer, denied non-admin, safe field shape.
- [ ] Commit:

```bash
git add src/lib/admin-project-observer.ts src/lib/admin-project-observer.test.ts
```

---

### Task 2: WorkspaceShell read-only prop

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx`
- Modify: `src/routes/_main.projects.$id.tsx`
- Remove: `src/components/projects/AdminProjectObserver.tsx` if no longer used.

**Interfaces:**
- `WorkspaceShellProps` adds `readOnly?: boolean`.
- `/projects/:id` passes `readOnly={data.mode === "observer"}`.

- [ ] Add `readOnly?: boolean` to props.
- [ ] Render a banner when `readOnly` is true: `Mode admin baca-saja. Kamu melihat proyek seperti pengguna, tanpa izin mengubah atau mengirim aksi.`
- [ ] Gate all mutating callbacks with `if (readOnly) return;`: `publishProject`, `cancelBuild`, `startBuild`, `handleStartBuild`, `stopCurrentJob`, `sendVisualAnnotations`, `submitChatText`, title rename handlers.
- [ ] Disable side effects when `readOnly`: auto-start build, auto-send initial prompt, localStorage writes for annotations/build recommendation consumed state.
- [ ] Hide composer and mutating CTAs when `readOnly`; keep chat/preview/code panels visible.
- [ ] Replace observer component route branch with `WorkspaceShell readOnly`.
- [ ] Run `bun run typecheck`.
- [ ] Commit:

```bash
git add src/components/projects/WorkspaceShell.tsx src/routes/_main.projects.\$id.tsx src/components/projects/AdminProjectObserver.tsx
```

---

### Task 3: Admin read access for GET endpoints only

**Files:**
- Modify GET routes listed above.

**Interfaces:**
- Add helper-local predicate per route or reuse `isAdminEmail(session.user.email ?? "")` to allow reads by id.
- Do not modify mutation routes.

- [ ] For read endpoints, change `where: { id, userId: session.user.id }` to owner-or-admin read only.
- [ ] Keep POST routes unchanged.
- [ ] Run `bun run typecheck`.
- [ ] Commit:

```bash
git add src/routes/api.projects.\$id.workspace.ts src/routes/api.projects.\$id.runtime.ts src/routes/api.projects.\$id.source.ts src/routes/api.projects.\$id.preview.\$.ts src/routes/api.projects.\$id.thumbnail.ts src/routes/api.projects.\$id.chat.ts
```

---

### Task 4: Final verification

- [ ] Run focused tests:

```bash
bun test src/lib/admin-project-observer.test.ts src/lib/admin-projects.test.ts
```

- [ ] Run full gate:

```bash
bun run check
```

- [ ] Inspect status:

```bash
git status --short --untracked-files=all
```

- [ ] Commit only if verification uncovered and fixed tracked issues. Do not stage unrelated dirty files.

---

## Self-Review

- Spec coverage: same workspace UI, read-only admin path, owner unchanged, non-owner denied, GET-only admin reads, mutation owner-only, preview/code/chat visible.
- Placeholder scan: no TODO/TBD.
- Type consistency: `readOnly?: boolean`, `mode === "observer"`.
