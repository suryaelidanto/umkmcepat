# Discuss Chat Error Feedback & AI Thinking UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic "AI sempat terputus" banner with redacted Indonesian server copy, auto-retry transient chat failures up to a configurable cap before showing any banner, clear stale errors on send, and show a calm "AI thinking" strip so users never stare at dead air.

**Architecture:** All client-side. The error redactor `toUserFacingDiscussError` already exists and is reused; a new pure module `discuss-chat-error.ts` holds transient/terminal classification + retry-cap math so it is unit-testable without React. A new AppSetting `discuss.chat.auto_retry_attempts` (default 2, admin-editable) flows to the composer via the project-page loader prop. Auto-retry reuses the existing `retryChat` (resume-or-regenerate). A new `aiThinking` state drives the thinking strip with timers; a defensive reasoning-part scan future-proofs it for when `reasoning: "none"` is ever lifted.

**Tech Stack:** TypeScript, React 19, TanStack Start, AI SDK `useChat` (@ai-sdk/react), Vitest, Bun.

## Global Constraints

- Work from `dev`; atomic Conventional Commits per task, explicit `git add <paths>` only (never `-A`).
- TDD: write failing test → run to confirm fail → implement → run to confirm pass.
- Run unit tests with `bunx vitest run --project unit <file>`. Full gate: `bun run check`.
- Use Bun only; keep `bun.lock` canonical.
- Docs are part of the change (this plan + spec already created).
- Do NOT touch server error copy (`discuss-turn-worker.ts`), `toUserFacingDiscussError` internals, hedging, models, or the `project_request_blocked` / `chat_turn_too_large` specific banners.
- Do NOT flip `reasoning: "none"` to anything else. Only add a docstring + the defensive client scan.
- User-facing copy Indonesian; developer logs/code English.
- Never commit `.env`, secrets, logs, coverage artifacts.

---

### Task 1: Pure transient/terminal classification + retry-cap math

**Files:**
- Create: `src/lib/projects/discuss-chat-error.ts`
- Test: `src/lib/projects/discuss-chat-error.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `export type DiscussChatErrorKind = "transient" | "terminal"`
  - `export function classifyDiscussChatError(input: { code?: string; message?: string; status?: number }): DiscussChatErrorKind`
  - `export function nextRetryAttempt(current: number, cap: number): number | null` — returns `current + 1` when `current < cap`, else `null`.
  - `export function isTerminalChatError(input: { code?: string; message?: string; status?: number }): boolean` — convenience wrapper.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/projects/discuss-chat-error.test.ts
import { describe, expect, it } from "vitest";

import {
  classifyDiscussChatError,
  nextRetryAttempt,
} from "@/lib/projects/discuss-chat-error";

describe("classifyDiscussChatError", () => {
  it("treats known transient internal codes as transient", () => {
    expect(
      classifyDiscussChatError({ code: "stream_error_no_text" }),
    ).toBe("transient");
    expect(
      classifyDiscussChatError({ code: "repair_failed" }),
    ).toBe("transient");
  });

  it("treats stack/timeout/queue patterns as transient", () => {
    expect(
      classifyDiscussChatError({
        message: "ECONNREFUSED worker queue failed",
      }),
    ).toBe("transient");
    expect(
      classifyDiscussChatError({ message: "Failed to fetch" }),
    ).toBe("transient");
  });

  it("treats 429 and 408 as transient", () => {
    expect(classifyDiscussChatError({ status: 429 })).toBe("transient");
    expect(classifyDiscussChatError({ status: 408 })).toBe("transient");
  });

  it("treats blocked/too-large as terminal", () => {
    expect(
      classifyDiscussChatError({ code: "project_request_blocked" }),
    ).toBe("terminal");
    expect(
      classifyDiscussChatError({ code: "chat_turn_too_large" }),
    ).toBe("terminal");
  });

  it("treats terminal Indonesian copy as terminal", () => {
    expect(
      classifyDiscussChatError({ message: "Proses dihentikan." }),
    ).toBe("terminal");
    expect(
      classifyDiscussChatError({
        message: "Obrolan belum berhasil diproses. Coba kirim ulang ya.",
      }),
    ).toBe("terminal");
  });

  it("treats an empty/unknown error as transient (safest: retry once)", () => {
    expect(classifyDiscussChatError({})).toBe("transient");
  });
});

describe("nextRetryAttempt", () => {
  it("returns the next attempt below the cap", () => {
    expect(nextRetryAttempt(0, 2)).toBe(1);
    expect(nextRetryAttempt(1, 2)).toBe(2);
  });

  it("returns null at the cap", () => {
    expect(nextRetryAttempt(2, 2)).toBeNull();
    expect(nextRetryAttempt(0, 0)).toBeNull();
  });

  it("clamps negative cap to zero", () => {
    expect(nextRetryAttempt(0, -1)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run --project unit src/lib/projects/discuss-chat-error.test.ts`
