---
name: fix-cicd
description: Use when a GitHub Actions / CI run is failing (red X, "failure", "cancelled") on the current branch, when the user asks to "fix CI/CD", "perbaiki CI", "CI merah", "workflow gagal", or when a push/PR shows failing checks. Use before any patch when the failure cause is unknown — read the failing log first, never guess the symptom. Covers gh CLI, failed workflow logs, Storybook/a11y/color-contrast, lint, typecheck, build, and test failures in the UMKM Cepat `Quality` workflow.
---

# Fix CI/CD

Red CI → root cause → minimal fix → push to the same branch. Never guess from the run name.

Scope: repair an already-failing CI run on a given branch. Not for local `bun run check` failures, adding new workflows, force-push, or disabling checks to go green.

## 1. Confirm the failure is real

```bash
gh run list --branch <branch> --limit 5
gh run view <run-id> --log-failed      # ONLY failing-step output
```

Read `--log-failed`, not `--log`. Identify the exact failing step, the assertion/error line, and the source file:line it points at.

If `--log-failed` is empty but the run failed, the cause is setup/infra (service boot, env, OOM, timeout) — read `gh run view <run-id> --log` and the job setup steps.

Done with this step when you can state: failing step + assertion + source file:line in one sentence. If you cannot, keep reading.

## 2. Root cause, not symptom

The failure line names the *test*. The *cause* is in the product source the test exercises, not the test itself.

| Log says | Wrong (symptom) | Right (cause) |
|---|---|---|
| `Footer Default` color-contrast 3.73 | edit the story / disable a11y rule | fix color or opacity in `Footer.tsx` |
| `tsc` error `foo.ts:42` | `@ts-expect-error` | fix the type at `foo.ts:42` |
| `eslint` no-unused-vars | `eslint-disable-next-line` | delete the unused var |
| build `Cannot find module X` | add dep blindly | verify `package.json` + import path agree |

**The fix touches product source or config, never the test's expectation** — unless the test itself is wrong (state why explicitly).

Read the named source file before editing. For color/contrast: verify the token value (e.g. `--color-surface-warm-white` in `src/styles/globals.css`) before changing it. Common bug — **stacked opacity**: Tailwind `/50` + `opacity-80` compounds to 0.40 effective alpha and silently breaks contrast. Check for stacked opacity before touching color.

## 3. Minimal fix + local validate

Smallest diff that resolves the assertion. One-liner preferred. No refactors, no "while I'm here" edits. Match repo conventions (Bun, Indonesian product copy / English dev surfaces, existing tokens over new ones).

Validate with the same gate the failing step runs:

| Failing CI step | Local check |
|---|---|
| Storybook a11y / component tests | `bun run test:storybook` |
| `bun run verify` (lint/type/test/knip) | `bun run check`; then `verify` if check passes |
| `bun run build` | `bun run build` |
| Chromatic | skip locally; rely on CI |

Run `bun run check` before any push — mandatory. Never push a fix you have not seen green locally; a blind "push and see" burns a full CI cycle and is the guessing this skill forbids. If the step can't be reproduced locally (Chromatic, env-only), state that, push, and watch.

## 4. Commit + push to the SAME branch

The failing branch is the fix target. Do not open a new branch unless the user asks or the branch is protected and direct push is blocked.

```bash
git add <only the files you changed>
bun run check
git commit -m "fix(<scope>): <what was wrong, not the symptom>"
git push origin <branch>
```

Conventional Commits, lowercase scope, English. Example: `fix(footer): remove stacked opacity causing color-contrast failure`. Never `--no-verify`. Never force-push. Never disable a check to go green.

## 5. Watch the run you caused

```bash
gh run watch <new-run-id> --exit-status   # blocks; exits non-zero on failure
```

Fix is done only when the run is green. Still red → loop to step 1 with the new log. Do not stack a second guess on the first.

## Common mistakes

- Guessing from the run title. "Quality failed" has many causes. Always `--log-failed`.
- Patching the test, not the source. Disabling `toHaveNoViolations` ships the a11y bug.
- Stacked opacity (`/50` + `opacity-80` = 0.40). Check before changing color.
- Pushing without `bun run check`. Blind push = guessing + wasted CI cycle.
- Force-push / disable-checks to go green. Not a fix. Not this skill.
- New branch when user said "fix it on dev". Failing branch is the target unless protected.
