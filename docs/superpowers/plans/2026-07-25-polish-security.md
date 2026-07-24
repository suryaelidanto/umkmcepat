# Polish + Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roll back to a consistent dark chrome, ship SEO-maxed homepage copy + JSON-LD `@graph`, and tighten the 4 error-leak sites + 3 crypto/upload hardening items. Behavior on the happy path unchanged; error paths return generic Indonesian instead of raw internals.

**Architecture:** Dark-bg fixes in `__root`/`MainChrome`/NotFound; copy + schema in `__root` + `_main.index` + the H1 component (animated `100% gratis` underline); a shared `mapToUserFacingError` mapper wired into the leak sites; crypto/upload/postMessage/PATH/lockfile hardening. The OTP-route error-leak fix folds into topic 7's email/OTP plan (same routes).

**Tech Stack:** Bun, TypeScript, Framer Motion (`motion`, already a dep), React, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-25-polish-security-design.md`

## Global Constraints

- Behavior on the happy path must not change; the error-path changes are intended improvements (generic Indonesian, not raw internals).
- No theme toggle. Chrome is dark `#151515` by design; white buttons + preview iframe are intentional accents.
- SEO copy is the locked Direction B verbatim (H1/sub/title/meta/tagline) — do not paraphrase.
- JSON-LD `@graph` includes NO `aggregateRating` (manual-penalty risk until real reviews).
- `.env`/`.env.example` 1:1 (no new env vars in this spec).
- Visible product copy Indonesian; code/comments English.
- TDD + frequent atomic commits to `dev`. Conventional-commit, body ≤100 chars, `Co-Authored-By: Claude <noreply@anthropic.com>`.

---

## File Structure

- **Modify** `src/routes/__root.tsx` — dark body bg; new `<title>`/meta; `@graph` JSON-LD.
- **Modify** `src/components/common/MainChrome.tsx` — dark bg on spinner + chrome wrapper.
- **Modify** `src/routes/_main.index.tsx` — H1 + sub (logged-out variant).
- **Modify** `src/components/home/HeroContentMotion.tsx` (or the H1 wrapper) — animated `100% gratis` underline.
- **Create** `src/lib/user-facing-error.ts` — `mapToUserFacingError(reason): string`.
- **Create** `src/lib/user-facing-error.test.ts`.
- **Modify** `src/routes/api.payment.create.ts:88` — generic Indonesian, no raw Pakasir.
- **Modify** `src/routes/api.projects.preview.ts:505` — generic stream-error in prod.
- **Modify** `src/routes/api.projects.$id.runtime-events.ts:40` — omit/sanitize raw `message`.
- **Modify** `src/lib/otp.ts:8` — `crypto.randomInt`.
- **Modify** `src/routes/api.waitlist.ts` — magic-byte validation.
- **Modify** `src/lib/projects/runtime-proxy.ts:451,461` — postMessage target origin.
- **Modify** `src/lib/projects/generated-source.ts:450,370` — narrow build PATH + frozen-lockfile.

---

### Task 1: Dark chrome rollback

**Files:**
- Modify: `src/routes/__root.tsx:103,69`
- Modify: `src/components/common/MainChrome.tsx:109,122`

**Interfaces:** N/A — bg class swap.

- [ ] **Step 1: Body root → dark**

`__root.tsx:103` body className: `bg-surface-warm-white` → `bg-[#151515]`. Keep `text-surface-warm-white` so text stays light. NotFound (`:69`) same swap.

- [ ] **Step 2: MainChrome → dark**

`MainChrome.tsx:109` (spinner) + `:122` (chrome wrapper): `bg-surface-warm-white` → `bg-[#151515]`.

- [ ] **Step 3: Run the fast gate**

Run: `bun run check`
Expected: all green (no test asserts bg color, but typecheck/lint/format/Knip must pass).

- [ ] **Step 4: Commit**

```bash
git add src/routes/__root.tsx src/components/common/MainChrome.tsx
git commit -m "fix(chrome): roll back to dark #151515 (body/MainChrome/NotFound)"
```

---

### Task 2: SEO-maxed homepage copy + JSON-LD @graph

