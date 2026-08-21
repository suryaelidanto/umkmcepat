# Codebase Cleanliness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the codebase to professional, AI-navigable quality — delete dead comments, make code self-explanatory, apply targeted behavior-preserving deepening refactors — and write the cleanliness direction into `DEV.md` so a future 0-context agent inherits the bar.

**Architecture:** Four phases — (A) discovery via the `improve-codebase-architecture` skill's HTML report of deepening candidates; (B) a mechanical comment-hygiene sweep per the existing `DEV.md` line-8 rule; (C) atomic, gated deepening refactors from Phase A's picked candidates (lowest-risk first); (D) a "Cleanliness contract" section in `DEV.md`. **Every change is gated by `bun run check` before + after — behavior/output must not change.**

**Tech Stack:** Bun, TypeScript, ESLint, Prettier, Vitest, Knip. The `improve-codebase-architecture` skill + Explore agents for discovery. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-25-codebase-cleanliness-design.md`

## Global Constraints

- **Non-negotiable: behavior + output MUST NOT change.** `bun run check` green before + after every change. A refactor that breaks the gate → revert, don't ship. `bun run verify` before handoff.
- Comment hygiene per `DEV.md` line 8: delete restating/obvious/now-unnecessary comments; keep only non-obvious-why (invariants, guarded edge cases). One-liner preferred.
- No new dependencies. No abstraction for a single implementation. No config for a value that never changes. Prefer deletion over addition.
- Graphify: **live + working** (`~/.local/bin/graphify`, `bun run graph:update` confirmed 2026-07-25: 4269 nodes, 10364 edges). Use `bun run graph:update` to refresh + read `graphify-out/GRAPH_REPORT.md` / `graphify-out/GRAPH_TREE.html` for discovery. Do NOT add Graphify as a project dependency (per `CLAUDE.md`). (`.sql` migrations excluded unless `pip install "graphifyy[sql]"`.)
- Visible product copy Indonesian; code/comments English.

---

### Task 1: Phase A — Discovery (the architecture HTML report)

**Files:**
- Output (not committed): an HTML report in OS temp (`/tmp/architecture-review-*.html`), per the skill's `HTML-REPORT.md`.

**Interfaces:**
- Consumes: the `improve-codebase-architecture` skill, Explore agents, recent-commit hot spots (`git log --oneline`).
- Produces: a candidate list (shallow modules, leaking seams, testability gaps, duplicated logic), each with files/problem/solution/wins/before-after diagram/strength badge. The picked candidates feed Task 3.

- [x] **Step 1: Walk recent-commit hot spots**

Run: `git log --oneline -40` and note the files/subsystems that recur (generation, edit, runtime-artifacts, discuss-turn, workspace shell). These pull discovery attention first.

- [x] **Step 2: Invoke the improve-codebase-architecture skill**

Run the skill (`.claude/skills/improve-codebase-architecture/SKILL.md`): Explore-agent walk of the hot spots, note friction (shallow modules, leaking seams, pure-functions-extracted-for-testability-but-bugs-in-calls), apply the deletion test to anything suspected shallow.

- [x] **Step 3: Write the candidate list**

Delivered as a committed markdown doc instead of the spec's OS-temp HTML (user chose a reviewable committed artifact over an ephemeral one). Output: `docs/superpowers/plans/2026-07-25-codebase-cleanliness-candidates.md` — one entry per candidate with files/problem/solution/risk badge (`Strong`/`Worth exploring`/`Speculative`) + behavior-proof (the test file that catches a regression). Candidates are grouped: A shallow wrappers, B degenerate helpers, C single-file dups, E cross-route guard dups, F pure-cluster extraction, S security-consistency.

- [x] **Step 4: Pick candidates with the user**

User reviews the candidate doc and selects which to deepen in Task 3. The doc's "Recommended pick order" section pre-ranks them safest-first (S1 security → Tier 1 → Tier 2 → Tier 3/defer).

- [x] **Step 5: No code commit** (the candidate doc is the discovery output; deepening commits land in Task 3).

---

### Task 2: Phase B — Comment hygiene sweep

**Files:**
- Modify: across `src/` — delete obvious/restating/now-unnecessary comments per `DEV.md` line 8.

**Interfaces:**
- Consumes: the `DEV.md` line-8 rule.
- Produces: a codebase with only non-obvious-why comments; behavior unchanged (comments don't affect behavior).

- [x] **Step 1: Confirm the gate is green before starting**

Run: `bun run check`
Expected: green (baseline).

- [x] **Step 2: Sweep a directory chunk for obvious comments**

Per-directory (e.g. `src/lib/projects/`, then `src/routes/`, then `src/components/`): delete comments that restate the code (`// loop over items` above `for`), narrate the obvious, or duplicate what a name/structure says. **Keep** non-obvious-why comments (invariants, guarded edge cases, "this looks wrong because…"). Keep `ponytail:` deliberate-simplification notes (they're load-bearing). One-liner preferred.

- [x] **Step 3: Run the gate after each chunk**

Run: `bun run check`
Expected: green. If lint flags newly-dangling JSDoc (a `/** */` whose subject was removed), fix it (remove the dangling JSDoc too).

