---
name: writing-goal
description: Use when an autonomous agent must commit to a concrete goal before starting an open-ended or multi-step task — especially when the user's request is vague, when the task could be gamed, or when the user needs the agent to state upfront what "done" means
---

# writing-goal

## Overview
Before an autonomous agent does anything, it writes its own goal. A goal is a **filled contract** — seven required slots plus one gaming check. Baseline agents fill ~3 slots (outcome, partial verification, partial constraints) and consistently drop the numeric threshold, stop condition, boundaries, iteration policy, and the gaming check. Those dropped slots are where drift, infinite loops, and metric-gaming enter. This skill forces every slot filled before acting, then outputs the goal to the user.

**Core principle:** A goal is a filled template, not a sentence. A missing slot is a failure, not a style choice.

## When to use
- Agent is about to start an open-ended, multi-step, or tool-using task
- User's request is vague ("make X faster/better/less flaky")
- Agent must self-declare what "done" means before acting
- Task has a metric that could be gamed (error rate, ticket-close time, benchmark score)

## When NOT to use
- Single-step, no-judgment task ("run `npm test`")
- Cleanly decomposable task → use a fixed workflow, not an autonomous agent
- Pure reference lookup

## The goal contract — fill EVERY slot, in order

A goal is incomplete unless every slot is filled. **"N/A" is not a fill.** If a slot genuinely cannot be filled, say *what blocks it* — that statement IS the blocked stop condition (slot 7), and it means the goal is not ready to act on.

1. **Outcome** — the concrete end state. No adjectives ("faster", "better"). Name the observable thing that will be true.
2. **Numeric threshold** — a number the outcome must cross. "reduce latency" → "p95 checkout < 120ms". If you genuinely cannot name a number, say why and name the next-best observable proxy (e.g. "no baseline exists; first produce a baseline, then threshold = current p95 × 0.7").
3. **Verification surface** — the test, benchmark, command, artifact, or report whose output proves done. Must be something a command checks (exit 0/1) or a human reads — **not the model's self-assessment.**
4. **Constraints** — what must not regress (correctness suite stays green, no new error classes, unrelated-path latency within ±5%).
5. **Boundaries** — allowed files/modules/tools/data. Everything else is out of scope.
6. **Iteration policy** — how you pick the next action (e.g. "profile → top bottleneck → smallest fix → re-measure → repeat"). Not "try things."
7. **Stop condition** — **(a)** a max iteration count, AND **(b)** the "blocked" condition: when to stop and report "no defensible path remains" rather than grind forever.

## Required step — the gaming check

Before finalizing, answer this out loud in the goal:

> How would a lazy or adversarial agent satisfy slots 1–3 literally while dodging the intent? List each exploit. Close each one in the constraints (slot 4) or verification surface (slot 3).

Named exploit vectors to scan for (from reward-hacking literature): reclassifying/suppressing errors to hit a threshold; special-casing the exact test while breaking the general case; rewriting to pass a benchmark without real improvement; retrying the same failed thing to hit a "within N minutes" metric; denying the evaluation; leaking the answer into the input; tampering with the check itself.

If you cannot close an exploit, say so in the goal — that is an honest "blocked" signal, not a finished goal.

## Required step — the second-agent test

A second agent with **no context** of this work must be able to read the output alone and confirm "done" or "not done" from the verification surface. If a context-less agent could not, your verification surface is actually self-assessment — rewrite slot 3.

## Output format (REQUIRED)

Keep the goal tight: ideally ~1500 characters, hard max 4000 characters. If you're over, cut the worked-example-style prose, not the slot fills.

Output exactly this, filled, then stop:

> **Goal:** [one-line outcome + numeric threshold]
> **Verified by:** [verification surface — command/test/artifact, not self]
> **Constraints:** [what must not regress]
> **Boundaries:** [allowed files/tools/data]
> **How I'll proceed:** [iteration policy]
> **I stop when:** [max iterations] OR [blocked condition]
> **Gaming vectors I closed:** [list each, or "none — goal is gaming-resistant because…"]

Then state in plain language for the user what you will accomplish.

## Worked example

User: "Make checkout faster — customers complain."

> **Goal:** Reduce checkout p95 latency below 120ms on the `checkout-e2e` benchmark.
> **Verified by:** `./bench checkout-e2e` exits 0 and prints p95 < 120 (command-checked, not self-assessed). A second agent reading only this output can confirm done/not-done.
> **Constraints:** correctness suite (`npm test`) stays green; no new error classes in logs; unrelated-path latencies within ±5%.
> **Boundaries:** `src/checkout/**` writable; `src/payment/**` read-only. May profile and read logs. No new dependencies without asking.
> **How I'll proceed:** profile → rank hot paths → smallest fix to the top one → re-run bench → repeat only if p95 still > 120 and a measured cause remains.
> **I stop when:** 6 fix–measure cycles, OR p95 < 120 achieved, OR profiling shows the bottleneck is upstream (payment gateway) — in which case report blocked, do not rewrite.
> **Gaming vectors I closed:** (1) "faster by deleting slow tests" — blocked by constraints (suite must stay green). (2) "p95 < 120 by special-casing the bench inputs" — blocked: bench uses randomized inputs I cannot see. (3) "hollow win: rewrite to pass bench" — blocked: I also check unrelated-path latency didn't move, catching improvements that aren't real.

I'll reduce checkout latency to under 120ms at the p95, measured by the benchmark, without breaking tests or other paths. If the real bottleneck is the payment gateway (outside my boundary), I'll stop and tell you rather than fake it.

## Red flags — rewrite the goal

- Any slot filled with an adjective instead of a number/observable
- "Done when I'm satisfied" / "when it looks good" / "when it works"
- No max iteration count anywhere in slot 7
- Verification surface is the agent's own judgment
- You skipped listing a gaming vector because "none apply" — they almost always apply

## Source
Built from: OpenAI Codex Goals (six elements), arXiv 2505.02709 (goal drift + strong goal elicitation), Anthropic context engineering ("right altitude"), arXiv 2605.02964 (reward-hacking six exploit vectors), the second-agent test, and the "executable done-check" rule.
