import type { GeneratedProjectFile } from "@/lib/projects/generated-types";
import type { ImplementationSpec } from "@/lib/projects/implementation-spec";
import type { ProjectSiteSchema } from "@/lib/projects/site-schema";

import { loadArchetypeGuide } from "@/lib/projects/archetypes";
import { briefToBuildPrompt, type ProjectBrief } from "@/lib/projects/brief";
import { DESIGN_DIRECTIVE } from "@/lib/projects/design-directive";
import { deriveScaffoldManifest } from "@/lib/projects/scaffold/manifest";
import { createViteTanStackShadcnStarterFiles } from "@/lib/projects/scaffold/vite-tanstack-shadcn-starter";

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
  projectId: string;
  schema: ProjectSiteSchema;
}): { system: string; user: string } {
  const { brief, implementationSpec, projectId, schema } = input;
  const starterFiles = createViteTanStackShadcnStarterFiles(projectId, schema);
  const manifest = deriveScaffoldManifest(starterFiles);
  const appSpec = buildGeneratedAppBuildSpec({
    conversationBrief: briefToBuildPrompt(brief),
    implementationSpec,
    schema,
  });

  const system = `You are a frontend coding writer for UMKM Cepat generated apps. Emit the whole project in ONE structured response — no tool calls, no markdown fences, no prose between blocks beyond short notes.

Business: ${implementationSpec?.businessName || schema.businessName} — ${implementationSpec?.appKind || "landing"} — ${(implementationSpec?.features || [schema.offer, schema.audience]).join(", ")}

RESPONSE CONTRACT (strict — hard parse errors on any deviation):

<file path="src/...">
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

MISSING IMAGES: use <img src="/placeholder.svg" alt="<short description>" /> for landscape/wide image slots, and <img src="/placeholder-vertical.svg" alt="<short description>" /> for portrait/tall slots, only when an image slot is structurally necessary and no owner image exists. Alt text is supplied at use site. Never use remote placeholder URLs. For typographic layouts, prefer omitting the image slot instead of adding a gratuitous placeholder.

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

Example 3 — Catalog / retail (FULL multi-section landing — the pattern you MUST follow when site.ts has rich fields). Render EVERY populated field: hero, promo banner, product grid, order steps, testimonials, FAQ, social links. Never ship starter boilerplate ("Read the Blog", "View on GitHub", "⚡ Fast / 🎨 Beautiful / 📝 MDX Ready") — those are scaffold rot and the gate rejects them. If a field is empty, skip its section; if it has data, render it.
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
                  <Button asChild size="sm" className="mt-3"><a href={waHref} target="_blank" rel="noopener noreferrer">{site.primaryCta}</a></Button>
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

EXACT FIELD NAMES (tsc fails on any mismatch — use these EXACT property names):
- site.products[] → { name, description?, priceRange? } — NOT price, NOT title, NOT model.
- site.testimonials[] → { quote, author, rating? } — NOT content, NOT name, NOT role, NOT comment.
- site.faq[] → { q, a } — NOT question, NOT answer.
- site.socialLinks[] → { platform, handle, url? } — NOT name, NOT link.
- site.sections[] → { title, body } — NOT content, NOT description.
- site.trustPoints → string[] (array of strings, not objects).
- site.theme → { background, foreground, muted, accent } (hex colors, already in index.css — do not re-declare).
- Top-level: site.businessName, site.eyebrow, site.headline, site.subheadline, site.primaryCta, site.secondaryCta, site.audience, site.offer, site.currentPromo, site.tagline, site.usp.

${DESIGN_DIRECTIVE}

SCAFFOLD MANIFEST (the exact starter your files extend — do not rewrite these; src/router.tsx is the ONE exception — it is writer-owned, so DO rewrite it to register new routes per SPEED RULE 3):

File tree:
${manifest.fileTree.map((path) => `- ${path}`).join("\n")}

Router registration contract (src/main.tsx):
${manifest.contract.routerRegistration}

Root layout contract (src/routes/__root.tsx, platform-owned):
${manifest.contract.rootLayout}

Index route shape (src/routes/index.tsx must export):
${manifest.contract.indexRouteShape}

Pre-seeded shadcn components: ${manifest.preSeededComponents.join(", ")}
Available via <propose>: ${manifest.availableComponents.join(", ")}
Theme tokens already defined in src/index.css: ${manifest.themeTokens.join(", ")}`;

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
}): { system: string; user: string } {
  return {
    system: `You emit ONLY the strict response contract for generated apps:

<file path="src/...">full raw content</file>
<propose path="src/components/ui/<name>.tsx">reason</propose>
<done summary="..." />

Nothing else. No markdown fences. No prose. Unknown tags are a hard parse error.`,
    user: `Your previous response had a malformed structured block at byte offset ${input.errorOffset}: ${input.errorMessage}

Re-emit the COMPLETE response for the SAME task — every <file> block rewrite needed, then one <done summary="..." />. Follow the contract exactly.`,
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
  return {
    system: `You emit ONLY targeted <file> blocks for the files listed in the user turn, then exactly one <done summary="..." />.

Contract recap:
- <file path="src/...">full raw content (not JSON-escaped, no markdown fences)</file>
- Path allow-list: only under src/ (never src/content/site.ts, src/index.css, src/main.tsx, src/routes/__root.tsx) and public/.
- Only import dependencies the project's package.json already declares.
- Close every file with </file>. End with exactly one <done summary="..." />.`,
    user: `Diagnostics from the validation gates (fix these — re-emit ONLY the listed files, in full):

${input.diagnostics.map((line) => `- ${line}`).join("\n")}

Files to re-emit (current staged state, exactly as your previous response produced):

${currentBlocks}`,
  };
}
