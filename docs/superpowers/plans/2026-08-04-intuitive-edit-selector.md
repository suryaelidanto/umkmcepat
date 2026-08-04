# Intuitive Edit Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make visual edit annotations select the inner element the user clicked, while preserving section/card selection for empty container space.

**Architecture:** Keep the existing preview annotation bridge in `src/lib/projects/runtime-proxy.ts`, but mirror its priority decisions in a pure helper that can be tested in the repo's Node Vitest environment. The bridge will choose a Shadow DOM-aware deepest element first, normalize only obvious owner cases, and use container fallback only when no smaller meaningful target exists.

**Tech Stack:** Bun, TypeScript, Node Vitest unit tests, generated preview bridge injected as HTML script text.

## Global Constraints

- Use Bun only; keep `bun.lock` as the canonical lockfile.
- Keep changes small, focused, and easy to review.
- User-facing product UI copy uses Indonesian; developer-facing docs/code/logs/errors use English.
- Do not change the annotation payload shape consumed by `WorkspaceShell` or `/api/projects/:id/edit`.
- Do not add dependencies.
- Do not add a new user-facing selector mode in this change.
- Do not port Agentation wholesale; adopt only the relevant selector behavior.
- Before handoff for code changes, run `bun run check` explicitly.

---

## File Structure

- Modify: `src/lib/projects/runtime-proxy.ts`
  - Owns preview proxying, annotation bridge injection, and the raw bridge script string.
  - Add small exported pure helpers for selector priority behavior so tests can exercise the rules without a browser DOM.
  - Keep `PREVIEW_ANNOTATION_BRIDGE` payload shape and postMessage types unchanged.
- Modify: `src/lib/projects/runtime-proxy.test.ts`
  - Add Node-safe priority tests for target selection.
  - Keep existing proxy/header/asset tests intact.
- No change: `src/components/projects/WorkspacePrimitives.tsx`
  - Parent iframe message listener already accepts `umkmcepat-annotation-target`.
- No change: `src/components/projects/WorkspaceShell.tsx`
  - Parent annotation state already stores the bridge payload.
- No change: `src/lib/projects/visual-annotations.ts`
  - Existing sanitize/edit instruction payload remains valid.

### Task 1: Extract Testable Selector Priority Helper

**Files:**
- Modify: `src/lib/projects/runtime-proxy.ts`
- Modify: `src/lib/projects/runtime-proxy.test.ts`

**Interfaces:**
- Consumes: serializable metadata describing the clicked element and its ancestors. Unit tests run in Node, so this task must not require `document`, `HTMLElement`, JSDOM, happy-dom, or a new dependency.
- Produces:
  - `export type PreviewAnnotationCandidate = { annotatable?: boolean; className?: string; directText?: string; hasClickHandler?: boolean; ignored?: boolean; role?: string | null; tag: string; text?: string }`
  - `export function pickPreviewAnnotationCandidateIndex(candidates: PreviewAnnotationCandidate[]): number`

- [ ] **Step 1: Write failing tests for direct child preference**

Add these imports near the existing runtime proxy imports in `src/lib/projects/runtime-proxy.test.ts`:

```ts
import {
  applyPreviewSandboxHeaders,
  injectPreviewAnnotationBridge,
  pickPreviewAnnotationCandidateIndex,
  proxyDeploymentRequest,
  rewritePreviewAssetUrls,
  rewritePublicAssetUrls,
} from "@/lib/projects/runtime-proxy";
```

Replace the current import block from `@/lib/projects/runtime-proxy` with the block above.

Add this describe block after the existing `afterEach` setup inside `describe("runtime proxy", () => {`:

