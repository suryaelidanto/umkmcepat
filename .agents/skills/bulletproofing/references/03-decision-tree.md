# 03 — The Decision Tree: When to Split, Colocate, or Leave Alone

A principled evaluation rubric. Architecture is about maximizing cohesion and minimizing cognitive load, not blindly chasing arbitrary line counts.

---

## 1. The Fallacy of Arbitrary Line Counts (The LOC Trap)

Dividing a file simply because it reaches 300 lines without structural rationale is harmful:
- It creates **spaghetti indirection**: to understand a single button click, a developer must jump across 6 tiny files.
- It causes **artificial prop drilling**: tightly coupled state is forcibly passed through arbitrary layers.
- It obscures domain cohesion: related logic that evolves together gets scattered into random files.

**True Rule:** Lines of code are a *smell trigger* for inspection, never the sole justification for splitting.

---

## 2. When You MUST Split

Split a component, hook, or module if and only if one of these 4 architectural criteria is met:

```
                               ┌─────────────────────────────┐
                               │ Does the file need to split?│
                               └──────────────┬──────────────┘
                                              │
                   ┌──────────────────────────┴──────────────────────────┐
                   ▼                                                     ▼
     [CRITERION 1: Multiple Reasons]                       [CRITERION 2: Re-render Blast]
     Does the file change for 2+ distinct                 Does a fast-changing state
     stakeholder reasons? (e.g. business math              (e.g. input keystrokes) cause heavy
     + UI canvas rendering + network polling)              static sub-trees to re-render?
          ├── YES ➔ SPLIT into domain modules                   ├── YES ➔ EXTRACT isolated component
          └── NO ➔ Evaluate Criterion 2                         └── NO ➔ Evaluate Criterion 3
                   │                                                     │
                   ▼                                                     ▼
     [CRITERION 3: Mixed Abstractions]                     [CRITERION 4: Independent Lifecycle]
     Are high-level business rules tangled                Does one part have a distinct
     with low-level DOM math / canvas APIs?                asynchronous lifecycle (streaming/polling)
          ├── YES ➔ EXTRACT low-level adapter                   ├── YES ➔ EXTRACT dedicated hook
          └── NO ➔ Evaluate Criterion 4                         └── NO ➔ DO NOT SPLIT
```

### 1. Multiple Reasons to Change (Single Responsibility Principle)
- *Symptom:* Editing payment calculations requires touching the same file that renders checkout animations.
- *Remedy:* Separate pure business logic (`payment-calculator.ts`) from visual layout (`CheckoutView.tsx`).

### 2. Re-render Blast Radius (React Performance Barrier)
- *Symptom:* Typing a character into a small search input re-renders an entire 1,000-row table or complex SVG chart.
- *Remedy:* Extract the interactive input into its own component (`SearchInput.tsx`) or wrap children in the `children` prop pattern.

### 3. Mixed Levels of Abstraction
- *Symptom:* High-level domain intent (`publishWebsite()`) is mixed in the same function with low-level DOM bounding box math (`element.getBoundingClientRect()`) or raw WebSocket binary frame parsing.
- *Remedy:* Encapsulate raw DOM/transport mechanics into a dedicated utility or adapter hook.

### 4. Independent Async Lifecycle
- *Symptom:* A component manages visual tabs, but also contains a 200-line streaming supervisor with timer intervals, heartbeat retries, and socket listeners.
- *Remedy:* Extract the supervisor into a self-contained domain hook (e.g. `useWorkspaceBuild.ts`).

---

## 3. When You MUST NOT Split (Preserve Colocation)

Do NOT split code into new files if any of these 3 conditions apply:

### 1. Single Consumer Principle
If a helper function or small sub-component is only used by **one single parent component**, keep it in the same file or colocated in the same folder.
- *Anti-pattern:* Creating `src/components/common/HeaderAvatarBadgeHelper.tsx` for a 15-line JSX helper that is never used anywhere except inside `Header.tsx`.
- *Remedy:* Keep it directly inside `Header.tsx` as an unexported internal component.

### 2. Tightly Coupled State Machine
If two routines share a closed, intricate local state transition where separating them requires passing 8 callback functions and 6 state variables through props, keep them together.
- *Anti-pattern:* Ripping out half of a form wizard into a separate file, requiring an artificial bridge of 12 props.
- *Remedy:* Keep the state machine in one cohesive file, or extract the entire machine into a single custom hook (`useWizardState.ts`).

### 3. Premature Abstraction (YAGNI)
Never build generic components or utilities for speculative future use.
- *Rule of Three:* Write direct, specific code for the first two occurrences. Only consider an abstraction when a third real-world use case emerges.
- *Anti-pattern:* Building a configurable `<UniversalFilterDropdown<T, K>>` when your app only filters projects by status.

---

## 4. Summary Matrix

| Scenario | Recommendation | Rationale |
|---|---|---|
| A 350-line component with 0 sub-renders, single responsibility, and clean flow | **LEAVE ALONE** | High cohesion. Splitting would only add unnecessary indirection. |
| A 250-line file mixing raw CSS Canvas math with Stripe billing logic | **SPLIT IMMEDIATELY** | Mixed abstractions & multiple reasons to change. |
| A 50-line helper function used by only one component | **COLOCATE IN SAME FILE** | Prevents file sprawl; immediate locality of reference. |
| A helper function used across 3 distinct feature domains | **PROMOTE TO SHARED** | Move to `src/lib/common/` or `src/components/ui/`. |
