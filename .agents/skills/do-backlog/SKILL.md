---
name: do-backlog
description: Use when the user asks to work on, execute, or process tasks from docs/notes/backlog.md. Evaluates revisions, priorities, and domain clusters, proposes a clear batch execution plan, and waits for user confirmation before coding.
disable-model-invocation: true
---

# Do Backlog Skill

The single, intelligent Kanban execution orchestrator for `docs/notes/backlog.md`. Evaluates priorities like a senior engineering lead, checks revisions, groups related tasks, proposes a high-conviction execution plan, and waits for user confirmation before touching code.

## Execution Order & Senior Assessment

1. **Holistic Backlog Inspection**:
   - Read `docs/notes/backlog.md`.
   - Priority Hierarchy:
     1. **`## Needs Revision / Check Again`**: Any rejected tasks or items needing deep re-audit.
     2. **`## In Progress`**: Any uncompleted active tasks.
     3. **`## Backlog`**: Unassigned tasks, grouped by architectural synergy (files/domains touched).

2. **Wise Proposal & Grouping Recommendation**:
   - Analyze which tasks share the same domain (e.g. workspace composer UI + brief flow).
   - Present a concise, high-signal proposal to the developer:
     > *"Found 2 related tasks with shared domain: `[T-14]` (Persistent Composer Action Button) and `[T-15]` (Tiered Brief Priority & Proactive Enrichment). Both touch `WorkspaceShell.tsx` and `brief-flow.ts`.
     > 
     > Proposed Plan: Group and execute `[T-14]` + `[T-15]` in one clean pass. Proceed? [Y/n]"*
   - **MANDATORY**: Wait for explicit user confirmation before writing code.

3. **Execution & Strict Invariant Testing**:
   - Move confirmed ticket(s) to `## In Progress`.
   - Write minimal, surgical code + colocated `.test.ts` tests.
   - Follow the **Iron Law**: Assert only deterministic JSON schemas, data structures, and type contracts. Never assert AI response prose, classNames, CSS styles, or DOM markup.

4. **Verification & Stage**:
   - Run `bun run check`.
   - Move completed ticket(s) from `## In Progress` to `## Ready for Review`.
