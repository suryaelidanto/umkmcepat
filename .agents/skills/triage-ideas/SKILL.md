---
name: triage-ideas
description: Triage raw thoughts from docs/notes/ideas.md into structured Kanban tasks in docs/notes/backlog.md, architectural decisions in docs/architecture/, or repository rules in AGENTS.md/DEV.md, then clear ideas.md.
---

# Triage Ideas Skill

Read raw developer brain dumps from `docs/notes/ideas.md`, ask clarifying questions to align with the developer's exact mental model, categorize and route them to their proper documentation homes, and archive processed notes safely.

## Workflow & Alignment First

1. **Read & Probe First**: Read `docs/notes/ideas.md`. If a note is cryptic, short, or has multiple interpretations (e.g. *"super prevent placeholder"*, *"keep button or don't"*), **relentlessly ask the developer first**:
   - What is the exact expected behavior?
   - Is this an engine invariant, UI component, or business logic?
   - Do not guess or extrapolate developer intent without confirmation.
2. **Route Confirmed Items**:
   - **Tasks, Bugs, & Features** $\rightarrow$ Add as checkable items under `## Backlog` in `docs/notes/backlog.md` with relevant domain tags (`#engine`, `#ux`, `#conversion`, `#security`, `#pricing`, `#architecture`).
   - **Architectural Decisions** $\rightarrow$ If confirmed as a structural change, create a 1-page ADR in `docs/architecture/ADR-<name>.md` and link it inside `docs/notes/backlog.md`.
   - **Repository Standards** $\rightarrow$ If confirmed as a permanent engineering rule, update `AGENTS.md` or `DEV.md` directly.
3. **Preserve Untriaged Thoughts & Archive**:
   - Only remove lines from `ideas.md` that have been explicitly discussed and converted.
   - Append processed raw dumps into `docs/notes/ideas-archive.md` (timestamped).
   - Keep unconfirmed or WIP notes intact in `ideas.md`.
4. **Verification**: Run `bun run check` to verify formatting and link integrity.