```ts
  describe("preview annotation element picking", () => {
    it("selects a nested heading instead of its large section", () => {
      const candidates = [
        { tag: "h1", text: "Servis motor panggilan" },
        { className: "hero-copy", tag: "div", text: "Servis motor panggilan" },
        { className: "hero-section", tag: "section", text: "Servis motor panggilan" },
        { tag: "main", text: "Servis motor panggilan" },
      ];

      expect(pickPreviewAnnotationCandidateIndex(candidates)).toBe(0);
    });

    it("selects paragraph text inside a card instead of the card", () => {
      const candidates = [
        { tag: "p", text: "Paket servis ringan untuk motor harian." },
        { className: "service-card-body", tag: "div", text: "Paket servis ringan untuk motor harian." },
        { className: "service-card", tag: "article", text: "Paket servis ringan untuk motor harian." },
      ];

      expect(pickPreviewAnnotationCandidateIndex(candidates)).toBe(0);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test src/lib/projects/runtime-proxy.test.ts
```

Expected: FAIL because `pickPreviewAnnotationCandidateIndex` is not exported.

- [ ] **Step 3: Add minimal exported helpers**

In `src/lib/projects/runtime-proxy.ts`, add this TypeScript code above `const PREVIEW_ANNOTATION_BRIDGE = String.raw`:

```ts
export type PreviewAnnotationCandidate = {
  annotatable?: boolean;
  className?: string;
  directText?: string;
  hasClickHandler?: boolean;
  ignored?: boolean;
  role?: string | null;
  tag: string;
  text?: string;
};

export function pickPreviewAnnotationCandidateIndex(
  candidates: PreviewAnnotationCandidate[],
) {
  const usable = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter((item) => !item.candidate.ignored);

  return (
    findCandidateIndex(usable, isPreviewInteractiveCandidate) ??
    findCandidateIndex(usable, isPreviewMediaCandidate) ??
    findCandidateIndex(usable, isPreviewTextCandidate) ??
    findCandidateIndex(usable, (candidate) =>
      Boolean(cleanPreviewAnnotationText(candidate.directText || "")),
    ) ??
    findCandidateIndex(usable, isPreviewAtomicCandidate) ??
    findCandidateIndex(usable, isPreviewContainerCandidate) ??
    usable[0]?.index ??
    -1
  );
}

function findCandidateIndex(
  candidates: Array<{ candidate: PreviewAnnotationCandidate; index: number }>,
  predicate: (candidate: PreviewAnnotationCandidate) => boolean,
) {
  return candidates.find((item) => predicate(item.candidate))?.index;
}

function isPreviewInteractiveCandidate(candidate: PreviewAnnotationCandidate) {
  return (
    /^(button|a|input|select|textarea)$/.test(candidate.tag) ||
    candidate.role === "button" ||
    Boolean(candidate.hasClickHandler)
  );
}

function isPreviewMediaCandidate(candidate: PreviewAnnotationCandidate) {
  return /^(img|picture|video|svg)$/.test(candidate.tag);
}

function isPreviewTextCandidate(candidate: PreviewAnnotationCandidate) {
  return (
    /^(h1|h2|h3|h4|h5|h6|p|label|li|blockquote|figcaption|caption|span|strong|em|b|i|small|code|pre)$/.test(
      candidate.tag,
    ) && Boolean(cleanPreviewAnnotationText(candidate.text || ""))
  );
}

function isPreviewAtomicCandidate(candidate: PreviewAnnotationCandidate) {
  if (candidate.tag === "article") {
    return true;
  }

  if (candidate.role === "listitem" || candidate.annotatable) {
    return true;
  }

  return /(^|[-_\s])(badge|card|capsule|chip|feature|item|pill|product|service|tag|tile)([-_\s]|$)/i.test(
    candidate.className || "",
  );
}

function isPreviewContainerCandidate(candidate: PreviewAnnotationCandidate) {
  return /^(section|nav|header|footer|main|aside)$/.test(candidate.tag);
}

function cleanPreviewAnnotationText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
```

- [ ] **Step 4: Run tests to verify Task 1 passes**

Run:

```bash
bun test src/lib/projects/runtime-proxy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add src/lib/projects/runtime-proxy.ts src/lib/projects/runtime-proxy.test.ts
git commit -m "test: cover preview annotation element picking"
```

