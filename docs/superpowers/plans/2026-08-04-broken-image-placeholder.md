# Broken-Image Placeholder Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any loaded-but-failing `<img>` in a generated preview or published site swaps to a neutral, aspect-aware placeholder (landscape or vertical) via an injected capture-phase error listener backed by data-URIs, so it works for all projects including old builds with no placeholder file in their dist.

**Architecture:** A single `placeholders.ts` owns both SVG strings (landscape `600×400`, new portrait `400×600`) and their base64 data-URIs. The scaffold imports them to emit `public/placeholder.svg` + `public/placeholder-vertical.svg`. The runtime proxy injects a capture-phase `error` listener into preview and published HTML that swaps a failed `<img>` to an aspect-aware data-URI, with a `dataset` guard to prevent loops. A pure helper selects landscape vs vertical from rendered dimensions so it is testable in Node.

**Tech Stack:** Bun, TypeScript, TanStack Start server routes, Vitest, Node `renderToStaticMarkup` / string assertions.

## Global Constraints

- Use Bun only; keep `bun.lock` as the canonical lockfile.
- Keep changes small, focused, and easy to review.
- User-facing product UI copy uses Indonesian; developer-facing docs/code/logs/errors use English.
- Do not add dependencies.
- Do not change the annotation bridge's existing behavior or payload shape.
- Do not backfill placeholder files into existing dist artifacts in MinIO.
- Before handoff, run `bun run check` explicitly.
- Docs are part of the change: update `DEV.md` in the same diff.

---

## File Structure

- Create: `src/lib/projects/placeholders.ts`
  - Owns `LANDSCAPE_PLACEHOLDER_SVG`, `PORTRAIT_PLACEHOLDER_SVG`, `PLACEHOLDER_DATA_URIS`, and a pure aspect picker `pickPlaceholderDataUri`.
- Modify: `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts`
  - Import placeholder constants; emit `public/placeholder-vertical.svg`; remove the local `PLACEHOLDER_SVG`.
- Modify: `src/lib/projects/scaffold/scaffold.test.ts`
  - Assert both `public/placeholder.svg` and `public/placeholder-vertical.svg` are emitted.
- Create: `src/lib/projects/placeholders.test.ts`
  - Assert SVGs, data-URIs, and the aspect picker.
- Modify: `src/lib/projects/runtime-proxy.ts`
  - Inject the fallback script into preview and published HTML; export the aspect picker.
- Modify: `src/lib/projects/runtime-proxy.test.ts`
  - Assert injection in both paths and the aspect picker.
- Modify: `src/lib/projects/custom-source-generator.ts`, `src/lib/projects/skills/generated-app-builder.md`
  - Generation guidance: landscape vs vertical placeholder.
- Modify: `DEV.md`
  - Note the runtime fallback.

---

### Task 1: Placeholder source of truth

**Files:**
- Create: `src/lib/projects/placeholders.ts`
- Create: `src/lib/projects/placeholders.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export const LANDSCAPE_PLACEHOLDER_SVG: string`
  - `export const PORTRAIT_PLACEHOLDER_SVG: string`
  - `export type PlaceholderKind = "landscape" | "portrait"`
  - `export const PLACEHOLDER_DATA_URIS: Record<PlaceholderKind, string>`
  - `export function pickPlaceholderDataUri(width: number, height: number): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/projects/placeholders.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  LANDSCAPE_PLACEHOLDER_SVG,
  PLACEHOLDER_DATA_URIS,
  pickPlaceholderDataUri,
  PORTRAIT_PLACEHOLDER_SVG,
} from "./placeholders";

describe("placeholder assets", () => {
  it("exports landscape and portrait SVGs with neutral copy", () => {
    expect(LANDSCAPE_PLACEHOLDER_SVG).toContain('viewBox="0 0 600 400"');
    expect(LANDSCAPE_PLACEHOLDER_SVG).toContain("Tidak ada foto");
    expect(LANDSCAPE_PLACEHOLDER_SVG).toContain("</svg>");
    expect(PORTRAIT_PLACEHOLDER_SVG).toContain('viewBox="0 0 400 600"');
    expect(PORTRAIT_PLACEHOLDER_SVG).toContain("Tidak ada foto");
    expect(PORTRAIT_PLACEHOLDER_SVG).toContain("</svg>");
  });

  it("exposes both kinds as data URIs", () => {
    expect(PLACEHOLDER_DATA_URIS.landscape).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(PLACEHOLDER_DATA_URIS.portrait).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(PLACEHOLDER_DATA_URIS.landscape).not.toBe(PLACEHOLDER_DATA_URIS.portrait);
  });

  it("picks portrait for tall images and landscape for wide images", () => {
    expect(pickPlaceholderDataUri(300, 600)).toBe(PLACEHOLDER_DATA_URIS.portrait);
    expect(pickPlaceholderDataUri(600, 300)).toBe(PLACEHOLDER_DATA_URIS.landscape);
    expect(pickPlaceholderDataUri(400, 400)).toBe(PLACEHOLDER_DATA_URIS.landscape);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test src/lib/projects/placeholders.test.ts`
