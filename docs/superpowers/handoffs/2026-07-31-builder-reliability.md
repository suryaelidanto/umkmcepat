# Handoff: Builder reliability (2026-07-31)

## Shipped

- Unstuck recovery: `resolveGenerateMode`, `loadPersistedProjectSourceFiles`, empty `retry_build` demotion, runtime `hasPersistedSource`, client source contract
- Agent: forced rewrites, explore budget, **brief-home-seed** last resort
- Live recovery of stuck project `cms8qd27m000x4lng1onfsn02`
- Unit + edge mode tests green
- Reliability harness:
  - `scripts/reliability/run-batch.ts` — FormData create → DB brief → generate (SSE cancel) → poll runtime; rate-limit sleep; no lease-supersede on timeout
  - `scripts/reliability/stress-100.ts` — Origin headers + 520 retries → **100/100**
- Cookie path: gitignored `cookie.header.txt` (Secure session via **tunnel HTTPS** only)
- Proven ready builds this session include `cms949g85004f4lr16yn744f7`, `cms93xwo8002p4lr1rcmz1zk4`

## Residual / in flight

1. **~50 full E2E** — one full ready proven via harness; larger batch paused on **build rate_limit** (~18m windows) and ~10–16m/build wall time. Resume:
   ```bash
   export RELIABILITY_BASE_URL=https://dev.umkmcepat.com
   export RELIABILITY_COOKIE="$(cat cookie.header.txt)"
   bun run scripts/reliability/run-batch.ts --count 50 --batch 1 --timeout-ms 900000
   ```
2. Lease-kill regression: retry while job still running → `Build operation lease was superseded` (`cms94me4c005l4lr1b8yop5t8`). Harness fixed (extend poll, never retry with `activeJob`). Product still fragile if client double-fires.
3. Agent first-pass still often empty → seed path (generic home).
4. Cloudflare **520** blips under stress (mitigated with retries).

## Verify

- Stuck empty-source → generate → `mode.resolved first_generate`, never empty `retry_build` dead-end
- Batch: `PASS … ready:preview=true:source=true`
- Stress: `pass: 100`
