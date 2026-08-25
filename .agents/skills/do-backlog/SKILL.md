---
name: do-backlog
description: Use when the user wants to pick, group, and execute related backlog tickets from docs/notes/backlog.md with upfront grouping confirmation and full verification.
disable-model-invocation: true
---

# Do Backlog Skill

Pick, group, and execute related tasks from `docs/notes/backlog.md`. Group tickets that touch the same domain/files into a single atomic execution pass after developer confirmation.

## Execution Workflow

1. **Inspect Backlog & Suggest Batching**:
   - Read `docs/notes/backlog.md`.
   - Check tickets in `## Needs Revision / Check Again` first, then `## In Progress`, then `## Backlog`.
   - Identify tickets that touch related domains or files (e.g. workspace composer UI + brief flow).
   - **Proactive Grouping Proposal**: Present the proposed execution plan to the developer:
     > *"Found 2 related tickets: `[T-14]` (Composer Action Button) and `[T-15]` (Tiered Interview Questions). Propose executing them together in one pass. Proceed? [Y/n]"*

2. **Move Selected Tickets to `## In Progress`**:
   - Once confirmed by the user, move the targeted ticket(s) to `## In Progress`.

3. **Implement Clean Code & Colocated Tests**:
   - Write minimal, surgical code.
   - Follow the **Iron Law**: Assert only deterministic schemas, types, and mechanical boundaries. Never assert AI response prose, classNames, or CSS styles in tests.

4. **Verify & Stage to `## Ready for Review`**:
   - Run `bun run check`.
   - Move completed ticket(s) from `## In Progress` to `## Ready for Review`.
