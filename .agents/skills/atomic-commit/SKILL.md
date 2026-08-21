---
name: atomic-commit
description: Stage and commit isolated changes locally with Conventional Commits. No git push. Use when committing code progress, completing a task, or when staged changes need an atomic commit before pushing.
---

# Atomic Commit

Use this skill to create isolated, well-scoped commits locally on the current branch.
**Rule: Do not push to remote inside this skill.**

## Staging Policy

1. **Active Agent Task Context (DEFAULT - STRICT ISOLATION)**:
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

## Commit Message Format

Use the Conventional Commits specification in imperative mood:
`type(scope): concise description`

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

Append co-author attribution on every commit:
`Co-Authored-By: Claude <noreply@anthropic.com>`

## Execution

1. Check diff and verify staged files:
   ```bash
   git status --short
   git diff --staged --stat
   ```

2. Commit locally:
   ```bash
   git commit -m "type(scope): concise description

   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```

3. Confirm commit was created:
   ```bash
   git log -n 1 --oneline
   ```
