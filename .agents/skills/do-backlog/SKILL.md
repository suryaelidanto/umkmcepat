---
name: do-backlog
description: Use when the user asks to work on, execute, or process tasks from docs/notes/backlog.md. Evaluates revisions, priorities, and domain clusters, proposes a clear batch execution plan, and waits for user confirmation before coding.
disable-model-invocation: true
---

# Do Backlog Skill

Kanban orchestrator. Evaluates backlog priorities, checks revisions, groups related work sensibly, and writes a clear, substantive proposal before asking for confirmation.

## Principles

- **Speak like an engineer, not a bot**: Write naturally. No decorative emoji spam (`📋`, `💡`, `⚡`, `🎯`), no rigid template headings (`The Why`, `The Change`), and no fake cheerfulness.
- **Substance over extreme brevity**: Explain what the tickets actually do, how current code behaves, what breaks or feels clunky today, and how the changes fit together. Don't compress so hard that context is lost.
- **Unslop writing**: Follow `.agents/skills/unslop/SKILL.md`. Clear, direct sentences, active voice, zero fluff words.

## Execution Workflow

1. **Inspect Backlog Hierarchy**:
   - `## Needs Revision / Check Again` (Fix first if any exist)
   - `## In Progress` (Resume active work if any exist)
   - `## Backlog` (Analyze remaining queue for logical grouping)

2. **Present the Proposal**:
   - State board state (revisions, active, queued).
   - Explain the proposed task or batch in plain terms:
     - What the tickets actually do in the app.
     - Why grouping them makes sense (or why doing them individually is better).
     - Which files/modules will change and what the concrete user experience becomes.
   - Present straightforward options for the developer to confirm.
   - **MANDATORY**: Wait for explicit user confirmation before writing code.

3. **Implement & Test Invariants**:
   - Move confirmed ticket(s) to `## In Progress`.
   - Write minimal, surgical code + colocated tests.
   - Follow the **Iron Law**: Assert only deterministic JSON schemas, data contracts, and error boundaries. Never assert AI prose, classNames, CSS styles, or DOM markup.

4. **Verify & Stage**:
   - Run `bun run check`.
   - Move completed ticket(s) from `## In Progress` to `## Ready for Review`.
   - **IRON RULE**: NEVER move cards to `## Done`. Only the human developer moves approved tasks to `## Done`.
