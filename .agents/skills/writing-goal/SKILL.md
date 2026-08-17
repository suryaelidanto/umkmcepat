---
name: writing-goal
description: Use when an autonomous agent or human manager drafts, formats, or meta-prompts a rigorous, non-drifting /goal command or work contract for autonomous loops (pi-goal, Claude completion goals, Ralph loops, Codex goals) and delegated task execution. Never outputs files; outputs the fully articulated, pasteable /goal command and contract directly in chat.
---

# writing-goal

## Overview

A goal is an **ironclad, executable work contract**. It replaces human micro-management in autonomous agent loops (`pi-goal`, Claude loop engineering, Ralph loops, Codex goals) and high-trust delegation.

Without rigorous goal engineering, unattended agents fail in two catastrophic modes:
1. **Premature Quit (Stop Hacking / False Done):** Declares victory after two superficial tries, hallucinating success without empirical evidence.
2. **Infinite Drift (Metric / Busywork Hacking):** Grinds endlessly, invents out-of-scope tasks, perturbs unrelated files, or gets stuck repeating identical failed attempts.

**Core Directives:**
- **Zero File Creation:** Never write the goal to disk (`.md`, `.txt`, etc.) unless explicitly instructed by the user. Emit the full, ready-to-run `/goal ...` command directly in chat.
- **No Artificial Word Limits:** Do not truncate, compress, or omit essential contract slots. Express every constraint, checklist item, hardening step, and stop condition with maximum precision and depth.
- **Extreme Discipline & 10x Hardening:** Demand empirical proof (exit codes, exact logs, diff audits, multi-angle verification). Instruct the agent to proactively investigate, use tools (e.g. search/Firecrawl, docs, profilers, tests), self-correct, and harden the solution beyond minimum passing.

---

## The 10 Pillars of GOAT Goal Engineering

Every generated goal must fulfill all 10 pillars:

| # | Pillar | Description & Requirement |
|---|---|---|
| 1 | **Commander's Intent & Concrete Outcome** | The exact end state. Concrete observables only—no vague adjectives ("better", "faster", "cleaner"). |
| 2 | **Quantified Completion Criteria** | Exact numerical thresholds (`p95 < 120ms`, `0 errors`, `100% test coverage on touched paths`) or a fully closed checklist of binary checks. |
| 3 | **Empirical Verification Surface** | Non-negotiable external check (commands, test suites, build outputs, benchmarks, diff audits). Never model self-assessment or "looks good to me". |
| 4 | **Exhaustive Done Checklist** | Closed inventory of all actions and their individual binary pass criteria. Unrelated ideas go to `Deferred`. |
| 5 | **Negative Constraints & Anti-Regressions** | What must NOT break (no regressions on existing tests, no leaking secrets, no API contract breaks, no unapproved deps). |
| 6 | **Strict Operational Boundaries** | Exact allowed/forbidden directories, files, tools, networks, and permissions. |
| 7 | **Deterministic Iteration & Self-Correction Policy** | Hypothesis-driven workflow (`Observe -> Hypothesize -> Smallest Fix -> Verify -> Diff Audit`). Never random trial-and-error. |
| 8 | **Autonomous Problem-Solving & Tool Initiative** | When stuck or lacking context, mandate proactive tool use (Firecrawl web search/docs scraping, git log archaeology, deep reading, runtime profiling) instead of early quitting. |
| 9 | **10x Hardening & Adversarial Self-Audit** | After passing initial checks, rigorously probe edge cases, stress test, inspect diffs for unintended mutations, and verify clean production readiness. |
| 10 | **Tri-State Stop Protocol (DONE / BLOCKED / EXHAUSTED)** | Exact termination triggers and required evidence reports for all three terminal states. |

---

## The Initiative & Anti-Stall Ladder

When progress stalls (two consecutive iterations with no ticked items and no metric movement), the agent must sequentially execute this escalation ladder before any exit:

1. **Re-Measure & Baseline:** Re-run the verification surface to confirm current state against ground truth.
2. **Isolate & Reproduce:** Create the smallest isolated repro (minimal unit test, single CLI invocation, script).
3. **Change Mechanism (No Retry Loops):** Never repeat a failed approach. Switch strategy, paradigm, or architectural level.
4. **Proactive External Discovery:** When knowledge is missing, use search/Firecrawl to pull documentation, changelogs, upstream issues, and reference code.
5. **Lateral Checklist Pivot:** Switch to another open unblocked checklist item; return later with more context.
6. **Decompose & Land Verified Subset:** Break complex blockers into smaller sub-tasks; land and verify partial components.
7. **Read Deep Context:** Inspect complete source files, execution logs, AST/build trees, and commit histories.
8. **Formal Blocker Escalation:** If all rungs fail, halt with a structured blocker report stating exact evidence, attempted paths, and the exact single external decision/credential needed to unblock.

