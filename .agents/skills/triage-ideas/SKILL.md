---
name: triage-ideas
description: Triage raw thoughts from docs/notes/ideas.md into structured Kanban tasks with T-XX codes in docs/notes/backlog.md, backup to docs/notes/ideas-old/<timestamp>.md, and clear ideas.md.
---

# Triage Ideas Skill

Interview the developer relentlessly to map raw thoughts into a precise decision tree. Triage notes from `docs/notes/ideas.md` into high-signal Kanban tasks with compact `T-XX` codes in `docs/notes/backlog.md`, save timestamped backups in `docs/notes/ideas-old/`, and maintain personal notes in `docs/notes/notes.md`.

## Workflow & Alignment First (95% Confidence Frontier)

1. **Relentless Frontier Probing (Grilling Mechanics)**:
   - Read `docs/notes/ideas.md`.
   - Never assume or guess developer intent from brief fragments.
   - Present up to 5 rich options (`[A]`, `[B]`, `[C]`, `[D]`, `[E]`) per question with an explicit recommendation (`➡️ **Recommended: [X]**`).
   - The developer can reply simply by typing letters (e.g. `1C, 2A, 3B`).

2. **Route Confirmed Items**:
   - **Tasks, Bugs, & Features** $\rightarrow$ Add as checkable items under `## Backlog` in `docs/notes/backlog.md` with compact incremental `T-XX` codes (e.g. `[T-01]`, `[T-02]`) and domain tags.
   - **Architectural Decisions** $\rightarrow$ Create a 1-page ADR in `docs/architecture/ADR-<name>.md` and link it inside `docs/notes/backlog.md`.
   - **Repository Standards** $\rightarrow$ Update `AGENTS.md` or `DEV.md` directly.

3. **Backup & Clean Reset**:
   - Save the raw contents of `ideas.md` to `docs/notes/ideas-old/<YYYY-MM-DD-HHmm>.md`.
   - Reset `docs/notes/ideas.md` to a completely blank, 0-byte file for the next session.

4. **Verification**: Run `bun run check` to verify formatting and link integrity.
