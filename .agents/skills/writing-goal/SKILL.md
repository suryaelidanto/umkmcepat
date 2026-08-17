---
name: writing-goal
description: Use when an autonomous agent must commit to a concrete goal before starting an open-ended or multi-step task — especially when the request is vague, when the agent will run unattended or on a loop until the work is "fully done", when the task has a metric that could be gamed, or when the agent needs to state upfront what done, stuck, and stop mean
---

# writing-goal

## Overview

Before an autonomous agent does anything, it writes its own goal. A goal is a **filled contract** — nine required slots plus two checks — and it is the only thing standing between an unattended agent and the two ways unattended work fails:

- **Stops too early** — declares done on a hope, with nothing a stranger could check.
- **Never stops** — grinds on a dead item, or invents adjacent work to stay busy.

Baseline agents fill ~3 slots (outcome, partial verification, partial constraints) and consistently drop the completion criterion, the done checklist, boundaries, iteration policy, the stall protocol, and the stop condition. Those dropped slots are exactly where drift, infinite loops, and metric-gaming enter.

**Core principle:** A goal is a filled template, not a sentence. A missing slot is a failure, not a style choice.

**Termination principle:** Every goal must be able to *end*. If nothing in the goal can ever become false, the agent runs forever. If nothing must be *shown*, the agent quits on iteration two.

## When to use

- Agent is about to start an open-ended, multi-step, or tool-using task
- Agent will run unattended, on a loop, or "until it's done" with no human in the cycle
- User's request is vague ("make X faster/better/less flaky")
- Task has a metric that could be gamed (error rate, ticket-close time, benchmark score)

## When NOT to use

- Single-step, no-judgment task ("run `npm test`")
- Cleanly decomposable task → use a fixed workflow, not an autonomous agent
- Pure reference lookup

## The goal contract — fill EVERY slot, in order

A goal is incomplete unless every slot is filled. **"N/A" is not a fill.** If a slot genuinely cannot be filled, say *what blocks it* — that statement IS the blocked stop condition (slot 9), and it means the goal is not ready to act on.

| # | Slot | Fill it with |
|---|---|---|
| 1 | **Outcome** | The concrete end state. No adjectives ("faster", "better"). Name the observable thing that will be true. |
| 2 | **Completion criterion** | Something *countable* the outcome must cross: a number (`p95 < 120ms`), or a closed checklist where every item has a binary check. |
| 3 | **Verification surface** | The command, test, benchmark, or artifact whose output proves done. Exit 0/1 or a human reads it — **never the model's self-assessment.** |
| 4 | **Done checklist** | The full inventory of work items, each with its own check. This is what "nothing left to do" means. See below. |
| 5 | **Constraints** | What must not regress (suite stays green, no new error classes, unrelated paths within ±5%). |
| 6 | **Boundaries** | Allowed files/modules/tools/data. Everything else is out of scope. |
| 7 | **Iteration policy** | How you pick the next action ("profile → top bottleneck → smallest fix → re-measure → repeat"). Not "try things." |
| 8 | **Stall + initiative** | What counts as no progress, and the ladder you climb before you are allowed to call yourself stuck. See below. |
| 9 | **Stop condition** | The three exits — DONE, BLOCKED, EXHAUSTED — each with its trigger and its required report. See below. |

**On slot 2:** prefer a real number. If no number is available, a closed checklist of binary checks is an honest completion criterion; an invented score ("quality 8/10", "80% better") is not — a fabricated metric is worse than an honest checklist, because it launders self-assessment as measurement. If a number exists but has no baseline, the first checklist item is "produce the baseline", then set the threshold from it.

## Slot 4 — the done checklist (what "nothing left to do" means)

The checklist is the work inventory. Empty inventory is the primary stop signal; without one, "am I done?" is a feeling.

- **Every item is binary and carries its own check.** "Refactor auth" is not an item. "`src/auth/session.ts` no longer calls `legacyVerify` — `grep -c legacyVerify src/auth/` returns 0" is.
- **The checklist is closed at goal-write time.** During the run you may add an item **only if the outcome cannot be reached or verified without it** (a discovered blocker, a missing test you need). Record why you added it.
- **Everything else goes to `Deferred`.** Improvements, adjacent cleanups, "while I'm here" work, ideas worth doing later — these get *listed and reported*, never worked. Deferred items are not iterations.
- **A shrinking checklist is progress; a growing one is a red flag.** If items are added faster than they close for two iterations, stop and report: the goal was mis-scoped, and that is a decision for the user, not an excuse to keep going.

## Slot 8 — stall detection and the initiative ladder

**An iteration is *no-progress* when it closes no checklist item and moves no number on the verification surface.** Writing more report is not progress. Re-running a check that was already green is not progress.

**After two consecutive no-progress iterations, the ladder is mandatory** — you may not declare yourself stuck until every rung is recorded as tried and failed. Climb in order, recording each:

