---
name: writing-goals
description: Use when drafting, reviewing, or structuring agent goals, work programs, or long-running execution objectives. Triggers include preparing an AFK or hand-off execution run, scoping multi-phase engineering work, and turning broad user intent into verifiable deliverables.
---

# Writing Goals

## Overview

A goal is not a wish list or a narrative prompt. It is an invariant specification that an agent with zero context from this conversation can execute start to finish without asking a single clarifying question. Every claim of completion is a number produced by a named command.

## When to Use

- Drafting goals for an agent that will run unattended (AFK) or in a fresh session.
- Turning broad user intent into a numbered, verifiable work program.
- Reviewing whether an existing goal is executable and evidence-checked.

When NOT to use: quick one-command tasks, conversational answers, or exploratory work with no defined done state.

## Invocation Contract (Non-Negotiable)

When this skill is invoked:

1. Deliver the goal program as written text in the reply. That text is the entire deliverable.
2. Call zero tools. Do not call `create_goal`. Do not call MCP tools, goal extensions, pi-goal, or any packaged tool. Do not read files, search the web, or run commands.
3. Work only from what the user stated in the conversation. If a fact is missing, record it in that goal's "Blocked when" section instead of investigating.
4. The user loads and executes the program later, possibly in a fresh agent session. Write for that reader.

This contract binds the goal-writing session only. The agent that later executes the program follows Executor Autonomy below and may use every tool it has.

**Violating the letter of this contract is violating the spirit of the contract.**

| Excuse | Reality |
|--------|---------|
| "Calling `create_goal` makes it official" | Officialness is not requested. The written text is the deliverable. |
| "Reading the codebase makes goals more accurate" | Accuracy comes from the user's stated decisions. Missing facts go in "Blocked when". |
| "The goals are long, so a tool would help" | Length is fine. Tools are still forbidden. |
| "It is just one small lookup" | One exception reopens the loophole. Zero means zero. |
| "The user benefits if I start executing G1" | Execution is a different skill. This invocation writes only. |

Red flags, stop and reread this section: reaching for any tool, planning to "verify quickly", or drafting the goals inside a tool call instead of the reply.

## What Makes a Goal Executable AFK

A future agent must answer, from the goal text alone:

| Question | Answered by |
|---|---|
| What exact state must exist when I am done? | Objective |
| How do I prove it, with numbers? | Numeric pass criteria |
| What must not break? | Constraints |
| What am I allowed and forbidden to touch? | Scope |
| What do I do when a check fails? | Iteration policy |
| When do I stop and report instead of continuing? | Blocked condition |
| What do I leave behind? | Deliverable |

If any row cannot be answered from the text, the goal is not finished.

## The Numeric Evidence Rule

Every goal carries at least two numeric pass criteria. A criterion is numeric only when it names the exact command that produces the number and the expected value.

Measurable shapes:

- Exit codes: `bun run check` exits 0.
- Counts: `bunx vitest run --project unit` reports 0 failed; prior test totals never decrease.
- Ceilings: spawn env keys exactly `{PATH}` (count = 1); script timeout ≤ 12,000 ms.
- Floors: 100% of AI-call sites route through the charging path; bypass count = 0.
- Presence gates: `rg -c "pattern" path` returns ≥ 1 match where presence is required, exactly 0 matches where absence is required.
- Freshness: evidence comes from the final verification run in the working tree, not from memory of an earlier run.

Banned in pass criteria unless paired with a number: better, faster, robust, clean, proper, appropriate, high quality, improved, reliable, maintainable, user-friendly. If a criterion cannot carry a number, it belongs in Constraints or Objective, not in verification.

Checklist rule: every multi-point section of a goal (pass criteria, evidence, constraints, scope anchors, forbidden) is written as `- [ ]` checkboxes, one box per point. The executor ticks a box only after fresh evidence proves it. A goal is done only when every box in that goal is ticked; an unticked box is an unfinished goal, never a partial pass.

Outcome rule: criteria state results to prove, never implementation steps. Naming a file inside an evidence check (e.g. an `rg -c` count) is fine; prescribing module names, test techniques, or internal mappings as criteria is not. A hint about how to do the work goes in the optional `Suggested approach (non-binding):` line, and the agent may replace it freely as long as every box still ticks.

Command rule: never invent a verification command. When the exact command is unknown, the criterion says "run the project gate defined in AGENTS.md / package scripts" and the executor records the command it actually ran as evidence. A fabricated command is a broken criterion.

## SMART Decoding

- **Specific**: Name exact files, functions, modules, and behaviors. "the skill registry" is vague; `src/lib/projects/skills/skill-registry.ts` is specific.
- **Measurable**: Every criterion has a command and an expected numeric outcome.
- **Achievable**: Executable with tools and access the executing agent actually has. No criteria needing production credentials, paid services, or human reviewers.
- **Relevant**: Each goal traces to a stated root cause or user decision. Cut goals serving no stated decision.
- **Time/Scope-bound**: Each goal fits one working session and states what it excludes.

