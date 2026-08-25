---
name: do-backlog
description: Use when the user asks to work on, execute, or process tasks from docs/notes/backlog.md. Evaluates revisions, priorities, and domain clusters, proposes a clear batch execution plan, and waits for user confirmation before coding.
disable-model-invocation: true
---

# Do Backlog Skill

Kanban orchestrator. Evaluates tasks, prioritizes revisions, clusters synergistic tickets, and delivers an ultra-scannable vertical top-to-bottom proposal before asking for confirmation.

## Execution Workflow

1. **Inspect Backlog Hierarchy**:
   - `## Needs Revision / Check Again` (Fix first)
   - `## In Progress` (Resume active work)
   - `## Backlog` (Analyze for shared files/domains)

2. **Vertical Top-to-Bottom Proposal (Strict Template)**:
   - Present strictly top-to-bottom for near-zero cognitive load and fast vertical scanning:

```markdown
📋 **Backlog Status**
• Revisions: 0
• Active: 0
• Queued: 2 ([#14], [#15])

🎯 **Target Batch**
• [#14] Persistent Workspace Composer Action Button
• [#15] Tiered Brief Priority & Proactive Enrichment

💡 **The Why**
• User lacks clear 1-click build action in chat.
• Engine rushes to build before gathering photos/menu.

⚡ **The Change**
• Persistent [🚀 Buat Website] button in composer.
• 3-tier brief logic (Core -> Enrichment -> Polish).

👉 **Next Step**
[Y] Run recommended batch [#14] + [#15]
[1] Run [#14] only
[2] Run [#15] only
```

   - **MANDATORY**: Wait for explicit user confirmation before writing code.

3. **Execution & Strict Invariants**:
   - Move confirmed ticket(s) to `## In Progress`.
   - Implement minimal clean code + colocated tests.
   - Follow the **Iron Law**: Assert only Zod schemas, data structures, and deterministic contracts. Never assert AI response prose, classNames, CSS styles, or DOM markup.

4. **Verify & Stage**:
   - Run `bun run check`.
   - Move completed ticket(s) to `## Ready for Review`.
