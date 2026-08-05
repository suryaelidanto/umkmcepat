# Choice-Card Recovery for Malformed Options — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop users seeing plain text inputs when a model emits a choice card with malformed options. Keep the card in choice mode instead of silently relabeling it `text`, and harden the prompt so models stop sending empty-string options.

**Architecture:** Two small, independent changes. (1) `normalizeQuestion` in `brief-flow.ts` stops downgrading `choice`→`text` when it can't parse ≥2 options — it keeps `choice` with whatever valid options exist. (2) `discuss-tool.ts` prompt gains an explicit rule: options must be `{label, description}` objects, never string/empty arrays.

**Tech Stack:** Bun, TypeScript, Vitest.

## Global Constraints

- Work from `dev`; atomic Conventional Commits per task.
- TDD: write failing test → run to confirm fail → implement → run to confirm pass.
- Run unit tests with `bunx vitest run --project unit <file>`. Full gate: `bun run check`.
- Use Bun only; keep `bun.lock` canonical.
- Docs are part of the change (spec/plan) when behavior changes.
- Never commit `.env`, secrets, uploads, logs, `.next/`, `.pi/`, `.browser/`, coverage artifacts.

---

### Task 1: Keep `choice` on malformed options (normalizer)

**Problem recap:** `normalizeQuestion` (`brief-flow.ts:515-516`) forces `answerMode:"text"` when `options.length < 2`. minimax's `options:["","",""]` parses to zero valid options → every such card renders as a text box.

**Fix:** Only force `text` when the model explicitly requested `text` or zero options exist; otherwise preserve `choice` with whatever valid options parsed.

**Files:**
- Modify: `src/lib/projects/brief-flow.ts` (`normalizeQuestion`)

**Change:**
```ts
const answerMode =
  candidate.answerMode === "text" || options.length === 0 ? "text" : "choice";
```

- [ ] Change `options.length < 2` to `options.length === 0` in `normalizeQuestion`.
- [ ] Confirm existing tests still pass (the `< 2`→`===0` only affects the single-option edge).

**Verify:**
- [ ] `bunx vitest run --project unit src/lib/projects/brief-flow.test.ts` (or wherever normalizer tests live).

---

### Task 2: Add test for malformed-options recovery

**Files:**
- Modify or create: `src/lib/projects/brief-flow.test.ts`

**Change:** Add a test: a question with `answerMode:"choice"` and `options:["","",""]` produces a **choice** card (empty options), not `text`. Add another: `answerMode:"choice"` with 1 valid option stays `choice`.

- [ ] Add malformed-options → choice test.
- [ ] Add single-valid-option → choice test.

---

### Task 3: Prompt hardening — options are `{label, description}` objects

**Problem recap:** minimax sends `options:["","",""]` (array of empty strings), which invalidates the card.

**Fix:** In `discuss-tool.ts`, strengthen the instruction so options are always `{label, description}` objects and string/empty arrays are forbidden.

**Files:**
- Modify: `src/lib/projects/discuss-tool.ts`

**Change:** Add to the choice-option rules (near line 273 / the card-richness line):
```
options must be an array of 2-5 objects shaped { "label": "...", "description": "..." }. Never emit string arrays or empty strings, e.g. options: ["", "", ""] — that renders as a plain text box. Every option needs a non-empty label.
```

- [ ] Add explicit negative example for string/empty options.

---

### Task 4: Full gate

- [ ] `bun run check` passes.
