# UMKM Cepat Documentation Hub

Obsidian-compatible knowledge base for UMKM Cepat.

## Navigation

- **[[architecture/overview]]**: System architecture and core design principles
- **[[guides/local-development]]**: Local setup, environment, and development commands
- **[[notes/backlog]]**: Product backlog, Kanban task board, and milestones
- **[[notes/ideas]]**: Private local scratchpad for raw developer brain dumps and complaints (gitignored). Run `.agents/skills/triage-ideas/` to triage into backlog.
- **[[notes/ideas-archive]]**: Private local history log of past processed dumps (gitignored).

## Workflow for Developers & Agents

1. **Raw Dumps**: Paste thoughts, complaints, or feature ideas into `docs/notes/ideas.md`.
2. **Triage Loop**: Invoke `.agents/skills/triage-ideas/SKILL.md`. The agent must relentlessly question the developer until 95%+ confident about exact intent before routing.
3. **Execution**: Pick tasks from `docs/notes/backlog.md` (`Backlog` → `In Progress` → `Done`).
4. **Clean Reset**: Once triaged, `docs/notes/ideas.md` resets to blank zero-byte file.

## Core System Contracts

- `AGENTS.md` → AI boot instructions and iron laws
- `PRINCIPLES.md` → Senior developer standards and engineering taste
- `PRODUCT.md` → Product definition and UMKM domain constraints
- `DESIGN.md` → Visual design system and tactile UI tokens
- `DEV.md` → Development workflow, testing, and CI verification
