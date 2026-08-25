---
name: drive-backlog
description: Use when the user asks to drive, check, process, or execute tasks from docs/notes/backlog.md, or when resuming autonomous backlog execution across Kanban columns.
---

# Drive Backlog Skill

Autonomously process, verify, and advance tasks across the Kanban board in `docs/notes/backlog.md`.

## Execution Order

1. **Priority #1: `## Needs Revision / Check Again`**
   - Check if any task is listed in `## Needs Revision / Check Again`.
   - Read any developer review notes or attached wikilinks.
   - If notes are empty: Perform a thorough end-to-end audit, inspect browser previews and runtime behavior, find defects, and patch them.
   - Run `bun run check` and colocated unit tests until 100% green.
   - Move task to `## Ready for Review`.

2. **Priority #2: `## In Progress`**
   - Resume and drive any unfinished task to completion.
   - Write colocated unit/integration tests (`.test.ts`) asserting deterministic invariants (Zod schemas, data structures, compilation).
   - Verify with `bun run check`.
   - Move task to `## Ready for Review`.

3. **Priority #3: `## Backlog`**
   - Pull the topmost priority task from `## Backlog` into `## In Progress`.
   - Implement minimal clean code and verify with `bun run check`.
   - Move task to `## Ready for Review`.

## Iron Laws
- **Never test AI response content, classNames, or stochastic output**: Assert only Zod schemas, data structures, type narrowing, and compilation.
- **Always run `bun run check`** before moving any card to `## Ready for Review`.
- **Never push to `main` directly**: Commit locally using `atomic-commit` and release via `push-main` when explicitly requested.
