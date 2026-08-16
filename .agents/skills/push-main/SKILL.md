---
name: push-main
description: "Use when completed work on `dev` must be released to the protected `main` branch."
---

# Push Main

Use this skill when completed work on `dev` must be released to protected
`main`. Always use a GitHub pull request; never merge `dev` locally and push
`main` directly.

## Workflow Steps

### 1. Push Dev first

Ensure `dev` is clean, committed, pushed, and green.
**REQUIRED SUB-SKILL:** Use `push-dev` first. Do not continue if its CI fails.

If unrelated local commits are present on `dev`, resolve their scope before
releasing. Do not silently include another job's work.

### 2. Create or reuse the release PR

Check for an open `dev` → `main` PR:

```bash
gh pr list --base main --head dev --state open --limit 1
```

The PR title becomes the commit subject on `main`, so it must be a concise
Conventional Commit title in the imperative mood:

```text
type(scope): imperative release summary
```

Use a real scope and describe the user-visible or engineering change. Never
use generic titles such as `Dev`, `Release`, `Update`, or `Merge pull request`.
Examples:

```text
fix(navigation): preserve loading through route transitions
chore(ci): align protected branch release flow
```

If an existing release PR has a generic title, fix it before merging:

```bash
gh pr edit <PR_NUMBER> --title "type(scope): imperative release summary"
```

If none exists, create one using the same title and a useful release body:

```bash
gh pr create --base main --head dev \
  --title "type(scope): imperative release summary" \
  --body "<release summary>"
```

Do not check out `main`, merge locally, or push `origin main` in this skill.

### 3. Gate on PR checks

Wait for every required PR check to finish and pass:

```bash
gh pr checks <PR_NUMBER> --watch --interval 10
```

If a check fails, use `fix-ci`, inspect the failing log, fix the issue on
`dev`, push again, and update the PR. Never bypass required checks or merge
with admin privileges.

### 4. Merge through GitHub

After the PR checks are green, squash-merge through GitHub and keep the `dev`
branch:

```bash
gh pr merge <PR_NUMBER> --squash --delete-branch=false
```

Squash merging keeps `dev`'s detailed commit history while creating one clean
release commit on `main`. GitHub derives its subject from the PR title and
appends `(#PR_NUMBER)`, for example:
`fix(navigation): preserve loading through route transitions (#27)`.
Never use regular `--merge`, rebase locally, or bypass the required checks.

### 5. Watch post-merge main CI

The current Quality workflow also runs on pushes to `main`. Find the run whose
`headSha` matches the PR merge commit, then block until it reaches a terminal
state:

```bash
gh run watch <MAIN_RUN_ID> --exit-status
```

Do not stop at a pending status snapshot. If no push-to-main workflow exists,
skip this step; deployment is separate and must not be assumed.

If post-merge main CI fails, use `fix-ci`, fix the issue on `dev`, and repeat
the PR release flow. Do not commit directly on protected `main`.

### 6. Return to Dev

Always leave the local worktree on the active development branch:

```bash
git checkout dev
```