**Files:**
- Modify: `src/routes/__root.tsx` (title/meta/JSON-LD)
- Modify: `src/routes/_main.index.tsx` (H1 + sub)
- Modify: `src/components/home/HeroContentMotion.tsx` (animated underline)

**Interfaces:** N/A — copy + schema swap.

- [ ] **Step 1: Title + meta + JSON-LD in __root.tsx**

Replace the `siteTitle`/`siteDescription`/`jsonLd` block (`__root.tsx:17-26`):

```ts
const siteUrl = "https://umkmcepat.com";
const siteTitle = "Buat Website UMKM Gratis – AI 5 Menit | UMKM Cepat";
const siteDescription =
  "Buat website UMKM gratis yang datangkan pembeli dari Google & WhatsApp, terima QRIS. AI susun 5 menit, tanpa ngoding. Mulai — gratis.";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "UMKM Cepat",
      url: siteUrl,
      logo: `${siteUrl}/brand/umkmcepat-logo.svg`,
      sameAs: ["https://github.com/suryaelidanto/umkmcepat"],
    },
    {
      "@type": "WebSite",
      name: "UMKM Cepat",
      url: siteUrl,
      description: siteDescription,
      potentialAction: {
        "@type": "SearchAction",
        "target": `${siteUrl}/?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "SoftwareApplication",
      name: "UMKM Cepat",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: siteUrl,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "IDR",
      },
    },
  ],
};
```

Confirm the `siteTitle`/`siteDescription` are referenced in the `head()` `meta`/`title` block; update those references to the new strings.

- [ ] **Step 2: H1 + sub in _main.index.tsx**

Logged-out H1 (`_main.index.tsx:185-202`): replace with:

```tsx
<h1>Website yang bikin usahamu ketemu pembeli. <span className="relative inline-block">
  <span className="relative z-10">100% gratis.</span>
  <span className="absolute inset-x-0 bottom-0 h-1.5 bg-gradient-to-r from-emerald-400 to-cyan-400 motion-safe:animate-[draw_0.6s_ease-out_both]" />
</span></h1>
<p>Tulis aja usahamu — warung, toko, jasa. AI susun website yang siap dibagikan ke Google & WhatsApp, terima QRIS, dan bikin pelanggan gampang nemu kamu. Tanpa ngoding.</p>
```

Add the `draw` keyframe to `src/styles/globals.css` if not present (or use Framer Motion `whileInView` on the underline span — confirm the existing H1 wrapper's animation approach in `HeroContentMotion.tsx` and match it).

- [ ] **Step 3: Tagline** — add `Website UMKM yang ketemu pembeli.` near the wordmark/footer if a tagline slot exists; if not, skip (the `<title>` carries it).

- [ ] **Step 4: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/routes/__root.tsx src/routes/_main.index.tsx src/components/home/HeroContentMotion.tsx src/styles/globals.css
git commit -m "feat(seo): homepage copy (Direction B) + JSON-LD @graph"
```

---

### Task 3: Shared user-facing-error mapper

**Files:**
- Create: `src/lib/user-facing-error.ts`
- Create: `src/lib/user-facing-error.test.ts`

**Interfaces:**
- Produces: `mapToUserFacingError(reason: string): string` — known backend reason → Indonesian; unknown → `Permintaan belum bisa diproses. Coba lagi nanti.` (never the raw string).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { mapToUserFacingError } from "@/lib/user-facing-error";

