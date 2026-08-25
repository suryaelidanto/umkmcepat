---
name: triage-ideas
description: Triage raw thoughts from docs/notes/ideas.md into structured Kanban tasks in docs/notes/backlog.md, architectural decisions in docs/architecture/, or repository rules in AGENTS.md/DEV.md, then clear ideas.md.
---

# Triage Ideas Skill

Interview the developer relentlessly to map their raw thoughts into a precise decision tree. Triage notes from `docs/notes/ideas.md` into high-signal Kanban tasks in `docs/notes/backlog.md`, architectural decisions in `docs/architecture/`, and engineering rules in `AGENTS.md` / `DEV.md`.

## Workflow & Alignment First (95% Confidence Frontier)

1. **Relentless Frontier Probing (Grilling Mechanics)**:
   - Read `docs/notes/ideas.md`.
   - Never assume, extrapolate, or guess developer intent from brief fragments.
   - Work the decision tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled.
   - Present up to 5 rich, highly intentional options (`[A]`, `[B]`, `[C]`, `[D]`, `[E]`) per question that anticipate the developer's exact mind and technical nuances.
   - Always provide an explicit recommendation (`➡️`) with concise technical rationale so the developer can answer with zero friction.
   - Format each question clearly:
     ```markdown
     ❓ **Q1** - **<Topic Title>**: <Context and implications>
     - **[A]** <Option 1>
     - **[B]** <Option 2>
     - **[C]** <Option 3>
     - **[D]** <Option 4>
     - **[E]** <Option 5 / Custom>

     ➡️ **Recommended: [X]** — <1-line senior dev rationale>
     ```

2. **Lazy Developer Reply**:
   - The developer can reply simply by typing letters (e.g. `1C, 2A, 3B, 4D`) or saying *"accept all recommendations"*.

3. **Route Confirmed Items**:
   - **Tasks, Bugs, & Features** $\rightarrow$ Add as checkable items under `## Backlog` in `docs/notes/backlog.md` with relevant domain tags (`#engine`, `#ux`, `#conversion`, `#security`, `#pricing`, `#architecture`).
   - **Architectural Decisions** $\rightarrow$ If confirmed as a structural change, create a 1-page ADR in `docs/architecture/ADR-<name>.md` and link it inside `docs/notes/backlog.md`.
   - **Repository Standards** $\rightarrow$ If confirmed as a permanent engineering rule, update `AGENTS.md` or `DEV.md` directly.

4. **Preserve Untriaged Thoughts & Archive**:
   - Only remove lines from `ideas.md` that have been explicitly discussed and confirmed.
   - Append processed raw dumps into `docs/notes/ideas-archive.md` (timestamped).
   - Keep unconfirmed or WIP notes intact in `ideas.md`.
   - When all items are processed, reset `ideas.md` to a completely blank, empty file (zero bytes, no markdown headers or comments).

5. **Verification**: Run `bun run check` to verify formatting and link integrity.