## Density

Compact by default. A single goal runs 6-12 lines; a goal inside a program runs 10-20. A program grows long only because it contains many goals, never because each goal is padded. Every line carries a fact, a number, or a boundary; cut restatements, narrative, and constraints already covered by the program header.

## Work Program Format

When the job has more than one deliverable, never emit a single summary goal. Emit a numbered program.

```text
GOAL PROGRAM: <one-line outcome of the whole program>
Branch: <branch name>. Commit per goal. Push: <who pushes, or "no push">.
Run report: <path in the OS temp dir, outside the repository>
Shared constraints (apply to every goal): <invariants list>
Execution order: G1 → G2 → ... Dependencies: G3 needs G1 done.

### G1: <Title>
<per-goal template below>

### G2: ...
```

Program rules:

- One concern per goal. A goal naming two unrelated subsystems is two goals.
- Order goals by dependency. State dependencies explicitly.
- Each goal ends in its own atomic commit. A goal that cannot produce a clean commit is scoped wrong.
- Tests follow TDD: write the failing test, watch it fail for the stated reason, then implement. State this per goal.
- Every goal repeats its verification commands verbatim. The reader does not infer or look up commands.
- Ambiguous jobs: when scope or risk is genuinely unclear, offer two variants, narrow (safer, less delegation) and broad (full delegation), with a one-line recommendation. Otherwise deliver one program; never pad with options nobody asked for.

## Per-Goal Template

```text
### G<n>: <Imperative title>
Objective: <desired end state, named files and behaviors>
Why: <the break or decision this serves>
Suggested approach (non-binding): <optional hint; the agent may choose a different way>
Numeric pass criteria:
- [ ] `bun run check` exits 0.
- [ ] `bunx vitest run --project unit` exits 0; failed = 0; total tests ≥ <prior count>.
- [ ] <behavior-specific numeric criterion>
- [ ] <behavior-specific numeric criterion>
Evidence to capture:
- [ ] <path to log, output, or screenshot>
Constraints:
- [ ] <security, tenancy, billing, API, or convention invariant, one per box>
Allowed scope (anchors; new files allowed when recorded):
- [ ] <anchor path touched and verified>
Forbidden:
- [ ] <hard exclusion respected, one per box>
Iteration policy: failing criterion → root cause first → minimal fix → re-run the full criterion list. Never soften an assertion. Cap: 3 fix attempts per approach, then switch approach (see Executor Autonomy).
Blocked when: only an irreversible action, a money/energy/production change, a required credential or secret, or a taste decision is needed, or 3 distinct approaches have failed the same criterion. Then stop and report: evidence gathered, attempts with outcomes, exact blocker, single next input needed.
Deliverable: atomic commit `type(scope): <subject>` on <branch>; tests colocated; TDD red-green observed. No push.
```

## Executor Autonomy

Goals are written for an agent that takes initiative. Laziness and premature stopping are failures, not safety.

- **Scope is an anchor, not a cage.** The executing agent may create new files, touch nearby code, or expand scope slightly when the goal demands it, recording each addition in the run report with one line of why. Forbidden items stay forbidden; everything else is negotiable.
- **Exhaust yourself before stopping.** A stop is legitimate only after at least 3 distinct approaches to the failure have been tried, each with a one-line outcome. Switching approach resets the 3-attempt cap of a single approach.
- **Use every tool available.** When stuck, search the web, read docs, run experiments, write throwaway scripts. Being stuck on something a search would answer is not blocked; it is lazy.
- **Ask early for what only the developer has.** Credentials, API keys, secrets, irreversible actions (money, energy, production data, deletion), and taste calls: request them the moment the need is visible, before getting stuck.
- **Two equal options rule.** If two paths are materially equal, pick one and note the choice. If they diverge in cost, risk, or product direction, ask one short question instead of guessing big.
- A blocked report contains four items: evidence gathered, attempted paths each with its outcome, the exact blocker, and the one input that unblocks it.
- Never convert a blocked stop into a weaker pass. A lowered assertion is a failed goal, not a completed one.

## Run Report

The executor keeps one markdown journal for the whole program so the user and any fresh agent can read what happened without digging through git.

- Location: outside the repository, in the OS temporary directory (`/tmp` on Linux and macOS, `%TEMP%` on Windows), named `<program-slug>-run-report.md`. Never place it under `docs/` or anywhere it could be committed or pushed; the durable trace is the per-goal commits themselves.
- One entry per goal, written before the next goal starts: goal id, start/end time, every ticked box with its evidence path, commit hash and message, decisions taken autonomously, deviations from the Suggested approach with reasons, blockers hit and how they cleared.
- Finish with a summary block: goals done / total, boxes still unticked (must be 0), commit list, open questions for the user. Split claims into confirmed (box ticked with evidence), proxy (related evidence, not the box itself), blocked, and uncertain; a report that blurs these labels is a failed report.
- Paste the summary block into the chat when the program ends. If a session dies mid-run, the next agent reads this report first and resumes from the first unticked box.

