---
name: push-main
description: "Use when completed work on `dev` must be released to protected `main` branch via individual PRs per task."
---

# Push Main

Use this skill to release work from `dev` to protected `main`. Every distinct task/commit on `dev` is released as its own individual PR and squash-merged to `main`, maintaining clean, traceable PR history.

## Workflow Steps

### 1. Ensure Local Commits and Dev CI Green (Sub-skills)

1. **Commit any uncommitted work**:
   If uncommitted changes exist, invoke `atomic-commit` first.
2. **Sync and verify `dev`**:
   Invoke `push-dev` to push all pending commits to `origin dev` and ensure CI passes.
   Do NOT proceed if `dev` CI is failing.

### 2. Identify Tasks / Commits to Release

Fetch latest remotes and list unmerged commits on `dev`:
```bash
git fetch origin main dev
COMMITS=$(git log --reverse --format="%H" origin/main..dev)
```

If no commits found (`origin/main..dev` empty), `main` is already up to date. Exit cleanly.

### 3. Release Each Task via Individual PR

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
   If checks fail: stop, fix on `dev`, and restart flow.

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

7. **Update remote reference for next iteration**:
   ```bash
   git fetch origin main
   ```

### 4. Resync `dev` and Return

After all individual PRs are merged into `main`:

```bash
git checkout dev
git fetch origin main
git merge origin/main -m "chore(sync): sync main into dev"
git push origin dev
```

Leave working tree clean on `dev`:
```bash
git status --short
```
