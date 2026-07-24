# Prettier-on-All After AI Generation — Design

**Date:** 2026-07-25
**Topic:** 5 of the eight-topic roadmap (see `umkmcepat-eight-topic-roadmap` memory)
**Status:** Design approved; pending plan + implementation. Small spec — no forks.

## Goal

When the AI finishes a generation (and presents the result to the user in the code tab), run prettier on **all** the generated project source files so the code the user sees is polished — fast, via prettier's cache.

## Why

The existing pre-commit hook (`scripts/check-staged-fix.ts`) auto-formats **staged** platform files at commit time — it does not touch the generated project source written by the AI generation flow. Today, generated source on disk is whatever the AI emitted; in the code tab it may be inconsistently formatted. The user wants it pretty at presentation time, every generation, automatically. ESLint auto-repair already exists (the hook runs `eslint --fix`; the 2× build-repair loop is a separate concern) — this spec only adds the post-generation prettier sweep.

## Decisions (locked; no forks)

1. **Sweep the generated source artifact on disk.** The generated source lives as real files at `<PROJECT_ARTIFACT_DIR>/source/<artifactId>/files/<path>` (`runtime-artifacts.ts:305`). The sweep runs `prettier --write` on that directory tree. It does NOT touch the platform source (the repo's own `src/`).
2. **Fire-and-forget at the post-commit point.** Alongside `refreshProjectThumbnail` (generate route ~line 1220, `Promise.allSettled`), a `Promise.allSettled`-style sweep runs after the build succeeds + is presented. It must not block the generation result or fail the turn on a prettier error — best-effort, logged on failure.
3. **Fast via prettier cache.** Use `prettier --write --cache --cache-location <generated-cache-path>` so unchanged files are skipped. The cache lives under the artifact dir (gitignored), not the repo root (which is for platform `format:check`).
4. **Run on the generation flow + the edit flow.** Both `generate` (first generation) and `edit` (`/api/projects/$id/edit`) write a new source artifact + build; both should sweep after a successful build so the code tab is always pretty.
5. **No new dependency.** `prettier` is already a dep (`package.json:120`). The generated projects' own prettier config (if any) is out of scope — use the platform's `.prettierrc.json` (the repo default), which is what the code-tab viewer expects.

## Architecture

### New helper — `src/lib/projects/format-generated-source.ts`

- `formatGeneratedSource(artifactRef: string): Promise<{ formatted: number; failed: boolean }>`
- Resolves the artifact's `files/` directory from `artifactRef` (reuse `runtime-artifacts.ts` path resolution; read the dir, not the DB blob).
- Spawns `prettier --write --cache --cache-location <artifactDir>/.prettiercache "**/*.{ts,tsx,js,jsx,css,json,md}"` in that directory (scoped, so it only touches generated files).
- `failed: true` on non-zero exit — logged, not thrown (the generation already succeeded; prettier failure is cosmetic).
- `formatted: number` parsed from prettier's stdout for telemetry (optional).

### Wire into the generation + edit flows

- `src/routes/api.projects.$id.generate.ts` post-commit block (~line 1220, where `refreshProjectThumbnail` is `Promise.allSettled`'d): add `formatGeneratedSource(finalized.sourceRef)` to the same `allSettled` batch.
- `src/routes/api.projects.$id.edit.ts`: after the new build succeeds, add the same `formatGeneratedSource(newSnapshot.sourceRef)` to the post-build step.

### Cache + ignore hygiene

- The generated prettier cache (`.prettiercache` under each artifact dir) is a build artifact — confirm `.data/project-artifacts/` is gitignored (it is — `.data/` is ignored). No `.gitignore` change needed.

## Data flow

1. Generation builds successfully → `finalizeProjectOperation` → new source artifact on disk at `<PROJECT_ARTIFACT_DIR>/source/<id>/files/`.
2. Post-commit `Promise.allSettled([refreshProjectThumbnail(...), formatGeneratedSource(sourceRef)])`.
3. `formatGeneratedSource` runs `prettier --write` scoped to that artifact's `files/` dir (cached).
4. The code tab reads the now-formatted source; the user sees pretty code.

## Error handling

- Prettier non-zero exit → `failed: true`, logged via `devLog`; the generation turn still succeeds (it built; formatting is cosmetic).
- Missing source artifact (shouldn't happen post-build) → no-op, logged.
- Timeout: bound the sweep (e.g. 30s) so a pathological large project doesn't hang the post-commit side-effect.

## Testing (TDD)

1. **Unit — `formatGeneratedSource`:** writes a fixture source dir with unformatted `.ts` → run → assert the file is formatted + `formatted > 0` + `failed === false`. Use a temp dir + the platform `.prettierrc.json`.
2. **Unit — failure isolation:** a deliberately invalid file that prettier can't parse → `failed === true`, the generation turn is not affected (the helper throws nothing; the caller's `allSettled` absorbs it).
3. **Unit — cache hit:** second run on unchanged files → `formatted === 0` (cache skipped them) + fast.

## Out of scope

- Running prettier on the platform repo source (the pre-commit hook + `format:check` already do).
- ESLint auto-repair on generated source (separate concern; the build-repair loop exists).
- The generated project's own prettier config (use the platform default).
- Formatting dist (built output) — dist is build-generated; not user-facing in a code tab.

## Open questions for implementation

- Confirm the exact `prettier` binary invocation from the project (the `format` script uses `prettier --write`; the helper should match the same config + ignore path resolution, scoped to the artifact dir).
- Confirm whether the code-tab viewer reads from the on-disk artifact or the DB `snapshot.files`. If it reads the DB blob, the sweep must also update the DB snapshot's file contents (not just disk) — verify at impl time against the code-tab data source.
