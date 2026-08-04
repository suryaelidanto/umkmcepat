# Intuitive Edit Selector - Design

**Date:** 2026-08-04
**Status:** Approved design; implementation not started
**Scope:** Visual edit annotation hit-testing inside generated project previews

## Summary

The visual edit selector should select what the user visually clicked. Inner text, images, and controls must win over large wrapping sections or cards. Large containers remain selectable only when the user clicks their empty padding/background or when no smaller meaningful target exists.

The current selector feels inconsistent because it converts the browser hit-test result into a "meaningful" ancestor too early. That causes clicks inside large generated sections to select the section/card instead of the heading, paragraph, image, or button the user intended.

## Verified Current Behavior

The preview annotation bridge is injected from `src/lib/projects/runtime-proxy.ts` through `injectPreviewAnnotationBridge()`.

Both generated preview paths use the same bridge:

- Live runtime preview: `proxyDeploymentRequest()` rewrites generated HTML and calls `injectPreviewAnnotationBridge()`.
- Legacy/static preview: `src/routes/api.projects.$id.preview.$.ts` calls `injectPreviewAnnotationBridge(file.content)` for HTML files.

The parent workspace does not compute the selected element. `src/components/projects/WorkspacePrimitives.tsx` listens for `umkmcepat-annotation-target`, and `src/components/projects/WorkspaceShell.tsx` stores the posted payload. Therefore the root cause is inside the injected bridge, not the React workspace UI.

## Root Cause

Current bridge flow:

```text
mousemove/click
  -> elementAt(x, y)
  -> document.elementsFromPoint(x, y)
  -> meaningfulElement(element)
  -> targetData(element, selection)
  -> postMessage("umkmcepat-annotation-target")
```

The problematic step is `meaningfulElement(element)`:

- It climbs ancestors and returns the first `isLeafTarget()` or `isAtomicBlock()`.
- `isAtomicBlock()` treats class names like card, feature, item, product, service, tile, and article/listitem roles as selectable blocks.
- `isTextOnlyElement()` rejects divs that contain common nested elements, so many generated wrapper divs are skipped.
- There is no scoring step that prefers the smallest meaningful visible element under the cursor.
- Hover and click recompute the target independently, so small pointer movement or selection state can produce mismatch.

This creates a UX mismatch: the user thinks they clicked a heading or paragraph, but the bridge reports a larger card/section.

## Reference Research

`https://github.com/benjitaylor/agentation` was cloned outside this repo at `/tmp/opencode/agentation` for study only.

Relevant files in the reference repo:

- `/tmp/opencode/agentation/package/src/components/page-toolbar-css/index.tsx`
- `/tmp/opencode/agentation/package/src/utils/element-identification.ts`
- `/tmp/opencode/agentation/package/src/components/design-mode/section-detection.ts`

Useful lessons:

- Normal annotation mode trusts the deepest browser hit-test target using a Shadow DOM-aware `deepElementFromPoint()`.
- It does not make section/card selection the default for normal annotations.
- It blocks interactions while annotating, so buttons and links can be selected without triggering navigation/action.
- It separates normal element annotation from section/layout selection.
- It enriches the selected element with labels, paths, nearby text, classes, accessibility, computed styles, React component info, and source info after choosing the target.

Do not port Agentation wholesale. Adopt the selection philosophy and the Shadow DOM-aware hit-test pattern while preserving UMKM Cepat's existing preview bridge and annotation payload shape.

## Goals

1. Default selection chooses the smallest direct visual target the user clicked.
2. Interactive owner elements win over descendants: clicking text or icons inside a button/link selects the button/link.
3. Text and media targets win over large containers when the click is on visible text/media.
4. Large cards/sections remain selectable when the user clicks empty padding/background.
5. Hover highlight and click selection should match for normal pointer use.
6. Preserve the existing annotation payload shape consumed by edit requests.
7. Cover the selector behavior with repeatable tests.

## Non-Goals

- No new user-facing selector mode in this change.
- No modifier-key parent escalation in this change.
- No full Agentation port.
- No React component/source detection in this change.
- No changes to edit API request/response shape.
- No generated project rebuild or migration.

## Desired Selection Rules

Selection starts from a Shadow DOM-aware deepest element at the pointer.

Priority order:

1. Ignore annotation bridge UI: `.umkm-annotation-marker`, `.umkm-annotation-hover`, and their descendants.
2. If the click is inside `button`, `a`, `input`, `select`, `textarea`, `[role="button"]`, or `[onclick]`, select that interactive owner.
3. If the click is on or inside `img`, `picture`, `video`, or `svg`, select that media element.
4. If the click is on text content, select the nearest text owner: `h1`-`h6`, `p`, `label`, `li`, `blockquote`, `figcaption`, `caption`, `span`, `strong`, `em`, `b`, `i`, `small`, `code`, or `pre`.
5. If the direct element is a generic wrapper with its own direct text node, select that wrapper.
6. If no smaller meaningful target exists, select the nearest atomic block: `article`, `[role="listitem"]`, `[data-umkm-annotatable]`, or class names matching badge/card/capsule/chip/feature/item/pill/product/service/tag/tile.
7. If no atomic block exists, select the nearest semantic container: `section`, `nav`, `header`, `footer`, `main`, `aside`, or `[aria-label]`.
8. Last fallback: select the original deepest element.

Container selection must not override a smaller text/media/interactive target at the same point.

## Hover/Click Consistency

The bridge should cache the last hover target:

```ts
type LastHoverTarget = {
  element: HTMLElement;
  rect: DOMRect;
  selectedText?: string;
  selectionRect?: DOMRect;
  timestamp: number;
};
```

On click, reuse the cached hover target when all are true:

- The cached element is still in the document.
- The click point is inside the cached element rect or cached selection rect.
- The cached target is recent enough for normal pointer use, with a maximum age of `250` milliseconds.

If any check fails, recompute the target from the click coordinates.

## Existing Payload Contract

The bridge must continue posting:

```ts
{
  type: "umkmcepat-annotation-target",
  payload: {
    label: string;
    selectedText?: string;
    target: {
      boundingBox: { x: number; y: number; width: number; height: number };
      classes?: string;
      nearbyText?: string;
      selectorPath: string;
      src?: string;
      tag: string;
      text: string;
    };
  };
}
```

No parent workspace/API changes should be required.

## Testing Requirements

Behavioral tests should prove these scenarios:

1. Clicking a nested `h1` inside a large `section` selects `h1`.
2. Clicking a `p` inside a card/article selects `p`, not the card/article.
3. Clicking card padding/background selects the card/article.
4. Clicking text or an icon inside a `button` selects the `button`.
5. Clicking an image selects `img`.
6. Hover/click stability logic exists and reuses a recent matching hover target.

The repo's unit test project runs in Node, not JSDOM. Prefer tests against a pure selector-priority helper that accepts serializable candidate metadata, then keep string-level bridge assertions to verify the injected script uses the same priority names and hover cache.

## Verification

Focused verification after implementation:

```bash
bun test src/lib/projects/runtime-proxy.test.ts
```

Before handoff for code changes:

```bash
bun run check
```