Expected: FAIL — module `./placeholders` not found.

- [ ] **Step 3: Implement `placeholders.ts`**

Create `src/lib/projects/placeholders.ts`:

```ts
export type PlaceholderKind = "landscape" | "portrait";

const LANDSCAPE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" role="img" aria-labelledby="title description">
  <title id="title">Tidak ada foto</title>
  <desc id="description">Tempat untuk foto yang akan ditambahkan pemilik usaha</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#f5f1ea" />
      <stop offset="1" stop-color="#e4ddd2" />
    </linearGradient>
  </defs>
  <rect width="600" height="400" fill="url(#background)" />
  <circle cx="300" cy="170" r="42" fill="none" stroke="#8c8174" stroke-width="3" />
  <path d="m274 181 17-18 15 14 12-10 18 14" fill="none" stroke="#8c8174" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  <text x="300" y="250" fill="#655c52" font-family="system-ui, sans-serif" font-size="20" font-weight="600" text-anchor="middle">Tidak ada foto</text>
</svg>`;

const PORTRAIT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" role="img" aria-labelledby="title description">
  <title id="title">Tidak ada foto</title>
  <desc id="description">Tempat untuk foto yang akan ditambahkan pemilik usaha</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#f5f1ea" />
      <stop offset="1" stop-color="#e4ddd2" />
    </linearGradient>
  </defs>
  <rect width="400" height="600" fill="url(#background)" />
  <circle cx="200" cy="230" r="48" fill="none" stroke="#8c8174" stroke-width="3" />
  <path d="m170 244 19-21 17 16 14-12 20 16" fill="none" stroke="#8c8174" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  <text x="200" y="330" fill="#655c52" font-family="system-ui, sans-serif" font-size="22" font-weight="600" text-anchor="middle">Tidak ada foto</text>
</svg>`;

export const LANDSCAPE_PLACEHOLDER_SVG = LANDSCAPE_SVG;
export const PORTRAIT_PLACEHOLDER_SVG = PORTRAIT_SVG;

export const PLACEHOLDER_DATA_URIS: Record<PlaceholderKind, string> = {
  landscape: `data:image/svg+xml;base64,${Buffer.from(LANDSCAPE_SVG).toString("base64")}`,
  portrait: `data:image/svg+xml;base64,${Buffer.from(PORTRAIT_SVG).toString("base64")}`,
};

export function pickPlaceholderDataUri(width: number, height: number): string {
  return height > width
    ? PLACEHOLDER_DATA_URIS.portrait
    : PLACEHOLDER_DATA_URIS.landscape;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test src/lib/projects/placeholders.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/placeholders.ts src/lib/projects/placeholders.test.ts
git commit -m "feat(projects): shared landscape + portrait placeholder source"
```

---

### Task 2: Scaffold emits vertical placeholder

**Files:**
- Modify: `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts`
- Modify: `src/lib/projects/scaffold/scaffold.test.ts`

**Interfaces:**
- Consumes: `LANDSCAPE_PLACEHOLDER_SVG`, `PORTRAIT_PLACEHOLDER_SVG` from `@/lib/projects/placeholders`.
- Produces: generated starter files now include `public/placeholder.svg` and `public/placeholder-vertical.svg`.

- [ ] **Step 1: Write the failing test**

In `src/lib/projects/scaffold/scaffold.test.ts`, inside the `describe("scaffold local placeholder asset", ...)` block, add:

