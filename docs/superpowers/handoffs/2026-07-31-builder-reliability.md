# Handoff: Builder reliability (2026-07-31)

## Shipped (this session)

- Spec + plan under `docs/superpowers/`
- **Unstuck recovery:** `resolveGenerateMode` + `loadPersistedProjectSourceFiles`; API/worker demote empty `retry_build` → `first_generate`; runtime `hasPersistedSource` + stronger `canRetry`; client no longer treats failed status as “has source”
- **Agent:** second forced rewrite; exploration budget (12 reads); rewrite step budget 16; **brief-home-seed** last resort when agent still writes nothing
- **Live proof:** project `cms8qd27m000x4lng1onfsn02` recovered: `mode.resolved first_generate` → `brief-home-seed` → `source-finish ok:true` → `build.finished ok:true` → runtime `ready` / `hasPersistedSource:true` / `canPreview:true`
- **Tests:** unit matrix green; `bun run check` green
- **Harness:** `scripts/reliability/` stress-100 → 100/100
- Commits on `dev`: `74115b9`, `c2fbbc1`, `ac19570`, `2b81b51`

## Residual (next session)

1. **50 full discuss→build E2E** still thin: extend `run-batch` with discuss script + chaos; run `--count 50` when AFK energy budget allows.
2. **Agent first-pass rate:** seed is safety net (generic brief home); prefer improving model write rate so seed rarely fires.
3. **`ready_with_failed_latest_attempt`** may show if older failed attempts remain in list while latest succeeded — cosmetic; preview works.
4. Unrelated admin WIP may exist outside this branch work.

## Verify

- Stuck empty-source project → **Coba lagi** / generate → logs: `mode.resolved` `first_generate`, never `Belum ada source tersimpan` dead-end.
- If agent empty: `brief-home-seed` then successful build.
