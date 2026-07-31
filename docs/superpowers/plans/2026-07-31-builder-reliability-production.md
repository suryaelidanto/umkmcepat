# Builder reliability (production) Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans / subagent-driven-development, TDD, systematic-debugging, verification-before-completion, push-dev, fix-ci, push-main.

**Goal:** Production-grade discuss/build recovery, edge reliability, deeper agent structural success, 50 real E2E projects, 100-user stress smoke, push to main with green CI.

**Architecture:** Pure `resolveGenerateMode` + shared `loadPersistedProjectSourceFiles`; API/worker/client aligned; edge Vitest matrix; reliability harness; agent fixes from failure clusters; atomic commits; full release loop.

**Tech stack:** Bun, Prisma, BullMQ/Redis, Vitest, existing generate/discuss workers, Conventional Commits, `gh` CI.

## Locked decisions

| Topic | Decision |
|-------|----------|
| Iterations | Unit/integration **and** ~50 real projects |
| Scale | 100 concurrent users simulated; one account OK |
| Release | push-dev → CI green → push-main → CI green |
| Agent | Deep structural reliability (capped waves) |
| Stop | Max reliable slice + handoff if blocked |
| Commits | Atomic local on `dev` throughout |

## Phases

0. Docs + harness skeleton  
1. Unstuck recovery (TDD)  
2. Edge matrix tests + fixes  
3. Agent structural reliability (capped)  
4. 50 real projects E2E (+ chaos)  
5. Stress-100  
6. check → push-dev → CI → push-main → CI → handoff  

## Phase 1 detail (critical path)

1. `resolveGenerateMode(requestedMode, hasPersistedSource)`  
2. `loadPersistedProjectSourceFiles({ projectId, userId })`  
3. API: resolve mode before enqueue; log `mode.resolved`  
4. Worker: demote empty `retry_build` → `first_generate` (no dead-end throw)  
5. Client: only non-empty source (or runtime `hasPersistedSource`) counts  
6. Runtime: expose `hasPersistedSource`; solid `canRetry`  

See full AFK package in conversation 2026-07-31 and spec `2026-07-31-builder-reliability-production.md`.

## Edge matrix IDs

D1–D4 discuss/refresh · B1–B8 build/refresh/cancel · Q1–Q4 queue · R1–R4 runtime/energy/rate  

## Pass bars

- Phase 1: unit tests green; stuck class recoverable  
- Phase 2: matrix green  
- Phase 4: ≥80% ready first or one retry; 100% fails retryable  
- Phase 5: stress exit 0  
- Phase 6: main CI green  