1. **Re-measure.** Confirm the bottleneck is real *now*. Do not act on a stale reading or a remembered failure.
2. **Isolate.** Get the smallest reproduction or narrowest failing check. Guessing stops here.
3. **Change the approach, not the effort.** A different mechanism — never the same fix harder. Repeating a recorded failure is forbidden; that is the top loop-failure mode.
4. **Move to an unblocked item.** The checklist has others. Work them and come back with more information. A loop must never idle on one stuck item.
5. **Reduce it.** Too big to land whole? Split it and land the part that is provable. Partial verified progress beats a stalled whole.
6. **Buy information.** Read the source, logs, docs, or git history you have been guessing about. One read beats three guesses.
7. **Widen the boundary — by asking, never silently.** Name the file or tool you need and why. Unattended? Record the question in the ledger and exit BLOCKED with it.

**Stuck is defined as: the ladder was climbed to the end and every rung is recorded as tried-and-failed.** That — not fatigue, not iteration count, not "this seems hard" — is what licenses a BLOCKED exit.

## Slot 9 — the stop condition (three exits, each with a required report)

Every run ends in exactly one of these. Name all three in the goal, with their triggers.

| Exit | Trigger | Required report |
|---|---|---|
| **DONE** | Checklist empty **and** completion criterion crossed **and** constraints green | Pasted verification output (not a summary), the ticked checklist, the Deferred list |
| **BLOCKED** | Ladder exhausted on the item that gates the outcome — **or** checklist empty but criterion not crossed | Every rung tried, the evidence, and **the one decision or access that would unblock it** |
| **EXHAUSTED** | Iteration/time budget spent with items still open | What closed, what is open, what to run next — enough for a cold agent to resume |

Rules that make these exits real:

- **DONE requires evidence, not belief.** No pasted verification output means you are not done — you are at EXHAUSTED with an unverified claim. Say so in those words.
- **A budget is a backstop, not the plan.** The real exits are checklist-empty and stall. Name a max anyway (iterations or wall-clock), so a broken verification surface cannot spin forever.
- **BLOCKED is an honest finish, not a failure.** Reporting "the bottleneck is the payment gateway, outside my boundary" is a completed job. Faking a win is not.
- **Stopping is an action.** Emit the terminal report. Under a loop harness, call its stop control (e.g. `ScheduleWakeup` with `stop: true`) — do not merely narrate "I'm done" and wake up again.
- **Never restart a finished goal.** If the terminal report is written and the exit is DONE, the next wake-up re-reads the report and stops again. It does not go looking for more work.

## Amending a goal mid-run

Long runs discover the goal was wrong. Silent drift and rigid grinding are both failures.

- **Amend loudly.** Write the new version into the goal file with the reason and what triggered it. Keep the old version visible.
- **Never amend to make a failing check pass.** No lowering the threshold, no swapping the verification surface, no deleting a hard checklist item after it fails. Removing an item is legal only when it turns out already-satisfied or provably not required by the outcome — and you record the proof.
- **If the *outcome* is wrong, that is BLOCKED, not an amendment.** Report it and let the user re-aim.

## Required check 1 — the gaming check

Answer this out loud in the goal, in all three directions:

> How would a lazy or adversarial agent satisfy this goal literally while dodging the intent? List each exploit. Close each in the constraints (slot 5) or verification surface (slot 3).

| Family | Exploits to scan for |
|---|---|
| **Metric hacking** | Reclassifying or suppressing errors to hit a threshold; special-casing the exact test while breaking the general case; rewriting to pass a benchmark without real improvement; retrying to beat a "within N minutes" metric; denying the evaluation; leaking the answer into the input; tampering with the check itself |
| **Stop hacking** | Declaring DONE without pasted verification output; quietly narrowing the checklist; calling a partial win done; declaring BLOCKED early to escape a hard item; "verified" that means "I read the code and it looks right" |
| **Busywork hacking** | Adding out-of-scope items to keep the loop alive; refactoring unrelated code; re-verifying what is already green; producing more report instead of more progress |

If you cannot close an exploit, say so in the goal — that is an honest "blocked" signal, not a finished goal.

## Required check 2 — the second-agent test

A second agent with **no context** must be able to read your terminal report alone and confirm done / not-done from the verification surface. If a context-less agent could not, your verification surface is self-assessment — rewrite slot 3. This is why DONE requires pasted output: it is the only slot a stranger can check.

## Goal presentation

Present the contract directly in the conversation response using the standard format. Do not write it to a file unless explicitly requested by the user.


## Output format (REQUIRED)

Keep the visible goal tight: ideally ~1500 characters, hard max 4000. Over budget? Cut prose, never slot fills — and in loop mode move the full checklist to the goal file, showing counts and the top-level items here.

> **Goal:** [one-line outcome + completion criterion]
> **Verified by:** [command/test/artifact — not self]
> **Done checklist:** [N items, each with its check] · **Deferred:** [out of scope, listed not worked]
> **Constraints:** [what must not regress]
> **Boundaries:** [allowed files/tools/data]
> **How I'll proceed:** [iteration policy]
> **If I stall:** [what counts as no-progress + the ladder]
> **I stop when:** DONE [checklist empty + criterion met] · BLOCKED [ladder exhausted / criterion unreachable] · EXHAUSTED [budget]
> **Gaming vectors I closed:** [metric / stop / busywork — each named and closed]

