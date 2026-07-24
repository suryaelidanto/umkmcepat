# Backlog Batch (2026-07-24) — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-24-backlog-batch-design.md`
**Branch:** `dev` · **Tooling:** Bun-only · **Gate:** `bun run check` per phase, `bun run verify` before handoff · **Autonomy:** commit→dev, push via `/push-dev`

This plan is the executable companion to the spec. Each phase lists ordered tasks, TDD markers, and the doc touched. Run phases in order. Never bypass a failing `check`.

## Conventions for every phase
- TDD marker 🔴 = write failing test first; 🟢 = make it pass.
- One conventional commit per phase (`/conventional-commit`); message ends with `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Update the canonical doc in the same diff (architecture.md / DESIGN.md / DEV.md / .env.example as specified).
- `bun run check` green before commit; `bun run verify` before any push.
- If a phase uncovers a contradiction with the spec, fix the spec inline and note it in the commit body.

---

## Phase 0 — Verify handoff (DONE)
- ✅ `git status` clean, `git log` shows `3e87980` containing all three fixes.
- ✅ `discuss-tool.test.ts` tracked; `unstringifyJsonObject` + `jsonObjectOrString` present; `getUndeclaredImportIssues` present; `motion` scaffold-declared.
- No commit. Move on.

---

## Phase 1 — Dev navigation + token-efficient search

### 1a. Refresh Graphify (dev-only, no code change)
1. `bunx graphify .` → rebuild `graphify-out/` to HEAD. (gitignored; never commit.)
2. Skim the refreshed `GRAPH_REPORT.md` for new god-nodes/communities introduced since `2d0e0633`.
3. No commit.

### 1b. Bounded `read_file` + context `search_files` (TDD)
1. 🔴 `agent-tool-runner.test.ts` (or new `agent-tool-runner.bounded-read.test.ts`): `read_file` with `startLine`/`endLine` returns only that slice; out-of-range clamps; whole-file when omitted and small.
2. 🔴 `search_files` with `contextLines` returns per-match line ranges; default 2, capped 5.
3. 🟢 `agent-tool-runner.ts` `read_file` branch: accept `startLine?`/`endLine?`, clamp to `[1, fileLines]`, cap span at 200 lines, return a `{ path, startLine, endLine, content, totalLines }` shape (model-friendly).
4. 🟢 `search_files` branch: accept `contextLines?`, build match objects `{ path, line, text, contextBefore, contextAfter }`.
5. Mirror tool-def param schemas in `custom-source-generator.ts createAgentTools()` + `source-edit-agent.ts`.
6. Update tool descriptions so the model knows it can range-read.
7. `bun run check`. Commit: `feat(agent): bounded read_file ranges + search context lines`.

---

## Phase 2 — Shared upload primitive (object-storage v2)

1. 🔴 `object-storage.test.ts`: `putStoredObject` accepts `allowedContentTypes` + `maxBytes`; rejects oversized; rejects wrong type; key is owner-scoped `<scope>/<ownerId>/<ulid>.<ext>`.
2. 🟢 `src/lib/object-storage.ts`: generalize `normalizeObjectKey` to take a `scope` + `ownerId` + `ext`; keep image-only default; add `allowedContentTypes`/`maxBytes` params to `putStoredObject`; magic-byte validation (PNG/JPEG/WEBP/GIF/PDF headers) in addition to extension. **Provider pinned to `local` (no R2 wiring this batch).**
3. 🔴 New `ProjectAsset` model test: project delete cascades its `ProjectAsset` rows + deletes stored objects.
4. 🟢 `prisma/schema.prisma`: `ProjectAsset` (`id`, `projectId`, `ownerId`, `ref`, `purpose` enum `business-image|reference|logo`, `contentType`, `sizeBytes`, `createdAt`), cascade on `Project` delete. `bun run db:migrate` (dev).
5. 🟢 `src/lib/uploads.ts` (NEW): `uploadProjectAsset(projectId, ownerId, { file, purpose })` → validate, store via `object-storage`, persist `ProjectAsset`, return `{ ref, url }`.
6. 🔴 Route test: `POST /api/projects/$id/assets` rejects unauth, non-owner, wrong purpose, oversized; happy path stores + returns signed URL; `GET` signed round-trips.
7. 🟢 `src/routes/api.projects.$id.assets.ts` (NEW POST) + signed GET (extend or add `api.uploads.$.ts`). Reuse `getSignatureKey`/`hmac` from `object-storage.ts`. Add upload rate-limit bucket.
8. 🟢 `src/lib/projects/project-cleanup.ts`: delete `ProjectAsset` refs + stored objects (best-effort) before DB delete.
9. 🟢 `<FileUpload>` shadcn-style dropzone component in `src/components/ui/file-upload.tsx` + Storybook story.
10. `docs/architecture.md` §Storage: document generalized upload path + `ProjectAsset` cleanup.
11. `.env.example`: rate-limit upload env.
12. `bun run check`. Commit: `feat(uploads): owner-scoped project asset upload + signed GET`.

---

## Phase 3 — Prettier + ESLint auto-fix on commit

1. Read `scripts/check-staged.ts` to confirm current read-only flow.
2. 🟢 Add `scripts/check-staged-fix.ts` (or extend `check-staged.ts` with a `--fix` mode): enumerate staged files via `git diff --cached --name-only --diff-filter=ACMR`; run `prettier --write` + `eslint --fix` on them; `git add` any changed; then run the read-only prettier+eslint check. Block commit if read-only check still fails.
3. 🟢 `.husky/pre-commit`: call the fixing gate instead of the read-only one.
4. 🟢 `package.json`: add `lint:fix` + `format:fix` helper scripts (operate on whole tree or `--staged`); keep `check:fast`/`check` read-only.
5. 🟢 `DEV.md`: document that pre-commit auto-fixes staged files and re-stages them.
6. 🔴 Tiny shell/smoke test: stage a misformatted file, run the fixing gate, assert file fixed + re-staged + read-only check passes.
7. `bun run check`. Commit: `chore(dev): pre-commit auto-fix staged files + re-stage`.

---

## Phase 4 — History / restore

1. 🔴 `snapshots.test.ts`: `listSnapshots(projectId)` returns newest-first with build status + kind; `readSnapshotFile(snapshotId, path)` reads from `sourceRef` artifact; `restoreSnapshot` creates a NEW snapshot with `parentSnapshotId` = target, copies `files`+`sourceRef`, does NOT mutate target; missing-artifact → list-only, not restorable.
2. 🟢 `src/lib/projects/snapshots.ts` (NEW): `listSnapshots`, `readSnapshotFile`, `restoreSnapshot`. Reuse `runtime-artifacts.ts` read + `generated-source` file parsing.
3. 🔴 Route test: `GET /api/projects/$id/snapshots` (auth + owner); `GET .../snapshots/$snapshotId/source?path=` (owner); `POST .../snapshots/$snapshotId/restore` (owner, append-only).
4. 🟢 Routes: `api.projects.$id.snapshots.ts`, `...snapshots.$snapshotId.source.ts`, `...snapshots.$snapshotId.restore.ts`.
5. 🟢 `WorkspacePrimitives.tsx`: `WorkspaceHistoryDrawer` — list rows (timestamp, build status chip, kind, file-delta), `Lihat` (open file diff in Code tab) + `Kembalikan` (confirm dialog).
6. 🟢 `WorkspaceShell.tsx`: add `Riwayat` to the top-bar tablist; wire drawer open/close; restore → toast + optional rebuild prompt.
7. 🟢 Storybook: history drawer states (populated, empty, restoring, missing-artifact).
8. `docs/architecture.md` §Project workspace: restore-as-branch semantics.
9. `bun run check`. Commit: `feat(workspace): project snapshot history + restore`.

---

## Phase 5 — Websearch tool (Firecrawl) + guardrails  [SHIPS DISABLED BY DEFAULT — local/no-key constraint]

1. 🔴 `websearch.test.ts` (pure guards): SSRF block (private/loopback/link-local rejected), allowlist deny-by-default, denylist override, sanitize strips `<script>/<style>/<iframe>` via `dompurify`, per-result truncation, rate-cap (per-project + per-turn) fail-closed, **`WEBSEARCH_PROVIDER=none` (default) → returns "unavailable" string, build still succeeds**.
2. 🟢 `src/lib/websearch.ts` (NEW): `getWebSearchProvider()` reads `WEBSEARCH_PROVIDER` (default `none`); when `none`/unconfigured, `search()` returns a fail-closed "unavailable" string — **no network call, no key**. The `firecrawl` adapter is written behind the boundary (expects a **self-hosted** `FIRECRAWL_BASE_URL`, no hosted/paid key) so enabling later is one env change. Guards → sanitize (via `dompurify`) → `{ results: [{title,url,excerpt}] }`. Fail-closed everywhere.
3. 🔴 `agent-tool-runner` test: `web_search` command returns sanitized text, never touches in-memory file set; `WEBSEARCH_PROVIDER=none` → "unavailable" string, build still succeeds.
4. 🟢 `agent-tool-runner.ts`: `web_search` command variant + executor branch returning a `result` string (no `outputs.push`/`emit` file side effects).
5. 🟢 `custom-source-generator.ts createAgentTools()`: `web_search` tool def; mirror in `source-edit-agent.ts` behind a flag (default: source-gen only).
6. 🟢 `ai-agent-steps.ts` if needed (no new step key; search is within existing steps).
7. 🟢 `dev-log.ts`: `websearch` scope usage in the executor.
8. 🟢 Optional `WebSearchLog` model (start with devLog file; add table only if auditability is required this phase — YAGNI check).
9. `docs/architecture.md`: §AI gateway new bullet + §Provider boundaries table row; `.env.example`: `WEBSEARCH_PROVIDER`, `FIRECRAWL_BASE_URL`, `FIRECRAWL_API_KEY`, `WEBSEARCH_ALLOWLIST`, `WEBSEARCH_DENYLIST`, rate-limit env.
10. `bun run check`. Commit: `feat(agent): read-only web_search tool with SSRF/allowlist/sanitize guardrails`.

---

## Phase 6 — Read-only sub-agent + parallel execution

1. 🔴 `subagent.test.ts`: `spawn_subagent` tool set is read-only (no `write_file`/`replace_in_file`); step cap (`getAgentMaxSteps("subagent")`) enforced; subagent cannot call `spawn_subagent` (tool absent from its set); two concurrent spawns don't share mutable state.
2. 🟢 `ai-agent-steps.ts`: `getAgentMaxSteps("subagent")` (default 8, clamp 2–15) + a per-generate `subagent-step-pool`.
3. 🟢 `custom-source-generator.ts`: extract `createReadOnlyAgentTools()` (read_file, list_files, search_files, web_search, check_app). `spawn_subagent` tool in `createAgentTools`.
4. 🟢 `agent-tool-runner.ts`: `spawn_subagent` command + executor that builds a nested `ToolLoopAgent` with the read-only subset + bounded steps, runs it, returns the summary string. Enforce one nesting level (subagent's tool set omits `spawn_subagent`).
5. 🟢 Ensure executor re-entrancy (no module-level mutable cache touched by concurrent calls).
6. 🟢 `agent-loop-detector.ts`: per-subagent instance.
7. 🟢 `dev-log.ts`: `subagent` scope (`subagent-spawn`/`subagent-finish`, goal + steps).
8. `docs/architecture.md` §Agent tool runner: read-only sub-agents + one-nesting rule.
9. `bun run check`. Commit: `feat(agent): read-only spawn_subagent for parallel research fan-out`.

---

## Phase 7 — Waitlist / whitelist + story + image

1. 🔴 `waitlist.test.ts`: `submitWaitlist` idempotent on email (re-submit updates); `min story` length enforced; image optional; `isWaitlistApproved(email)` branches (approved/pending/rejected/none); `requireAdmin` allows only `ADMIN_EMAILS`.
2. 🟢 `prisma/schema.prisma`: `WaitlistEntry` model (fields per spec); migration that seeds existing pilot emails as `approved` (read the ~10 pilot emails from the DB or env).
3. 🟢 `src/lib/waitlist.ts` (NEW): `submitWaitlist`, `listPending`, `approveEntry`, `rejectEntry`, `isWaitlistApproved`, `linkApprovedUserOnSignup`.
4. 🔴 Route test: `POST /api/waitlist` (Turnstile, rate-limit, idempotent); admin list/approve/reject (admin-gated).
5. 🟢 `src/routes/api.waitlist.ts` (NEW POST) + `src/routes/api.admin.waitlist.ts` (NEW).
6. 🟢 `src/lib/auth-admin.ts` (NEW): `requireAdmin` behind `ADMIN_EMAILS`.
7. 🟢 `src/routes/_main.waitlist.tsx` (NEW page) + `src/components/waitlist/WaitlistForm.tsx` (story textarea centerpiece, optional `<FileUpload>` image with `purpose: waitlist-evidence`). Warm Control Plane styling, no aurora overload.
8. 🟢 `MainChrome.tsx`: waitlist-gate redirect mirroring the `verificationQuery → /verify` pattern; approved→pass, pending/rejected/none→`/waitlist`.
9. 🟢 Admin surface: minimal `src/routes/_main.admin.waitlist.tsx` list + approve/reject (defer polished admin styling if scope tight; functional first).
10. `docs/architecture.md` §Auth: waitlist gate + admin-email allowlist.
11. `.env.example`: `ADMIN_EMAILS`, `WEBSEARCH_*` already done in P5.
12. `bun run check`. Commit: `feat(auth): pilot waitlist with business story + image + admin approval`.

---

## Phase 8 — Mobile-friendly workspace

1. 🟢 Extract `MobileWorkspaceShell` sub-component out of the inline `max-md:` block in `WorkspaceShell.tsx` (improves the 2.7k-line-file smell; bounded refactor, no behavior change yet). Storybook the current mobile states first as a baseline.
2. 🔴 Component test: bottom-nav swap (Tampilan/Kode/Riwayat/Obrolan) changes the visible surface; active state uses near-black token.
3. 🟢 `WorkspacePrimitives.tsx`: `WorkspaceBottomNav`, `MobileSheetComposer` (file list as bottom sheet via shadcn `sheet`), mobile-aware `GeneratedPreviewFrame` (full-bleed, default mobile viewport).
4. 🟢 `MobileWorkspaceShell`: single-surface swap via bottom nav; `useViewportHeight` hook for mobile chrome; sticky touch composer (44px targets); streaming scroll-anchor (already fixed in `f15ec93`).
5. 🟢 Code view on mobile: file list → bottom sheet, content full-width; drop `md:grid-cols-[280px_1fr]` for mobile.
6. 🟢 Build progress on mobile: vertical timeline (reuse `BuildProgressPanel`, responsive).
7. 🟢 Visual-annotation editor: read-only/hidden on mobile (`md:` gate); document scope limit in architecture.md. Mobile users edit via chat.
8. 🟢 Re-audit every workspace state for mobile legibility: loading, ready, stuck (Phase-0 bounded-loader), build-failed, runtime-stopped, rate-limited.
9. 🟢 Storybook: new mobile states + bottom-nav + sheet-composer stories; Storybook tests.
10. `docs/architecture.md` §Project workspace: mobile layout mode + annotation-on-mobile scope limit.
11. `DESIGN.md`: document the mobile composer + bottom-nav if a new pattern; reuse shadcn `sheet`/`tabs` where possible.
12. `bun run check` + `bun run test:storybook` (if viable). Commit: `feat(workspace): designed mobile shell with bottom nav + touch composer`.

---

## Cross-phase: before declaring "all done"
- `bun run verify` (locks + route regen + format/lint/typecheck/full tests/Knip) green.
- Re-read `docs/superpowers/specs/2026-07-24-backlog-batch-design.md` success criteria; tick each.
- `MEMORY.md` — append a memory summarizing the batch outcome + any non-obvious decisions (e.g. subagent one-nesting-level, waitlist admin-allowlist-not-roles) for the next agent.
- Do NOT run `bun run build` unless asked.
- Push via `/push-dev` at natural breakpoints; never push to `main`.

## Resume path (if a phase is unfinished at handoff)
Each phase's TDD tests + the spec section are the resume contract: if tests are red, read the corresponding spec section; if tests are green but uncommitted, commit. The plan is linear; do not skip ahead.
