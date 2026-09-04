---
name: push-branch
description: Use when pushing branch commits to remote and monitoring CI check results.
disable-model-invocation: true
---

# Push Branch

Use this skill whenever you need to push local changes on the current active branch (e.g. `feat/...`, `fix/...`, `feat/engine-update`) and wait for remote CI verification.

## Workflow Steps

### 1. Atomic Commit (Sub-skill)
If there are uncommitted working tree changes from the current task, invoke `atomic-commit` first:
- Stage ONLY files modified for the current task.
- NEVER discard, revert, stash, or stage uncommitted changes belonging to other agents/tasks.
- Create local Conventional Commit.
- Verify working tree status:
```bash
git status --short
```

### 2. Verification
Run local checks before pushing to prevent broken CI runs:
```bash
bun run check
```
* **If it fails**: Fix the errors first and commit the fix via `atomic-commit`. Do not bypass.

### 3. Push
Detect current branch and push commits to origin:
```bash
CURRENT_BRANCH=$(git branch --show-current)
if [ -z "$CURRENT_BRANCH" ] || [ "$CURRENT_BRANCH" = "main" ]; then
  echo "Cannot push directly to main using push-branch. Use ship-to-main to release." >&2
  exit 1
fi
git push -u origin "$CURRENT_BRANCH"
```

### 4. Watch CI (blocking)
Find the CI run for the exact commit SHA on the current branch and block until terminal state:
```bash
BRANCH_SHA=$(git rev-parse HEAD)
RUN_ID=$(gh run list --branch "$CURRENT_BRANCH" --limit 20 --json databaseId,headSha --jq ".[] | select(.headSha == \"$BRANCH_SHA\") | .databaseId" | head -n 1)
if [ -z "$RUN_ID" ]; then
  echo "No CI run found for $BRANCH_SHA on $CURRENT_BRANCH" >&2
  exit 1
fi
gh run watch "$RUN_ID" --exit-status
```

If the run fails:
1. View failing logs: `gh run view "$RUN_ID" --log-failed`.
2. Apply minimal fix.
3. Commit via `atomic-commit`.
4. Push and watch new run until green.

## Release Handoff

Once branch CI is green, work is ready for `ship-to-main`. Do not push or merge `main` directly from this skill.