Expected: FAIL — module not found (`Cannot find module '@/lib/projects/discuss-chat-error'`).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/projects/discuss-chat-error.ts
export type DiscussChatErrorKind = "transient" | "terminal";

// Patterns that mean "the provider/stream hiccuped — safe to retry".
const TRANSIENT_PATTERNS = [
  /stream_error_no_text/,
  /repair_failed/,
  /ECONN|failed to fetch|network|timeout|worker |queue |exception|undefined|null/i,
  /429|408|503/i,
  /rate.?limit|overloaded|unavailable/i,
];

// Terminal Indonesian copy from the server — retrying is pointless.
const TERMINAL_PATTERNS = [
  /proses dihentikan/i,
  /belum berhasil diproses/i,
  /terlalu panjang/i,
  /ditolak|diblokir|blocked/i,
];

export function classifyDiscussChatError(input: {
  code?: string;
  message?: string;
  status?: number;
}): DiscussChatErrorKind {
  const code = input.code ?? "";
  const message = input.message ?? "";
  const status = input.status ?? 0;

  if (code === "project_request_blocked" || code === "chat_turn_too_large") {
    return "terminal";
  }
  if (TERMINAL_PATTERNS.some((re) => re.test(message))) {
    return "terminal";
  }
  if (status >= 400 && status !== 429 && status !== 408) {
    return "terminal";
  }
  if (
    TRANSIENT_PATTERNS.some((re) => re.test(code) || re.test(message)) ||
    status === 429 ||
    status === 408
  ) {
    return "transient";
  }
  // Unknown / empty error — safest is to retry once before alarming the user.
  return "transient";
}

export function isTerminalChatError(input: {
  code?: string;
  message?: string;
  status?: number;
}): boolean {
  return classifyDiscussChatError(input) === "terminal";
}

