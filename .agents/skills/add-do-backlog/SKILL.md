---
name: add-do-backlog
description: Intelligently draft an isolated backlog task with single contextual emoji, move it straight to In Progress, execute clean implementation + colocated tests, verify via bun run check, transition to Ready for Review, and commit locally.
---

# Add-Do Backlog Skill

Unified, end-to-end task creator and executor. Combines `add-backlog` and `do-backlog` into a single, confident workflow: create a well-scoped task from user intent, immediately execute it, verify, and prepare for human review.

## Principles

1. **Deterministic Isolation**: Every task tackles ONE isolated concern with concrete acceptance criteria, standard domain tags, and a contextual emoji icon.
2. **Breathing Room Spacing**: Cards in `docs/notes/backlog.md` always maintain a blank newline between each other for clean Obsidian Kanban rendering.
3. **Iron Law of Testing**: Tests assert deterministic mechanical invariants only (Zod schemas, data contracts, type narrowing, hard boundaries, compilation). Never test AI model prose, classNames, styling strings, or rendered HTML markup snapshots.
4. **Strict Review Boundary**: Agents NEVER move cards to `## Done`. Completed work stops at `## Ready for Review`. Only the human developer moves approved tasks to `## Done`.
5. **Local Commit Only**: Stage and commit task changes locally with strict Conventional Commits. Never push to remote without explicit user command.

---

## Workflow

### 1. Draft Task & Assign Code
- Read `docs/notes/backlog.md`.
- Find the highest existing ticket code across all columns (e.g. `[#27]`).
- Assign the next sequential code (e.g. `[#28]`).
- Format the task:
  ```markdown
  - [ ] <emoji> **[#XX] Title**: Concrete description explaining what changed, why, and acceptance boundaries #tag1 #tag2
  ```

### 2. Enter In Progress
- Place the newly created ticket with a newline directly under `## In Progress` in `docs/notes/backlog.md`.
- Keep existing cards intact.

### 3. Implement & Test
- Write surgical, high-standard code.
- Write colocated unit/integration tests (`foo.test.ts` beside `foo.ts`).
- Avoid unnecessary abstractions or bloat.

### 4. Verify Suite
- Run `bun run check`.
- Ensure typecheck, lint, format, tests, Knip, routes, and discipline checks are 100% green.

### 5. Transition to Ready for Review
- Move the completed ticket from `## In Progress` to `## Ready for Review` in `docs/notes/backlog.md`.
- Never move to `## Done`.

### 6. Atomic Commit
- Stage modified files explicitly.
- Craft Conventional Commit (e.g. `feat(media): ... [#XX]` or `fix(chat): ... [#XX]`).
- Commit locally. Do not push.
