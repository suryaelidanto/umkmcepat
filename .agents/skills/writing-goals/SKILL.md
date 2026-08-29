---
name: writing-goals
description: Use when drafting, reviewing, or structuring agent goals, work contracts, or long-running execution objectives with SMART criteria, stopping conditions, and verification metrics.
---

# Writing Goals

Formulate durable, evidence-checkable work contracts for coding agents. A goal is not a wish list or a narrative prompt; it is an invariant specification that guides autonomous execution and survives context compaction.

## Core Formula

Every high-standard goal must define six explicit dimensions:

```text
[Desired End State]
verified by [Specific Deterministic Evidence]
while preserving [System Invariants & Non-Negotiables].
Scope: [Allowed Tools & Domain Boundaries]
Avoid: [Forbidden Actions & Out-of-Scope Bloat]
Stopping condition: [Concrete pass criteria or exact blocker definition].
```

## When to Use

- Defining active thread goals (`create_goal` or agent contracts).
- Scoping multi-phase engineering refactors.
- Turning broad user intent into measurable, testable deliverables.
- Setting explicit boundaries before executing high-blast-radius tasks.

## Goal Structure Contract

### 1. Objective & Desired End State
Name the exact change in system behavior or codebase state. Focus on what must exist and function, not the effort spent.

### 2. Verification Surface (Metrics & Evidence)
List deterministic checks that prove completion. A goal without a measurable check cannot be marked done.
- Commands to run (e.g. `bun run check`, `bun test <file>`).
- Quantifiable boundaries (e.g. 0 regressions, p95 latency reduction, $O(n)$ parser scaling).
- Contract invariant assertions (Zod schemas, types, error codes).

### 3. Constraints & Invariants
List non-negotiables that must survive the change:
- Security policies, tenancy gates, and billing correctness.
- Preserved APIs, routes, and data models.
- Codebase conventions (colocated tests, no `any`, unslop copy).

### 4. Scope Boundaries
- **Allowed Scope**: Explicit directories, services, or modules to touch.
- **Forbidden Scope**: Speculative refactors, model swaps, third-party rewrites, or unrequested features.

### 5. Iteration Policy
How to choose the next action between steps:
- Measure $\rightarrow$ Identify bottleneck $\rightarrow$ Minimal fix $\rightarrow$ Verify.
- If a test fails, fix production code; never soften test assertions.

### 6. Blocked / Stopping Condition
- **Success**: All verification commands exit 0 and all contract requirements are met.
- **Blocked**: When external input is missing or 3 consecutive architectural hypotheses fail, stop with evidence gathered, attempted paths, and exact blocker description.

## Example

<Good>
```text
Objective: Eliminate discuss engine streaming lag and enforce anti-slop generator art direction.
Verification:
1. 'bun run check' passes 100% (typecheck, lint, tests, knip, discipline, docs).
2. 'nextAssistantTextDeltaFromPartialToolJson' operates in O(1) incremental scan without re-parsing full accumulated JSON per token.
3. First assistant text delta emits immediately; subsequent deltas coalesce over a 16–32ms window.
4. Anti-slop markup linter detects and flags >2 card grids or consecutive centered sections before visual review.
Constraints: Keep 9router model setup, BullMQ queue durability, and billing ledger checks intact.
Forbidden: No schema migrations for chat JSONB, no model replacements, no git push.
Stopping Condition: All colocated tests pass, 'bun run check' exits 0, and local validation confirms smooth streaming.
```
</Good>

<Bad>
```text
Objective: Make the chat faster and design better websites.
Verification: Test it and see if it looks good.
Constraints: Don't break things.
```
</Bad>

## Quick Reference

| Dimension | Question to Answer |
|---|---|
| **Specific** | What exact files, methods, or behaviors change? |
| **Measurable** | What command or test produces a green exit code? |
| **Achievable** | Can this be executed with current tools without speculative infrastructure? |
| **Relevant** | Does this solve the identified root cause? |
| **Time/Scope-Bound** | What is explicitly excluded from this iteration? |
| **Stopping Gate** | What exact evidence signals completion? |
