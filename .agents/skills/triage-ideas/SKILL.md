---
name: triage-ideas
description: Triage raw thoughts from docs/notes/ideas.md into structured Kanban tasks in docs/notes/backlog.md, architectural decisions in docs/architecture/, or repository rules in AGENTS.md/DEV.md, then clear ideas.md.
---

# Triage Ideas Skill

Read raw developer brain dumps from `docs/notes/ideas.md`, ask clarifying questions to align with the developer's exact mental model, categorize and route them to their proper documentation homes, and archive processed notes safely.

## Workflow & Alignment First (95% Confidence Rule)

1. **Relentless Probing with Lazy Multiple-Choice Options (A/B/C/D)**:
   - Read `docs/notes/ideas.md`.
   - Never assume, extrapolate, or guess developer intent from brief fragments.
   - Relentlessly question the developer until 95%+ confident, but **make answering dead simple for lazy developers**:
     - Format every question with clear multiple-choice options: `[A]`, `[B]`, `[C]`, `[Custom]`.
     - The developer can simply reply with single letters (e.g. `1A, 2B, 3A, 4C`).
     - Example:
       ```
       1. "super prevent placeholder":
          [A] In Discuss: AI must not emit cards without conversational preamble text.
          [B] In Generator: Banned words check (e.g. "Lorem Ipsum", "Contoh Menu") fails build.
          [C] Both A and B.
       ```
2. **Route Confirmed Items**:
   - **Tasks, Bugs, & Features** $\rightarrow$ Add as checkable items under `## Backlog` in `docs/notes/backlog.md` with relevant domain tags (`#engine`, `#ux`, `#conversion`, `#security`, `#pricing`, `#architecture`).
   - **Architectural Decisions** $\rightarrow$ If confirmed as a structural change, create a 1-page ADR in `docs/architecture/ADR-<name>.md` and link it inside `docs/notes/backlog.md`.
   - **Repository Standards** $\rightarrow$ If confirmed as a permanent engineering rule, update `AGENTS.md` or `DEV.md` directly.
3. **Preserve Untriaged Thoughts & Archive**:
   - Only remove lines from `ideas.md` that have been explicitly discussed and confirmed.
   - Append processed raw dumps into `docs/notes/ideas-archive.md` (timestamped).
   - Keep unconfirmed or WIP notes intact in `ideas.md`.
   - When all items are processed, reset `ideas.md` to a completely blank, empty file (zero bytes, no markdown headers or comments).
4. **Verification**: Run `bun run check` to verify formatting and link integrity.
