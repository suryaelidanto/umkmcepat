# Dev Logging Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dev logging surface autonomous-AI-debuggable: `devLog`/`writeAiRequestLog` are always-on in dev (gated by `NODE_ENV`, not a toggle), write a rotating `dev.log` at repo root, and a documented debug-reading workflow replaces the retired `dev:verbose`.

**Architecture:** One mode-gated sink (`devLog`) + one file sink (`dev.log`, append + ~5 MB rotation) replaces the `UMKM_VERBOSE_DEV` toggle. `writeAiRequestLog` (used by `discuss-turn-worker.ts` for the `[umkm:ai]` events) drops its gate and inherits the always-on file path — so the discuss events already seen in session logs land in `dev.log` automatically. `dev:verbose` is retired; `dev:logs` tails the file. ~15 new correlated `devLog` checkpoints cover the gaps (moderation auth/timeout, discuss claim/finalize/replay, build/source-gen).

**Tech Stack:** Bun, TypeScript, Vite, node `fs/promises` (`appendFile`, `stat`), Vitest. No new deps.

## Global Constraints

- Use Bun only; `bun.lock` is canonical. Run the gate with `bun run check`.
- Developer-facing docs/code/logs/errors in English; consumer-facing product UI copy in Indonesian.
- Do not commit `dev.log`, `dev.log.1`, `.env`, or secrets. Add `/dev.log` and `/dev.log.1` to `.gitignore`.
- `devLog` and `writeAiRequestLog` must be **no-ops in production** (`NODE_ENV === "production"`). In dev (`vite dev`, `NODE_ENV` unset or `"development"`) they write.
- Surgical edits: touch only the files listed. Match surrounding style. No raw `console.log` for new logs — route through `devLog`.
- Never bypass a failing gate (`bun run check`). Commit per task with Conventional Commits.

---

## File Structure

- `src/lib/dev-log.ts` — **rewrite**: mode-gate, file sink + rotation. Single surface. Exports `devLog(scope, event, metadata?)` and `isDevLoggingActive()` (replaces `isVerboseDevLoggingEnabled`).
- `src/lib/dev-log.test.ts` — **new**: tests for mode-gate, file append, rotation, prod no-op.
- `src/lib/ai-request-log.ts` — **modify**: drop `isVerboseDevLoggingEnabled` gate; use `isDevLoggingActive()`; keep `requests.ndjson` raw dump; mirror to `dev.log`.
- `scripts/dev-verbose.ts` — **delete**.
- `scripts/dev-logs.ts` — **new**: tails `dev.log`.
- `package.json` — **modify**: remove `dev:verbose`, add `dev:logs`.
- `.gitignore` — **modify**: add `/dev.log`, `/dev.log.1`.
- `src/lib/ai-moderation.ts` — **modify**: add `devLog` checkpoints (request-start, unexpected-response, auth/timeout via catch).
- `src/lib/projects/discuss-turn.ts` — **modify**: add `devLog` at claim, duplicate-rejected, finalize(success/fail/cancel).
- `src/routes/api.projects.preview.ts` — **modify**: add `devLog` at `replayTurnFromDb` entry + client-auto-resume path.
- `src/lib/projects/custom-source-generator.ts` — **modify**: add source-gen start/finish + repair checkpoints (build-worker.ts already covered).
- `DEV.md` — **modify**: new Debugging section; trim `dev:verbose` block (lines ~27-33).
- `AGENTS.md` — **modify**: debugging pointer + sharpen Graphify rule.

---

### Task 1: Rewrite `dev-log.ts` — mode-gated sink with file append + rotation

**Files:**
- Modify: `src/lib/dev-log.ts` (full rewrite)
- Create: `src/lib/dev-log.test.ts`
- Modify: `.gitignore` (add `/dev.log`, `/dev.log.1`)

**Interfaces:**
- Consumes: `process.env.NODE_ENV`, `process.cwd()`, node `fs/promises` (`appendFile`, `stat`, `rename`), node `path`.
- Produces: `devLog(scope: string, event: string, metadata?: Record<string, unknown>): void` and `isDevLoggingActive(): boolean`. The file path is `<cwd>/dev.log`; rotation cap is 5 MB.

- [ ] **Step 1: Write the failing test**

