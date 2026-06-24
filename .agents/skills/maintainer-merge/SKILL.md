---
name: maintainer-merge
description: Maintainer merge workflow. Use when the user wants to pull, merge, review, or resolve conflicts for a PR, fork branch, contributor branch, or GitHub pull request as a maintainer.
---

# Maintainer Merge

Predictable PR intake for UMKM Cepat. Goal: merge locally, resolve conflicts against product and engineering direction, then stop for human review. Never commit or push.

## 1. Grounding

Read these first, before resolving conflicts or judging incoming code:

- `AGENTS.md`
- `README.md`
- `CONTRIBUTING.md`
- `DEV.md`
- `ANTI_AI_SLOP.md`
- `.env.example`
- `package.json`

Then read only matching topic docs:

- UI/copy/layout: `DESIGN.md`
- AI/provider/model/gateway: `docs/9router.md`, `docs/provider-architecture.md`, `docs/providers.md`
- monitoring: `docs/observability.md`
- deployment/runtime: `docs/docker-deployment.md`, `docs/local-development.md`

Completion: every changed area has its governing docs read; no conflict decision is made from guesswork.

## 2. Intake

Run:

```bash
git status --short --untracked-files=all
git branch --show-current
git diff --name-only --diff-filter=U
```

If PR is not pulled yet, prefer safe local intake:

```bash
git fetch origin pull/<number>/head:pr-<number>
```

If user explicitly wants direct merge into current branch:

```bash
git pull origin pull/<number>/head
```

Completion: current branch, staged files, untracked files, and conflict files are known.

## 3. Conflict policy

For each conflict:

1. Read ours, theirs, and surrounding file context.
2. Keep product language Indonesian, UMKM-friendly, non-technical; keep `AI` when honest and useful.
3. Prefer existing architecture boundaries over PR shortcuts.
4. Reject broad runtime dependencies unless already required by the product path.
5. Keep AI calls behind Vercel AI SDK + `src/lib/ai.ts`.
6. Keep security protections, but do not add global blockers, IP bans, or user-hostile flows without explicit approval.
7. Prefer small integrated edits over taking all ours/theirs.

Completion: every `<<<<<<<`, `=======`, `>>>>>>>` marker is gone, and each conflict has an explicit reason in the handoff.

## 4. Review incoming files

Inspect all staged, modified, and untracked incoming files. For each file decide:

- keep as-is
- keep with edits
- discard
- defer for human decision

Bias:

- Keep SEO files (`robots.ts`, `sitemap.ts`, metadata) if accurate.
- Keep UX improvements if copy and behavior match UMKM users.
- Keep tests for real behavior.
- Discard dead docs, speculative infra, unused CSS, unused endpoints, unused dependencies.
- Do not keep a dependency unless `package.json`, lockfile, code usage, and docs all agree.

### Infra/dependency scrutiny

If the PR adds a runtime dependency or service such as Redis, queue, storage, database, AI provider, cache, or rate limit backend, verify all of these before keeping it:

- `package.json` and lockfile include the dependency.
- `.env.example` documents required env vars.
- `docker-compose.yml` provides local infrastructure when the service needs a port/process.
- `DEV.md` and matching `docs/` explain how to run and why it exists.
- app code reaches it through an internal adapter, not direct route/component imports.
- request paths have clear fail-open/fail-closed behavior.
- product policy is separated from infrastructure plumbing; moderation/blocking is not disguised as rate limiting.

Reject infra that exists only for speculative future use, unused CSS/scripts, or hostile flows such as global IP bans unless the maintainer explicitly approved them.

Completion: no staged file is unexplained; no unused dependency or dead file remains knowingly staged.

## 5. Validate

Run:

```bash
bun run check
```

Completion: `bun run check` passes, or failures are reported with exact blocker and next fix.

## 6. Stop gate

Do not run:

```bash
git commit
git push
```

Do not finish a merge commit. Leave the working tree ready for human review.

Final handoff must include:

- conflict files resolved
- files kept/edited/discarded
- rationale for each non-obvious decision
- checks run and results
- browser artifacts if UI was verified
- explicit line: `No commit, no push.`
