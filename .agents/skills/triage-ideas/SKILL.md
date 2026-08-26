---
name: triage-ideas
description: Triage raw thoughts and inspect all attached images from docs/notes/ideas.md into structured Kanban tasks with [#XX] codes in docs/notes/backlog.md, backup to docs/notes/ideas-old/<timestamp>.md, and clear ideas.md.
disable-model-invocation: true
---

# Triage Ideas Skill

Interview the developer relentlessly to map raw thoughts and attached visual evidence from `docs/notes/ideas.md` into precise Kanban tasks with `[#XX]` codes in `docs/notes/backlog.md`, save timestamped backups in `docs/notes/ideas-old/`, and keep `docs/notes/ideas.md` clean for the next dump.

## Workflow & Non-Destructive Principles

1. **Mandatory Image Inspection & Zero Assumption Frontier Probing**:
   - Read `docs/notes/ideas.md`.
   - **MANDATORY IMAGE INSPECTION (IRON LAW)**: Scan the entire file for any image references, paths, markdown image tags (`![](/tmp/...)`, `![](...)`), or Obsidian wikilinks (`![[...]]`). Use the `read` tool to inspect **every single attached image** directly before formulating questions or drawing conclusions. Never skip image inspection.
   - Never assume, guess, or jump to conclusions from brief text fragments or uninspected visual attachments.
   - Present up to 5 rich multiple-choice options (`[A]`, `[B]`, `[C]`, `[D]`, `[E]`) per question with an explicit recommendation (`➡️ **Recommended: [X]**`).
   - Keep asking until all ambiguous intentions, visual references, and scope boundaries are 100% clarified.
   - The developer can reply simply by typing letters (e.g. `1C, 2A, 3B`).

2. **Non-Destructive Backlog Routing**:
   - **Actionable Tasks, Bugs, & Features** $\rightarrow$ Append as checkable items under `## Backlog` in `docs/notes/backlog.md` using the next incremental `[#XX]` code (e.g. `[#09]`, `[#10]`) and domain tags (`#engine`, `#ui`, `#security`).
   - **Future / Long-Term Explorations** $\rightarrow$ Append under `## Future / Icebox` in `docs/notes/backlog.md` with `[#XX]` code and tags.
   - **Preserve Existing Board State**: Never delete, reorder, or alter items in other columns (`In Progress`, `Needs Revision / Check Again`, `Ready for Review`, `Done`).
   - **Architectural Decisions** $\rightarrow$ Create a 1-page ADR in `docs/architecture/ADR-<name>.md` and reference it inside the new backlog item.
   - **Repository Standards** $\rightarrow$ Update `AGENTS.md` or `DEV.md` directly in English.

3. **Timestamped Backup & Clean Reset**:
   - Save the raw contents of `ideas.md` to `docs/notes/ideas-old/<YYYY-MM-DD-HHmm>.md`.
   - Reset `docs/notes/ideas.md` to a blank 0-byte file.

4. **Verification**: Run `bun run check` to verify markdown formatting and link integrity.