---

## Tri-State Stop Protocol

Every goal terminates in one of these three explicit states:

- **DONE (Verified Success):** Checklist 100% closed + completion threshold crossed + negative constraints green + 10x hardening passed. **Must include pasted raw verification terminal output.**
- **BLOCKED (Escalation):** Exhausted all ladder steps on an unavoidable gating blocker (e.g. missing external credentials, architecture veto, out-of-boundary dependency). Report: attempted paths, evidence logs, root cause, and exact unblocking input needed.
- **EXHAUSTED (Resource Limit Backstop):** Reached hard token or iteration budget. Report: closed checklist items, remaining open items, current state of verification surface, and exact resumption guide for the next run.

---

## Gaming & Exploitation Vectors (Pre-Emptively Closed)

The generated goal must explicitly close standard agent exploitation patterns:
- **Metric Hacking:** Muting assertions, deleting slow/failing tests, catching and swallowing errors, or hardcoding return values for benchmark inputs.
- **Stop Hacking:** Quitting after a shallow first pass, declaring DONE on subjective belief, or claiming BLOCKED to avoid hard debugging.
- **Busywork Hacking:** Refactoring unrelated codebases, formatting untouched modules, or generating lengthy narrative logs to simulate activity.

---

## Output Contract & Formatting

When writing a goal, output **directly into the conversation** (no file creation). Use the following comprehensive format:

```text
/goal <High-density, self-contained single-paragraph objective defining outcome, verification commands, constraints, boundaries, iteration policy, proactive tool use, and stop conditions that survives context compaction and token budgets.>
```

### Full Structured Work Contract (Presented Directly Below the `/goal` command):

```markdown
### 1. Objective & Commander's Intent
- **Desired End State:** [Exact observable outcome]
- **Value / Purpose:** [Why this matters & the operational criteria]

### 2. Completion Criteria & Metrics
- **Quantified Thresholds:** [Exact numbers, benchmarks, exit codes, or 100% pass criteria]
- **Verification Surface:** [Specific command line(s), test scripts, linters, profilers to execute]

### 3. Done Checklist & Work Inventory
- [ ] **Item 1:** [Action] -> *Binary Verification Check:* `[Exact command/file assertion]`
- [ ] **Item 2:** [Action] -> *Binary Verification Check:* `[Exact command/file assertion]`
- [ ] **Item 3:** [Action] -> *Binary Verification Check:* `[Exact command/file assertion]`
- **Deferred (Out of Scope):** [Explicitly excluded adjacent ideas/tasks]

### 4. Constraints & Boundaries
- **Must Not Regress:** [Zero test failures, unchanged public API signatures, latency caps, security rules]
- **Allowed Scope:** [Target directories, authorized tools, allowed packages]
- **Forbidden Scope:** [Untouched files, disallowed libraries, forbidden workarounds]

### 5. Iteration, Tool Initiative & Anti-Stall Ladder
- **Execution Loop:** Observe -> Form Hypothesis -> Surgical Action -> Empirical Verify -> Diff Audit.
- **Proactive Investigation:** On ambiguity or unknown errors, leverage Firecrawl / web search, doc scrapes, logs, and git archaeology before attempting guesswork.
- **Anti-Stall Ladder:** (1) Re-measure -> (2) Isolate repro -> (3) Switch mechanism -> (4) External docs/search -> (5) Pivot item -> (6) Decompose -> (7) Deep file read -> (8) Stop BLOCKED.

### 6. 10x Hardening & Adversarial Verification
- Edge case boundary testing & stress validation.
- Final diff audit across all touched files (ensure zero accidental mutations, no leftover debug prints, no loose types).

### 7. Termination & Stop Conditions
- **DONE:** Checklist complete, verification surface exit 0 / criteria met, constraints verified with pasted raw command output.
- **BLOCKED:** Initiative ladder exhausted; emit evidence, attempted mechanisms, and the exact needed unblocker.
- **EXHAUSTED:** Hard iteration/budget limit reached; output current state diff and cold-start resume steps.

### 8. Closed Gaming Vectors
- *Metric Exploits:* [Named prevention]
- *Stop Exploits:* [Named prevention]
- *Busywork Exploits:* [Named prevention]
```
