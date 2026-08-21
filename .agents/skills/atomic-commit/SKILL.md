---
name: atomic-commit
description: Stage isolated task changes locally and craft precise, high-standard Conventional Commits. Never push to remote. Never touch or discard other agents' uncommitted files.
---

# Atomic Commit & Conventional Commits Guide

Use this skill to isolate, stage, craft, validate, and commit changes locally on the current branch.
**Rule: Do not push to remote inside this skill.**

---

## 1. Staging Policy (Strict Task Isolation)

1. **Active Agent Task Context (DEFAULT)**:
   - Stage **ONLY** files explicitly created or modified for your current assigned task:
     ```bash
     git add src/path/to/my-file1.ts src/path/to/my-file2.test.ts
     ```
   - **STRICTLY FORBIDDEN:**
     - **NEVER** run `git checkout -- .`, `git checkout HEAD -- <dir>`, `git restore .`, or `git reset --hard` to revert untracked/modified files created by other agents or skills (such as `.agents/skills/*`, user edits, or parallel agent worktrees).
     - **NEVER** touch, overwrite, discard, or clean unrelated dirty files. Leave all other files untouched in the working tree.
     - **NEVER** run `git add -A` or `git add .` unless explicitly requested by the user.

2. **Explicit User Request to Stage All**:
   - Only when user explicitly says "commit everything" or "stage all":
     ```bash
     git status --short
     git add -A
     ```

---

## 2. Conventional Commit Specification & Crafting

Every commit message must follow the Conventional Commits v1.0.0 specification with strict rigor:

### Structure

```
<type>(<scope>): <short summary>

[optional body: explain WHAT changed, WHY, and technical rationale]

[optional footer: BREAKING CHANGE, Closes #123, refs]
Co-Authored-By: Claude <noreply@anthropic.com>
```

### Type Taxonomy

| Type | Purpose | When to use |
|---|---|---|
| `feat` | New feature | User-facing feature, new capability, or new API endpoint |
| `fix` | Bug fix | Fixing broken behavior, patch, or edge case |
| `docs` | Documentation | Markdown, README, skill docs, JSDoc / inline doc updates |
| `style` | Formatting | Whitespace, formatting, semicolon fixes (no logic impact) |
| `refactor` | Code restructuring | Code changes that neither fix bugs nor add features |
| `perf` | Performance | Optimizations reducing memory, CPU, DB roundtrips, or latency |
| `test` | Tests | Adding missing tests, correcting test regressions |
| `build` | Build / Dependencies | Bun/Vite configs, package.json dependencies, lockfile |
| `ci` | CI / CD | GitHub Actions workflows, lint/typecheck script updates |
| `chore` | Housekeeping | Meta files, tooling, cleanup tasks |
| `revert` | Revert | Reverting a previous commit |

### Quality Rules
- **Imperative summary**: Use imperative verbs in English (`add`, `fix`, `update`, `remove`, `refactor`). Never past tense (`added`, `fixed`).
- **Short line**: Header line must be ≤ 72 characters, lowercase start, no trailing period.
- **Precise scope**: Scope must be a clean noun targeting the module, feature, or directory touched (e.g. `(projects)`, `(api)`, `(skills)`, `(ui)`, `(auth)`).
- **Breaking changes**: Append `!` after type/scope (e.g. `feat(auth)!: ...` or `refactor(db)!: ...`) AND include `BREAKING CHANGE: <explanation>` in the footer.
- **Detailed body when non-trivial**: If the change has architectural implications, complex bug fixes, or behavioral subtleties, explain *why* in the body paragraphs.
- **Always include Co-Author**: Append `Co-Authored-By: Claude <noreply@anthropic.com>`.

### Reference Examples

```bash
# Feature with scope
git commit -m "feat(projects): add batch generator retry handler

Co-Authored-By: Claude <noreply@anthropic.com>"

# Bug fix with explanation body
git commit -m "fix(ui): correct dialog close button alignment on mobile

Flex wrap caused the close button to push down beneath the modal header on screens < 640px.

Co-Authored-By: Claude <noreply@anthropic.com>"

# Breaking change
git commit -m "feat(auth)!: migrate token verification to header bearer scheme

BREAKING CHANGE: Query parameter token authentication is now rejected.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 3. Step-by-Step Execution

1. **Check status and review diff**:
   ```bash
   git status --short
   git diff <file>
   ```

2. **Stage task-specific files only**:
   ```bash
   git add <file1> <file2>
   git diff --staged --stat
   ```

3. **Validate conventional message & commit**:
   ```bash
   git commit -m "type(scope): concise description

   [optional body]

   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```

4. **Verify commit record**:
   ```bash
   git log -n 1 --stat
   ```
