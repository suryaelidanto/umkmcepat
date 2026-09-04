---
name: ship-to-main
description: Use when releasing completed branch changes to the main branch via pull requests.
disable-model-invocation: true
---

# Ship To Main

Use this skill to release work from the current active feature branch (e.g. `feat/engine-update`, `feat/...`, `fix/...`) to protected `main`. Every distinct task/commit is released as its own individual PR and squash-merged to `main`, maintaining clean, traceable PR history.

## Workflow Steps

### 1. Ensure Local Commits and Branch CI Green (Sub-skills)

1. **Commit current task's uncommitted work**:
   If uncommitted changes from current task exist, invoke `atomic-commit` first (stage only current task files). Never discard or stash uncommitted changes from other agents.
2. **Sync and verify active branch**:
   Invoke `push-branch` to push task commits to origin and ensure CI passes.
   Do NOT proceed if branch CI is failing.

### 2. Identify Tasks / Commits to Release

Fetch latest remotes and list unmerged commits on the active branch:
```bash
CURRENT_BRANCH=$(git branch --show-current)
git fetch origin main "$CURRENT_BRANCH"
COMMITS=$(git log --reverse --format="%H" origin/main.."$CURRENT_BRANCH")
```

If no commits found (`origin/main..$CURRENT_BRANCH` empty), `main` is already up to date. Exit cleanly.
If releasing only specific task commit(s), set `COMMITS` to only those commit hashes; do not include other agents' unmerged commits unless explicitly instructed.

### 3. Release Each Task via Individual PR

> **Note on dirty working tree**: If other agents left uncommitted files in working tree, do NOT run `git checkout` directly if it fails or destroys changes. Stash temporary uncommitted changes or work cleanly without discarding them.

For each commit hash `$SHA` in `$COMMITS`:

1. **Extract commit info**:
   ```bash
   TITLE=$(git log -1 --format="%s" "$SHA")
   BODY=$(git log -1 --format="%b" "$SHA")
   SHORT_SHA=$(git rev-parse --short "$SHA")
   BRANCH="release/${SHORT_SHA}"
   ```

2. **Create temporary topic branch from current `origin/main`**:
   ```bash
   git checkout -B "$BRANCH" origin/main
   git cherry-pick "$SHA"
   git push -u origin "$BRANCH" --force
   ```

3. **Open individual PR targeting `main`**:
   ```bash
   PR_URL=$(gh pr create --base main --head "$BRANCH" --title "$TITLE" --body "${BODY:-$TITLE}")
   PR_NUM=$(gh pr view "$BRANCH" --json number --jq .number)
   ```

4. **Gate on PR CI checks**:
   ```bash
   gh pr checks "$PR_NUM" --watch --interval 10
   ```
   If checks fail: stop, fix on the active branch, and restart flow.

5. **Squash merge into `main` and delete remote topic branch**:
   ```bash
   gh pr merge "$PR_NUM" --squash --delete-branch
   ```

6. **Watch post-merge CI on `main`**:
   ```bash
   MAIN_SHA=$(git ls-remote origin refs/heads/main | cut -f1)
   MAIN_RUN_ID=$(gh run list --branch main --limit 10 --json databaseId,headSha --jq ".[] | select(.headSha == \"$MAIN_SHA\") | .databaseId" | head -n 1)
   if [ -n "$MAIN_RUN_ID" ]; then
     gh run watch "$MAIN_RUN_ID" --exit-status
   fi
   ```

### 4. Return to Active Branch

Switch back to the original active branch and rebase/sync with updated `origin/main`:
```bash
git checkout "$CURRENT_BRANCH"
git fetch origin main
git rebase origin/main
```