Create `src/lib/dev-log.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { devLog, isDevLoggingActive } from "./dev-log";

const LOG_FILE = path.join(process.cwd(), "dev.log");
const ROTATED = path.join(process.cwd(), "dev.log.1");

function reset() {
  for (const f of [LOG_FILE, ROTATED]) {
    try {
      rmSync(f);
    } catch {
      // ignore
    }
  }
}

describe("devLog", () => {
  beforeEach(reset);
  afterEach(reset);

  it("is active when NODE_ENV is not production", () => {
    const orig = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    expect(isDevLoggingActive()).toBe(true);
    process.env.NODE_ENV = "development";
    expect(isDevLoggingActive()).toBe(true);
    process.env.NODE_ENV = orig;
  });

  it("is inactive in production", () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    expect(isDevLoggingActive()).toBe(false);
    process.env.NODE_ENV = orig;
  });

  it("appends a structured line to dev.log in dev", async () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    devLog("test-scope", "event", { projectId: "p1" });
    await new Promise((r) => setTimeout(r, 50));
    const contents = require("node:fs").readFileSync(LOG_FILE, "utf8");
    expect(contents).toContain('[umkm:test-scope] event');
    expect(contents).toContain('"projectId":"p1"');
    process.env.NODE_ENV = orig;
  });

  it("does not write in production", async () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    devLog("test-scope", "event", { projectId: "p2" });
    await new Promise((r) => setTimeout(r, 50));
    expect(() => require("node:fs").readFileSync(LOG_FILE, "utf8")).toThrow();
    process.env.NODE_ENV = orig;
  });

  it("rotates dev.log to dev.log.1 at the cap", async () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    // Pre-seed a file just under 5MB so the next append triggers rotation.
    mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    writeFileSync(LOG_FILE, "x".repeat(5 * 1024 * 1024 - 10));
    devLog("test-scope", "trigger-rotation", {});
    await new Promise((r) => setTimeout(r, 100));
    expect(statSync(ROTATED).size).toBeGreaterThan(0);
    // New dev.log exists and contains the new event.
    const fresh = require("node:fs").readFileSync(LOG_FILE, "utf8");
    expect(fresh).toContain("trigger-rotation");
    process.env.NODE_ENV = orig;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/dev-log.test.ts`
Expected: FAIL — `devLog`/`isDevLoggingActive` still no-op (current `dev-log.ts` gates on `UMKM_VERBOSE_DEV`, so writes never happen; rotation undefined).

- [ ] **Step 3: Write minimal implementation**

Rewrite `src/lib/dev-log.ts`:

```ts
import { appendFile, rename, stat } from "node:fs/promises";
import path from "node:path";

const LOG_FILE = path.join(process.cwd(), "dev.log");
const ROTATED_FILE = path.join(process.cwd(), "dev.log.1");
const ROTATE_AT_BYTES = 5 * 1024 * 1024;
let rotating = false;

export function isDevLoggingActive() {
  return process.env.NODE_ENV !== "production";
}

export function devLog(
  scope: string,
  event: string,
  metadata?: Record<string, unknown>,
) {
  if (!isDevLoggingActive()) {
    return;
  }

  const suffix = metadata ? ` ${stableJson(metadata)}` : "";
  const line = `[umkm:${scope}] ${event}${suffix}\n`;
  void writeToFile(line);
}

async function writeToFile(line: string) {
  try {
    await maybeRotate();
    await appendFile(LOG_FILE, line, "utf8");
  } catch {
    // Best-effort: a logging failure must never break the request.
  }
}

async function maybeRotate() {
  if (rotating) {
    return;
  }
  let size: number;
  try {
    size = (await stat(LOG_FILE)).size;
  } catch {
    return; // file does not exist yet
  }
  if (size < ROTATE_AT_BYTES) {
    return;
  }
  rotating = true;
  try {
    await rename(LOG_FILE, ROTATED_FILE); // overwrites prior .1
  } catch {
    // ignore — next write recreates dev.log
  } finally {
    rotating = false;
  }
}

function stableJson(value: Record<string, unknown>) {
  return JSON.stringify(value, Object.keys(value).sort());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/dev-log.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Add gitignore lines**

In `.gitignore`, add (near the existing `*.log` line):

```
/dev.log
/dev.log.1
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/dev-log.ts src/lib/dev-log.test.ts .gitignore
git commit -m "feat(dev-log): mode-gated sink with rotating dev.log file

