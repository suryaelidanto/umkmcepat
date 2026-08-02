# Job Reliability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server owns generate/discuss/edit on BullMQ; FE starts then listens; fail-clean + retry after crash; reaper; hydrate/cancel fixed — ~100 concurrent users, single process + Redis.

**Architecture:** Unified `project-attempt` queue (`generate` | `discuss` | `edit`); in-memory progress channels; background reaper; abort registry for cancel; stream hydrate by real `ProjectBuild.id`.

**Tech Stack:** BullMQ, Redis, Prisma, existing pubsub patterns, Vitest

**Spec:** `docs/superpowers/specs/2026-08-02-job-reliability-hardening-design.md`

## Global Constraints

- Fail-clean only (`attempts: 1`); no mid-token resume
- Single process + Redis queue; progress stays in-memory
- One project op at a time (existing leases)
- User copy Indonesian; code/logs English
- Surgical diffs; TDD; `bun run check` before handoff
- Never commit secrets

---

## File map

| Create | Role |
|--------|------|
| `src/lib/projects/job-abort-registry.ts` | `registerJobAbort` / `abortJob` / `clearJobAbort` |
| `src/lib/projects/job-reaper.ts` | Global stale/lease/turn sweep + interval start |
| `src/lib/projects/edit-attempt-worker.ts` | Full edit job (agent + compile) |
| `src/routes/api.projects.$id.turns.$turnId.stream.ts` | Discuss reattach stream |

| Modify | Role |
|--------|------|
| `attempt-queue.ts` | Job kinds, abort wrap, discuss/edit dispatch, concurrency default 3, start reaper |
| `api.projects.$id.attempts.$attemptId.stream.ts` | Hydrate by real `buildId` |
| `api.projects.$id.cancel.ts` | Abort open job ids + publish terminal |
| `api.projects.preview.ts` | Enqueue discuss instead of `void runDiscussTurn` |
| `discuss-turn-worker.ts` | Optional `abortSignal` |
| `api.projects.$id.edit.ts` | Thin: claim + enqueue `edit` |
| `app-settings-registry.ts` | Default concurrency 3 |
| FE discuss/build reattach | Turn stream when needed |

---

### Task 1: Abort registry

**Files:**
- Create: `src/lib/projects/job-abort-registry.ts`
- Test: `src/lib/projects/job-abort-registry.test.ts`

- [ ] Write failing tests for register/abort/clear
- [ ] Implement registry
- [ ] Commit

### Task 2: Fix attempt stream hydrate (`buildId`)

**Files:**
- Modify: `src/routes/api.projects.$id.attempts.$attemptId.stream.ts`
- Test: existing or new stream route test

- [ ] Failing test for real buildId replay
- [ ] Fix query to use attempt's ProjectBuild id
- [ ] Commit

### Task 3: Wire abort into generate worker + cancel

**Files:**
- Modify: `src/lib/projects/attempt-queue.ts`
- Modify: `src/routes/api.projects.$id.cancel.ts`

- [ ] Register abort on generate job
- [ ] Cancel aborts open attempt ids
- [ ] Commit

### Task 4: Background job reaper

**Files:**
- Create: `src/lib/projects/job-reaper.ts` + test
- Modify: `startAttemptQueueWorker` to start reaper

- [ ] Tests for lease/build/turn expiry
- [ ] Implement + start interval
- [ ] Commit

### Task 5: Queue discuss turns

**Files:**
- Modify: `attempt-queue.ts`, `api.projects.preview.ts`, discuss worker

- [ ] Discuss job kind + enqueue
- [ ] Worker loads turn from DB and runs
- [ ] Commit

### Task 6: Discuss turn stream reattach

**Files:**
- Create: `src/routes/api.projects.$id.turns.$turnId.stream.ts`
- FE wire if needed

- [ ] Stream route live/terminal
- [ ] FE reattach when running turn
- [ ] Commit

### Task 7: Queue full edit

**Files:**
- Create: `edit-attempt-worker.ts`
- Modify: `edit.ts`, `attempt-queue.ts`

- [ ] Extract runEditAttempt
- [ ] Thin route + FE listen
- [ ] Commit

### Task 8: Concurrency default + lockDuration

**Files:**
- `attempt-queue.ts`, `app-settings-registry.ts`

- [ ] Default 3 + long lockDuration
- [ ] Commit

### Task 9: Docs + acceptance

- [ ] Spec status, handoff, `bun run check`, push when ready