- [x] **Step 4: Commit per chunk**

```bash
git add <chunk paths>
git commit -m "chore(clean): remove obvious/restating comments in <chunk>"
```

- [x] **Step 5: Repeat** for each directory chunk until the sweep is complete.

---

### Task 3: Phase C — Deepening refactors (from Task 1's picked candidates)

**Files:**
- Modify: per candidate (e.g. consolidate a duplicated helper, delete a shallow wrapper, deepen a module's interface).

**Interfaces:**
- Consumes: the picked candidates from **`2026-07-25-codebase-cleanliness-candidates.md`** (this directory) — the canonical candidate list surfaced by Phase A: shallow wrappers (A1–A6), degenerate helpers (B1–B2), single-file dups (C1–C5), cross-route guard dups (E1–E8), pure-cluster extraction (F1–F3), and a security-consistency leak fix (S1). Each entry has files / problem / solution / risk badge / behavior-proof.
- Produces: deeper modules / consolidated helpers / removed wrappers — behavior unchanged, gate green.

- [x] **Step 1: Order candidates by risk (lowest-risk, highest-leverage first)**

The pick order lives in the candidate doc's "Recommended pick order" section. S1 (security) first, then Tier 1 (E1 session guard ×28, E2 owned-project ×~19, C3 repair-helper merge — author-approved via ponytail L2262, E3 escapeHtml, A1/A2/A4/A5 inline wrappers, C1 toPackageName), then Tier 2 (F1/F2 pure-cluster extraction + mid-leverage dups), then Tier 3 (judgment calls — defer unless requested). C4/E6 are deferred: adjacent to the in-flight energy-metering WIP.

- [ ] **Step 2: For the first candidate — confirm gate green before**

Run: `bun run check`
Expected: green.

- [ ] **Step 3: Apply the deepening refactor**

The exact change per candidate is in the candidate doc. Examples: inline a pass-through wrapper (A1–A6), extract the session-guard helper (E1), merge the two 130-line repair functions via `runRepairAgent` (C3), extract `escapeHtml` (E3).

- [ ] **Step 4: Run the gate after**

Run: `bun run check`
Expected: green. If not green → revert, defer the candidate.

- [ ] **Step 5: Commit**

```bash
git add <files>
git commit -m "refactor(clean): <deepening one-liner> (behavior unchanged)"
```

S1 uses `fix(security):` (it changes error-message content, not cosmetic).

- [ ] **Step 6: Repeat** for each picked candidate, each its own atomic commit. Stop when a candidate can't be proven behavior-preserving — defer it (note in the candidate doc).

---

### Task 4: Phase D — DEV.md Cleanliness contract

**Files:**
- Modify: `DEV.md` (extend the existing self-explanatory-code rule, line 8, with a "Cleanliness contract" section).

**Interfaces:**
- Produces: a terse standing section future 0-context agents inherit.

- [x] **Step 1: Add the Cleanliness contract section to DEV.md**

After the existing line-8 rule, add a short section (terse — a future agent reads it and knows the bar):

```markdown
## Cleanliness contract

- Refactors are behavior-preserving only. `bun run check` green before + after every change; a refactor that breaks the gate is reverted, not "fixed forward."
- Comments explain a non-obvious _why_, never restate the code. Delete obvious/restating/now-unnecessary comments; do not leave them "just in case." One-liner preferred.
- Prefer deletion over addition: a shallow wrapper removed is a win; a new abstraction for a single implementation or a "later" config value is a loss.
- No new dependencies for what a few lines can do. No interface with one implementation, no factory for one product.
- `ponytail:` comments mark deliberate simplifications and their upgrade ceiling — keep them.
- Deepening opportunities (shallow modules, leaking seams) are surfaced via the `improve-codebase-architecture` skill; each picked candidate is an atomic, gated commit.
```

- [x] **Step 2: Run the gate**

Run: `bun run check`
Expected: green (docs change, but still gate it).

- [x] **Step 3: Commit**

```bash
git add DEV.md
git commit -m "docs(clean): DEV.md cleanliness contract for future agents"
```

---

### Task 5: Final verification

- [ ] **Step 1: Full verify gate** (runs after Task 3 ships)

Run: `bun run verify`
Expected: green (locks + route regen + format/lint/typecheck/full tests/Knip).

- [ ] **Step 2: Confirm no behavior change** — the test suite passing is the proof; spot-check a generation + edit + publish flow manually if the refactors touched those paths. (Phase A discovery + Phase B comment sweep + Phase D DEV.md contract are verified-shipped; Phase C deepening is not yet shipped, so this step is gated on Task 3.)

- [ ] **Step 3: Hand off** — the codebase is cleaner; future agents inherit the DEV.md contract.

---

## Post-implementation

- If Phase A surfaced the non-image `selectorPath` brittleness as a behavior-preserving candidate (unlikely — it's a behavior change to fix), defer it to its own spec (already flagged in photo-upload).
- The discovery HTML report is not committed (OS temp); if the user wants it archived, copy to `graphify-out/` or a docs folder — but the picked-candidate rationale lives in the commit messages.
