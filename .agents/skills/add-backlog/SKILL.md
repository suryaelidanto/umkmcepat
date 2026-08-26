---
name: add-backlog
description: Use when adding explicit, isolated tasks, bugs, or feature tickets with [#XX] codes, single contextual emoji icon, clean spacing, and domain tags directly into docs/notes/backlog.md.
disable-model-invocation: true
---

# Add Backlog Skill

Add isolated, actionable tasks directly into `docs/notes/backlog.md` with deterministic `[#XX]` numbering, single contextual emoji, clean breathing room spacing, and clear domain tags.

## Workflow

1. **Inspect Existing Backlog**:
   - Read `docs/notes/backlog.md`.
   - Find the highest existing ticket number across all columns (e.g. `[#27]`).
   - Assign the next sequential code (e.g. `[#28]`).

2. **Format Isolated Task Card**:
   - Every ticket represents a single, isolated concern.
   - Format:
     ```markdown
     - [ ] <emoji> **[#XX] Title**: Concrete description explaining what needs to change, why, and acceptance boundaries #tag1 #tag2
     ```
   - Standard domain tags: `#engine`, `#ui`, `#ux`, `#workspace`, `#security`, `#copy`, `#scaffold`, `#media`, `#data`, `#future`.
   - Contextual Emoji: Exactly 1 emoji reflecting the task (e.g. 📸 media, 📜 history/docs, 🎨 UI, 💬 chat, 🛡️ security, ⚡ perf, 🧪 test, 🔄 sync/restore, 🚀 deploy).
   - **Breathing Room (Spacing)**: Always leave a blank newline between cards in `docs/notes/backlog.md` for clean Obsidian Kanban board rendering.

3. **Append Non-Destructively**:
   - Write and append the ticket with a newline directly under `## Backlog` in `docs/notes/backlog.md` (or `## Future / Icebox` for speculative items).
   - Never modify or reorder existing tickets in other columns.

4. **Verify**:
   - Run `bun run check`.

5. **Report**:
   - Show the added ticket clearly to the developer.
