---
name: tldr
description: Use when asked to explain or summarize a technical concept quickly — "tldr", "what is", "quick overview", "how does X work" — for concepts, not for deep tutorials, debugging, or code-writing tasks
---

# tldr

Explain a technical concept **short, easy, still technical** — like a human dev in a hallway, not a form. Keep the real terms; keep it readable; don't lecture.

**The output IS 2-3 short sentences of natural prose — not an essay, not a labeled card.** No "Keywords:" / "Flow:" / "Analogy:" labels. The terms are **bolded** inline so they pop without a list.

## What to explain (the target)

- **With an argument** (`/tldr WebSocket`, "tldr mutex"): explain that concept.
- **No argument, or "above" / "this" / "that"** (`/tldr`, `/tldr above`): the target is the **immediately preceding technical content in the chat** — the last assistant message, or the concept/term it just explained. **Do NOT ask the user for an argument — it's obvious they want the thing above tldr'd.** Read up the thread, find the last concept/explanation/term, and tldr it. If genuinely nothing technical preceded, say so in one short line — still don't prompt for arguments.

## The contract

Every tldr answer reads like this — natural prose, ≤40 words:

```
**<Concept>** — <plain-verb definition + a familiar contrast>, with <terms bolded>. <If a real lifecycle: one sentence with → arrows. If none: skip.>
```

That's the whole answer. No gotchas, watch-outs, variants, failure-modes, "why it exists", and no trailing prose line tying it to the user's code. Those are scope creep — refuse them.

## Rules

- **Definition sentence (always, the comprehension layer):** ≤1 line, **plain verbs + a familiar anchor**. Name what it does + contrast against something the reader already knows (HTTP for WebSocket, "one-at-a-time" for mutex, the literal word for guardrails). **This is the ONLY comprehension layer — no rescue prose. If it uses a word as hard as the term itself, the reader learns nothing.**
  - ❌ `Guardrails — safety invariants that keep an agent bounded` (jargon defines jargon)
  - ✅ `**Guardrails** — hard caps that stop an AI agent running off-track, unlike a plain prompt where it does whatever it wants.`
- **Terms (always, the recall layer):** the verbatim jargon you'd grep in docs/errors, **bolded inline** in the prose — not a labeled list, not paraphrased. This is where the technical words live; the Definition stays plain.
  - ❌ `switching response` (loses the search term `101 Switching Protocols`)
- **Flow (conditional, the behavior layer):** weave it as one sentence with `→` arrows **only if the concept has a real lifecycle** (handshake, acquire→release, OAuth). Absent for flat concepts (`idempotent`, `pure function`, `array`) — no lifecycle, no flow sentence. Present iff *a sequence exists*, NOT iff *the concept is hard*.
- **Analogy (opt-in only):** add ONLY when the user asks ("give me an analogy", "ELI5") OR the concept is pure abstraction with no concrete handle. Never by default. One clause, woven in — never replaces the technical layer.

## Worked example (copy this feel — natural, not labeled)

**WebSocket** keeps one TCP conn open so both sides push anytime, unlike HTTP's request-then-response. It starts as an HTTP **Upgrade** → server replies **101 Switching Protocols** → both sides trade **frames** (**ping/pong** keepalive) until a **close** frame.

No "Keywords:" line. No "Flow:" line. Just prose with the terms bolded and the flow as arrows.

## HTML visual mode (same content, rendered)

Same definition + terms + flow, shown visually instead of text. Browser = the rendering stdlib; no new dependency.

- **Auto-trigger** HTML iff the concept has a **branching structure** — ≥3 branches / decision points / parallel paths / a state machine with loops (OAuth redirect paths, a decision tree, CI fan-out). Linear `A → B → C` flows read fine as prose — do NOT auto-HTML those.
- **Else on-demand** — "show me" / "draw it" / "visual". Flat or linear concepts → text unless asked.
- One self-contained `.html` in the OS temp dir, all CSS inline, no external deps, no framework. Render the **same** definition + terms + flow — terms as styled chips, flow as a diagram. Don't invent new sections.

## Rationalizations — refuse these

| Rationalization | Reality |
|---|---|
| "User said technical → they want thorough" | Technical = verbatim terms, not more depth. tl;dr wins. |
| "This concept needs watch-outs to be useful" | Prose = the contract above. Watch-outs ≠ tldr. Refuse the section. |
| "A short analogy up front helps first" | Analogy is opt-in. Lead with the definition. |
| "Label the terms 'Keywords:' for clarity" | Labels read robotic. Bold them inline in prose instead. |
| "Define guardrail with 'invariants'/'bounded'" | Definition is the comprehension layer. Jargon defining jargon teaches nothing. Use plain verbs + a familiar anchor. |
| "One closing line tying it to their code helps" | Trailing prose = scope creep. The answer IS the 2-3 sentences. |
| "I need an argument to proceed — let me ask" | No-arg / "above" means tldr the preceding chat content. Never prompt for args. |

## Red flags — STOP, rewrite

- More than ~3 sentences, or over ~40 words on a simple concept
- "Keywords:" / "Flow:" / "Analogy:" labels (robotic — weave as prose)
- Analogy appearing without being asked
- Terms paraphrased instead of verbatim
- Definition uses a word as hard as the term itself (jargon defines jargon)
- Gotchas / watch-outs / variants / failure-modes sections
- Any prose line after the answer tying it to the user's code
- Asking the user for an argument when invoked with none or with "above"

## When NOT to use this skill

"explain deeply", "full tutorial", "how do I implement X", debugging, code review, writing code. This is for quick-concept recall, not depth or task execution.

Answer in the language of the question. Terms stay verbatim English regardless.
