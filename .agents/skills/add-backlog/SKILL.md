---
name: add-backlog
description: Use when adding explicit, isolated tasks, bugs, or feature tickets with [#XX] codes and domain tags directly into docs/notes/backlog.md.
disable-model-invocation: true
---

# Add Backlog Skill

Add isolated, actionable tasks directly into `docs/notes/backlog.md` with deterministic `[#XX]` numbering and clear domain tags.

## Workflow

1. **Inspect Existing Backlog**:
   - Read `docs/notes/backlog.md`.
   - Find the highest existing ticket number across all columns (e.g. `[#16]`).
   - Assign the next sequential code (e.g. `[#17]`).

2. **Format Isolated Task Card**:
   - Every ticket must represent a single, isolated concern.
   - Format:
     ```markdown
     - [ ] **[#XX] Title**: Concrete description explaining what needs to change, why, and acceptance boundaries #tag1 #tag2
     ```
   - Standard domain tags: `#engine`, `#ui`, `#ux`, `#workspace`, `#security`, `#copy`, `#scaffold`, `#media`, `#data`, `#future`.

3. **Append Non-Destructively**:
   - Write and append the ticket directly to the bottom of `## Backlog` in `docs/notes/backlog.md` (or `## Future / Icebox` for speculative/parking items).
   - Never modify or reorder existing tickets in any other column.

4. **Verify**:
   - Run `bun run check`.

5. **Report**:
   - Show the added ticket clearly to the developer.
