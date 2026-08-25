---
name: add-backlog
description: Use when adding explicit, isolated tasks, bugs, or feature tickets with T-XX codes and domain tags into docs/notes/backlog.md without running a full idea triage.
disable-model-invocation: true
---

# Add Backlog Skill

Add isolated, actionable tasks directly into `docs/notes/backlog.md` with deterministic `[#XX]` numbering and clear domain tags.

## Workflow

1. **Inspect Existing Backlog**:
   - Read `docs/notes/backlog.md`.
   - Find the highest existing ticket number (e.g. `[#13]`).
   - Assign the next sequential code (e.g. `[#14]`).

2. **Format Isolated Task Card**:
   - Every ticket must represent a single, isolated concern.
   - Format:
     ```markdown
     - [ ] **[#XX] Title**: Concrete description explaining what needs to change, why, and the acceptance boundary #tag1 #tag2
     ```
   - Standard domain tags: `#engine`, `#ui`, `#ux`, `#workspace`, `#security`, `#copy`, `#scaffold`, `#media`, `#data`, `#future`.

3. **Append Non-Destructively**:
   - Add new actionable tickets to the bottom of `## Backlog`.
   - Add long-term or speculative items to `## Future / Icebox`.
   - Never modify or reorder items in `## In Progress`, `## Needs Revision / Check Again`, `## Ready for Review`, or `## Done`.

4. **Verify**:
   - Run `bunx prettier --write docs/notes/backlog.md && bun run check`.
