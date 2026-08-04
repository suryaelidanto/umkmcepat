# Broken-Image Placeholder Fallback Design

**Status:** Approved for planning
**Date:** 2026-08-04
**Related:** `2026-07-27-rustfs-local-s3-design.md`

## Problem

Generated UMKM preview/published sites render images from two sources: a local
`/placeholder.svg` in the dist, and owner-uploaded assets. Two gaps cause broken
images:

1. **Old builds lack `placeholder.svg` entirely.** The scaffold only started
   emitting `public/placeholder.svg` in commit `240dac1` (2026-08-04). Projects
   built before that have no placeholder in their dist, so any `<img
   src="/placeholder.svg">` 404s and shows the browser's broken-image icon.
   Verified: only 1 of 153 dist files across MinIO is a `placeholder.svg`.

2. **No vertical placeholder variant.** Only a landscape `600×400` SVG exists
   (`PLACEHOLDER_SVG`). Generated sites use it for every image slot regardless of
   aspect, so portrait slots show a distorted/cropped landscape placeholder.

Additionally, any `<img>` can fail at runtime for reasons unrelated to the
placeholder file: an owner asset was deleted, a remote URL is dead, or an upload
is corrupt. Today there is no fallback for a loaded-but-failing image.

## Goals

- **G1:** A loaded-but-failing `<img>` swaps to a neutral placeholder instead of
  the browser's broken-image icon.
- **G2:** The placeholder is **aspect-aware**: landscape slots get a landscape
  graphic, portrait slots a portrait one.
- **G3:** The fallback works for **all** projects — including old builds whose
  dist lacks any placeholder file — with no rebuild and no per-project dist
  dependency.
- **G4:** The same placeholder assets are available at generation time so new
  builds can reference both landscape and vertical variants.

## Non-goals

- Not backfilling placeholders into existing dist artifacts in MinIO.
- Not adding a third (square) placeholder variant.
- Not changing how owner-uploaded real images are stored or served.
- Not changing the annotation bridge's existing behavior.

## Design

### Shared placeholder source

Add a module that owns both SVG strings so the scaffold and the injected fallback
use the same source of truth:

- `src/lib/projects/placeholders.ts`
  - `LANDSCAPE_PLACEHOLDER_SVG` — the existing "Tidak ada foto" graphic
    (`viewBox="0 0 600 400"`), moved from `vite-tanstack-shadcn-starter.ts`.
  - `PORTRAIT_PLACEHOLDER_SVG` — a new portrait graphic
    (`viewBox="0 0 400 600"`), same visual style (neutral gradient, image glyph,
    "Tidak ada foto" label).
  - `PLACEHOLDER_DATA_URIS` — base64 data-URI forms of both, used by the injected
    fallback so it needs no network request.

The scaffold file imports these constants and emits both `public/placeholder.svg`
and `public/placeholder-vertical.svg`.

### Engine-level fallback (G1, G2, G3)

Inject a small capture-phase `error` listener into generated HTML at serve time.
It runs in both preview and published pages:

```js
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t && t.tagName === 'IMG' && !t.dataset.umkmPlaceholder) {
    t.dataset.umkmPlaceholder = '1';
    const vertical = t.clientHeight > t.clientWidth;
    t.src = vertical ? VERTICAL_DATA_URI : LANDSCAPE_DATA_URI;
  }
}, true);
```

- **Capture phase** catches images added after load (dynamic renders).
- **`dataset.umkmPlaceholder` guard** prevents a loop if the placeholder itself
  fails to render; it only tries once per image.
- **Aspect pick** uses the rendered box (`clientHeight`/`clientWidth`); a portrait
  `<img>` gets the portrait placeholder.
- **Data URI** means no fetch, so it works even when the project's dist has no
  placeholder file (old builds) or the network is degraded.

Injection points (reuse the existing HTML-rewrite helpers in
`runtime-proxy.ts`):
- Preview: `injectPreviewAnnotationBridge`
- Published: `injectPublishedHead`

Both already run only when serving `text/html` responses, so the listener is
added to documents, not assets.

### Generation guidance (G4)

The agent skill prompt (`generated-app-builder.md`) and the placeholder rule in
`custom-source-generator.ts` gain one line: use `/placeholder.svg` for
landscape/wide slots and `/placeholder-vertical.svg` for portrait/tall slots.
The runtime fallback remains the safety net for any failure regardless of which
the agent chose.

## Security analysis

- The injected listener only rewrites an `<img>`'s `src` to an embedded SVG on a
  failed load. It does not introduce any new network fetch, script execution,
  or user input. It runs in the already-sandboxed preview/published frame.
- The `dataset` guard bounds the change to one rewrite per image; no unbounded
  work.
- No new dependencies, no external resources.

## Reliability

- Data-URI fallback cannot 404 (nothing to fetch), covering old builds, dead
  remote URLs, and corrupt uploads uniformly.
- The scaffold change only affects future builds; existing projects rely on the
  injected fallback (G3), not on their dist contents.
- If both data-URIs were somehow invalid (defensive), the guard still prevents an
  infinite retry loop.

## Files

- Create: `src/lib/projects/placeholders.ts` — SVG constants + data-URIs.
- Modify: `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts` — import
  constants; emit `public/placeholder-vertical.svg`.
- Modify: `src/lib/projects/scaffold/scaffold.test.ts` — assert both assets
  emitted.
- Create: `src/lib/projects/placeholders.test.ts` — assert SVGs, data-URIs, and
  aspect picker.
- Modify: `src/lib/projects/runtime-proxy.ts` — inject fallback script in preview
  + published; export a testable pure aspect picker.
- Modify: `src/lib/projects/runtime-proxy.test.ts` — fallback injection + aspect
  picker tests.
- Modify: `src/lib/projects/skills/generated-app-builder.md`,
  `src/lib/projects/custom-source-generator.ts` — placeholder guidance for
  landscape vs vertical.
- Modify: `DEV.md` — note the runtime fallback.
