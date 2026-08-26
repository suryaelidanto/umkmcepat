---
name: do-backlog
description: Use when the user asks to work on, execute, or process tasks from docs/notes/backlog.md. Evaluates revisions, priorities, and domain clusters, proposes a clear batch execution plan, and waits for user confirmation before coding.
disable-model-invocation: true
---

# Do Backlog Skill

Kanban orchestrator. Evaluates backlog priorities, checks revisions, and clusters ONLY tasks with genuine domain and architectural synergy before proposing a batch to the developer.

## Core Rules for Batch Grouping

- **Strict Domain Synergy**: ONLY group tasks that touch the same domain, shared components, or related data models (e.g. grouping Workspace Shell + History Drawer, or Admin Table + Energy Mutation).
- **NEVER Mix Unrelated Domains**: Never bundle Admin tasks with Workspace UI, or Media pipeline with Generator prompts in the same batch just because they exist in the backlog. If tasks belong to different domains, propose them as separate, focused iterations.
- **Surgical Batch Size**: 1 to 2 synergistic tasks max per batch. A clean 50-line focused fix beats an unfocused multi-domain blob.
- **Unslop writing**: Follow `.agents/skills/unslop/SKILL.md`. Direct, natural engineering voice, zero decorative emoji spam.

## Execution Workflow

1. **Inspect Backlog Hierarchy**:
   - `## Needs Revision / Check Again` (Fix first if any exist)
   - `## In Progress` (Resume active work if any exist)
   - `## Backlog` (Analyze remaining queue for genuine domain clusters)

2. **Present the Proposal**:
   - State board state.
   - Pick the highest priority task or synergistic pair from the same domain.
   - Explain what the task(s) do, why they belong together (or why it's kept isolated), and which files will change.
   - Present clear options for developer confirmation.
   - **MANDATORY**: Wait for explicit user confirmation before writing code.

3. **Implement & Test Invariants**:
   - Move confirmed ticket(s) to `## In Progress`.
   - Write minimal, surgical code + colocated tests.
   - Follow the **Iron Law**: Assert only deterministic JSON schemas, data contracts, and error boundaries. Never assert AI prose, classNames, CSS styles, or DOM markup.

4. **Verify & Stage**:
   - Run `bun run check`.
   - Move completed ticket(s) from `## In Progress` to `## Ready for Review`.
   - **IRON RULE**: NEVER move cards to `## Done`. Only the human developer moves approved tasks to `## Done`.
