# Handoff: Builder reliability (2026-07-31 → 2026-08-02)

## Shipped

- Unstuck recovery: `resolveGenerateMode`, `loadPersistedProjectSourceFiles`, empty `retry_build` demotion, runtime `hasPersistedSource`, client source contract
- Agent: forced rewrites, explore budget
- Live recovery of stuck project `cms8qd27m000x4lng1onfsn02`
- Unit + edge mode tests green
- Reliability harness:
  - `scripts/reliability/run-batch.ts` — FormData create → DB brief → generate (SSE cancel) → poll runtime; rate-limit sleep; no lease-supersede on timeout
  - `scripts/reliability/stress-100.ts` — Origin headers + 520 retries → **100/100**
- Cookie path: gitignored `cookie.header.txt` (Secure session via **tunnel HTTPS** only)
- Proven ready builds this session include `cms949g85004f4lr16yn744f7`, `cms93xwo8002p4lr1rcmz1zk4`

## 2026-08-02: agent empty + seed false-green (fixed on `dev`)

**Root cause (not BullMQ / not “wrong model”):**

1. Coding agent often finished `length` with **0 tool ops** (no write/replace stream).
2. Live **`seedBriefBasedHome`** shipped a bland Card template and still marked source OK → `buildStatus=passed` (e.g. `cmsbhyge8000o4l6maq99r4c8`: toolOps=0 → seed → 19 files, home ~1940 chars).
3. Good projects (`cms75zhvl…`, `cms75083l…`, `cms5vvq6m…`, `cms6v3u7c…`) were real agent multi-file writes on flash — design quality != seed.

**Fix (forward on current stack; keep queue/worker/progress):**

- Removed live seed success path after rewrites — fail cleanly (`AI agent produced invalid source: …`).
- Dropped `prepareStep` force-`write_file`-only (kept `toolChoice: "required"` + write-focused rewrite toolset + explore budget).
- `devLog` `stableJson` / `maskPii` preserve arrays (`edited`, `issues`) so logs are trustworthy.
- `seedBriefBasedHome` remains as **test/helper only**.

**Verify:**

- Empty agent mock: rejects, no seed-shaped home success.
- Live gen: progress shows real `write_file` / replace ops when agent works; no `seed.brief-home` on success path.
- Design should match good-era agent quality, not seed template.

## 2026-08-02: expandable write/replace diffs + multi-page gate

**Bug:** worker `send("operation", op)` did `publish({ type: "operation", ...op })`; op.`type` (`write_file`) clobbered SSE event type → client `reduceBuildStreamEvent` ignored live ops → no expandable diffs. Hydrate also dropped `diff` from DB metadata.

**Fix:**
- `build-attempt-worker` `send`: spread data first, force `type: event`, map tool name to `tool`; persist truncated `diff` on write/replace.
- `checkAgentSourceQuality`: fail if route files under `src/routes/` are not registered in `src/router.tsx` (`findUnregisteredRouteFiles`).
- Final quality re-check emits a transparent `Cek kualitas source` operation before deliver.
- Prompt: multi-page consistency (register routes same turn; shared chrome in `__root`).

## Residual / in flight

1. **~50 full E2E** — larger batch paused on **build rate_limit** (~18m windows) and ~10–16m/build wall time. Resume:
   ```bash
   export RELIABILITY_BASE_URL=https://dev.umkmcepat.com
   export RELIABILITY_COOKIE="$(cat cookie.header.txt)"
   bun run scripts/reliability/run-batch.ts --count 50 --batch 1 --timeout-ms 900000
   ```
2. Lease-kill regression: retry while job still running → `Build operation lease was superseded`. Harness fixed; product still fragile if client double-fires.
3. Live agent still can return 0 tools — now **fails** instead of seed; may need further prompt/budget tuning if flake rate high.
4. Cloudflare **520** blips under stress (mitigated with retries).

## Verify (unchanged + new)

- Stuck empty-source → generate → `mode.resolved first_generate`, never empty `retry_build` dead-end
- Empty agent → **error**, not seed `passed`
- Batch: `PASS … ready:preview=true:source=true` with non-seed home size / custom structure
- Stress: `pass: 100`
