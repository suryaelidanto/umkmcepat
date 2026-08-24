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

- [x] **Step 1: Body root → dark**

`__root.tsx:103` body className: `bg-surface-warm-white` → `bg-[#151515]`. Keep `text-surface-warm-white` so text stays light. NotFound (`:69`) same swap.

- [x] **Step 2: MainChrome → dark**

`MainChrome.tsx:109` (spinner) + `:122` (chrome wrapper): `bg-surface-warm-white` → `bg-[#151515]`.

- [x] **Step 3: Run the fast gate**

Run: `bun run check`
Expected: all green (no test asserts bg color, but typecheck/lint/format/Knip must pass).

- [x] **Step 4: Commit**

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

- [x] **Step 1: Title + meta + JSON-LD in __root.tsx**

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

- [x] **Step 2: H1 + sub in _main.index.tsx**

Logged-out H1 (`_main.index.tsx:185-202`): replace with:

```tsx
<h1>Website yang bikin usahamu ketemu pembeli. <span className="relative inline-block">
  <span className="relative z-10">100% gratis.</span>
  <span className="absolute inset-x-0 bottom-0 h-1.5 bg-gradient-to-r from-emerald-400 to-cyan-400 motion-safe:animate-[draw_0.6s_ease-out_both]" />
</span></h1>
<p>Tulis aja usahamu — warung, toko, jasa. AI susun website yang siap dibagikan ke Google & WhatsApp, terima QRIS, dan bikin pelanggan gampang nemu kamu. Tanpa ngoding.</p>
```