### Task 2: Cover Owner Normalization And Container Fallback

**Files:**
- Modify: `src/lib/projects/runtime-proxy.test.ts`
- Modify: `src/lib/projects/runtime-proxy.ts`

**Interfaces:**
- Consumes: `pickPreviewAnnotationCandidateIndex(candidates: PreviewAnnotationCandidate[]): number` from Task 1.
- Produces: tested behavior for button/media/container target selection.

- [ ] **Step 1: Add tests for button, image, and padding fallback**

Add these tests inside `describe("preview annotation element picking", () => {` in `src/lib/projects/runtime-proxy.test.ts`:

```ts
    it("selects a button when clicking text or icon inside the button", () => {
      expect(
        pickPreviewAnnotationCandidateIndex([
          { ignored: true, tag: "svg" },
          { tag: "span", text: "Pesan sekarang" },
          { className: "primary-action", tag: "button", text: "Pesan sekarang" },
        ]),
      ).toBe(2);

      expect(
        pickPreviewAnnotationCandidateIndex([
          { tag: "span", text: "Pesan sekarang" },
          { className: "primary-action", tag: "button", text: "Pesan sekarang" },
        ]),
      ).toBe(1);
    });

    it("selects an image directly", () => {
      expect(
        pickPreviewAnnotationCandidateIndex([
          { tag: "img" },
          { tag: "section" },
        ]),
      ).toBe(0);
    });

    it("selects a card when clicking generic card padding", () => {
      expect(
        pickPreviewAnnotationCandidateIndex([
          { className: "card-padding", tag: "div" },
          { className: "product-card", tag: "article", text: "Paket hemat" },
        ]),
      ).toBe(1);
    });
```

- [ ] **Step 2: Run tests to verify behavior**

Run:

```bash
bun test src/lib/projects/runtime-proxy.test.ts
```

Expected: PASS if Task 1 implementation already covers these cases. The first button assertion marks the inner `svg` ignored because the bridge will ignore `aria-hidden="true"` before building candidate metadata; the owner button must still win over the visible span.

- [ ] **Step 3: Adjust helper only if a test fails**

If the button test fails, ensure `pickPreviewAnnotationCandidateIndex()` checks interactive candidates before media and text:

```ts
    findCandidateIndex(usable, isPreviewInteractiveCandidate) ??
    findCandidateIndex(usable, isPreviewMediaCandidate) ??
    findCandidateIndex(usable, isPreviewTextCandidate) ??
```

If the card padding test fails, ensure `isPreviewAtomicCandidate()` accepts `article` and class-name atomic blocks before semantic container fallback.

- [ ] **Step 4: Run tests after any adjustment**

Run:

```bash
bun test src/lib/projects/runtime-proxy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add src/lib/projects/runtime-proxy.ts src/lib/projects/runtime-proxy.test.ts
git commit -m "test: cover preview annotation target priorities"
```

### Task 3: Wire Helpers Into The Injected Bridge

**Files:**
- Modify: `src/lib/projects/runtime-proxy.ts`
- Modify: `src/lib/projects/runtime-proxy.test.ts`

**Interfaces:**
- Consumes: Behavior defined by Task 1 and Task 2.
- Produces: Bridge script behavior that mirrors `pickPreviewAnnotationCandidateIndex()` priorities with real DOM traversal.

- [ ] **Step 1: Add bridge string assertions for new selector path**

Update the existing `it("injects the private preview annotation bridge once", () => {` expectations in `src/lib/projects/runtime-proxy.test.ts`.

Keep existing expectations and add:

```ts
    expect(html).toContain("function deepElementFromPoint");
    expect(html).toContain("function pickElement");
    expect(html).toContain("lastHoverTarget");
    expect(html).toContain("Date.now() - lastHoverTarget.timestamp <= 250");
```

- [ ] **Step 2: Run tests to verify bridge assertions fail**

Run:

```bash
bun test src/lib/projects/runtime-proxy.test.ts
```