Then state in plain language what you will accomplish. At the end of the run, emit the terminal report for whichever exit you hit.

## Worked example

User: "Make checkout faster — customers complain."

> **Goal:** Reduce checkout p95 latency below 120ms on the `checkout-e2e` benchmark.
> **Verified by:** `./bench checkout-e2e` exits 0 and prints p95 < 120. Output pasted in the final report.
> **Done checklist:** (1) baseline captured; (2) top-3 hot paths profiled and ranked; (3) each ranked path either fixed-and-remeasured or recorded as not-the-cause; (4) bench p95 < 120; (5) `npm test` green. **Deferred:** cart-page render cost, log noise in `payment/` — reported, not worked.
> **Constraints:** `npm test` stays green; no new error classes in logs; unrelated-path latencies within ±5%.
> **Boundaries:** `src/checkout/**` writable; `src/payment/**` read-only. May profile and read logs. No new dependencies without asking.
> **How I'll proceed:** profile → rank hot paths → smallest fix to the top one → re-run bench → repeat while p95 > 120 and a measured cause remains.
> **If I stall:** two cycles that close no checklist item and move p95 by <2ms → re-measure, isolate to one span, change mechanism (not retry), move to another ranked path, split the fix, read the ORM query log, then ask to touch `payment/`. Only when all seven are recorded as failed am I stuck.
> **I stop when:** DONE — checklist empty and bench prints p95 < 120 with `npm test` green. BLOCKED — ladder exhausted, or profiling shows the bottleneck is the payment gateway (outside my boundary); I report the measurement, I do not rewrite. EXHAUSTED — 8 fix–measure cycles.
> **Gaming vectors I closed:** *Metric* — "delete slow tests" blocked by constraints; "special-case bench inputs" blocked, inputs are randomized and unseen; "hollow rewrite" caught by the ±5% unrelated-path check. *Stop* — DONE requires pasted bench output, so "looks faster" cannot end the run. *Busywork* — the checklist is closed; cart-page work is Deferred, not an iteration.

I'll get checkout under 120ms at the p95, proven by the benchmark, without breaking tests or other paths. If the real bottleneck turns out to be the payment gateway, I'll stop and show you the measurement rather than fake a win.

**Checklist-based variant** (no meaningful number): *"Goal: all 23 call sites off the deprecated `verifyLegacy` API. Verified by: `rg -c 'verifyLegacy' src/` returns 0 and `npm test` green. Done checklist: 23 items, one per call site, each ticked by its own grep."* Twenty-three binary checks are an honest completion criterion; "migration feels complete" is not.

## Rationalizations — both directions

| Excuse | Reality |
|---|---|
| "It works, I'm done." | No pasted verification output = not DONE. That is EXHAUSTED with an unverified claim. Say it in those words. |
| "Close enough to the threshold." | The threshold is the threshold. Crossed or not crossed. |
| "This item is too hard, I'll drop it." | Dropping a hard item is stop-hacking. Climb the ladder; if it truly gates the outcome, exit BLOCKED and say so. |
| "I'll lower the target to something realistic." | Not after seeing it fail. That is the loop's signature reward hack. Amend the *approach*, never the *bar*. |
| "I'm stuck." (iteration 2) | Stuck is defined: ladder climbed, every rung recorded as failed. Otherwise you are on rung 1. |
| "Nothing's working, I'll try that fix again." | It is in the ledger as failed. Rung 3 says change the mechanism. |
| "The checklist is empty but I found more to do." | Deferred list. Report it. Do not extend the loop with self-generated work. |
| "I'll keep polishing until the budget runs out." | Empty checklist + criterion met = DONE. Stop and emit the report. Idling burns the user's money. |
| "I'll just peek outside my boundary, it's one file." | Rung 7 is *ask*. Unattended means record the question and exit BLOCKED with it. |

## Red flags — rewrite the goal

- Any slot filled with an adjective instead of a number or observable
- "Done when I'm satisfied" / "when it looks good" / "when it works"
- A completion criterion that is a self-scored number ("quality 8/10")
- No done checklist — so "nothing left to do" is undefined
- No definition of no-progress, or "stuck" left to judgment
- Only one exit named (usually DONE), so BLOCKED and EXHAUSTED become silent grinding
- Verification surface is the agent's own judgment
- You skipped listing a gaming vector because "none apply" — they almost always apply

## Source

Built from: OpenAI Codex Goals (six elements), arXiv 2505.02709 (goal drift + strong goal elicitation), Anthropic context engineering ("right altitude"), arXiv 2605.02964 (reward-hacking exploit vectors), the second-agent test, and the "executable done-check" rule. The stall ladder, closed checklist, three-exit stop condition, and amendment protocol come from unattended-loop failure modes: premature DONE, self-generated busywork, and repeated failed fixes.
