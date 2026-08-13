import type {
  GeneratedSiteContractV1,
  GeneratedSiteWriterContractV2,
} from "@/lib/projects/generated-site-contract";
import type { GeneratedSiteDesignKitV1 } from "@/lib/projects/generated-site-design-kits/types";
import type {
  GeneratedSiteGoldExample,
  GeneratedSiteRecipeV1,
} from "@/lib/projects/generated-site-recipes";
import type { GeneratedProjectFile } from "@/lib/projects/generated-types";
import type { ImplementationSpec } from "@/lib/projects/implementation-spec";
import type { ProjectSiteSchema } from "@/lib/projects/site-schema";

import { loadArchetypeGuide } from "@/lib/projects/archetypes";
import { briefToBuildPrompt, type ProjectBrief } from "@/lib/projects/brief";
import { DESIGN_DIRECTIVE } from "@/lib/projects/design-directive";
import { deriveScaffoldManifest } from "@/lib/projects/scaffold/manifest";
import { createViteTanStackShadcnStarterFiles } from "@/lib/projects/scaffold/vite-tanstack-shadcn-starter";

export function buildReferenceCalibratedCorrectionPrompt(input: {
  contract: GeneratedSiteWriterContractV2;
  kit: GeneratedSiteDesignKitV1;
  projectId: string;
  acceptedPlan: unknown;
  reason: string;
  diagnostics: string[];
  implicatedPaths: string[];
  files: GeneratedProjectFile[];
}): { system: string; user: string } {
  return {
    system: `You are correcting one generated Indonesian landing site response. Emit only one complete <design-plan>, full replacement <file> blocks for the implicated writable paths, and one <done summary="..." />. Use no tools, no markdown, no prose. Keep the immutable contract, kit, media mode, routes, facts, and protected scaffold unchanged. AI SDK retries are disabled and this is the only shared correction.`,
    user: JSON.stringify({
      contract: input.contract,
      kit: {
        id: input.kit.id,
        version: input.kit.version,
        patterns: input.kit.compositionPatterns,
        sourceAssertions: input.kit.sourceAssertions,
        antiPatterns: input.kit.antiPatterns,
      },
      acceptedPlan: input.acceptedPlan,
      reason: input.reason,
      diagnostics: input.diagnostics,
      implicatedPaths: input.implicatedPaths,
      files: input.files.filter((file) =>
        input.implicatedPaths.includes(file.path),
      ),
      projectId: input.projectId,
    }),
  };
}

export function buildReferenceCalibratedWriterPrompt(input: {
  contract: GeneratedSiteWriterContractV2;
  kit: GeneratedSiteDesignKitV1;
  projectId: string;
  schema: ProjectSiteSchema;
}): { system: string; user: string } {
  const theme =
    input.kit.themePolicy.backgroundLightness === "dark"
      ? {
          background: "#171b2b",
          foreground: "#f3f4ff",
          muted: "#2c3150",
          accent: "#9d7cff",
        }
      : (input.schema?.theme ?? {
          background: "#f7f3ec",
          foreground: "#3d2b1f",
          muted: "#e5ddd2",
          accent: "#d4a017",
        });
  const planSeed = {
    schemaVersion: 2,
    contractHash: input.contract.contractHash,
    kit: { id: input.kit.id, version: 1 },
    mediaMode: input.contract.media.mode,
    visualThesis:
      input.kit.compositionPatterns[0]?.intent ?? "Content-led composition.",
    compositionPatternId: input.kit.compositionPatterns[0]?.id ?? "",
    palette: {
      background: theme.background,
      foreground: theme.foreground,
      muted: theme.muted,
      accent: theme.accent,
    },
    typography: {
      displayRole: input.kit.typography.displayRole,
      bodyRole: input.kit.typography.bodyRole,
    },
    sections: input.contract.obligations.sections.map((section) => ({
      id: section.id,
      treatment: "content-led",
      surface: "base",
      density: "regular",
    })),
    mobileStrategy: ["stack columns", "keep the primary action visible"],
    signatureElement:
      input.kit.compositionPatterns[0]?.id ?? "content hierarchy",
  };
  const writablePaths = [
    "src/routes/index.tsx",
    "src/components/site/sections.tsx",
  ];
  return {
    system: `You are a senior Indonesian landing-page designer and React writer. Emit one complete customer-facing site in Indonesian. System instructions and code comments remain English. Use the selected executable design kit; do not fall back to a generic template.

IMMUTABLE WRITER CONTRACT:
${JSON.stringify(input.contract)}

EXECUTABLE KIT:
${JSON.stringify({
  id: input.kit.id,
  version: input.kit.version,
  patterns: input.kit.compositionPatterns,
  typography: input.kit.typography,
  sourceAssertions: input.kit.sourceAssertions,
  antiPatterns: input.kit.antiPatterns,
})}

RESPONSE CONTRACT:
<design-plan>${JSON.stringify(planSeed)}</design-plan>
<file path="src/routes/index.tsx">full raw TSX</file>
<file path="src/components/site/sections.tsx">full raw TSX only when needed</file>
<done summary="..." />

Rules:
- Emit exactly one design plan first, then only complete files under these writable paths: ${writablePaths.join(", ")}.
- Use the seeded SiteSection, SiteStack, SiteSplit, and SiteCluster primitives from @/components/site/layout; never rewrite them.
- Render every non-empty required field from the contract visibly. Do not invent facts, proof, products, prices, contacts, addresses, hours, guarantees, or claims.
- Use semantic Tailwind tokens only. Do not emit raw palette literals, remote URLs, placeholders, empty media frames, or starter markers.
- The primary CTA must use the accepted target and a real accessible action. Keep all interactive targets at least 44px tall.
- Use one deliberate display/body type relationship, varied section rhythm, and the selected pattern's signature. Avoid identical card grids.
- Keep the editable response under 32 KiB and finish with exactly one done marker. Do not emit tools, shell actions, markdown fences, or prose outside tags.
- If the brief is sparse, keep the page sparse. Do not pad it with generic sections.
`,
    user: `Build ${input.contract.business.name} now from the immutable contract and selected kit. The generated project must stand alone after export. Project key: ${input.projectId}. The seeded content schema is ${input.schema?.businessName ?? input.contract.business.name}; read facts from @/content/site and never duplicate owner values in local invented arrays.`,
  };
}