Expected: FAIL because the injected bridge still uses `elementAt()` and does not contain the new helper names/cache.

- [ ] **Step 3: Replace bridge hit-test helpers**

Inside `PREVIEW_ANNOTATION_BRIDGE` in `src/lib/projects/runtime-proxy.ts`, replace the existing `elementAt()`, `shouldIgnore()`, `meaningfulElement()`, `isLeafTarget()`, `isTextOnlyElement()`, `closestAtomicBlock()`, `isAtomicBlock()`, and `isInlineAtomicBlock()` functions with this bridge-local code:

```js
  let lastHoverTarget = null;

  function deepElementFromPoint(x, y) {
    let element = document.elementFromPoint(x, y);
    while (element instanceof HTMLElement && element.shadowRoot) {
      const deeper = element.shadowRoot.elementFromPoint(x, y);
      if (!deeper || deeper === element) break;
      element = deeper;
    }
    return element instanceof HTMLElement ? element : null;
  }

  function elementAt(x, y) {
    const element = deepElementFromPoint(x, y);
    return element ? pickElement(element) : null;
  }

  function pickElement(element) {
    if (isBridgeUi(element)) return null;

    const interactive = closestElement(element, 'button,a,input,select,textarea,[role="button"],[onclick]');
    if (interactive) return interactive;

    const media = closestElement(element, 'img,picture,video,svg');
    if (media && !isIgnorableDecoration(media)) return media;

    const text = closestElement(element, 'h1,h2,h3,h4,h5,h6,p,label,li,blockquote,figcaption,caption,span,strong,em,b,i,small,code,pre');
    if (text && !isIgnorableDecoration(text) && clean(text.innerText || text.textContent || '')) return text;

    if (!isIgnorableDecoration(element) && hasDirectText(element)) return element;

    const atomic = closestAtomicBlock(element);
    if (atomic) return atomic;

    const container = closestElement(element, 'section,nav,header,footer,main,aside,[aria-label]');
    return container || element;
  }

  function closestElement(element, selector) {
    let current = element;
    while (current && current !== document.body) {
      if (current instanceof HTMLElement && current.matches(selector) && !isBridgeUi(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function isBridgeUi(element) {
    if (element.closest('.umkm-annotation-marker,.umkm-annotation-hover')) return true;
    return false;
  }

  function isIgnorableDecoration(element) {
    if (element.getAttribute('aria-hidden') === 'true') return true;

    const className = typeof element.className === 'string' ? element.className : '';
    const isDecoration = /(backdrop|decoration|gradient|glow|overlay|veil)/i.test(className);
    const hasText = Boolean(clean(element.innerText || element.textContent || ''));
    const isInteractive = element.matches('a,button,input,select,textarea,[role="button"],[onclick]');

    return isDecoration && !hasText && !isInteractive;
  }

  function hasDirectText(element) {
    return Array.from(element.childNodes).some((node) =>
      node.nodeType === Node.TEXT_NODE && clean(node.textContent || ''),
    );
  }

  function closestAtomicBlock(element) {
    let current = element;
    while (current && current !== document.body) {
      if (current instanceof HTMLElement && !isIgnorableDecoration(current) && isAtomicBlock(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function isAtomicBlock(element) {
    if (element.matches('article,[role="listitem"],[data-umkm-annotatable]')) return true;

    const className = typeof element.className === 'string' ? element.className : '';
    return /(^|[-_\\s])(badge|card|capsule|chip|feature|item|pill|product|service|tag|tile)([-_\\s]|$)/i.test(className);
  }

  function pointInRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function recentHoverTargetAt(x, y) {
    if (!lastHoverTarget) return null;
    if (!document.contains(lastHoverTarget.element)) return null;
    if (Date.now() - lastHoverTarget.timestamp > 250) return null;

    const rect = lastHoverTarget.selectionRect || lastHoverTarget.rect;
    return pointInRect(x, y, rect) ? lastHoverTarget : null;
  }
```

- [ ] **Step 4: Update bridge hover/click functions to use cache**

