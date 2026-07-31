# Handoff: Builder reliability (2026-07-31)

## Shipped (this session)

- Spec + plan under `docs/superpowers/`
- **Unstuck recovery:** `resolveGenerateMode` + `loadPersistedProjectSourceFiles`; API/worker demote empty `retry_build` → `first_generate`; runtime `hasPersistedSource` + stronger `canRetry`; client no longer treats failed status as “has source”
- **Agent:** second forced rewrite; exploration budget (12 reads) before writes; rewrite step budget 16
- **Tests:** mode/edge/load-persisted/custom-source-generator (50 unit tests green)
- **Harness:** `scripts/reliability/` (stress-100 passed 100/100 against local server)
- Commit: `74115b9` on `dev`

## Residual (operator / next session)

1. **50 real full discuss→build E2E** needs `RELIABILITY_COOKIE` + AI energy + full discuss API scripting (current `run-batch` only creates project + probes runtime). Extend discuss+build flow then run `--count 50`.
2. **Deep agent quality** beyond rewrite waves: monitor first-pass rate after deploy; further prompt/tool work if skip-home remains common.
3. **Unrelated dirty tree** left unstaged: `AdminShell.tsx`, `_main.admin.settings.tsx`, `admin-settings-client-sync*` (not part of this work).
4. **`.playwright-mcp/`** snapshots — do not commit.

## How to verify unstuck on Studio Grafis project

Open failed empty-source project → Build ulang → logs should show `mode.resolved` with `generateMode: first_generate` and `retry_build.empty_source_fallback` if client still sent retry.
