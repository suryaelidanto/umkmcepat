---
name: push-dev
description: Use when changes on `dev` must be committed, pushed, and validated by CI.
---

# Push Dev

Use this skill whenever you need to commit and push local changes to the `dev` branch.

## Workflow Steps

### 1. Verification
Before staging or committing, run local checks to ensure the codebase compiles:
```bash
bun run check
```
* **If it fails**: Fix the errors first. Do not bypass or push broken code.

### 2. Stage

**If you know exactly which files you worked on** — stage only those files. Never blindly stage everything when you have context:
```bash
git add src/components/foo.tsx src/lib/bar.ts   # only what you touched
```

**If you have no session context** (e.g. fresh agent, resumed session, or user asked to commit all) — inspect first, then stage all changed files:
```bash
git status --short   # review what is changed
git add -A           # stage everything
```

When in doubt, run `git diff --stat` and use judgment. Do not silently stage unrelated files.

Construct the commit message using the Conventional Commits specification.
Format: `type(scope): description`
All commits must end with:
`Co-Authored-By: Claude <noreply@anthropic.com>`

When `push-main` opens or reuses the release PR, its title must use the same
Conventional Commit format because squash merging uses that title as the
commit subject on `main`. Keep it specific and imperative; never use generic
titles such as `Dev`, `Release`, `Update`, or `Merge pull request`.

Example command:
```bash
git commit -m "feat(auth): add email verification

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### 3. Push
Push your branch to origin:
```bash
git push origin dev
```

### 4. Watch CI (blocking — do not stop until green/red)
After pushing, find the run for the exact pushed commit and **block on it** so
you never watch another concurrent push or stop mid-run waiting for a re-prompt:
```bash
DEV_SHA=$(git rev-parse HEAD)
RUN_ID=$(gh run list --branch dev --limit 20 --json databaseId,headSha --jq ".[] | select(.headSha == \"$DEV_SHA\") | .databaseId" | head -n 1)
if [ -z "$RUN_ID" ]; then
  echo "No dev CI run found for $DEV_SHA" >&2
  exit 1
fi
gh run watch "$RUN_ID" --exit-status      # blocks until run finishes; exits non-zero on failure
```
`gh run watch --exit-status` is the gate. Do not `gh run list` and stop — that snapshot returns while the run is still in progress and forces the user to re-prompt you. Always block until the run reports a terminal state.

If the run failed, invoke `fix-ci` to view logs (`gh run view "$RUN_ID" --log-failed`), apply a minimal fix, push again, then **watch the new run to completion** — loop until green.

## Release handoff

A green `dev` run is the handoff to `push-main`. Do not check out, merge, or
push `main` from this skill.