describe("mapToUserFacingError", () => {
  it("maps a known Pakasir reason to Indonesian", () => {
    expect(mapToUserFacingError("Pakasir create transaction failed with status 500: upstream error")).toBe(
      "Pembayaran gagal. Coba lagi.",
    );
  });
  it("returns a generic fallback for unknown reasons (never the raw string)", () => {
    expect(mapToUserFacingError("some internal postgres error: relation users_xyz")).toBe(
      "Permintaan belum bisa diproses. Coba lagi nanti.",
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** `mapToUserFacingError` — a map of known reason substrings → Indonesian strings; default fallback. (Keep it small; extend as leak sites surface patterns.)

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/user-facing-error.ts src/lib/user-facing-error.test.ts
git commit -m "feat(error): mapToUserFacingError (generic Indonesian, never raw)"
```

---

### Task 4: Wire the mapper into the 3 leak sites (OTP routes handled in topic 7)

**Files:**
- Modify: `src/routes/api.payment.create.ts:88`
- Modify: `src/routes/api.projects.preview.ts:505`
- Modify: `src/routes/api.projects.$id.runtime-events.ts:40`

**Interfaces:**
- Consumes: `mapToUserFacingError` (Task 3).

- [ ] **Step 1: api.payment.create.ts** — replace `error.message` echo with `mapToUserFacingError(error.message)` + log raw server-side.

- [ ] **Step 2: api.projects.preview.ts:505** — `onError` returns `mapToUserFacingError(error.message)` in prod; raw only in dev logs.

- [ ] **Step 3: api.projects.$id.runtime-events.ts:40** — drop `message` from the `select` (or sanitize via `getIndonesianBuildFailureSummary`); confirm no client consumes it first (`grep -rn "event.message\|\.message" src/components/projects/WorkspaceShell.tsx`).

- [ ] **Step 4: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.payment.create.ts src/routes/api.projects.preview.ts src/routes/api.projects.\$id.runtime-events.ts
git commit -m "fix(error): route leak sites through mapToUserFacingError"
```

---

### Task 5: OTP crypto + waitlist magic-byte

**Files:**
- Modify: `src/lib/otp.ts:8`
- Modify: `src/routes/api.waitlist.ts` (image upload block)

- [ ] **Step 1: OTP crypto** — `Math.random()` → `crypto.randomInt(0, 1_000_000).toString().padStart(6, "0")` (import `randomInt` from `node:crypto`).

- [ ] **Step 2: Waitlist magic-byte** — in `api.waitlist.ts` after the size check, reuse `detectImageFormat` from `@/lib/projects/project-assets`; reject non-images even if `file.type` claims `image/png`.

- [ ] **Step 3: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/otp.ts src/routes/api.waitlist.ts
git commit -m "fix(security): crypto.randomInt OTP + waitlist image magic-byte validation"
```

---

### Task 6: Generated-site sandbox hardening

**Files:**
- Modify: `src/lib/projects/runtime-proxy.ts:451,461`
- Modify: `src/lib/projects/generated-source.ts:450,370`

- [ ] **Step 1: postMessage origin** — replace `postMessage(payload, '*')` with `postMessage(payload, controlPlaneOrigin)` where `controlPlaneOrigin` is the parent window origin (pass it in via the bridge script's data attribute or `NEXT_PUBLIC_APP_URL`).

- [ ] **Step 2: Narrow build PATH** — in the build child `env`, set `PATH` to the bun bin dir + standard system dirs (`/usr/local/bin:/usr/bin:/bin`) rather than inheriting the full `process.env.PATH`.

- [ ] **Step 3: Frozen lockfile** — after package-policy validation, if a `bun.lock` exists in the workspace, run `bun install --frozen-lockfile`; else enforce lockfile presence before install.

- [ ] **Step 4: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/runtime-proxy.ts src/lib/projects/generated-source.ts
git commit -m "fix(security): postMessage origin + narrow build PATH + frozen-lockfile"
```

---

### Task 7: Manual E2E

Not committed — verification.

- [ ] **Step 1:** Homepage renders dark (no cream); H1 + animated `100% gratis` underline; sub copy; `<title>`/meta via view-source; JSON-LD `@graph` validates at search.google.com/test/rich-results.
- [ ] **Step 2:** Trigger a Pakasir error + a preview stream error → user sees Indonesian generic, never raw internals.
- [ ] **Step 3:** OTP code is 6 digits, generated via `crypto.randomInt` (inspect devLog).
- [ ] **Step 4:** Upload a non-image claiming `image/png` to `/api/waitlist` → rejected.
- [ ] **Step 5:** `bun run check` green.

---

## Post-implementation

- The OTP-route error-leak fix lands in topic 7's plan (same routes); this plan's Task 4 skips them to avoid double-touching.
- The non-image `selectorPath` brittleness remains flagged (photo-upload spec).
