# Codebase Cleanliness / Polish — Design

**Date:** 2026-07-25
**Topic:** 6 of the eight-topic roadmap (see `umkmcepat-eight-topic-roadmap` memory)
**Status:** Design approved; pending plan + implementation.

## Goal

Polish the codebase to professional, AI-navigable quality: delete dead/obvious comments, make code self-explanatory, and apply targeted deepening refactors surfaced by the `improve-codebase-architecture` skill — **without changing any behavior or output**. Write the cleanliness direction into `DEV.md` so a future 0-context agent keeps it instead of regressing.

## Why

The user wants the codebase clean + crafted-by-a-professional, primarily so AI agents working on it later can maximize their potential (navigate fast, edit reliably, not trip over noise). `DEV.md` already has the self-explanatory-code rule (line 8); this spec makes it operational + extends it into a standing "cleanliness contract" future agents inherit. The `improve-codebase-architecture` skill (`/.claude/skills/improve-codebase-architecture/`) produces an HTML report of deepening opportunities (shallow modules → deep ones); that's the discovery step for the refactor candidates.

## The non-negotiable rule

**Behavior + output must NOT change.** Every refactor in this topic is purely structural/cosmetic. The proof: the existing test suite (`bun run check` + `bun run verify`) stays green before and after each change. Any refactor that can't be proven behavior-preserving via the gate is rejected. This is not "improve while you're in there" — it's "restructure with zero behavior delta, gated by tests."

## Decisions (locked; no forks)

1. **Discovery = the `improve-codebase-architecture` skill's HTML report.** Run it (Explore-agent walk + the skill's deepening lens), produce the candidate list (shallow modules, leaking seams, testability gaps), present as an HTML report in OS temp, then pick candidates to deepen. Not every candidate ships — only those where the deepening is clearly behavior-preserving.
2. **Comment hygiene = enforce the existing `DEV.md` rule strictly.** Delete comments that restate code, narrate the obvious, or duplicate what a name/structure says. Keep only non-obvious-why comments (invariants, guarded edge cases, "this looks wrong because…"). When a comment becomes unnecessary, delete it — no "just in case." One-liner comments preferred; multi-line only for a genuine invariant that can't be a name.
3. **Targeted deepening, not a big-bang rewrite.** Each refactor candidate is its own atomic commit, gated by `bun run check`. If a candidate touches too much to be a clean atomic change, split it or defer it. Prefer deletion over addition (YAGNI): a shallow wrapper removed is a win; a new abstraction added for "later" is a loss.
4. **No new dependencies.** No new library, no new abstraction layer for a single implementation, no config for a value that never changes. (Matches the repo's `PRINCIPLES.md` + the agent's lazy-dev bar.)
5. **Write the direction into `DEV.md`.** Extend the existing self-explanatory-code rule (line 8) with a short "Cleanliness contract" section future agents inherit: behavior-preserving-only refactors, comment hygiene, no over-abstraction, gate-or-reject. Keep it terse — a future 0-context agent reads it and knows the bar.
6. **Graphify for discovery when available.** The skill recommends Graphify; the binary isn't on PATH here, so discovery falls back to Explore agents + the stale `graphify-out/` artifacts, OR ask the user to `uv tool install graphifyy`. Do not add Graphify as a project dependency (per `CLAUDE.md`).

## Architecture

### Phase A — Discovery (the HTML report)

Invoke the `improve-codebase-architecture` skill: Explore-agent walk of the codebase's hot spots (recent-commit files per `git log`), note friction (shallow modules, leaking seams, untested-via-interface paths, pure-functions-extracted-for-testability-but-bugs-in-calls). Apply the deletion test (would deleting it concentrate complexity or just move it?). Render the candidates as a self-contained HTML file in OS temp (Tailwind + Mermaid CDNs, per the skill's `HTML-REPORT.md`), each candidate a card with files/problem/solution/wins/before-after diagram/strength badge. Open it for the user. Pick candidates to deepen.

### Phase B — Comment hygiene sweep

A pass over the codebase deleting obvious/restating/now-unnecessary comments per the `DEV.md` rule. This is mechanical + behavior-preserving (comments don't affect behavior); still gated by `bun run check` (lint may flag newly-dangling JSDoc, etc.). Atomic commits per directory or per logical chunk.

### Phase C — Deepening refactors (from Phase A's picked candidates)

Each picked candidate → its own atomic commit. Order by risk: lowest-risk, highest-leverage first (e.g. delete a shallow wrapper, consolidate a duplicated helper, deepen a module's interface). Each must pass `bun run check` before + after. If a candidate can't be proven behavior-preserving, defer it (don't ship).

### Phase D — DEV.md direction

Extend `DEV.md` with a "Cleanliness contract" section capturing the standing rules, so the next agent inherits them.

## Data flow

N/A — this is a refactor + docs spec. The only invariant is: gate green before + after each change.

## Error handling

- A refactor that breaks `bun run check` → revert, don't ship. The gate is the safety.
- A candidate that's too risky to prove behavior-preserving → defer (note in the report), don't force.
- Comment deletion that removes a genuinely-load-bearing why-comment → keep the comment (the rule explicitly protects non-obvious-why comments).

## Testing

- **The existing suite IS the test.** `bun run check` (format/lint/typecheck/changed-tests/Knip) + `bun run verify` (full tests + route regen + Knip) before + after each change. Green = behavior preserved (to the suite's coverage). No new tests for cosmetic refactors (YAGNI); a deepening that changes an interface gets the interface's existing tests updated, not new tests for the sake of it.
- For a deepening that concentrates a pure function, the existing tests of the callers prove the behavior holds.

## Out of scope

- Any behavior/output change (rejected by the non-negotiable rule).
- New features (this is polish).
- New dependencies.
- A big-bang rewrite (each refactor is atomic).
- The non-image `selectorPath` annotation brittleness (flagged in the photo-upload spec; not auto-fixed here unless Phase A surfaces it + it's behavior-preserving to fix — unlikely, so defer).

## Open questions for implementation

- Which candidates Phase A surfaces — that's the discovery output, decided at run time, not now.
- Whether to ask the user to `uv tool install graphifyy` for live Graphify, or fall back to Explore + stale artifacts. Lean: fall back unless discovery clearly needs live graph.