devLog is now gated on NODE_ENV !== 'production' and appends every event
to <root>/dev.log, rotating to dev.log.1 at ~5MB. Deletes the
UMKM_VERBOSE_DEV toggle surface (callers updated next)."
```

---

### Task 2: Route `writeAiRequestLog` through the always-on sink

**Files:**
- Modify: `src/lib/ai-request-log.ts`

**Interfaces:**
- Consumes: `isDevLoggingActive()` from `@/lib/dev-log`.
- Produces: `writeAiRequestLog(event: Record<string, unknown>): Promise<void>` — now always writes in dev; `discuss-turn-worker.ts` (8 call sites) inherits this automatically with no changes.

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai-request-log.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync, readFileSync } from "node:fs";
import path from "node:path";

import { writeAiRequestLog } from "./ai-request-log";

const DEV_LOG = path.join(process.cwd(), "dev.log");
const NDJSON = path.join(process.cwd(), ".data", "tmp", "ai-debug", "requests.ndjson");

function reset() {
  for (const f of [DEV_LOG, NDJSON]) {
    try { rmSync(f); } catch { /* ignore */ }
  }
}

describe("writeAiRequestLog", () => {
  beforeEach(reset);
  afterEach(reset);

  it("writes to dev.log and requests.ndjson in dev", async () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    await writeAiRequestLog({ event: "test-evt", projectId: "p9" });
    const dev = readFileSync(DEV_LOG, "utf8");
    const nd = readFileSync(NDJSON, "utf8");
    expect(dev).toContain("test-evt");
    expect(nd).toContain('"event":"test-evt"');
    process.env.NODE_ENV = orig;
  });

  it("no-ops in production", async () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    await writeAiRequestLog({ event: "prod-evt" });
    expect(() => readFileSync(DEV_LOG, "utf8")).toThrow();
    process.env.NODE_ENV = orig;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/ai-request-log.test.ts`
Expected: FAIL — `writeAiRequestLog` still gates on `isVerboseDevLoggingEnabled` (now removed); import fails.

- [ ] **Step 3: Write minimal implementation**

Rewrite `src/lib/ai-request-log.ts`:

```ts
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { devLog, isDevLoggingActive } from "@/lib/dev-log";

const LOG_DIR = path.join(process.cwd(), ".data", "tmp", "ai-debug");
const LOG_FILE = path.join(LOG_DIR, "requests.ndjson");

export async function writeAiRequestLog(event: Record<string, unknown>) {
  if (!isDevLoggingActive()) {
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    ...event,
  };
  const scope = String(event.event ?? "event");
  // devLog handles the rotating dev.log mirror; no direct console.warn so the
  // terminal stays quiet during `bun run dev`.
  devLog("ai", scope, entry);

  await mkdir(LOG_DIR, { recursive: true });
  await appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/ai-request-log.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify discuss events now hit dev.log automatically**

Manual check — start server, trigger a discuss turn, confirm `dev.log` contains `discuss:start` / `discuss:finish`:

```bash
bun run dev &
sleep 4
# trigger one discuss turn via the UI or curl, then:
tail -n 20 dev.log
```
Expected: `[umkm:ai] discuss:start {...}` and `[umkm:ai] discuss:finish {...}` appear in `dev.log`. (The 8 existing `writeAiRequestLog` call sites in `discuss-turn-worker.ts` now write automatically.)

- [ ] **Step 6: Run full gate**

Run: `bun run check`
Expected: PASS (format/lint/typecheck/test/knip). No Knip warning for removed `isVerboseDevLoggingEnabled` import.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai-request-log.ts src/lib/ai-request-log.test.ts
git commit -m "feat(ai-request-log): always-on in dev, mirror to dev.log

writeAiRequestLog now gates on NODE_ENV and mirrors each event into the
rotating dev.log via devLog. discuss-turn-worker's [umkm:ai] events land in
dev.log automatically. Removes the UMKM_VERBOSE_DEV gate."
```

---

### Task 3: Retire `dev:verbose`, add `dev:logs`

**Files:**
- Delete: `scripts/dev-verbose.ts`
- Create: `scripts/dev-logs.ts`
- Modify: `package.json` (remove `dev:verbose`, add `dev:logs`)

**Interfaces:**
- Produces: `bun run dev:logs` — tails `dev.log` at repo root.

- [ ] **Step 1: Create the tail script**

Create `scripts/dev-logs.ts`:

