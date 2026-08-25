---
name: do-backlog
description: Use when the user asks to work on, execute, or process tasks from docs/notes/backlog.md. Evaluates revisions, priorities, and domain clusters, proposes a clear batch execution plan, and waits for user confirmation before coding.
disable-model-invocation: true
---

# Do Backlog Skill

The single, intelligent Kanban execution orchestrator for `docs/notes/backlog.md`. Evaluates priorities like a senior engineering lead, checks revisions, groups related tasks, delivers a high-signal architectural briefing, and waits for explicit user confirmation before touching code.

## Execution Workflow

1. **Holistic Backlog Inspection**:
   - Read `docs/notes/backlog.md`.
   - Inspect priority hierarchy:
     1. `## Needs Revision / Check Again`: Any rejected tasks or items needing deep re-audit.
     2. `## In Progress`: Any uncompleted active tasks.
     3. `## Backlog`: Unassigned tasks, analyzed for domain synergy.

2. **High-Signal Architectural Briefing (MANDATORY)**:
   - Deliver a clear, insightful briefing following this exact structure:
     - **Status Papan Kanban**: Quick snapshot of all columns.
     - **Analisis Masalah & Dampak Pengguna**: Plain-English/Indonesian explanation of the UX/business problem and why these tasks matter.
     - **Rencana Implementasi Terpadu**:
       - Touched modules and contracts.
       - Concrete *Before vs After* behavioral comparison.
       - Verification & test invariant strategy.
     - **Pilihan Keputusan**: Provide clear multiple-choice options (`[Y]` Batch recommended, `[1]` Single ticket, etc.).
   - **MANDATORY**: Wait for explicit user confirmation before writing code.

3. **Execution & Strict Invariant Testing**:
   - Move confirmed ticket(s) to `## In Progress`.
   - Write minimal, surgical code + colocated `.test.ts` tests.
   - Follow the **Iron Law**: Assert only deterministic JSON schemas, data structures, and type contracts. Never assert AI response prose, classNames, CSS styles, or DOM markup.

4. **Verification & Stage**:
   - Run `bun run check`.
   - Move completed ticket(s) from `## In Progress` to `## Ready for Review`.