export function buildGeneratedAppBuildSpec(
  input:
    | ProjectSiteSchema
    | {
        conversationBrief?: string;
        implementationSpec?: ImplementationSpec;
        schema: ProjectSiteSchema;
      },
  legacyConversationBrief = "",
) {
  const { conversationBrief, implementationSpec, schema } =
    "schema" in input
      ? {
          conversationBrief: input.conversationBrief ?? "",
          implementationSpec: input.implementationSpec,
          schema: input.schema,
        }
      : {
          conversationBrief: legacyConversationBrief,
          implementationSpec: undefined,
          schema: input,
        };
  return [
    implementationSpec
      ? `App kind: ${implementationSpec.appKind}`
      : "App kind: landing page",
    `Business: ${implementationSpec?.businessName || schema.businessName}`,
    implementationSpec
      ? `Pages: ${implementationSpec.pages.map((page) => `${page.slug} — ${page.title}: ${page.purpose}`).join(" | ")}`
      : `Audience: ${schema.audience}`,
    implementationSpec
      ? `Components: ${implementationSpec.components.map((component) => `${component.name}: ${component.purpose}`).join(" | ")}`
      : `Offer: ${schema.offer}`,
    implementationSpec
      ? `Features: ${implementationSpec.features.join(", ")}`
      : `Primary CTA: ${schema.primaryCta}`,
    `Visual direction: ${implementationSpec?.style.direction || `background ${schema.theme.background}; foreground ${schema.theme.foreground}; muted ${schema.theme.muted}; accent ${schema.theme.accent}`}`,
    conversationBrief ? `Conversation summary:\n${conversationBrief}` : "",
    implementationSpec
      ? `Structured content:\n${JSON.stringify(implementationSpec.content, null, 2)}`
      : "",
    "Build intent:",
    "- Build the structure declared above. Do not force everything into one generic landing page.",
    "- If appKind is interactive_app, create useful static frontend interactions only; no backend persistence.",
    "- Invent layout, hierarchy, cards, flows, pages, and proof points that fit the business.",
    "- Rewrite user answers into customer-facing Indonesian copy; the result must feel designed, not a transcript.",
    "- Use business-specific visual metaphors; avoid generic white cards copied from a schema.",
    "Required source shape:",
    "- Routes own composition only.",
    "- Content module owns structured copy/data.",
    "- CSS owns visual identity.",
    "- Components own specific visual or interactive sections.",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Constants shared with gates

/** Dependency allow-list source of truth: the scaffold's own package.json. */

export function buildBatchedWriterPrompt(input: {
  brief: ProjectBrief;
  implementationSpec?: ImplementationSpec;
  contract?: GeneratedSiteContractV1;
  recipe?: GeneratedSiteRecipeV1;
  example?: GeneratedSiteGoldExample;
  projectId: string;
  schema: ProjectSiteSchema;
  photoEnabled?: boolean;
}): { system: string; user: string } {
  const {
    brief,
    implementationSpec,
    contract,
    recipe,
    example,
    projectId,
    schema,
  } = input;
  const starterFiles = createViteTanStackShadcnStarterFiles(projectId, schema);
  const manifest = deriveScaffoldManifest(starterFiles);
  const appSpec = buildGeneratedAppBuildSpec({
    conversationBrief: briefToBuildPrompt(brief),
    implementationSpec,
    schema,
  });

  if (contract && recipe && example) {
    const designPlan = JSON.stringify({
      contractHash: contract.contractHash,
      recipeId: recipe.id,
      mediaMode: contract.design.mediaMode,
      visualThesis: contract.design.composition,
      hierarchy: contract.design.hierarchy,
      sectionOrder: contract.page.requiredSections.map((section) => section.id),
      signatureElement: contract.design.signatureElement,
    });
    const system = `You are a senior Indonesian landing-page copywriter and React writer. Emit one compact, production-ready customer landing for the accepted contract. System instructions and code comments are English; all visible copy is natural Indonesian.

CONTRACT: ${JSON.stringify({
      business: contract.business,
      content: contract.content,
      page: contract.page,
      design: contract.design,
    })}

Rules:
- First block exactly: <design-plan>${designPlan}</design-plan>
- Then exactly one editable file: src/routes/index.tsx. End with one <done summary="..." />.
- Never emit platform-owned files, package/config files, extra routes, prose, markdown fences, or propose blocks.
- Use only imports from the seeded scaffold: @/content/site, @/lib/preview-ready, @/components/ui/button, @/components/ui/card.
- Call usePreviewReady() in HomeRouteComponent. Render every populated site field visibly: headline, subheadline, primaryCta, secondaryCta, offer, trustPoints, sections, products, testimonials, faq, socialLinks, currentPromo.
- Primary CTA must be a real WhatsApp link using the accepted target, wrapped with <Button asChild size="lg">. Secondary CTA must use <Link to="/" hash="..."> or a real section id. No raw href="#...".
- Use Tailwind semantic tokens only. No custom CSS, images, placeholders, external URLs, invented facts, or technical headings. No data-generated-site-starter marker.
- Keep the file compact enough to finish below the output limit.

Output contract:
<design-plan>${designPlan}</design-plan>
<file path="src/routes/index.tsx">full TSX</file>
<done summary="..." />`;
    const user = `Build the accepted one-page ${contract.business.name} landing now. Brief context: ${briefToBuildPrompt(brief)}\nSelected recipe: ${recipe.composition}\nGold example principle only: ${example.source}`;
    return { system, user };
  }

  const qualityContract =
    contract && recipe && example
      ? `GENERATED-SITE CONTRACT (immutable; overrides examples):
${JSON.stringify(contract, null, 2)}

SELECTED RECIPE:
${JSON.stringify(recipe, null, 2)}

ONE GOLD EXAMPLE (copy composition principles only; never copy literals, names, URLs, or identity):
${example.source}

FIRST BLOCK REQUIRED:
<design-plan>{"contractHash":"${contract.contractHash}","recipeId":"${recipe.id}","mediaMode":"${contract.design.mediaMode}","visualThesis":"...","hierarchy":["..."],"sectionOrder":[${contract.page.requiredSections.map((section) => `"${section.id}"`).join(",")}],"signatureElement":"${contract.design.signatureElement}"}</design-plan>
The design plan MUST precede every <file> block and match the immutable contract exactly.`
      : "";

  const contractMode = contract
    ? `CONTRACT MODE: emit exactly one editable file block: src/routes/index.tsx. Never emit src/styles.css, src/content.js, src/content/site.ts, src/index.css, src/main.tsx, src/routes/__root.tsx, package.json, or any config file. Platform-owned files already contain the typed accepted facts and theme. Do not emit extra routes because the contract declares only /. Keep the response compact enough to finish below the output limit. Use site.* fields only; never hardcode owner facts.`
    : "";

  const photoEnabled = input.photoEnabled ?? true;
  const system = `You are a senior landing-page builder, direct-response copywriter, AND frontend coding writer for UMKM Cepat. Your job is to help Indonesian UMKM sell 10× with near-zero effort — every landing you ship must feel instantly shoppable, legit, and effortless to make. Emit the whole project in ONE structured response — no tool calls, no markdown fences, no prose between blocks beyond short notes.

${qualityContract}

${contractMode}

Business: ${implementationSpec?.businessName || schema.businessName} — ${implementationSpec?.appKind || "landing"} — ${(implementationSpec?.features || [schema.offer, schema.audience]).join(", ")}

MARKETING EXPERT MINDSET (EN system — ID customer output):
- You are a senior Indonesian market expert. System, reasoning, and code comments stay in English; ALL customer-facing copy (headlines, subheadlines, bullets, CTAs, FAQs, testimonials) MUST be natural Indonesian, not English and not translated-spec.
- Never copy brief answers verbatim. Spec phrases like "Katalog jadi hero utama", "Fitur disederhanakan", "Info jelas", "Online murni", "Gamis & dress", "Tujuan utama: Katalog/jualan — sederhanakan/cepat" are INTERNAL notes — forbidden as customer copy. Translate every such note into a benefit: "Katalog jadi hero" → "Pilih gamis favoritmu dalam 1 menit — foto jelas, ukuran lengkap"; "Info jelas" → "Detail bahan & ukuran transparan di setiap produk"; "Online murni" → "Pesan dari rumah, kirim dari Jakarta hari ini".
- Hero formula: eyebrow = who it's for, headline = transformation/outcome (e.g. "Anggun Setiap Hari, Nyaman Seharian"), subheadline = concrete offer (apa + untuk siapa + kenapa sekarang + cara order via WhatsApp). No business-name — dash — offer label headlines.
- 10× value framing: surface near-zero effort (screenshot → chat → kirim), speed ("chat dibalas cepat"), and trust ("kirim dari Jakarta", "foto sesuai aslinya", "bisa tanya ukuran dulu") in hero + one proof block. Legit: never invent phone numbers, exact addresses, prices, stock, awards, guarantees, or payment status not in the brief — use only what the brief provides.
- Smart word choice: tactile, specific Indonesian (warna kalem, bahan jatuh adem, potongan longgar, tidak menerawang) — avoid generic "kualitas terbaik / harga terjangkau" without proof.
- Show the offer concretely: if site.products exists, each card must have outcome + detail; if site.currentPromo exists, frame as "Hari ini" benefit, not just label.
- The landing must make the UMKM look established and ready to sell today — not "coming soon" or "starter boilerplate".

RESPONSE CONTRACT (strict — hard parse errors on any deviation):

${contract ? '<design-plan>{"contractHash":"...","recipeId":"...","mediaMode":"...","visualThesis":"...","hierarchy":[],"sectionOrder":[],"signatureElement":"..."}</design-plan>\n' : ""}<file path="src/...">
...full raw file content (NOT JSON-escaped)...
</file>
<file path="src/...">
...another file...
</file>
<propose path="src/components/ui/<name>.tsx">short reason — only if absolutely needed</propose>
<done summary="One-sentence Indonesian recap of what was written — pages, sections, design moves." />

Rules:
- Emit <file> blocks for every file the app needs. Order doesn't matter, but write the index route FIRST so partial streams still land the home page.
- Path allow-list: only under src/ (never src/content/site.ts, src/index.css, src/main.tsx, src/routes/__root.tsx — platform-owned, exactly as seeded) and public/. Never package.json, vite.config.ts, tsconfig*.json, eslint.config.js, index.html.
- Only import dependencies listed in package.json (scaffold block below).
- Close every file with </file>. No nested <file>. No unknown tags. No self-closing <file/>.
- Content is raw text between the tags: do NOT wrap in markdown fences and do NOT JSON-escape quotes or newlines.
- After all files are out, end with exactly one <done summary="..." />. Nothing after.
- Use <propose> only for shadcn components you genuinely need beyond the pre-seeded ones; the platform copies the registry source for known components automatically (no hand-written ui/ component sources — those are platform-owned).

SPEED RULES (you have one response — write immediately and completely):
1. FIRST emitted file MUST be src/routes/index.tsx with the FULL custom home page (complete TSX). Not a stub.
2. Treat the implementation brief / pages list as your checklist — write every needed file in this single response; no deferral.
3. Write extra routes under src/routes/ when the brief has distinct pages and register them by rewriting src/router.tsx yourself (same shape as the scaffold block below).
4. Compose shadcn components; do not hand-roll ui primitives.
5. Emit FULL file content every time — never "..." or partial code. Every file must be complete and self-consistent.
6. STOP after <done>: do not keep editing.

STACK (locked — do not change tooling):
- Vite + React 19 + TypeScript + TanStack Router (hash history, static).
- Tailwind CSS v4 (utility classes inline; src/index.css pre-wires theme vars — do not edit it).
- shadcn/ui components in src/components/ui/ are platform-owned — do not edit them; compose them. Pre-seeded now: ${manifest.preSeededComponents.join(", ")}. ${manifest.availableComponents.length} more available via <propose>.
- package.json is platform-owned — do not add or remove dependencies.

STYLING (shadcn + Tailwind only — no custom CSS):
- All styling uses Tailwind utility classes inline in the TSX, using theme tokens (bg-background, text-foreground, bg-primary, text-primary-foreground, bg-muted, text-muted-foreground, bg-accent, text-accent-foreground, border-border, ring-ring).
- Do NOT write custom CSS class names (no .btn-primary / .nav-link / .hero-section / etc.) and do NOT edit src/index.css.
- Only ${manifest.preSeededComponents.join(" + ")} are pre-seeded. For any other shadcn component, emit <propose path="src/components/ui/<name>.tsx">why</propose> — the platform writes the canonical new-york + Tailwind v4 source + transitive deps automatically.
- Use min-h-dvh for full-height sections, never h-screen.

ROUTING & PAGE CONTRACT:
- src/routes/index.tsx MUST export a component named HomeRouteComponent: "export function HomeRouteComponent() { ... }".
- Prefer REAL multi-page routing when the brief has distinct sections (Home, Catalog, Contact, Product detail, etc.). Add one route file per page under src/routes/ (e.g. katalog.tsx, kontak.tsx) and register each in when you rewrite src/router.tsx: import your route components, createRoute({ getParentRoute: () => rootRoute, path: "/katalog", component: ... }), then add it to rootRoute.addChildren([...]). Keep the existing index route and the path:"*" 404 catch-all.
- MULTI-PAGE CONSISTENCY: shared chrome (nav, footer, brand colors, fonts) belongs in __root.tsx layout — but remember __root.tsx is platform-owned, so when the brief calls for header/footer, build a layout component under src/components/ and wrap each page in it. Same palette tokens + type scale on every page — no one-off colors per route.
- Navigate between pages with <Link to="/katalog"> from "@tanstack/react-router". Do NOT fake routing with useState tabs.
- In-page section links (anchor scroll within one page) MUST use <Link to="/" hash="sectionId"> from "@tanstack/react-router", targeting a <section id="sectionId">. NEVER use raw <a href="#sectionId"> — with hash history the URL hash is the route path, so "#sectionId" resolves to no route and triggers the 404 catch-all — the anchor glitches (first click re-renders + scrolls to top) and only works on a second click. <Link to="/" hash="..."> produces #/sectionId and uses TanStack's native hash-scroll.
- Add scroll-mt-<size> (e.g. scroll-mt-24) to each id-target section so a fixed/sticky header does not cover it.
- Import usePreviewReady from "@/lib/preview-ready" and call usePreviewReady() in HomeRouteComponent so the preview iframe unlocks.
- Import the business data using: import { site } from "@/content/site". Do NOT edit src/content/site.ts — it is fully populated and exports site as both named and default exports.
- FILE TYPE RULES: components and pages go in .tsx files (src/components/*.tsx or src/routes/*.tsx). src/content/* files are DATA-ONLY .ts modules — never put JSX/TSX markup in a .ts file, and never create src/content/*.tsx. Menu/product data you need beyond site.ts must live in src/content/*.ts as plain TypeScript objects (no JSX).

STATIC ONLY: no auth, no backend, no database, no payment gateway, no fake /api routes. Use WhatsApp/contact CTAs and real Indonesian business copy.
Do not add or remove dependencies — package.json is platform-owned.

${photoEnabled ? `MISSING IMAGES (photo uploads ENABLED): use <img src="/placeholder.svg" alt="<short description>" /> for landscape/wide slots and <img src="/placeholder-vertical.svg" alt="<short description>" /> for portrait/tall slots, only when an image slot is structurally necessary and no owner image exists. Alt text at use site. Never use remote placeholder URLs. For typographic layouts, prefer omitting the image slot instead of adding a gratuitous placeholder.` : `PHOTO DISABLED — Composer image uploads are OFF (feature.composer_uploads_enabled=false): NEVER emit <img src="/placeholder.svg"> or <img src="/placeholder-vertical.svg"> or any placeholder image. Never use remote placeholder URLs (placehold.co, unsplash, etc.). Build an elegant TYPOGRAPHIC / COLOR-BLOCK / INITIALS layout instead — use gradients, large type, accent blocks, icon cards, or initials as visual — no image slots at all. If you feel an image is needed, omit it and strengthen the copy/layout. Any placeholder <img> will be stripped and will look broken.`}

FEW-SHOT HEROES (copy the pattern, not the text — render from site.*):

Example 1 — Warung Sate (friendly/warm, variance 8):
\`\`\`tsx
import { site } from "@/content/site";
import { usePreviewReady } from "@/lib/preview-ready";
import { Button } from "@/components/ui/button";
export function HomeRouteComponent() {
  usePreviewReady();
  return (<main className="mx-auto max-w-6xl px-6 py-12">
    <section className="grid gap-8 md:grid-cols-2 items-center py-16">
      <div><p className="text-sm font-medium text-muted-foreground">{site.eyebrow}</p>
        <h1 className="text-5xl font-bold tracking-tight text-balance" style={{letterSpacing:"-0.03em"}}>{site.headline}</h1>
        <p className="mt-4 max-w-[65ch] text-pretty text-muted-foreground">{site.subheadline}</p>
        <div className="mt-6 flex gap-3"><Button asChild><a href="#kontak">{site.primaryCta}</a></Button><Button variant="outline">{site.secondaryCta}</Button></div>
      </div>
      <img src="/placeholder.svg" alt="Warung sate" className="rounded-xl" />
    </section>
    <section className="grid gap-4 md:grid-cols-3"><div className="rounded-xl border p-6">{site.trustPoints[0]}</div><div className="rounded-xl border p-6">{site.trustPoints[1]}</div><div className="rounded-xl border p-6">{site.trustPoints[2]}</div></section>
  </main>);
}
\`\`\`

Example 2 — Laundry Kiloan (clean/trust, variance 8):
\`\`\`tsx
import { site } from "@/content/site";
import { usePreviewReady } from "@/lib/preview-ready";
export function HomeRouteComponent() {
  usePreviewReady();
  return (<main className="mx-auto max-w-5xl px-6">
    <section className="py-20 text-center"><h1 className="text-5xl font-semibold text-balance">{site.headline}</h1><p className="mx-auto mt-4 max-w-[65ch] text-pretty text-muted-foreground">{site.subheadline}</p></section>
    <section className="grid gap-6" style={{gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))"}}>{site.sections.slice(0,3).map(s=><article key={s.title} className="border rounded-xl p-6"><h3 className="font-semibold">{s.title}</h3><p className="text-sm text-muted-foreground">{s.body}</p></article>)}</section>
  </main>);
}
\`\`\`

Example 3 — Catalog / retail (FULL multi-section landing — the pattern you MUST follow when site.ts has rich fields). Render EVERY populated field: hero, promo banner, product grid, order steps, testimonials, FAQ, social links. Never ship starter boilerplate ("Read the Blog", "View on GitHub", "⚡ Fast / 🎨 Beautiful / 📝 MDX Ready") — those are scaffold rot and the gate rejects them. If a field is empty, skip its section; if it has data, render it. HERO COPY RULE: never render \`<h1>{site.businessName} — {site.offer}</h1>\` — that's a spec transcript (BAD). Always render the marketing fields: \`<h1>{site.headline}</h1>\` + \`<p>{site.subheadline}</p>\` (site.headline is already benefit-driven Indonesian, e.g. "Anggun Setiap Hari…").
\`\`\`tsx
import { site } from "@/content/site";
import { usePreviewReady } from "@/lib/preview-ready";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function HomeRouteComponent() {
  usePreviewReady();
  const waHref = site.primaryCta.toLowerCase().includes("whatsapp") || site.primaryCta.toLowerCase().includes("chat")
    ? \`https://wa.me/?text=\${encodeURIComponent(site.headline)}\`
    : "#kontak";
  return (
    <main className="mx-auto max-w-6xl px-6">
      {/* Hero — always render eyebrow, headline, subheadline, primaryCta, secondaryCta */}
      <section className="grid gap-8 md:grid-cols-2 items-center py-20">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{site.eyebrow}</p>
          <h1 className="mt-2 text-5xl font-bold tracking-tight text-balance" style={{letterSpacing:"-0.03em"}}>{site.headline}</h1>
          <p className="mt-4 max-w-[65ch] text-pretty text-muted-foreground">{site.subheadline}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild><a href={waHref} target="_blank" rel="noopener noreferrer">{site.primaryCta}</a></Button>
            <Button variant="outline" asChild><a href="#cara-order">{site.secondaryCta}</a></Button>
          </div>
        </div>
        <img src="/placeholder.svg" alt={site.businessName} className="rounded-xl" />
      </section>

      {/* Promo banner — only when site.currentPromo is populated */}
      {site.currentPromo ? (
        <section aria-label="Promo" className="rounded-xl bg-accent/10 p-6 text-center">
          <p className="font-medium text-accent-foreground">{site.currentPromo}</p>
        </section>
      ) : null}

      {/* Trust points — always render when present */}
      {site.trustPoints?.length ? (
        <section className="grid gap-4 md:grid-cols-3 py-12">
          {site.trustPoints.map((tp) => (
            <div key={tp} className="rounded-xl border p-6 text-sm">{tp}</div>
          ))}
        </section>
      ) : null}

      {/* Product catalog — only when site.products is populated */}
      {site.products?.length ? (
        <section id="katalog" className="scroll-mt-24 py-12" aria-label="Katalog">
          <h2 className="text-3xl font-semibold mb-8">Katalog</h2>
          <div className="grid gap-6" style={{gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))"}}>
            {site.products.map((p) => (
              <Card key={p.name}>
                <CardHeader><CardTitle>{p.name}</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {p.description ? <p className="text-sm text-muted-foreground">{p.description}</p> : null}
                  {p.priceRange ? <p className="font-semibold">{p.priceRange}</p> : null}
                  <Button asChild size="lg" className="mt-3"><a href={waHref} target="_blank" rel="noopener noreferrer">{site.primaryCta}</a></Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* Testimonials — only when site.testimonials is populated */}
      {site.testimonials?.length ? (
        <section aria-label="Testimoni" className="py-12">
          <h2 className="text-3xl font-semibold mb-8">Testimoni</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {site.testimonials.map((t) => (
              <Card key={t.author}>
                <CardContent className="pt-6">
                  {t.rating ? <p className="text-accent">{"★".repeat(t.rating)}</p> : null}
                  <p className="text-pretty">"{t.quote}"</p>
                  <p className="mt-3 text-sm font-medium">{t.author}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* FAQ — only when site.faq is populated */}
      {site.faq?.length ? (
        <section aria-label="FAQ" className="py-12">
          <h2 className="text-3xl font-semibold mb-8">FAQ</h2>
          <Accordion type="single" collapsible>
            {site.faq.map((item, i) => (
              <AccordionItem key={i} value={\`q-\${i}\`}>
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent>{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      ) : null}

      {/* Social links — only when populated */}
      {site.socialLinks?.length ? (
        <footer className="flex flex-wrap gap-4 py-12 border-t">
          {site.socialLinks.map((s) => (
            <a key={s.platform} href={s.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground">{s.platform}</a>
          ))}
        </footer>
      ) : null}
    </main>
  );
}
\`\`\`

RENDER COMPLETENESS RULE (enforced by the gate — read carefully):
- site.ts is fully populated. Before writing index.tsx, READ its fields. Every non-empty field MUST appear in the rendered JSX as a visible element (not just mentioned in a comment or unused variable).
- Render: site.eyebrow, site.headline, site.subheadline, site.primaryCta (as a real <a>/<Button> with href), site.secondaryCta, site.trustPoints, site.sections.
- If site.products has items, render them as cards in a grid (name + description + priceRange + CTA each).
- If site.testimonials has items, render them (quote + author + rating stars).
- If site.faq has items, render them as an accordion or list (q + a).
- If site.currentPromo is set, render a promo banner.
- If site.socialLinks has items, render them in a footer.
- If a field is empty/undefined, SKIP its section. Do not invent data.
- NEVER ship starter boilerplate: no "Read the Blog", no "View on GitHub", no "⚡ Fast / 🎨 Beautiful / 📝 MDX Ready", no "Welcome to the home page", no "Your new project is ready". The gate rejects these.
- NEVER hardcode href="/blog" or href="https://github.com". CTAs link to WhatsApp, #kontak, or real business actions.
- EVERY call-to-action <Button asChild><a> MUST use size="lg" (44px min height). NEVER use size="sm" or size="default" on a CTA — the browser gate rejects any CTA under 44px and every CTA is checked, not just the hero. Nav/header chat buttons count too.
- Use theme token utilities ONLY (bg-background, text-foreground, text-accent, border-border, bg-card, bg-accent). NEVER use arbitrary hex colors like bg-[#0b0b0d] or text-[#d4af37] — they bypass the compiled WCAG theme and re-theming will not propagate.

EXACT FIELD NAMES (tsc fails on any mismatch — use these EXACT property names):
- site.products[] → { name, description?, priceRange? } — NOT price, NOT title, NOT model.
- site.testimonials[] → { quote, author, rating? } — NOT content, NOT name, NOT role, NOT comment.
- site.faq[] → { q, a } — NOT question, NOT answer.
- site.socialLinks[] → { platform, handle, url? } — NOT name, NOT link. Use social.url as the href (never social.handle — it is display text like "@suryaphone", not a URL).
- site.sections[] → { title, body } — NOT content, NOT description.
- site.trustPoints → string[] (array of strings, not objects).
- site.theme → { background, foreground, muted, accent } (hex colors, already in index.css — do not re-declare).
- Top-level: site.businessName, site.eyebrow, site.headline, site.subheadline, site.primaryCta, site.secondaryCta, site.audience, site.offer, site.currentPromo, site.tagline, site.usp.

${contract ? "" : DESIGN_DIRECTIVE}

${contract ? "" : "SCAFFOLD MANIFEST (the exact starter your files extend — do not rewrite these; src/router.tsx is the ONE exception — it is writer-owned, so DO rewrite it to register new routes per SPEED RULE 3):"}

${
  contract
    ? ""
    : `File tree:
${manifest.fileTree.map((path) => `- ${path}`).join("\n")}

Router registration contract (src/main.tsx):
${manifest.contract.routerRegistration}

Root layout contract (src/routes/__root.tsx, platform-owned):
${manifest.contract.rootLayout}

Index route shape (src/routes/index.tsx must export):
${manifest.contract.indexRouteShape}

Pre-seeded shadcn components: ${manifest.preSeededComponents.join(", ")}
Available via <propose>: ${manifest.availableComponents.join(", ")}
Theme tokens already defined in src/index.css: ${manifest.themeTokens.join(", ")}`
}`;

  const user = `Build the full project from this brief/streamer answer summary. Emit every <file> block now, then <done>.

${appSpec}

Brief:
${briefToBuildPrompt(brief)}
${loadArchetypeGuide(implementationSpec?.archetype ?? "")}`;

  return { system, user };
}

export function buildFormatRepairPrompt(input: {
  errorOffset: number;
  errorMessage: string;
  designPlan?: {
    contractHash: string;
    recipeId: string;
    mediaMode: GeneratedSiteContractV1["design"]["mediaMode"];
    visualThesis: string;
    hierarchy: string[];
    sectionOrder: string[];
    signatureElement: string;
  };
  requireDesignPlan?: boolean;
}): { system: string; user: string } {
  const designPlan = input.designPlan
    ? `<design-plan>${JSON.stringify(input.designPlan)}</design-plan>\n`
    : "";
  const contractRules = input.designPlan
    ? `
CONTRACT REPAIR RULES:
- Emit exactly the design-plan above, then exactly one file: <file path="src/routes/index.tsx">...</file>, then <done summary="..." />.
- Never emit package.json, src/content/site.ts, src/index.css, src/main.tsx, src/routes/__root.tsx, src/styles.css, src/content.js, config files, extra routes, or propose blocks.
- Keep the index route complete but compact. Use only the seeded platform imports and site.* fields.
`
    : "";
  return {
    system: `You emit ONLY the strict response contract for generated apps:

${designPlan}<file path="src/...">full raw content</file>
<propose path="src/components/ui/<name>.tsx">reason</propose>
<done summary="..." />

Nothing else. No markdown fences. No prose. Unknown tags are a hard parse error.${input.requireDesignPlan ? " The design-plan must be the first block and must preserve the immutable contract values from the original response." : ""}${contractRules}`,
    user: `Your previous response had a malformed structured block at byte offset ${input.errorOffset}: ${input.errorMessage}

${designPlan ? "Emit the exact design-plan above first. Then emit only the one compact src/routes/index.tsx file and done marker; do not re-emit any other path. " : ""}Repair the SAME task. Follow the contract exactly.`,
  };
}

export function buildTruncationResumePrompt(input: {
  errorMessage: string;
  errorOffset: number;
  stagedPaths: string[];
  truncatedPath?: string;
}): { system: string; user: string } {
  const stagedList =
    input.stagedPaths.length > 0
      ? input.stagedPaths.map((p) => `- ${p}`).join("\n")
      : "- (none yet — first file truncated)";
  const truncatedLine = input.truncatedPath
    ? `Truncated file: ${input.truncatedPath}`
    : "Truncated at unknown file boundary";
  return {
    system: `You emit ONLY the strict response contract for generated apps:

<file path="src/...">full raw content</file>
<propose path="src/components/ui/<name>.tsx">reason</propose>
<done summary="..." />

Nothing else. No markdown fences. No prose. Unknown tags are a hard parse error.
You are resuming a PREVIOUS truncated stream. Some files were already staged successfully — DO NOT re-emit them. Only emit the truncated file (full content) and any remaining files, then <done />.`,
    user: `Your previous response truncated mid-stream at byte offset ${input.errorOffset}: ${input.errorMessage}
${truncatedLine}

Already staged and persisted (DO NOT re-emit these — they are safe):
${stagedList}

Resume now: re-emit the truncated file IN FULL (if any), then every remaining file the project still needs, then exactly one <done summary="..." />. Do not repeat already-staged files.`,
  };
}

export function buildTargetedRepairPrompt(input: {
  contract?: GeneratedSiteContractV1;
  diagnostics: string[];
  implicatedPaths: string[];
  starterFiles: GeneratedProjectFile[];
  staged: Map<string, { content: string; path: string }>;
}): { system: string; user: string } {
  const currentBlocks = input.implicatedPaths
    .map((path) => {
      const staged = input.staged.get(path);
      if (!staged) {
        return `<file path="${path}">\n(file was never staged — re-emit it in full)\n</file>`;
      }
      return `<file path="${path}">\n${staged.content}\n</file>`;
    })
    .join("\n\n");
  // The render-completeness gate names site.<field> fields that must appear in
  // index.tsx. Without the actual site.ts data the model invents local arrays
  // and abandons the schema, so every repair diverges further. Provide the
  // staged site.ts as a READ-ONLY reference — it is never in the re-emit list.
  const siteFile = input.staged.get("src/content/site.ts");
  const siteReference = siteFile
    ? `\n\nReference — src/content/site.ts (READ-ONLY data source; render these fields, do NOT re-emit site.ts):\n\n<file path="src/content/site.ts">\n${siteFile.content}\n</file>`
    : "";
  const designPlan = input.contract
    ? `<design-plan>${JSON.stringify({
        contractHash: input.contract.contractHash,
        recipeId: input.contract.design.recipeId,
        mediaMode: input.contract.design.mediaMode,
        visualThesis: input.contract.design.composition,
        hierarchy: input.contract.design.hierarchy,
        sectionOrder: input.contract.page.requiredSections.map(
          (section) => section.id,
        ),
        signatureElement: input.contract.design.signatureElement,
      })}</design-plan>`
    : "";
  const contractRules = input.contract
    ? `
- Contract-v1 repair: emit the exact design-plan above FIRST, then ONLY the listed editable files, then done.
- Never emit platform-owned files, package/config files, extra routes, or prose.
`
    : "";
  return {
    system: `You emit ONLY targeted <file> blocks for the files listed in the user turn, then exactly one <done summary="..." />.
${designPlan}
${contractRules}
Contract recap:
- <file path="src/...">full raw content (not JSON-escaped, no markdown fences)</file>
- Path allow-list: only under src/ (never src/content/site.ts, src/index.css, src/main.tsx, src/routes/__root.tsx) and public/.
- Only import dependencies the project's package.json already declares.
- Close every file with </file>. End with exactly one <done summary="..." />.`,
    user: `${designPlan}
Diagnostics from the validation gates (fix these — re-emit ONLY the listed files, in full):

${input.diagnostics.map((line) => `- ${line}`).join("\n")}

Files to re-emit (current staged state, exactly as your previous response produced):

${currentBlocks}${siteReference}`,
  };
}
