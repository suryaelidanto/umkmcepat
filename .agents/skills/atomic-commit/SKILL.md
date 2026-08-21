---
name: atomic-commit
description: Stage and commit isolated changes locally with Conventional Commits. No git push. Use when committing code progress, completing a task, or when staged changes need an atomic commit before pushing.
---

# Atomic Commit

Use this skill to create isolated, well-scoped commits locally on the current branch.
**Rule: Do not push to remote inside this skill.**

## Staging Policy

1. **Active Agent Task Context**:
   - Stage ONLY files modified for the current task:
     ```bash
     git add src/path/to/file1.ts src/path/to/file2.test.ts
     ```
   - Do NOT stage unrelated dirty files unless explicitly instructed by the user.

2. **No Active Task Context / User Explicit Request**:
   - If no specific task isolation is needed or user requested committing all changes:
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