## Testing Rules Baked Into Every Goal

- Tests assert deterministic mechanical invariants only: schemas, types, counts, boundaries, exit codes. Never assert model prose, classNames, palette hues, HTML trees, or generated source snapshots.
- Never use `any` or `@ts-ignore` to make a criterion pass.
- Never delete or weaken an existing test to reach a number. Totals may grow, not shrink.
- Repo verification vocabulary: `bun run check` for the full gate, `bunx vitest run --project unit` for unit tests (never `bun test`), `bun run typecheck` and `bun run lint` for focused runs.

## Worked Example

Good:

```text
### G2: Sandbox skill script execution
Objective: `executeSkillScript` in src/lib/projects/skills/skill-registry.ts spawns
scripts with a scrubbed environment, a hard timeout, and an output cap.
Why: the spawn inherits the full process.env, including potential secrets, and a
hung script stalls the build worker forever.
Numeric pass criteria:
- [ ] `bunx vitest run --project unit` exits 0; failed = 0.
- [ ] New test asserts env passed to spawn has exactly 1 key (`PATH`).
- [ ] New test asserts a script sleeping 30s is killed and reports an error
      (fake timers; asserted error text contains "timed out").
- [ ] New test asserts stdout above 2 MiB is truncated and `ok` stays true.
- [ ] `rg -c "process.env" src/lib/projects/skills/skill-registry.ts` returns exactly 1.
Evidence to capture:
- [ ] Test run output quoted in the commit body.
Constraints:
- [ ] Script results keep the `{ ok, output?, error? }` shape.
- [ ] All existing registry tests pass unchanged.
Allowed scope (anchors; new files allowed when recorded):
- [ ] src/lib/projects/skills/skill-registry.ts and its test file touched and verified.
- [ ] Any new supporting file (e.g. an allowlist module) recorded in the run report.
Forbidden:
- [ ] No new dependencies.
- [ ] No changes to agentic-generator.ts.
- [ ] No git push.
Iteration policy: root cause before patch; 3 attempts per approach, then switch approach.
Blocked when: 3 distinct approaches fail the same criterion, or a decision only the
developer can make is required.
Deliverable: atomic commit `feat(engine): sandbox skill script execution` on engine-new.
```

Bad:

```text
Goal: Make skill scripts safe and fast. Verify tests pass. Don't break anything.
```

Why it fails: no file named, no command named, no number anywhere, "safe and fast" unmeasurable, no stop condition, no deliverable.

## Common Mistakes

- Writing one summary goal for a multi-part job. Split into a numbered program.
- Criteria like "tests pass" without the command, or "fast" without a millisecond bound.
- Scope so wide one session cannot finish it, so narrow the goal cannot commit cleanly, or wrapped in speculative forbidden lists that squeeze out the working solution.
- Blocked conditions that fire on difficulty. Difficulty triggers a new approach; only irreversibility, credentials, money/production, or taste trigger a stop.
- Forgetting the push policy, leaving the executor to guess whether to push.
- Letting the executing agent invent facts. Missing facts belong in "Blocked when".
- Calling tools during this invocation. Writing only, always.

## Delivery Checklist

Before handing the program to the user, verify every line:

- [ ] Program header states branch, commit policy, push policy, and execution order.
- [ ] Every goal is numbered with dependencies stated.
- [ ] Every goal has ≥ 2 numeric pass criteria, each with a verbatim command and expected value.
- [ ] Every multi-point section in every goal uses `- [ ]` checkboxes; a goal reads as a tickable contract, done only when every box is ticked.
- [ ] Zero implementation steps inside pass criteria; any how-hint sits in a non-binding Suggested approach line.
- [ ] No invented commands; unknown verification commands defer to AGENTS.md / package scripts.
- [ ] Density holds: single goal 6-12 lines, program goals 10-20, zero filler lines.
- [ ] The final summary separates confirmed, proxy, blocked, and uncertain claims.
- [ ] Ambiguous jobs ship narrow and broad variants with one recommendation.
- [ ] Zero unmeasurable adjectives in any pass criterion.
- [ ] Every goal states scope anchors (new files allowed when recorded), hard exclusions only, iteration cap, and the autonomy-based blocked condition.
- [ ] Executor Autonomy is reachable from every goal: 3 approaches before stop, tools allowed, ask early for credentials and irreversible calls.
- [ ] Program header names the run report location in the OS temp dir, outside the repository, and the report format is defined.
- [ ] Every goal ends in an atomic commit; push is explicitly assigned or denied.
- [ ] Test rules (TDD, deterministic invariants, no weakened assertions) are present.
- [ ] Zero tool calls were made during this invocation.