Add the `draw` keyframe to `src/styles/globals.css` if not present (or use Framer Motion `whileInView` on the underline span — confirm the existing H1 wrapper's animation approach in `HeroContentMotion.tsx` and match it).

- [x] **Step 3: Tagline** — add `Website UMKM yang ketemu pembeli.` near the wordmark/footer if a tagline slot exists; if not, skip (the `<title>` carries it).

- [x] **Step 4: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [x] **Step 5: Commit**

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

- [x] **Step 1: Write the failing test**

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

- [x] **Step 2: Run to verify it fails.**

- [x] **Step 3: Implement** `mapToUserFacingError` — a map of known reason substrings → Indonesian strings; default fallback. (Keep it small; extend as leak sites surface patterns.)

- [x] **Step 4: Run to verify it passes.**

- [x] **Step 5: Commit**

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

- [x] **Step 1: api.payment.create.ts** — replace `error.message` echo with `mapToUserFacingError(error.message)` + log raw server-side.

- [x] **Step 2: api.projects.preview.ts:505** — `onError` returns `mapToUserFacingError(error.message)` in prod; raw only in dev logs.

- [x] **Step 3: api.projects.$id.runtime-events.ts:40** — drop `message` from the `select` (or sanitize via `getIndonesianBuildFailureSummary`); confirm no client consumes it first (`grep -rn "event.message\|\.message" src/components/projects/WorkspaceShell.tsx`).

- [x] **Step 4: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [x] **Step 5: Commit**

```bash
git add src/routes/api.payment.create.ts src/routes/api.projects.preview.ts src/routes/api.projects.\$id.runtime-events.ts
git commit -m "fix(error): route leak sites through mapToUserFacingError"
```

---

### Task 5: OTP crypto + waitlist magic-byte

**Files:**
- Modify: `src/lib/otp.ts:8`
- Modify: `src/routes/api.waitlist.ts` (image upload block)

- [x] **Step 1: OTP crypto** — `Math.random()` → `crypto.randomInt(0, 1_000_000).toString().padStart(6, "0")` (import `randomInt` from `node:crypto`).

- [x] **Step 2: Waitlist magic-byte** — in `api.waitlist.ts` after the size check, reuse `detectImageFormat` from `@/lib/projects/project-assets`; reject non-images even if `file.type` claims `image/png`.

- [x] **Step 3: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [x] **Step 4: Commit**

```bash
git add src/lib/otp.ts src/routes/api.waitlist.ts
git commit -m "fix(security): crypto.randomInt OTP + waitlist image magic-byte validation"
```

---

### Task 6: Generated-site sandbox hardening

**Files:**
- Modify: `src/lib/projects/runtime-proxy.ts:451,461`
- Modify: `src/lib/projects/generated-source.ts:450,370`

- [x] **Step 1: postMessage origin** — replace `postMessage(payload, '*')` with `postMessage(payload, controlPlaneOrigin)` where `controlPlaneOrigin` is the parent window origin (pass it in via the bridge script's data attribute or `NEXT_PUBLIC_APP_URL`).

- [x] **Step 2: Narrow build PATH** — in the build child `env`, set `PATH` to the bun bin dir + standard system dirs (`/usr/local/bin:/usr/bin:/bin`) rather than inheriting the full `process.env.PATH`.

- [x] **Step 3: Frozen lockfile** — after package-policy validation, if a `bun.lock` exists in the workspace, run `bun install --frozen-lockfile`; else enforce lockfile presence before install.

- [x] **Step 4: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [x] **Step 5: Commit**

```bash
git add src/lib/projects/runtime-proxy.ts src/lib/projects/generated-source.ts
git commit -m "fix(security): postMessage origin + narrow build PATH + frozen-lockfile"
```

---

### Task 7: Manual E2E

Not committed — verification.

- [x] **Step 1:** Homepage renders dark (no cream); H1 + animated `100% Gratis` underline; `<title>`/meta via view-source; JSON-LD `@graph` validates at search.google.com/test/rich-results.
- [x] **Step 2:** Trigger a Pakasir error + a preview stream error → user sees Indonesian generic, never raw internals.
- [x] **Step 3:** OTP code is 6 digits, generated via `crypto.randomInt` (inspect devLog).
- [x] **Step 4:** Upload a non-image claiming `image/png` to `/api/waitlist` → rejected.
- [x] **Step 5:** `bun run check` green.

---

### Task 8: Umami + Uptime Kuma compose services

**Files:**
- Modify: `docker-compose.prod.yml`
- Modify: `.env` + `.env.example` (add `UMAMI_WEBSITE_ID` + `UMAMI_SCRIPT_SRC` in OPTIONAL section, 1:1)
- Create: `src/lib/analytics.ts`
- Create: `src/lib/analytics.test.ts`

**Interfaces:**
- Produces: `track(event: string, props?: Record<string, string|number|boolean>): void` — calls `window.umami.track(event, props)` when the Umami script is loaded + `UMAMI_WEBSITE_ID` set + in prod; no-op in dev or on server. Never called from `/api/*` or `/p/<slug>`.

- [x] **Step 1: Add Umami + Uptime Kuma to docker-compose.prod.yml**

```yaml
  umami:
    image: ghcr.io/umami-software/umami:postgresql-latest
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/umami
      UMAMI_SCRIPT: /script.js
    depends_on: [postgres]
    ports: ["3001:3000"]
    restart: unless-stopped

  uptime-kuma:
    image: louislam/uptime-kuma:1
    volumes: [uptime-kuma:/app/data]
    ports: ["3002:3001"]
    restart: unless-stopped

volumes:
  uptime-kuma:
```

(Confirm the Umami image tag + DB-sharing approach with the official Umami docker docs at impl; lean a separate `umami` DB on the same Postgres instance to avoid schema collision. Uptime Kuma uses its own SQLite.)

- [x] **Step 2: Add env vars (1:1)** — `.env` + `.env.example` OPTIONAL section:

```env
# Umami analytics (empty = dev no-op; set website id + script src in prod).
UMAMI_WEBSITE_ID=""
UMAMI_SCRIPT_SRC=""
```

- [x] **Step 3: Create src/lib/analytics.ts**

```ts
export function track(
  event: string,
  props?: Record<string, string | number | boolean>,
): void {
  if (process.env.NODE_ENV !== "production") return;
  if (typeof window === "undefined") return;
  const w = window as unknown as { umami?: { track?: (e: string, p?: unknown) => void } };
  if (!process.env.UMAMI_WEBSITE_ID) return;
  w.umami?.track?.(event, props);
}
```

- [x] **Step 4: Write the failing test** — `track` is a no-op when `NODE_ENV !== production` or `UMAMI_WEBSITE_ID` empty; calls `window.umami.track` when both set. Mock `window.umami`.

- [x] **Step 5: Wire the Umami script tag** in `__root.tsx` `head()` (prod-only, `UMAMI_SCRIPT_SRC`): `<script defer src={UMAMI_SCRIPT_SRC} data-website-id={UMAMI_WEBSITE_ID} />`.

- [x] **Step 6: Sprinkle `track()` calls** on key user actions (hero CTA click, project create, publish, mode toggle) — a few high-signal events, not every click.

- [x] **Step 7: Run the fast gate + verify 1:1**

Run: `bun run check` + `diff <(sed 's/=".*"/=""/' .env.example) <(sed 's/=".*"/=""/' .env)`
Expected: all green + no diff output.

- [x] **Step 8: Commit**

```bash
git add docker-compose.prod.yml .env.example src/lib/analytics.ts src/lib/analytics.test.ts src/routes/__root.tsx <component files>
git commit -m "feat(analytics): Umami + Uptime Kuma self-hosted; client track helper"
```

---

### Task 9: Per-page SEO for published sites (`/p/<slug>`)

**Files:**
- Modify: `src/routes/p.$slug.$.ts` (add per-page head) OR the deployment-serving path that emits HTML
- Modify: `src/lib/projects/runtime-proxy.ts` (inject `<title>`/meta/og/canonical/JSON-LD into the served published HTML)

**Interfaces:**
- Consumes: the published deployment's metadata (business name, slug, `GENERATED_PUBLIC_ORIGIN`).
- Produces: each published site serves a unique `<title>` (`<businessName> — <tagline>`), meta description, og:title/description/image/canonical, and `LocalBusiness` JSON-LD.

- [x] **Step 1: Write the per-page head injector** — a function that takes `{businessName, slug, description?, image?}` and returns the `<head>` fragment string (title, meta, og, canonical `https://<GENERATED_PUBLIC_ORIGIN>/p/<slug>`, `LocalBusiness` JSON-LD with name + url + the WhatsApp/IG `sameAs` if present).

- [x] **Step 2: Wire it into the published-site serve path** — when serving `/p/<slug>/*`, inject the head into the dist's `index.html` (or emit it server-side). Confirm the exact injection point in `p.$slug.$.ts` + `runtime-proxy.ts`.

- [x] **Step 3: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [x] **Step 4: Commit**

```bash
git add src/routes/p.\$slug.\$.ts src/lib/projects/runtime-proxy.ts
git commit -m "feat(seo): per-page title/meta/og/canonical + LocalBusiness JSON-LD on /p/<slug>"
```

---

### Task 10: Expand sitemap to list published sites

**Files:**
- Modify: `src/routes/sitemap[.]xml.ts`

**Interfaces:**
- Consumes: `prisma.projectDeployment.findMany({where:{kind:"published"}})` for slugs + `updatedAt`.
- Produces: a `<urlset>` with the homepage (priority 1) + every published `/p/<slug>` (priority 0.8, `<lastmod>` from deployment).

- [x] **Step 1: Replace the single-URL sitemap** with a dynamic one enumerating published deployments:

```ts
export const Route = createFileRoute("/sitemap.xml")({
  server: { handlers: { GET: async () => {
    const siteUrl = process.env.GENERATED_PUBLIC_ORIGIN || "https://umkmcepat.com";
    const deployments = await prisma.projectDeployment.findMany({
      where: { kind: "published" },
      select: { slug: true, updatedAt: true },
    });
    const urls = [
      `  <url><loc>${siteUrl}</loc><changefreq>weekly</changefreq><priority>1</priority></url>`,
      ...deployments.map(d =>
        `  <url><loc>${siteUrl}/p/${encodeURIComponent(d.slug)}</loc><lastmod>${d.updatedAt.toISOString()}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`),
    ].join("\n");
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
    return new Response(body, { headers: { "Content-Type": "application/xml" } });
  } } },
});
```

- [x] **Step 2: Run the fast gate**

Run: `bun run check`
Expected: all green.

- [x] **Step 3: Commit**

```bash
git add src/routes/sitemap\[.\]xml.ts
git commit -m "feat(seo): sitemap enumerates published /p/<slug> deployments"
```

---

## Post-implementation

- The OTP-route error-leak fix lands in topic 7's plan (same routes); this plan's Task 4 skips them to avoid double-touching.
- The non-image `selectorPath` brittleness remains flagged (photo-upload spec).
