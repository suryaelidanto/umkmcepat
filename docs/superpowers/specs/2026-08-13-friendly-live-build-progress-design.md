# Friendly Live Build Progress — Design

**Date:** 2026-08-13  
**Status:** Approved direction; awaiting written-spec review  
**Scope:** Consumer-facing build and edit/rebuild progress experience  
**Related handoff:** `/tmp/umkmcepat-friendly-build-progress-handoff.md`

## Summary

UMKM Cepat will make website generation feel like a live workshop: owners can see meaningful work accumulate while the system builds their site. The experience should be satisfying and reassuring, not simulated. Every visible completion must correspond to a real progress or file operation emitted by the build pipeline.

The existing server-side progress stream, per-file rows, durations, stop/retry behavior, terminal states, and expandable file/diff details remain the source of truth. This change improves the vocabulary and continuity of those real events. It does not add fake steps, artificial delays, percentages, or decorative activity that suggests work has happened when it has not.

## User experience

While a build is running, the panel presents:

```text
Website sedang dibuat
Setiap bagian akan muncul saat selesai.

✓ Menyiapkan website             1.2s
✓ Membuat halaman utama          6.8s
✓ Menambahkan bagian produk      4.1s
● Merapikan tampilan             3.4s
○ Memeriksa website

3 bagian sudah selesai
```

The exact rows depend on real emitted events. The current active phase keeps its live timer and active indicator until the next real operation arrives. Completed file rows retain their existing expandable path and diff evidence.

At completion, the panel uses an outcome-oriented terminal message such as `Website siap dilihat` and keeps the existing preview action. Error and retry states explain what the owner can do next without exposing implementation details.

Initial generation and edit/rebuild use the same vocabulary and progression model.

## Progress model

1. **Start a real phase immediately.** At each actual worker stage boundary, emit or display one active user-facing phase, such as `Menyiapkan website`, `Menyusun struktur halaman`, `Merapikan tampilan`, or `Memeriksa website`.
2. **Append real file completions.** When a streamed file block closes and passes the existing stage gate, append exactly one row for that file operation. Do not merge repeated operations or cap the list.
3. **Preserve evidence.** The primary row describes the website outcome. The existing expandable detail retains the actual file path and diff.
4. **Show truthful momentum.** A completed-row count may be shown when derived from the actual progress-step list. No percentage or estimated remaining time is introduced.
5. **Keep long phases honest.** If the upstream model takes time before the next file closes, the current real phase remains active with its timer. No fake heartbeat rows or fabricated file activity is added.
6. **Finish explicitly.** Completion closes active rows and shows the existing terminal state. Errors remain errors and preserve retry behavior.

The client continues to deduplicate replayed stream events and rehydrate durable progress after reconnects. The reducer and progress-step identity must not be weakened to make the list appear more active.

## Copy rules

Consumer-facing Indonesian copy should describe the website outcome, not implementation machinery.

Preferred vocabulary:

- `Website sedang dibuat`
- `Menyiapkan website`
- `Menyusun struktur halaman`
- `Membuat halaman utama`
- `Menambahkan bagian produk`
- `Menambahkan informasi kontak`
- `Merapikan tampilan`
- `Memeriksa website`
- `Website siap dilihat`
- `Buat ulang website`

Avoid in consumer-facing progress, buttons, statuses, and errors:

- `build` when `buat website` is clearer
- `batch`, `batched`, `writer`, `agent`, `worker`
- `compile`, `compilasi`
- `source` when it means an internal implementation artifact
- queue, model, provider, or internal phase explanations

Internal code identifiers, logs, telemetry, admin/debug ledgers, and architecture documents remain technically precise. Actual file paths may remain in the existing expanded evidence surface.

## Boundaries

### Included

- Friendly labels and details emitted by generation and edit/rebuild producers
- Friendly labels and details in the progress reducer and workspace components
- Active-state copy, completion copy, retry/error copy, and start/rebuild buttons
- A truthful completed-row count if it fits the existing panel without changing its interaction model
- Focused tests for event-to-row mapping, copy, replay deduplication, per-file rows, and diff preservation

### Excluded

- New event schemas unless an existing real stage cannot be represented
- Fake progress, artificial delays, fake percentages, or token-level noise
- Merging, capping, or deduplicating real file operations
- Removing paths, diffs, expandable rows, durations, stop controls, retry behavior, or reconnect support
- A broad visual redesign of the progress panel
- E2E execution or remote push in this implementation pass unless separately requested

## Data flow

```text
real worker stage/file event
  -> build progress publisher
  -> stream reducer / durable progress row
  -> friendly outcome label + real detail
  -> live panel with active timer
  -> expandable path/diff evidence
```

The implementation should first audit whether any perceived silence is caused by missing real stage events or only by technical copy. If a real stage boundary is missing, add the smallest event at that boundary. Do not add synthetic events solely to make the list longer.

## Verification

Focused tests must prove:

- A real stage start produces an active row with friendly copy.
- Each real file completion produces exactly one row.
- Replayed sequence numbers do not duplicate rows.
- The active timer and status remain correct between file completions.
- Paths and diffs remain available through the existing expansion behavior.
- Initial generation and edit/rebuild use the same friendly vocabulary.
- Completion, error, stop, retry, and reconnect states remain intact.
- Forbidden implementation vocabulary does not reach consumer-facing progress copy.

The final implementation gate is `bun run check`. Do not run `bun run build` unless requested or required by a build/deployment change.

## Success criteria

An owner watching a long build should always know:

1. The website work has started.
2. What real stage is currently active.
3. Which real parts of the website have finished.
4. That the system is still working during a long active phase.
5. What they can inspect in the details.
6. When the website is ready or when a retry is needed.

The experience should feel rewarding because meaningful website work visibly accumulates—not because the product simulates activity.
