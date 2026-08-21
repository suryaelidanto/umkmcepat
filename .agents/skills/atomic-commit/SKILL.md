---
name: atomic-commit
description: Stage and commit isolated changes locally with Conventional Commits. No git push. Use when committing code progress, completing a task, or when staged changes need an atomic commit before pushing.
---

# Atomic Commit

Use this skill to create isolated, well-scoped commits locally on the current branch.
**Rule: Do not push to remote inside this skill.**

## Staging Policy

1. **Active Agent Task Context (DEFAULT)**:
   - Stage ONLY files explicitly created or modified for the current task:
     ```bash
     git add src/path/to/file1.ts src/path/to/file2.test.ts
     ```
   - **NEVER** stage, revert, discard, or clean unrelated dirty files from other agents or user work. Leave unmanaged files untouched in working tree.
   - **NEVER** run `git add -A`, `git add .`, `git reset --hard`, `git restore .`, or `git clean` unless explicitly ordered by user.

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
