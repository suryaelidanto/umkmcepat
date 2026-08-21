---
name: push-dev
description: Use when changes on `dev` must be committed, pushed, and validated by CI.
---

# Push Dev

Use this skill whenever you need to push local changes to `dev` and wait for remote CI verification.

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
Push local `dev` commits to origin:
```bash
git push origin dev
```

### 4. Watch CI (blocking)
Find the CI run for the exact commit SHA and block until terminal state:
```bash
DEV_SHA=$(git rev-parse HEAD)
RUN_ID=$(gh run list --branch dev --limit 20 --json databaseId,headSha --jq ".[] | select(.headSha == \"$DEV_SHA\") | .databaseId" | head -n 1)
if [ -z "$RUN_ID" ]; then
  echo "No dev CI run found for $DEV_SHA" >&2
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

Once `dev` CI is green, work is ready for `push-main`. Do not push or merge `main` from this skill.
