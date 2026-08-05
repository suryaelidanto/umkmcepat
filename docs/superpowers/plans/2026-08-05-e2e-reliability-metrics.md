# End-to-End Engine Reliability — Metrics & Execution Plan

**Date:** 2026-08-05
**Status:** Active goal (pre-production final iteration)
**Target project:** `cmsfuten4000p4li0s50xjbmf` (jamu online) + 1 fresh project from scratch
**Finish trigger:** All M1–M5 pass, then run `@.agents/skills/push-main/SKILL.md`

## M1 — Engine works end-to-end (functional)
- [ ] New project created from home form → lands in discuss
- [ ] Full interview → `build_recommendation` card with `readyForBuild: true`
- [ ] Build triggered → status `succeeded`, real HTML site generated
- [ ] Preview URL returns 200 + working page
- [ ] Deploy → public path live, 200
- [ ] Edit: change field → rebuild → site reflects change
- **Metric:** 100% of steps complete, zero manual intervention, all terminal states `succeeded`, zero `failed`

## M2 — Discuss smooth & reliable
- [ ] Every discuss turn `succeeded` (0 failed) across interview
- [ ] TTFT ≤ 3s avg, ≤ 8s p99 (`AiCallRecord.ttftMs`)
- [ ] Turn wall-clock (POST→finish) ≤ 12s avg, ≤ 25s p99 (excludes backgrounded compaction)
- [ ] `finish` published before compaction (R1 verified)
- [ ] Zero silent failures; any error surfaces retry-able message; retry succeeds on 1st attempt (≤1 retry)
- [ ] Rate-limit resilience: mimo-v2.5 429 → fails over to minimax-m3 → turn still succeeds
- [ ] Card types persist: `question` (text + choice), `image_upload`, `build_recommendation`
- [ ] Reconnect/resume: mid-turn refresh shows live deltas, no data loss (R7/R9)

## M3 — Build smooth & fast
- [ ] Build wall-clock (trigger→success) ≤ 90s avg, ≤ 180s p99
- [ ] First progress event ≤ 3s after trigger
- [ ] No build failure for standard brief (100% on target + 1 fresh)
- [ ] Generated page valid: HTML parses, no broken internal links, assets load 200
- [ ] Visual quality: Plus Jakarta Sans typography, spacing, palette; no system-font fallback (CSP R4)

## M4 — Edit loop reliable
- [ ] Edit request → rebuild → preview updates with change
- [ ] Edit round-trip ≤ 120s p99
- [ ] Edit does not corrupt existing content; other fields preserved

## M5 — No regressions / observability
- [ ] `bun run check` green on every atomic commit
- [ ] Zero console errors during drive (no `[preview-chat] error`, no CSP enforce blocking font)
- [ ] `AiCallRecord` status `ok` for all successful calls
- [ ] Energy debits correct (projectId populated; reason matches)

## Execution contract
- Atomic commits: one logical fix per commit, Conventional Commits, explicit paths only (never `git add -A`)
- Verify-before-commit: run failing symptom → fix → confirm fixed → `bun run check`
- Iterate: drive real API with provided session cookie; on any failure, fix + re-test until metric passes; re-run full path
- Finish: when M1–M5 pass, run `push-main` skill
- Report: summarize which metric each commit hit, with measured numbers vs targets

## Test harness
- Auth: `__Secure-authjs.session-token` (dev) for `dev.umkmcepat.com`
- Drive: POST `/api/projects/preview` → poll turn → verify card/persist → fetch preview HTML
- Verify via DB (`Project`, `ProjectChatTurn`, `AiCallRecord`, energy)
