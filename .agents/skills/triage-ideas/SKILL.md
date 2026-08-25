---
name: triage-ideas
description: Triage raw thoughts from docs/notes/ideas.md into structured Kanban tasks in docs/notes/backlog.md, architectural decisions in docs/architecture/, or repository rules in AGENTS.md/DEV.md, then clear ideas.md.
---

# Triage Ideas Skill

Read raw developer brain dumps from `docs/notes/ideas.md`, categorize and route them to their proper documentation homes, and reset `ideas.md` to a clean blank state.

## Routing Rules

1. **Tasks, Bugs, & Features** $\rightarrow$ Add as checkable items under `## Backlog` in `docs/notes/backlog.md` with relevant domain tags (`#engine`, `#ux`, `#conversion`, `#security`, `#pricing`, `#architecture`).
2. **Architectural Decisions & Research** $\rightarrow$ If a thought requires design or irreversible choices, create a 1-page ADR in `docs/architecture/ADR-<name>.md` and link it inside `docs/notes/backlog.md`.
3. **Core Engineering Standards** $\rightarrow$ If a thought establishes a permanent repository rule, update `AGENTS.md` or `DEV.md` directly.
4. **Reset Scratchpad** $\rightarrow$ Once all items are triaged and routed, empty `docs/notes/ideas.md` with `# Ideas & Research\n\n` so the developer has a fresh scratchpad.
5. **Verification** $\rightarrow$ Run `bun run check` to verify formatting and link integrity.