In `handleMove(event)` inside `PREVIEW_ANNOTATION_BRIDGE`, replace its body after the `if (!active) return;` guard with:

```js
    const selection = selectionAt(event.clientX, event.clientY);
    const element = selection ? selection.target : elementAt(event.clientX, event.clientY);
    if (!element) {
      lastHoverTarget = null;
      hideHoverBox();
      return;
    }

    const rect = selection ? selection.rect : element.getBoundingClientRect();
    lastHoverTarget = {
      element,
      rect: element.getBoundingClientRect(),
      selectedText: selection ? selection.text : undefined,
      selectionRect: selection ? selection.rect : undefined,
      timestamp: Date.now(),
    };
    setHoverBox(rect);
    window.parent.postMessage({ type: 'umkmcepat-annotation-hover', payload: targetData(element, selection) }, PARENT_ORIGIN);
```

In `handleClick(event)` inside `PREVIEW_ANNOTATION_BRIDGE`, replace target computation with:

```js
    const hovered = recentHoverTargetAt(event.clientX, event.clientY);
    const selection = selectionAt(event.clientX, event.clientY);
    const element = selection
      ? selection.target
      : hovered
        ? hovered.element
        : elementAt(event.clientX, event.clientY);
    if (!element) return;
    window.parent.postMessage({ type: 'umkmcepat-annotation-target', payload: targetData(element, selection) }, PARENT_ORIGIN);
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
bun test src/lib/projects/runtime-proxy.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add src/lib/projects/runtime-proxy.ts src/lib/projects/runtime-proxy.test.ts
git commit -m "fix: make preview edit selector target direct elements"
```

### Task 4: Manual Preview Sanity Check And Final Gate

**Files:**
- Modify: no source files expected unless Task 4 reveals a defect.

**Interfaces:**
- Consumes: Updated injected bridge from Task 3.
  - `GeneratedPreviewFrame` continues posting `umkmcepat-annotation-mode` and receives `umkmcepat-annotation-target`.
  - `WorkspaceShell` continues creating annotations with unchanged target shape.
- Produces: Verified implementation ready for handoff.

- [ ] **Step 1: Run the focused test**

Run:

```bash
bun test src/lib/projects/runtime-proxy.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the project check**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 3: Manually sanity-check if local preview data is available**

If the dev server and a generated project are available, open the workspace preview, activate `Ubah`, and verify:

- Clicking a heading inside a large hero section highlights/selects the heading.
- Clicking paragraph text inside a card selects the paragraph.
- Clicking empty card padding selects the card.
- Clicking button text/icon selects the button without triggering navigation/action.
- Clicking an image enables the existing image replacement affordance.

If local preview data is not available, record that manual preview was not run and rely on the focused DOM tests plus `bun run check`.

- [ ] **Step 4: Commit any follow-up test/code fix from manual sanity check**

If manual sanity check reveals a defect, make the smallest fix and run:

```bash
bun test src/lib/projects/runtime-proxy.test.ts
bun run check
```

Expected: PASS.

Then commit:

```bash
git add src/lib/projects/runtime-proxy.ts src/lib/projects/runtime-proxy.test.ts
git commit -m "fix: stabilize preview annotation hit testing"
```

If no follow-up fix is needed, do not create an empty commit.

## Self-Review

Spec coverage:

- Inner target selection is covered by Task 1 and Task 2.
- Interactive owner selection is covered by Task 2.
- Container fallback is covered by Task 2.
- Hover/click consistency is covered by Task 3.
- Payload compatibility is preserved by Task 3 because `targetData()` and postMessage type remain unchanged.
- Verification is covered by Task 4.

Placeholder scan:

- No task uses TBD, vague TODOs, or undefined interfaces.
- Conditional adjustment steps include exact code and commands.

Type consistency:

- `pickPreviewAnnotationCandidateIndex` and `PreviewAnnotationCandidate` names are consistent across tasks.
- Test imports match the produced helper names.
