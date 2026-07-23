---
name: push-dev
description: Use to commit and push changes on the `dev` branch. Handles local verification, Conventional Commits, pushing, and watching CI. Incorporates CI fixing flow if the push fails CI checks.
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
After pushing, find the newest run and **block on it** so you never stop mid-run waiting for a re-prompt:
```bash
RUN_ID=$(gh run list --branch dev --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status      # blocks until run finishes; exits non-zero on failure
```
`gh run watch --exit-status` is the gate. Do not `gh run list` and stop — that snapshot returns while the run is still in progress and forces the user to re-prompt you. Always block until the run reports a terminal state.

If the run failed, invoke `@.agents/skills/fix-ci` to view logs (`gh run view "$RUN_ID" --log-failed`), apply a minimal fix, push again, then **watch the new run to completion** — loop until green.