```ts
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const LOG_FILE = path.join(process.cwd(), "dev.log");

async function main() {
  let size = 0;
  try {
    size = (await stat(LOG_FILE)).size;
  } catch {
    console.error(`No dev.log yet at ${LOG_FILE}. Start the server with \`bun run dev\` first.`);
    process.exit(1);
  }

  // Print existing content, then tail.
  const startStream = createReadStream(LOG_FILE, { encoding: "utf8", start: 0 });
  startStream.on("data", (chunk) => process.stdout.write(chunk));
  await new Promise<void>((resolve) => startStream.on("end", resolve));

  // Tail new appends (poll for size growth — dependency-free).
  let pos = size;
  setInterval(async () => {
    try {
      const now = (await stat(LOG_FILE)).size;
    } catch {
      return;
    }
    if (now <= pos) {
      // Rotation may have reset the file to a smaller size.
      if (now < pos) {
        pos = 0;
      }
      return;
    }
    const stream = createReadStream(LOG_FILE, { encoding: "utf8", start: pos });
    for await (const chunk of stream) {
      process.stdout.write(chunk as string);
    }
    pos = now;
  }, 500);
}

void main();
```

- [ ] **Step 2: Update package.json scripts**

In `package.json`, remove the line:
```json
"dev:verbose": "bun scripts/dev-verbose.ts",
```
and add (next to `dev`):
```json
"dev:logs": "bun scripts/dev-logs.ts",
```

- [ ] **Step 3: Delete the verbose script**

```bash
git rm scripts/dev-verbose.ts
```

- [ ] **Step 4: Verify the script runs**

Run: `bun run dev:logs`
Expected: prints "No dev.log yet..." (server not running) OR streams existing content. No crash.

- [ ] **Step 5: Run gate**

Run: `bun run check`
Expected: PASS — Knip must not flag `dev-logs.ts`.

- [ ] **Step 6: Commit**

```bash
git add scripts/dev-logs.ts package.json
git commit -m "chore(dev): retire dev:verbose, add dev:logs tail