```ts
  it("includes a portrait public/placeholder-vertical.svg", () => {
    const files = createViteTanStackShadcnStarterFiles(
      "proj_placeholder",
      schema(),
    );
    const placeholder = files.find(
      (f) => f.path === "public/placeholder-vertical.svg",
    );

    expect(placeholder).toBeDefined();
    expect(placeholder!.content).toContain('viewBox="0 0 400 600"');
    expect(placeholder!.content).toContain("Tidak ada foto");
    expect(placeholder!.content).toContain("</svg>");
    expect(placeholder!.content).not.toContain("Test Biz");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test src/lib/projects/scaffold/scaffold.test.ts`
Expected: FAIL — `public/placeholder-vertical.svg` undefined.

- [ ] **Step 3: Update the starter**

In `src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts`:
- Add the import at the top:

```ts
import {
  LANDSCAPE_PLACEHOLDER_SVG,
  PORTRAIT_PLACEHOLDER_SVG,
} from "@/lib/projects/placeholders";
```

- Delete the local `const PLACEHOLDER_SVG = ...` block (lines ~13-26).
- In `createViteTanStackShadcnStarterFiles`, replace line 45:

```ts
    { path: "public/placeholder.svg", content: LANDSCAPE_PLACEHOLDER_SVG },
```

with:

```ts
    { path: "public/placeholder.svg", content: LANDSCAPE_PLACEHOLDER_SVG },
    {
      path: "public/placeholder-vertical.svg",
      content: PORTRAIT_PLACEHOLDER_SVG,
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test src/lib/projects/scaffold/scaffold.test.ts src/lib/projects/placeholders.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/scaffold/vite-tanstack-shadcn-starter.ts src/lib/projects/scaffold/scaffold.test.ts
git commit -m "feat(scaffold): emit portrait placeholder alongside landscape"
```

---

### Task 3: Inject broken-image fallback into preview + published HTML

**Files:**
- Modify: `src/lib/projects/runtime-proxy.ts`
- Modify: `src/lib/projects/runtime-proxy.test.ts`

**Interfaces:**
- Consumes: `PLACEHOLDER_DATA_URIS`, `pickPlaceholderDataUri` from `@/lib/projects/placeholders`.
- Produces: `injectPreviewAnnotationBridge` and `injectPublishedHead` now append an image-fallback script; a new exported helper `export function buildImageFallbackScript(): string` and `export function pickPlaceholderDataUri(...)` (re-export) for tests.

- [ ] **Step 1: Write the failing tests**

In `src/lib/projects/runtime-proxy.test.ts`, add imports for the new helpers:

```ts
import {
  applyPreviewSandboxHeaders,
  buildImageFallbackScript,
  injectPreviewAnnotationBridge,
  injectPublishedHead,
  pickPreviewAnnotationCandidateIndex,
  pickPlaceholderDataUri,
  proxyDeploymentRequest,
  rewritePreviewAssetUrls,
  rewritePublicAssetUrls,
} from "@/lib/projects/runtime-proxy";
```

Add tests:

```ts
  it("injects an image-fallback listener into preview HTML", () => {
    const html = "<html><body><main></main></body></html>";
    const res = injectPreviewAnnotationBridge(html);
    expect(res).toContain("umkm-image-fallback");
    expect(res).toContain("addEventListener('error'");
  });

  it("injects an image-fallback listener into published HTML", () => {
    const html = "<html><head></head><body></body></html>";
    const res = injectPublishedHead(html, {
      businessName: "Usaha",
      noindex: false,
      slug: "usaha",
    });
    expect(res).toContain("umkm-image-fallback");
    expect(res).toContain("addEventListener('error'");
  });

  it("builds an aspect-aware fallback script with data URIs", () => {
    const script = buildImageFallbackScript();
    expect(script).toContain("data:image/svg+xml;base64,");
    expect(script).toContain("clientHeight");
    expect(script).toContain("clientWidth");
    expect(script).toContain("dataset");
  });

  it("picks a portrait data URI for tall images", () => {
    const dataUris = pickPlaceholderDataUri(200, 500);
    expect(dataUris).toMatch(/^data:image\/svg\+xml;base64,/);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test src/lib/projects/runtime-proxy.test.ts`
Expected: FAIL — `buildImageFallbackScript` and `pickPlaceholderDataUri` not exported.

- [ ] **Step 3: Implement the fallback script**

In `src/lib/projects/runtime-proxy.ts`:

- Add the import at the top:

```ts
import {
  PLACEHOLDER_DATA_URIS,
  pickPlaceholderDataUri,
} from "@/lib/projects/placeholders";
```

- Add a re-export (so the route test can import it from the proxy module):

