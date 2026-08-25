# AGENTS.md

Boot instructions for AI agents working on UMKM Cepat.

## Read first

- `PRINCIPLES.md` → taste, engineering mindset, and senior developer standards
- `DEV.md` → workflow, conventions, folder architecture, and typecheck/lint/test gates
- `.agents/skills/codebase-steward/SKILL.md` → autonomous quality and codebase perfection audit
- `PRODUCT.md` → product definition and business context
- `DESIGN.md` → design system tokens and UI standards
- `.agents/skills/unslop/SKILL.md` → unslop writing standard (cut AI tells, active voice, plain speech)
- `docs/` → Obsidian-ready documentation hub and architecture overview

---

## What makes UMKM Cepat special

A restrained, trustworthy site generation engine for Indonesian small business owners. Four non-negotiables:

1. **Trust beats spectacle**: Visible progress, honest states, no fake awards, prices, reviews, or addresses.
2. **One clear path**: Next action is obvious: discuss → build → preview → edit → publish.
3. **Portable output**: Generated Vite + React + Tailwind standalone site with no vendor lock-in.
4. **100% free to succeed**: Core features work on pilot energy grant (500k); booster is an optional upgrade, never a paywall.

---

## Rules — god-tier

- **NEVER TEST AI RESPONSE CONTENT, CLASSNAMES, ANCHORS, OR STOCHASTIC OUTPUT (IRON LAW)**: Unit and TDD tests MUST NOT assert AI model prose, answer wording, Indonesian phrasing, exact className strings, Tailwind utility lists, HTML tag structures, anchor hrefs/IDs, palette hues, fonts, layout structure, card counts, section sequences, or generated source snapshots. Tests assert deterministic mechanical invariants only:
  1. JSON Schemas (Zod validation)
  2. Structure conformance, data types, and presence of required keys
  3. Type narrowing and contract error handling
  4. Hard deterministic boundaries (action URLs, route topology, package policies, security, compilation)
     Never test exact className values, HTML markup strings, or regex-matched styling strings. Testing markup or styling creates rigid template-ish generator behavior. Rendered aesthetic quality and copy appeal belong exclusively to human evaluation and live browser reviews.
- **Domain before file type**: Organize by feature or domain first (`src/components/admin/`, `src/lib/projects/`). Never create generic catch-all directories (`hooks/`, `utils/`, `helpers/`, `misc/`).
- **Colocated tests by default**: Unit, component, and route tests sit directly beside the module they verify (`foo.ts` + `foo.test.ts`). Top-level `tests/` is strictly for cross-domain integration, real DB infrastructure, or browser audits.
- **No `any` or `@ts-ignore`**: `any` disables the type-checker. Use `unknown` with narrowing or schema validation. Fix actual root causes.
- **Self-explanatory code over comments**: Code must be obvious through clear names and modular structure. Never write multi-line block comments or banner dividers (`// ---`). Authored comments delete by default; keep only strictly necessary single-line invariant explanations.
- **Solid as hell**: Nothing ships without `typecheck + lint + affected tests` passing together. CI is the ultimate gate. Run `bun run check` locally before handoff.
- **Small and surgical**: One concern per change. A 50-line fix beats a 500-line refactor.
- **Fail loud at trust boundaries**: Validate untrusted input at server boundaries and fail closed on auth, payment, or publishing failures.
- **Always unslop**: Follow `.agents/skills/unslop/SKILL.md` across all code, prompt strings, and docs. Cut AI filler words, puffery, and passive voice.

---

## Where code lives

- `src/lib/projects/` — brief flow, agent generator, visual review, and build worker logic
- `src/routes/api.projects.*` — API endpoints for generation, preview, editing, and chat turns
- `src/components/projects/workspace/` — workspace shell, history drawer, and canvas controls
- `src/lib/storage/` — S3/R2 object storage client
- `src/lib/projects/scaffold/` — shadcn Base UI registry and starter scaffold
- `docs/notes/backlog.md` — Active Kanban task board (`Backlog`, `In Progress`, `Done`)

---

## Task Execution & Obsidian Backlog (Autonomous Loop)

- `docs/notes/backlog.md` is the single source of truth for work items (`Backlog`, `In Progress`, `Ready for Review`, `Needs Revision`, `Done`).
- **Autonomous Execution Priority**:
  1. **Priority #1 (Revisions)**: If items exist in `## Needs Revision`, read developer notes/wikilinks, fix issues, verify with `bun run check`, and move to `## Ready for Review`.
  2. **Priority #2 (Resume)**: If an item is under `## In Progress`, drive that task to completion.
  3. **Priority #3 (Next Task)**: If `## In Progress` and `## Needs Revision` are empty, pick the topmost priority from `## Backlog`, move it to `## In Progress`, implement colocated tests + minimal clean code, verify 100% green via `bun run check`, and move to `## Ready for Review`.
  4. **Approval & Commit**: Once approved by the user, move task from `## Ready for Review` to `## Done` and commit atomically. If rejected by user, it moves to `## Needs Revision`.
- Raw developer brain dumps go into `docs/notes/ideas.md` and are triaged via `.agents/skills/triage-ideas/`. Personal notes live in `docs/notes/notes.md`.

---

## Commands

```bash
bun install
cp .env.example .env
bun run infra
bun run db:migrate
bun run dev
bun run check        # Fast cached parallel check: locks + routes + format + lint + typecheck + tests + Knip + discipline + docs
bun run verify       # Full verification suite before release
```
