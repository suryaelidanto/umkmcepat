# Spec: Builder reliability (production)

**Status:** Implementing  
**Date:** 2026-07-31  
**Product:** UMKM Cepat — project discuss → build → preview path

## Problem

Real project `cms8qd27m000x4lng1onfsn02` failed structurally:

1. **Primary:** AI source agent left `agentEditedFiles` empty / never wrote real `src/routes/index.tsx` → quality gate correctly rejected → **no source persisted**.
2. **Secondary (product bug):** Client treats `buildStatus === "failed"` as “has existing source” → always POSTs `retry_build` → worker throws `Belum ada source tersimpan. Jalankan build pertama dulu.` → **user permanently stuck** despite “Build ulang”.

Users must always recover by hand. System must stay correct under refresh, multi-project, queue, and ~100 concurrent product users (simulated).

## Goals

1. **Unstuck:** Failed states with or without source have a working recovery path. Mode is decided by **persisted files**, not status flags alone. Server + worker never trust a lying client mode.
2. **Edge reliability:** Discuss/build/refresh/cancel/queue/stale-lease covered by tests; bugs fixed with atomic commits.
3. **Agent reliability:** Reduce structural first-pass failures (skip-home / zero writes); driven by real-run clusters; capped waves + handoff residuals.
4. **Real E2E:** ~50 real projects on the operator account with chaos injects.
5. **Scale smoke:** 100 concurrent **users** simulated (not 100 Google accounts).
6. **Release:** Atomic commits on `dev` → push-dev + CI green → push-main + CI green.
7. **Stop:** Ship maximum reliable slice + handoff if blocked (energy, external AI, infra).

## Non-goals

- 1000 concurrent users / multi-region infra.
- Perfect visual design quality of generated sites.
- 100 real Google accounts.
- Infinite agent prompt rewriting beyond 3 major fix waves.

## Success criteria

| ID | Criterion |
|----|-----------|
| S1 | Empty-source fail → Build ulang runs `first_generate` |
| S2 | With-source fail → Build ulang runs `retry_build` |
| S3 | Client `retry_build` + empty source → server/worker still `first_generate` |
| S4 | Edge matrix automated tests green |
| S5 | 50 real projects: ≥80% ready first-pass or after one retry; 100% fails retryable |
| S6 | Stress script for ~100 concurrent product ops exits 0 |
| S7 | `dev` and `main` CI green after release path |
| S8 | Handoff lists residual risks if any |

## Architecture principles

1. Source of truth for mode = persisted source files length > 0.
2. Defense in depth: client hint → API resolve → worker re-resolve.
3. Jobs survive browser (BullMQ); UI rehydrates via runtime + attempt stream.
4. One build lease per project.
5. Build concurrency admin-tuned; correctness > throughput.
6. User hand control: no silent infinite auto-retry; harness may auto-retry once to measure recoverability.

## Evidence (baseline)

- Log: `source-finish ok:false` … `agent did not edit enough files, home route was not written…`
- Later: `retry_build` → `Belum ada source tersimpan…`
- Client: `WorkspaceShell.tsx` treated `buildStatus === "failed"` as has source
- Worker: hard throw on empty source for `retry_build`
- API: trusted `body.mode` only

## User-facing copy (Indonesian)

- “Tekan Build ulang untuk mencoba lagi.”
- Empty-retry demotion progress: “Source belum ada” / “Menjalankan build pertama dari brief yang sudah siap.”