dev:verbose is redundant now that dev.log is always written in dev. dev:logs
tails dev.log live for when you want to watch the server stream."
```

---

### Task 4: Add moderation checkpoints with correlation

**Files:**
- Modify: `src/lib/ai-moderation.ts`

**Interfaces:**
- Consumes: `devLog` from `@/lib/dev-log`, `getDefaultAiModel()`.
- Produces: no new exports; adds `[umkm:moderation]` events to `dev.log`.

- [ ] **Step 1: Add the import**

In `src/lib/ai-moderation.ts`, ensure the import block includes:

```ts
import { devLog } from "@/lib/dev-log";
```

- [ ] **Step 2: Add a request-start checkpoint**

Inside `moderateProjectRequest`, right after the cache miss (before `const abortController`), add:

```ts
devLog("moderation", "request-start", {
  promptHash: hashPrompt(key),
  model: getDefaultAiModel(),
});
```

Add the helper at the bottom of the file:

```ts
function hashPrompt(prompt: string) {
  // Simple, stable fingerprint for correlation without logging raw prompt.
  let h = 0;
  for (let i = 0; i < prompt.length; i++) {
    h = (Math.imul(31, h) + prompt.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}
```

- [ ] **Step 3: Add an unexpected-response checkpoint**

In the existing `if (!["ALLOW", "BLOCK", "CLARIFY"].includes(label))` block, the code already does `console.warn("[moderation] unexpected model response...")`. Replace that `console.warn` with:

```ts
devLog("moderation", "unexpected-response", {
  raw: result.text,
  model: modelId,
});
```

(Removes a raw `console.warn` — keeps terminal quiet, lands in `dev.log`.)

- [ ] **Step 4: Add a catch-path checkpoint in the callers**

The moderation throw is caught in `src/routes/api.projects.preview.ts:269` and `src/routes/api.projects.ts:195`. For now, the `discuss`/`ai-request-log` paths already cover the flow; leave the route catch as-is (Task 5 covers discuss). No change here.

- [ ] **Step 5: Run gate**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai-moderation.ts
git commit -m "feat(moderation): add request-start and unexpected-response devLog

Checkpoints land in dev.log for autonomous debugging of the moderation
safety call (the Unauthorized/timeout/unexpected-response paths)."
```

---

### Task 5: Add discuss-turn lifecycle checkpoints

**Files:**
- Modify: `src/lib/projects/discuss-turn.ts`

**Interfaces:**
- Consumes: `devLog` from `@/lib/dev-log`.
- Produces: `[umkm:discuss-turn]` events: `claim`, `duplicate-rejected`, `finalize`.

- [ ] **Step 1: Add the import**

In `src/lib/projects/discuss-turn.ts`, add:

```ts
import { devLog } from "@/lib/dev-log";
```

- [ ] **Step 2: Add claim + duplicate-rejected checkpoints**

In `claimDiscussTurn`, inside the `$transaction`, after `existing` is found (the `if (existing)` block), add before `return`:

```ts
if (existing) {
  devLog("discuss-turn", "duplicate-rejected", {
    projectId,
    activeTurnId: existing.id,
  });
  return { claimed: false, turnId: null };
}
```

And after `const turnId = ...` / before `await tx.projectChatTurn.create`, add:

```ts
devLog("discuss-turn", "claim", { projectId, turnId });
```

- [ ] **Step 3: Add finalize checkpoint**

In `finalizeDiscussTurn`, after `await store.projectChatTurn.update(...)`, add:

```ts
devLog("discuss-turn", "finalize", {
  turnId,
  status,
  hasError: Boolean(errorMessage),
});
```

- [ ] **Step 4: Run gate**

Run: `bunx vitest run src/lib/projects/discuss-turn`
Then: `bun run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/discuss-turn.ts
git commit -m "feat(discuss): claim/finalize/duplicate-rejected devLog checkpoints

Correlated by projectId + turnId so an agent can grep one turn and read its
full lifecycle: claim -> (writeAiRequestLog start/finish) -> finalize."
```

---

### Task 6: Add replay + auto-resume checkpoints in preview route

**Files:**
- Modify: `src/routes/api.projects.preview.ts`

**Interfaces:**
- Consumes: `devLog` from `@/lib/dev-log`, existing `readTurnState`/`replayTurnFromDb`.
- Produces: `[umkm:discuss]` events: `replay-from-db`, `auto-resume`.

- [ ] **Step 1: Add the import**

Ensure `src/routes/api.projects.preview.ts` imports:

```ts
import { devLog } from "@/lib/dev-log";
```

- [ ] **Step 2: Add replay-from-db checkpoint**

In `replayTurnFromDb`, as the first line of the function body, add:

```ts
devLog("discuss", "replay-from-db", { turnId, projectId });
```

- [ ] **Step 3: Add auto-resume checkpoint**

At the two `readTurnState(turnId) === "gone"` branches (lines ~476 and ~493), add before each `replayTurnFromDb` call:

```ts
devLog("discuss", "auto-resume", { turnId, projectId: project.id, reason: "gone" });
```

- [ ] **Step 4: Run gate**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.projects.preview.ts
git commit -m "feat(discuss): replay-from-db and auto-resume devLog checkpoints

Surfaces the reconnect-after-restart fallback path in dev.log so an agent can
see when a client resumed a finished/failed turn from DB state."
```

---

### Task 7: Add source-gen checkpoints in custom-source-generator

**Files:**
- Modify: `src/lib/projects/custom-source-generator.ts`

**Interfaces:**
- Consumes: `devLog` from `@/lib/dev-log` (already imported).
- Produces: `[umkm:generate]` events: `source-start`, `source-finish`, `repair-attempt`.

- [ ] **Step 1: Locate the generation entry/exit**

Run: `grep -n 'export async function' src/lib/projects/custom-source-generator.ts`
Identify the main generation function and its `return` / `throw` points.

- [ ] **Step 2: Add source-start checkpoint**

At the top of the main generation function body (after input validation), add:

```ts
devLog("generate", "source-start", { projectId });
```

- [ ] **Step 3: Add source-finish checkpoint**

Before each successful `return` of generated output, add:

```ts
devLog("generate", "source-finish", { projectId, ok: true });
```

And in the existing failure `throw`/`catch` (the `AI source generation failed:` paths at lines ~320, ~2146), add before the throw:

```ts
devLog("generate", "source-finish", { projectId, ok: false, reason: error instanceof Error ? error.message : "agent failed" });
```

- [ ] **Step 4: Add repair-attempt checkpoint**

At the existing repair entry point (where the in-turn repair runs — search `repair` in the file), add:

```ts
devLog("generate", "repair-attempt", { projectId });
```

- [ ] **Step 5: Run gate**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects/custom-source-generator.ts
git commit -m "feat(generate): source-start/finish/repair-attempt devLog checkpoints

Surfaces the source-gen lifecycle in dev.log: start, finish (ok/fail reason),
and repair attempts — the 'AI source generation failed' failure path."
```

---

### Task 8: Document the debug workflow in DEV.md + AGENTS.md

**Files:**
- Modify: `DEV.md` (lines ~27-33 trim; add Debugging section)
- Modify: `AGENTS.md` (Graphify rule + debugging pointer)

- [ ] **Step 1: Trim the dev:verbose block in DEV.md**

Replace lines 27-33 (the `Verbose development mode:` block through the `bun run dev` quiet paragraph) with:

```markdown
Server logs are written to `dev.log` at the repo root automatically during `bun run dev` (no toggle). Tail it live in a second terminal:

```bash
bun run dev:logs
```
```

- [ ] **Step 2: Add the Debugging section to DEV.md**

Insert a new `## Debugging` section after the `## Local runtime` section:

```markdown
## Debugging

When something breaks, an agent (or you) reconstructs the causal chain without copy-pasting logs:

1. **Read `dev.log` at repo root.** Grep for the project id or error string; read the matching `[umkm:scope] event {json}` lines in order. Every event carries a correlation id (`projectId` + `turnId` or request scope) so one id surfaces the full chain — e.g. a discuss turn: `discuss-turn:claim` → `[umkm:ai] discuss:start` → `discuss-turn:finalize`.
2. **Cross-reference infra with Docker logs** for 9Router / Headroom / Postgres failures: `bun run infra:logs` (or `docker compose logs -f`).
3. **Cross-reference raw AI payloads** in `.data/tmp/ai-debug/requests.ndjson` when a model call looks wrong (full request/response bodies that would bloat `dev.log`).
4. **Navigate before you grep.** Run `bun run graph:update` then read the source tree Graphify returns — non-trivial discovery goes through Graphify first, never blind search.

`dev.log` rotates at ~5 MB to `dev.log.1`; it is never deleted on crash (a crash is when it matters most). Both are gitignored.
```

- [ ] **Step 3: Sharpen the Graphify rule in AGENTS.md**

In `AGENTS.md`, replace line 60:

```markdown
- Use Graphify for non-trivial codebase discovery when available; do not add it as a project dependency.
```

with:

```markdown
- Run `bun run graph:update` and navigate the source tree before blind grep/search; Graphify is the default discovery step for non-trivial work. Do not add it as a project dependency.
```

- [ ] **Step 4: Add a debugging pointer in AGENTS.md**

In `AGENTS.md`'s `## Commands` section, after the `bun run check` / `bun run verify` block, add:

```markdown
- When debugging, read `dev.log` at repo root and `docker compose logs`; see `DEV.md`'s Debugging section for the full workflow.
```

- [ ] **Step 5: Run gate**

Run: `bun run check`
Expected: PASS (docs are prettier-checked).

- [ ] **Step 6: Commit**

```bash
git add DEV.md AGENTS.md
git commit -m "docs: dev logging debug workflow + Graphify-first rule

DEV.md gets a Debugging section (dev.log → docker logs → requests.ndjson →
graphify) and AGENTS.md sharpens Graphify to a default-first step + adds a
debugging pointer. dev:verbose prose removed."
```

---

### Task 9: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm no stale `UMKM_VERBOSE_DEV` / `isVerboseDevLoggingEnabled` refs**

Run:
```bash
grep -rn 'UMKM_VERBOSE_DEV\|isVerboseDevLoggingEnabled' src/ scripts/ .env.example DEV.md AGENTS.md
```
Expected: no matches.

- [ ] **Step 2: Confirm `dev:verbose` is gone and `dev:logs` exists**

Run:
```bash
grep -nE '"dev:verbose"|"dev:logs"' package.json
```
Expected: only `"dev:logs"` matches.

- [ ] **Step 3: Run the full gate**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 4: Smoke-test end-to-end**

```bash
bun run dev &
sleep 5
# trigger one builder/discuss action in the UI, then:
tail -n 30 dev.log
bun run dev:logs   # confirm it streams
```
Expected: `dev.log` contains `[umkm:...]` events; `dev:logs` streams new appends; killing the server leaves `dev.log` intact.

- [ ] **Step 5: Commit any remaining cleanup (if smoke test surfaced issues)**

If the smoke test found nothing to fix, skip. Otherwise:

```bash
git add -A
git commit -m "fix(dev-log): <what the smoke test surfaced>"
```
