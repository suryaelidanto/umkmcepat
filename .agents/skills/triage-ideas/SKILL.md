---
name: triage-ideas
description: Triage raw thoughts and inspect all attached images from docs/notes/ideas.md into structured Kanban tasks with [#XX] codes, contextual icon, priority, author, date, and clean spacing in docs/notes/backlog.md, backup to docs/notes/ideas-old/<timestamp>.md, and clear ideas.md.
disable-model-invocation: true
---

# Triage Ideas Skill

Interview the developer relentlessly to map raw thoughts and attached visual evidence from `docs/notes/ideas.md` into precise Kanban tasks with `[#XX]` codes, single contextual emoji, priority indicator `[P0..P3]`, `@author`, created date, and clean breathing room spacing in `docs/notes/backlog.md`, save timestamped backups in `docs/notes/ideas-old/`, and keep `docs/notes/ideas.md` clean for the next dump.

## Workflow & Non-Destructive Principles

1. **Mandatory Image Inspection & Zero Assumption Frontier Probing**:
   - Read `docs/notes/ideas.md`.
   - **MANDATORY IMAGE INSPECTION (IRON LAW)**: Scan the entire file for any image references, paths, markdown image tags (`![](/tmp/...)`, `![](...)`), or Obsidian wikilinks (`![[...]]`). Use the `read` tool to inspect **every single attached image** directly before formulating questions or drawing conclusions. Never skip image inspection.
   - Never assume, guess, or jump to conclusions from brief text fragments or uninspected visual attachments.
   - Present up to 5 rich multiple-choice options (`[A]`, `[B]`, `[C]`, `[D]`, `[E]`) per question with an explicit recommendation (`➡️ **Recommended: [X]**`).
   - Keep asking until all ambiguous intentions, visual references, and scope boundaries are 100% clarified.
   - The developer can reply simply by typing letters (e.g. `1C, 2A, 3B`).

2. **Standardized Card Formatting**:
   - Format:
     ```markdown
     - [ ] <emoji> **[#XX] [P0..P3] Title**: Concrete description explaining what needs to change, why, and acceptance boundaries #tag1 #tag2 @author YYYY-MM-DD
     ```
   - Standard domain tags: `#engine`, `#ui`, `#ux`, `#workspace`, `#security`, `#copy`, `#scaffold`, `#media`, `#data`, `#future`.
   - Standard priority: `[P0]` (Critical/Blocker), `[P1]` (High), `[P2]` (Medium), `[P3]` (Low/Polish).
   - Author: `@<git-username>` (e.g. `@suryaelidanto`).
   - Contextual Emoji: Exactly 1 emoji reflecting the task (e.g. 📸 media, 📜 history/docs, 🎨 UI, 💬 chat, 🛡️ security, ⚡ perf, 🧪 test, 🔄 sync/restore, 🚀 deploy).
   - **Breathing Room (Spacing)**: Always leave a blank newline between cards in `docs/notes/backlog.md` for clean Obsidian Kanban board rendering.

3. **Non-Destructive Backlog Routing**:
   - **Actionable Tasks, Bugs, & Features** $\rightarrow$ Append with a newline under `## Backlog` in `docs/notes/backlog.md` using the next incremental `[#XX]` code.
   - **Future / Long-Term Explorations** $\rightarrow$ Append with a newline under `## Future / Icebox` in `docs/notes/backlog.md`.
   - **Preserve Existing Board State**: Never delete, reorder, or alter items in other columns (`In Progress`, `Needs Revision / Check Again`, `Ready for Review`, `Done`).
   - **Architectural Decisions** $\rightarrow$ Create a 1-page ADR in `docs/architecture/ADR-<name>.md` and reference it inside the new backlog item.
   - **Repository Standards** $\rightarrow$ Update `AGENTS.md` or `DEV.md` directly in English.

4. **Timestamped Backup & Clean Reset**:
   - Save the raw contents of `ideas.md` to `docs/notes/ideas-old/<YYYY-MM-DD-HHmm>.md`.
   - Reset `docs/notes/ideas.md` to a blank 0-byte file.

5. **Verification**: Run `bun run check` to verify markdown formatting and link integrity.
