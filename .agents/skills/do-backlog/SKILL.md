---
name: do-backlog
description: Use when the user asks to work on, execute, or process tasks from docs/notes/backlog.md. Evaluates revisions, priorities, and domain clusters, proposes a clear batch execution plan, and waits for user confirmation before coding.
disable-model-invocation: true
---

# Do Backlog Skill

Intelligent Kanban orchestrator. Evaluates tasks, checks revisions, groups synergistic tickets, and delivers an unslop, ultra-concise plan before asking for confirmation.

## Execution Workflow

1. **Inspect Backlog Hierarchy**:
   - `## Needs Revision / Check Again` (Fix first)
   - `## In Progress` (Resume active work)
   - `## Backlog` (Analyze for shared files/domains)

2. **Ultra-Concise Proposal (Max 15 lines)**:
   - Apply `.agents/skills/unslop/SKILL.md`. Cut filler words, long tables, and AI fluff.
   - Present only:
     - **Status**: Active task counts.
     - **Why**: 1-2 sharp sentences on the problem.
     - **Proposed Batch**: Which `[#XX]` tickets to group and why.
     - **Key Change**: 2 bullet points on what actually changes in the UI/code.
     - **Decision**: `[Y]` Batch, `[1]` Ticket A, `[2]` Ticket B.
   - **MANDATORY**: Wait for explicit user confirmation before writing code.

3. **Execution & Strict Invariants**:
   - Move confirmed ticket(s) to `## In Progress`.
   - Implement minimal clean code + colocated tests.
   - Follow the **Iron Law**: Assert only Zod schemas, data structures, and deterministic contracts. Never assert AI response prose, classNames, CSS styles, or DOM markup.

4. **Verify & Stage**:
   - Run `bun run check`.
   - Move completed ticket(s) to `## Ready for Review`.