```ts
export { pickPlaceholderDataUri };
```

- Add a module-level script builder after `injectPublishedHead`:

```ts
export function buildImageFallbackScript(): string {
  return `<script data-umkm-image-fallback>(() => {
  const LANDSCAPE = ${JSON.stringify(PLACEHOLDER_DATA_URIS.landscape)};
  const PORTRAIT = ${JSON.stringify(PLACEHOLDER_DATA_URIS.portrait)};
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (!t || t.tagName !== 'IMG' || t.dataset.umkmPlaceholder) return;
    t.dataset.umkmPlaceholder = '1';
    t.src = t.clientHeight > t.clientWidth ? PORTRAIT : LANDSCAPE;
  }, true);
})();</script>`;
}
```

- In `injectPreviewAnnotationBridge`, append the fallback script after the annotation bridge script. Replace the return block:

```ts
  const script = `<script data-umkm-annotation-bridge data-umkm-origin="${origin}">${PREVIEW_ANNOTATION_BRIDGE}</script>`;
  const fallback = buildImageFallbackScript();

  if (html.includes("data-umkm-annotation-bridge")) {
    return html;
  }

  const injected = html.includes("</body>")
    ? html.replace("</body>", `${script}${fallback}</body>`)
    : `${html}${script}${fallback}`;
  return injected;
```

- In `injectPublishedHead`, append the fallback inside the `headInjection` array. Change the return from `html.replace(/<head>/i, ...)` to also prepend the fallback script:

```ts
  const fallback = buildImageFallbackScript();
  return html.replace(
    /<head>/i,
    `<head>\n    ${fallback}\n    ${headInjection}`,
  );
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test src/lib/projects/runtime-proxy.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/runtime-proxy.ts src/lib/projects/runtime-proxy.test.ts
git commit -m "feat(projects): inject broken-image placeholder fallback into preview and published HTML"
```

---

### Task 4: Generation guidance for landscape vs vertical

**Files:**
- Modify: `src/lib/projects/custom-source-generator.ts`
- Modify: `src/lib/projects/skills/generated-app-builder.md`

**Interfaces:**
- Consumes: the new `public/placeholder-vertical.svg` asset from Task 2.
- Produces: updated prompt copy telling the agent to choose placeholder by slot aspect.

- [ ] **Step 1: Update the MISSING IMAGES rule**

In `src/lib/projects/custom-source-generator.ts`, replace the `MISSING IMAGES:` line (line ~2453):

```ts
MISSING IMAGES: use <img src="/placeholder.svg" alt="<short description>" /> for landscape/wide image slots, and <img src="/placeholder-vertical.svg" alt="<short description>" /> for portrait/tall slots, only when an image slot is structurally necessary and no owner image exists. Alt text is supplied at use site. Never use remote placeholder URLs. For typographic layouts, prefer omitting the image slot instead of adding a gratuitous placeholder.
```

- [ ] **Step 2: Update the agent builder doc**

In `src/lib/projects/skills/generated-app-builder.md`, after line 63 ("Write real Indonesian customer-facing copy, not placeholders"), add:

```markdown
- For missing images, use `/placeholder.svg` in wide/landscape slots and `/placeholder-vertical.svg` in tall/portrait slots (both ship with the scaffold). Never use remote placeholder URLs.
```

- [ ] **Step 3: Run affected tests**

Run: `bun run test src/lib/projects/custom-source-generator.test.ts`
Expected: PASS (existing tests unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/lib/projects/custom-source-generator.ts src/lib/projects/skills/generated-app-builder.md
git commit -m "docs(projects): guide landscape vs vertical placeholder choice"
```

---

### Task 5: DEV.md note

**Files:**
- Modify: `DEV.md`

- [ ] **Step 1: Add a runtime fallback note**

In `DEV.md`, after the runtime self-heal paragraph (added by the runtime-recovery change), add:

```markdown
Generated previews/published sites inject a capture-phase error listener that
swaps a failing `<img>` to an aspect-aware placeholder data-URI (landscape vs
portrait), so broken images never show a browser error icon and work even for
old builds whose dist lacks a placeholder file.
```

- [ ] **Step 2: Commit**

```bash
git add DEV.md
git commit -m "docs(dev): note broken-image placeholder fallback"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run the local quality gate**

Run: `bun run check`
Expected: PASS (format, lint, typecheck, tests, Knip, docs). Fix any failures before proceeding.
