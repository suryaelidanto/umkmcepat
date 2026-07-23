---
name: push-main
description: Use to push changes from `dev` to `main`. This handles the full release loop: local checks, commit to `dev`, merge `dev` into `main`, push `main`, watch CI, and return back to `dev` locally. 
---

# Push Main

Use this skill when the work on `dev` is complete, and it is time to release or deploy to `main`. 

## Workflow Steps

### 1. Push Dev first
Ensure `dev` is in a clean state and all local changes are committed and pushed successfully:
Follow the `@.agents/skills/push-dev` skill workflow first (i.e. `bun run check`, `git add`, `git commit` with Conventional Commits, and `git push origin dev`).
Do not proceed to step 2 if `dev` fails CI.

### 2. Switch and Merge
Checkout the `main` branch, ensure it's up to date, and merge `dev` into it:
```bash
git checkout main
git pull origin main
git merge dev --no-edit
```
If there are merge conflicts, resolve them locally before continuing. 

### 3. Verification on Main
Ensure the combined codebase is completely healthy:
```bash
bun run check
```
If this fails, fix the errors on `main` and commit them before pushing.

### 4. Push Main
Push the newly merged `main` branch to origin:
```bash
git push origin main
```

### 5. Watch CI (blocking — do not stop until green/red)
Verify the deploy/workflow succeeds on `main`. Find the newest run and **block on it** so you never stop mid-run waiting for a re-prompt:
```bash
RUN_ID=$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status      # blocks until run finishes; exits non-zero on failure
```
`gh run watch --exit-status` is the gate. Do not `gh run list` and stop — that snapshot returns while the run is still in progress and forces the user to re-prompt you. Always block until the run reports a terminal state.

If CI fails, follow the `@.agents/skills/fix-ci` procedures. View failing logs (`gh run view "$RUN_ID" --log-failed`), commit a minimal fix, push again, then **watch the new run to completion** — loop until green.

### 6. Return to Dev
Always leave the local worktree in the active development branch:
```bash
git checkout dev
```
If you had to apply CI fixes directly to `main`, make sure to merge those fixes back to `dev` locally (`git merge main`) and push them.