export function nextRetryAttempt(current: number, cap: number): number | null {
  const safeCap = Math.max(0, Math.floor(cap));
  if (current < safeCap) {
    return current + 1;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run --project unit src/lib/projects/discuss-chat-error.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/discuss-chat-error.ts src/lib/projects/discuss-chat-error.test.ts
git commit -m "feat(discuss): add transient/terminal chat error classifier + retry-cap math"
```

---

### Task 2: Register `discuss.chat.auto_retry_attempts` AppSetting

**Files:**
- Modify: `src/lib/app-settings-registry.ts` (insert after the `discuss.hedging` entry, ~line 439)
- Test: `src/lib/app-settings-registry.test.ts` (extend)

**Interfaces:**
- Consumes: existing registry types (`ConfigEntry`, category `feature_flag`).
- Produces: `APP_SETTINGS` entry with key `discuss.chat.auto_retry_attempts` — readable server-side via `getSettingSync("discuss.chat.auto_retry_attempts", 2)`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/app-settings-registry.test.ts` inside `describe("APP_SETTINGS registry", ...)`:

```ts
it("includes the discuss chat auto-retry cap with safe default 2", () => {
  const e = APP_SETTINGS.find((x) => x.key === "discuss.chat.auto_retry_attempts");
  expect(e).toBeDefined();
  expect(e?.type).toBe("number");
  expect(e?.fallback).toBe(2);
  expect(e?.min).toBe(0);
  expect(e?.max).toBe(5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run --project unit src/lib/app-settings-registry.test.ts`
Expected: FAIL — `e` is `undefined` (`to be defined` assertion fails).

- [ ] **Step 3: Add the registry entry**

In `src/lib/app-settings-registry.ts`, immediately after the `discuss.hedging` entry:

```ts
{
  key: "discuss.chat.auto_retry_attempts",
  category: "feature_flag",
  tier: "advanced",
  type: "number",
  label: "Discuss chat auto-retry attempts",
  fallback: 2,
  min: 0,
  max: 5,
  env: "DISCUSS_CHAT_AUTO_RETRY_ATTEMPTS",
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run --project unit src/lib/app-settings-registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/app-settings-registry.ts src/lib/app-settings-registry.test.ts
git commit -m "feat(settings): register discuss.chat.auto_retry_attempts (default 2)"
```

---

### Task 3: Pass the retry cap to the composer via the project loader

**Files:**
- Modify: `src/routes/_main.projects.$id.tsx`
- Modify: `src/components/projects/WorkspaceShell.tsx` (props type + destructure only)

**Interfaces:**
- Consumes: `getSettingSync` from `@/lib/app-settings`; `WorkspaceShellProps`.
- Produces: `<WorkspaceShell autoRetryAttempts={number} ... />` prop.

- [ ] **Step 1: Write the failing test**

There is no test harness for the route loader, so the TDD gate for this task is a **typecheck** — the prop must be required on `WorkspaceShellProps` before the route passes it. Add to `src/components/projects/WorkspaceShell.tsx`:

```ts
type WorkspaceShellProps = {
  // ... existing fields ...
  autoRetryAttempts?: number;
};
```

and destructure in `WorkspaceShell({ ... autoRetryAttempts = 2, ... })`.

Then in `_main.projects.$id.tsx`, modify the `loadProject` server fn return and `ProjectPage`:

```tsx
// in loadProject handler, before `return {`
const autoRetryAttempts = getSettingSync(
  "discuss.chat.auto_retry_attempts",
  2,
);

return {
  mode: result.mode,
  projectJson: JSON.stringify(result.project),
  autoRetryAttempts,
};
```

```tsx
// in ProjectPage
const autoRetryAttempts = data.autoRetryAttempts ?? 2;
// ...
<WorkspaceShell
  // ...existing props...
  autoRetryAttempts={autoRetryAttempts}
/>
```

- [ ] **Step 2: Run typecheck to verify it fails before the prop wiring**

Run: `bunx tsc --noEmit --incremental --tsBuildInfoFile .tsbuildinfo`
Expected: FAIL — `Property 'autoRetryAttempts' does not exist on type 'WorkspaceShellProps'` (if route passes it first) OR missing prop type error. Order: add the route wiring first so the type error is visible.

- [ ] **Step 3: Wire the prop through**

Apply both edits above (props type + loader + destructure). Confirm `getSettingSync` is imported in `_main.projects.$id.tsx`:

```ts
import { getSettingSync } from "@/lib/app-settings";
```

- [ ] **Step 4: Run typecheck to verify it passes**

Run: `bunx tsc --noEmit --incremental --tsBuildInfoFile .tsbuildinfo`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add src/routes/_main.projects.\$id.tsx src/components/projects/WorkspaceShell.tsx
git commit -m "feat(discuss): pass auto_retry_attempts setting into workspace composer"
```

---

### Task 4: Redact the error banner + honest retry copy

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx` — catch-all error banner (`:3218-3234`), `submitChatText` (`:2488`), add `retryAttempt` state + `autoRetryAttempts` ref.

**Interfaces:**
- Consumes: `toUserFacingDiscussError` (existing, `:4965`), `nextRetryAttempt` (Task 1), `clearError` (existing from `useChat`), `autoRetryAttempts` prop (Task 3).
- Produces: `retryAttempt` state (`useState<number>(0)`), `retryAttemptRef` (`useRef<number>(0)`).

- [ ] **Step 1: Write the failing test**

There is no unit-test harness for this component; the TDD gate is **typecheck + a focused behavior test** of the pure copy decision. Add to `src/lib/projects/discuss-chat-error.test.ts`:

```ts
it("classifies the server transient copy as transient (drives auto-retry)", () => {
  expect(
    classifyDiscussChatError({ message: "AI lagi gangguan. Coba lagi sebentar." }),
  ).toBe("transient");
});
```

Run: `bunx vitest run --project unit src/lib/projects/discuss-chat-error.test.ts`
Expected: FAIL first (message does not match existing transient patterns yet) — then **update `TRANSIENT_PATTERNS`** in `discuss-chat-error.ts` to include `/gangguan|coba lagi sebentar/i` and re-run to PASS.

- [ ] **Step 2: Add state + refs in WorkspaceShell**

Near the other `useState` hooks (`:344` area):

```tsx
const [retryAttempt, setRetryAttempt] = useState(0);
const retryAttemptRef = useRef(0);
```

- [ ] **Step 3: Rewrite the catch-all error banner**

Replace `:3218-3234` with:

```tsx
) : error ? (
  <div className="rounded-[18px] border border-[#ffb4a6]/24 bg-[#ffb4a6]/[0.06] px-spacing-5 py-spacing-4">
    <p className="text-sm font-medium text-[#ffb4a6]">
      {isRetrying
        ? `Mencoba lagi (putaran ke-${Math.max(1, retryAttempt)})…`
        : toUserFacingDiscussError(error.message)}
    </p>
    {!readOnly && !isRetrying ? (
      <Button
        type="button"
        onClick={() => void retryChat()}
        className="mt-spacing-3 h-9 rounded-full bg-surface-warm-white px-spacing-5 text-xs text-foreground-primary hover:bg-surface-warm-white/86"
      >
        Kirim ulang
      </Button>
    ) : null}
  </div>
```

- [ ] **Step 4: Clear stale error on send**

In `submitChatText` (`:2598-2604`), add `clearError()` and reset the retry counter:

```tsx
setRateLimitError(null);
clearError();                 // hide stale banner from the previous failed turn
retryAttemptRef.current = 0;
setRetryAttempt(0);
setMessage("");
setBuildProgress([]);
```

- [ ] **Step 5: Add `clearError` to the dependency array of `submitChatText`**

Append `clearError` to the deps array at the bottom of `submitChatText` (`~:2631-2642`):

```tsx
[
  authStatus,
  clearError,
  composerState,
  // ...rest unchanged...
]
```

- [ ] **Step 6: Typecheck + run the classifier test**

Run: `bunx tsc --noEmit --incremental --tsBuildInfoFile .tsbuildinfo && bunx vitest run --project unit src/lib/projects/discuss-chat-error.test.ts`
Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx src/lib/projects/discuss-chat-error.ts src/lib/projects/discuss-chat-error.test.ts
git commit -m "fix(discuss): redact chat error banner and clear stale error on send"
```

---

### Task 5: Auto-retry transient errors before the banner

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx` — add auto-retry `useEffect`.

**Interfaces:**
- Consumes: `error`, `status`, `clearError`, `isRetrying`, `setIsRetrying`, `retryChat` (existing), `classifyDiscussChatError` / `nextRetryAttempt` (Task 1), `autoRetryAttempts` prop (Task 3).
- Produces: auto-retry effect; resets `retryAttemptRef` on `status === "ready"`.

- [ ] **Step 1: Write the failing test**

The pure logic (cap math + classification) is already tested. Add one more classifier case for the boundary the effect relies on:

```ts
it("returns null (no more retries) once attempts reach the cap", () => {
  expect(nextRetryAttempt(2, 2)).toBeNull();
  expect(nextRetryAttempt(1, 2)).toBe(2);
});
```

Run: `bunx vitest run --project unit src/lib/projects/discuss-chat-error.test.ts` — already passes; this is a boundary guard, not new behavior.

- [ ] **Step 2: Add the auto-retry effect**

Place after the `retryChat` definition (`:2871`), before any other effect that reads `error`:

```tsx
const lastAutoRetriedErrorRef = useRef<unknown>(null);

useEffect(() => {
  if (!error || readOnly) {
    return;
  }
  if (isRetrying || status === "streaming" || status === "submitted") {
    return;
  }
  // Same error already handled (React 18 StrictMode double-invoke guard).
  if (lastAutoRetriedErrorRef.current === error) {
    return;
  }
  const err = error as ChatError;
  const terminal = isTerminalChatError({
    code: err.code,
    message: err.message,
    status: err.status,
  });
  if (terminal) {
    return; // banner renders with redacted copy
  }
  const next = nextRetryAttempt(retryAttemptRef.current, autoRetryAttempts);
  if (next === null) {
    return; // cap reached — banner renders
  }
  lastAutoRetriedErrorRef.current = error;
  retryAttemptRef.current = next;
  setRetryAttempt(next);
  setIsRetrying(true);
  void retryChat();
}, [error, isRetrying, status, readOnly, autoRetryAttempts, retryChat]);
```

Also add a reset when a turn succeeds (near the existing `useEffect` that watches `status`):

```tsx
useEffect(() => {
  if (status === "ready") {
    retryAttemptRef.current = 0;
    setRetryAttempt(0);
    lastAutoRetriedErrorRef.current = null;
  }
}, [status]);
```

- [ ] **Step 3: Import the classifier helpers**

At the top of `WorkspaceShell.tsx` imports (near the other `@/lib/projects/*` imports):

```tsx
import {
  isTerminalChatError,
  nextRetryAttempt,
} from "@/lib/projects/discuss-chat-error";
```

- [ ] **Step 4: Typecheck + run the classifier test**

Run: `bunx tsc --noEmit --incremental --tsBuildInfoFile .tsbuildinfo && bunx vitest run --project unit src/lib/projects/discuss-chat-error.test.ts`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx
git commit -m "feat(discuss): auto-retry transient chat errors up to configured cap"
```

---

### Task 6: "AI thinking" strip (calm, honest, future-proofed)

**Files:**
- Modify: `src/components/projects/WorkspaceShell.tsx` — thinking state, timers, reasoning scan, render strip.

**Interfaces:**
- Consumes: `status`, `messages` (from `useChat`), existing render slot above the composer.
- Produces: `aiThinking` state (`"idle" | "active" | "slow" | "reasoning"`), thinking strip JSX.

- [ ] **Step 1: Write the failing test**

No component test harness; the TDD gate is the pure **tier-decider**. Add to `src/lib/projects/discuss-chat-error.ts` + test:

```ts
// in discuss-chat-error.ts
export type AiThinkingTier = "idle" | "active" | "slow" | "reasoning";

export function decideAiThinkingTier(input: {
  hasToken: boolean;
  hasReasoning: boolean;
  elapsedMs: number;
}): AiThinkingTier {
  if (input.hasToken || input.elapsedMs <= 0) {
    return "idle";
  }
  if (input.hasReasoning) {
    return "reasoning";
  }
  if (input.elapsedMs >= 8_000) {
    return "slow";
  }
  return "active";
}
```

```ts
// in discuss-chat-error.test.ts
import { decideAiThinkingTier } from "@/lib/projects/discuss-chat-error";

describe("decideAiThinkingTier", () => {
  it("stays idle before any elapsed time", () => {
    expect(decideAiThinkingTier({ hasToken: false, hasReasoning: false, elapsedMs: 0 })).toBe("idle");
  });

  it("goes active after the grace period", () => {
    expect(decideAiThinkingTier({ hasToken: false, hasReasoning: false, elapsedMs: 1_500 })).toBe("active");
  });

  it("escalates to slow past 8s", () => {
    expect(decideAiThinkingTier({ hasToken: false, hasReasoning: false, elapsedMs: 9_000 })).toBe("slow");
  });

  it("prefers reasoning tier while reasoning is in flight", () => {
    expect(decideAiThinkingTier({ hasToken: false, hasReasoning: true, elapsedMs: 9_000 })).toBe("reasoning");
  });

  it("returns idle the moment a token lands", () => {
    expect(decideAiThinkingTier({ hasToken: true, hasReasoning: true, elapsedMs: 9_000 })).toBe("idle");
  });
});
```

Run: `bunx vitest run --project unit src/lib/projects/discuss-chat-error.test.ts`
Expected: FAIL — `decideAiThinkingTier` not exported yet. Then implement (above) and re-run to PASS.

- [ ] **Step 2: Add thinking state + timers in WorkspaceShell**

Near the other `useState` hooks:

```tsx
const [aiThinking, setAiThinking] = useState<AiThinkingTier>("idle");
const thinkingTimersRef = useRef<number[]>([]);
const thinkingStartRef = useRef(0);
const clearThinkingTimers = useCallback(() => {
  for (const t of thinkingTimersRef.current) {
    window.clearTimeout(t);
  }
  thinkingTimersRef.current = [];
}, []);
```

- [ ] **Step 3: Effect to arm/disarm the thinking strip on chat status**

```tsx
useEffect(() => {
  if (status === "submitted" || status === "streaming") {
    clearThinkingTimers();
    if (thinkingStartRef.current === 0) {
      thinkingStartRef.current = Date.now();
    }
    thinkingTimersRef.current = [
      window.setTimeout(() => {
        setAiThinking((tier) =>
          decideAiThinkingTier({
            hasToken: false,
            hasReasoning: false,
            elapsedMs: Date.now() - thinkingStartRef.current,
          }),
        );
      }, 800),
      window.setTimeout(() => {
        setAiThinking((tier) =>
          decideAiThinkingTier({
            hasToken: false,
            hasReasoning: false,
            elapsedMs: Date.now() - thinkingStartRef.current,
          }),
        );
      }, 8_000),
    ];
    return;
  }
  clearThinkingTimers();
  thinkingStartRef.current = 0;
  setAiThinking("idle");
  return clearThinkingTimers;
}, [status, clearThinkingTimers]);
```

- [ ] **Step 4: Reasoning + first-token scan**

```tsx
useEffect(() => {
  if (status !== "streaming") {
    return;
  }
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const hasReasoning = Boolean(
    lastAssistant?.parts.some(
      (p) =>
        p.type === "reasoning" &&
        (p as { state?: string }).state !== "done",
    ),
  );
  const hasToken = Boolean(
    lastAssistant?.parts.some(
      (p) =>
        p.type === "text" ||
        p.type === "tool-input-delta" ||
        p.type === "text-delta",
    ),
  );
  if (hasToken) {
    clearThinkingTimers();
    thinkingStartRef.current = 0;
    setAiThinking("idle");
    return;
  }
  if (hasReasoning) {
    setAiThinking("reasoning");
  }
}, [messages, status, clearThinkingTimers]);
```

- [ ] **Step 5: Render the strip above the composer, mutually exclusive with the error banner**

In the render region where the error banner lives (`~:3183-3250`), before the `error` branch, add a thinking branch. The layout becomes:

```tsx
) : aiThinking !== "idle" ? (
  <div className="flex items-center gap-spacing-2 rounded-[18px] border border-surface-warm-white/10 bg-surface-warm-white/[0.04] px-spacing-5 py-spacing-3">
    <span
      className={cn(
        "h-1.5 w-1.5 rounded-full bg-surface-warm-white/60",
        aiThinking === "slow" && "animate-pulse",
      )}
    />
    <p
      className={cn(
        "text-sm text-surface-warm-white/60",
        aiThinking === "slow" && "animate-pulse",
      )}
    >
      {aiThinking === "reasoning"
        ? "AI sedang menyusun ide…"
        : "Memproses…"}
    </p>
  </div>
) : error ? (
  // ...existing redacted banner from Task 4...
```

- [ ] **Step 6: Cleanup on unmount**

In the existing unmount cleanup effect (`:428-433`), add:

```tsx
clearThinkingTimers();
```

- [ ] **Step 7: Typecheck + run the classifier test**

Run: `bunx tsc --noEmit --incremental --tsBuildInfoFile .tsbuildinfo && bunx vitest run --project unit src/lib/projects/discuss-chat-error.test.ts`
Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/projects/WorkspaceShell.tsx src/lib/projects/discuss-chat-error.ts src/lib/projects/discuss-chat-error.test.ts
git commit -m "feat(discuss): show calm AI-thinking strip during chat turns"
```

---

### Task 7: Future-proofing docstring + full gate

**Files:**
- Modify: `src/lib/ai.ts` (`getNoReasoningCallOptions` docstring)
- Docs: this plan + spec (already created)

- [ ] **Step 1: Add the docstring**

In `src/lib/ai.ts:47-53`:

```ts
/**
 * Best-effort: AI SDK portable flag to disable hidden reasoning.
 *
 * NOTE: flipping this off (e.g. to reasoning: "auto") changes the discuss UX
 * contract — WorkspaceShell's AI-thinking strip reacts to streamed reasoning
 * parts (tier "reasoning"), and reasoning tokens would be billed. Persisted
 * messages strip reasoning parts via chat-memory.ts. Keep in sync with the
 * composer's thinking-tier handling.
 */
export function getNoReasoningCallOptions() {
  return {
    reasoning: "none" as const,
  };
}
```

- [ ] **Step 2: Run the full gate**

Run: `bun run check`
Expected: format ✓ lint ✓ typecheck ✓ test ✓ knip ✓ docs ✓. If the route tree needs regeneration, run `bun run check:routes` first (the loader change does not add routes, so normally unnecessary).

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai.ts
git commit -m "docs(ai): note reasoning-off UX contract in getNoReasoningCallOptions"
```

---

## Verification Drive (manual, after all tasks)

1. `bun run dev`, log in as admin, open a project's discuss workspace.
2. **Error redaction:** temporarily point `api/projects/preview`'s transport at a failing path (or use a failing provider combo) — confirm the banner shows `toUserFacingDiscussError` output (e.g. "AI lagi gangguan. Coba lagi sebentar." or the generic fallback), never raw English, never "AI sempat terputus".
3. **Auto-retry:** with `discuss.chat.auto_retry_attempts = 2`, simulate a transient failure (provider 429) — confirm two automatic retries with "Mencoba lagi (putaran ke-1)…" / "(putaran ke-2)…" copy, then the banner on exhaustion. Set the setting to 0 — confirm no auto-retry (current behavior).
4. **Clear on send:** after a failed turn, type + send a new message — confirm the old banner disappears immediately.
5. **Thinking strip:** send a normal message — confirm "Memproses…" fades in at ~800ms, disappears on first token, and pulses after 8s only if the turn is genuinely slow.
6. `bun run check` green before handoff.

## Self-Review Notes

- Spec coverage: error redaction (Task 4), auto-retry + cap (Tasks 1, 2, 3, 5), clear-on-send (Task 4), thinking strip (Task 6), future-proofing (Task 7) — all mapped.
- No placeholders: every task has real code, exact paths, exact commands.
- Type consistency: `classifyDiscussChatError`, `nextRetryAttempt`, `isTerminalChatError`, `decideAiThinkingTier`, `AiThinkingTier` defined in Task 1/6 and used consistently in Tasks 4/5/6.
