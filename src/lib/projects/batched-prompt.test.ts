import { describe, expect, it } from "vitest";

import {
  buildReferenceCalibratedCorrectionPrompt,
  buildReferenceCalibratedWriterPrompt,
  buildTargetedRepairPrompt,
} from "./batched-prompt";
import { selectGeneratedSiteDesignKit } from "./generated-site-design-kits/catalog";
import { referenceCalibratedRequiredContentFields } from "./generated-site-gates";

import type { GeneratedSiteWriterContractV2 } from "./generated-site-contract";
import type { GeneratedProjectFile } from "./generated-types";

const SITE_TS = `export const site = {
  businessName: "SuryaPhone",
  headline: "iPhone bekas berkualitas",
  primaryCta: "Chat WhatsApp",
  sections: [{ title: "Produk" }],
  testimonials: [{ quote: "q", author: "a" }],
  socialLinks: [{ label: "IG", href: "https://ig.com" }],
} as const;
export default site;`;

const INDEX_TSX = `import { site } from "@/content/site";
export function HomeRouteComponent() { return <main />; }`;

function writerContract(): GeneratedSiteWriterContractV2 {
  return {
    schemaVersion: 2,
    contractHash: "a".repeat(64),
    handoff: { contractHash: "b".repeat(64), planHash: "c".repeat(64) },
    business: {
      name: "Usaha Sintetis",
      type: "retail",
      audience: "Pembeli",
      primaryJob: "Memilih produk",
      primaryCta: {
        kind: "whatsapp",
        label: "Chat WhatsApp",
        target: "+6281100000000",
      },
    },
    content: {
      headline: "Pilih dengan mudah",
      subheadline: "Lihat pilihan yang tersedia.",
      offer: "Produk utama",
      promotion: null,
      trustPoints: ["Info jelas"],
      products: [],
      testimonials: [],
      faq: [],
      usp: [],
      hours: [],
      paymentMethods: [],
      priceRange: null,
      address: null,
      deliveryArea: null,
      socialLinks: [],
    },
    obligations: {
      routes: [
        {
          path: "/",
          purpose: "Beranda",
          requiredFactIds: [],
          requiredSectionIds: ["hero"],
        },
      ],
      sections: [{ id: "hero", purpose: "Penawaran", requiredFactIds: [] }],
      prohibitedClaims: [],
    },
    media: { mode: "graphic", approvedAssets: [] },
    visualInputs: {
      direction: "hangat",
      density: "sparse",
      selectedKitId: "bold-typographic",
      selectedKitVersion: 1,
    },
  };
}

describe("buildReferenceCalibratedWriterPrompt", () => {
  it("states the numeric gate rules the writer keeps failing", () => {
    // A real build failed on both: 4 tracked uppercase labels where 1 was
    // allowed, and site.usp never rendered. The prompt only said "do not
    // repeat eyebrow scaffolding" and "render every populated contract fact".
    const kit = selectGeneratedSiteDesignKit({
      archetype: "generic",
      density: "sparse",
      hasOperationalDetails: false,
      mediaMode: "graphic",
      primaryJobKind: "inquire",
    });
    const contract = writerContract();
    const prompt = buildReferenceCalibratedWriterPrompt({
      contract,
      kit,
      projectId: "benchmark-project",
      schema: {} as never,
    });

    for (const field of referenceCalibratedRequiredContentFields(contract)) {
      expect(prompt.system).toContain(`site.${field}`);
    }
    expect(prompt.system).toMatch(/uppercase/i);
    expect(prompt.system).toMatch(/\b1 className\b/);
  });

  it("gives the writer the exact CTA digits and the pattern id it is checked for", () => {
    // kit-pattern-missing greps for the composition pattern id, and
    // primary-cta-target-missing greps for the accepted digits. The writer
    // prompt named neither, so both were unreachable by construction.
    const kit = selectGeneratedSiteDesignKit({
      archetype: "generic",
      density: "sparse",
      hasOperationalDetails: false,
      mediaMode: "graphic",
      primaryJobKind: "inquire",
    });
    const contract = writerContract();
    const prompt = buildReferenceCalibratedWriterPrompt({
      contract,
      kit,
      projectId: "benchmark-project",
      schema: {} as never,
      compositionPatternId: "full-field-lockup",
    });

    expect(prompt.system).toContain("data-pattern");
    expect(prompt.system).toContain("full-field-lockup");
    expect(prompt.system).toContain(
      contract.business.primaryCta.target.replace(/\D/g, ""),
    );
  });

  it("carries the frozen creative direction and omits the section without one", () => {
    const kit = selectGeneratedSiteDesignKit({
      archetype: "generic",
      density: "sparse",
      hasOperationalDetails: false,
      mediaMode: "graphic",
      primaryJobKind: "inquire",
    });
    const withDirection = buildReferenceCalibratedWriterPrompt({
      contract: writerContract(),
      kit,
      projectId: "benchmark-project",
      schema: {} as never,
      creativeDirection:
        "Lead with the filling portion a student can afford after class.",
    });
    const withoutDirection = buildReferenceCalibratedWriterPrompt({
      contract: writerContract(),
      kit,
      projectId: "benchmark-project",
      schema: {} as never,
    });

    expect(withDirection.system).toContain(
      "Lead with the filling portion a student can afford after class.",
    );
    expect(withDirection.system).toMatch(/CREATIVE DIRECTION/);
    expect(withDirection.system).toMatch(/never a source of facts/i);
    expect(withoutDirection.system).not.toMatch(/CREATIVE DIRECTION/);
  });

  it("grounds one writer response in one executable kit without fixed-route prose", () => {
    const kit = selectGeneratedSiteDesignKit({
      archetype: "generic",
      density: "sparse",
      mediaMode: "graphic",
      primaryJobKind: "inquire",
      hasOperationalDetails: false,
    });
    const prompt = buildReferenceCalibratedWriterPrompt({
      contract: writerContract(),
      kit,
      projectId: "benchmark-project",
      schema: {} as never,
    });
    expect(prompt.system).toContain("bold-typographic");
    expect(prompt.system).toContain("full-field-lockup");
    expect(prompt.system).toContain("DESIGN STANDARDS");
    expect(prompt.system).toContain("meaningful inline SVG");
    expect(prompt.system).toContain(
      "platform supplies the accepted design plan",
    );
    expect(prompt.system).toContain(
      'Your first visible characters must be <file path="src/routes/index.tsx">',
    );
    expect(prompt.system).toContain("src/content/site.ts");
    // Reproduced live: the writer referenced site.usp when this business's
    // usp was empty and the key did not exist on the schema at all.
    expect(prompt.system).toContain(
      "never a field this business has no data for",
    );
    expect(prompt.system).toContain("SiteSection accepts children");
    expect(prompt.system).toContain("SiteCluster does not accept gap");
    expect(prompt.system).toContain("site.primaryCta is a string");
    expect(prompt.system).toContain("Never read site.theme in JSX");
    expect(prompt.system).toContain(
      "text-muted, text-card, text-popover, text-secondary, and text-background are surface tokens, never text colors",
    );
    // Reproduced live: text-muted-foreground inside SiteSection surface=
    // "contrast" (which compiles to bg-foreground text-background) read at
    // contrast ratio 1.00 — that token family is only readable against the
    // light background/muted/card/popover surfaces.
    expect(prompt.system).toContain(
      'Inside SiteSection surface="contrast" or any bg-foreground element, text-foreground, text-muted-foreground, text-card-foreground, text-popover-foreground, and text-secondary-foreground are invisible too',
    );
    // Reproduced live: a real build's CTA button paired bg-accent with bare
    // text-foreground at 2.68:1, needing 4.5 — text-foreground is calibrated
    // for the page's light background, not for bg-accent/bg-primary.
    expect(prompt.system).toContain(
      "bg-accent and bg-primary need text-accent-foreground and text-primary-foreground",
    );
    expect(prompt.system).toContain("one deliberate signature");
    // Reproduced live: a real build rendered site.trustPoints and site.usp
    // as two adjacent sections with byte-identical items — visibly
    // repetitive, since usp falls back to trustPoints verbatim whenever
    // the brief has no distinct usp of its own.
    expect(prompt.system).toContain(
      "site.trustPoints and site.usp are often the same values — never render both",
    );
    expect(prompt.system).toContain(
      "Do not repeat eyebrow or numbered-marker scaffolding",
    );
    expect(prompt.system).toContain("page strategy");
    expect(prompt.system).toContain(kit.taste.typeGuidance);
    expect(prompt.system).toContain(
      "usePreviewReady() as a standalone statement",
    );
    expect(prompt.system).toContain("export function HomeRouteComponent()");
    expect(prompt.system).not.toContain("createGeneratedSiteRouteSource");
    expect(prompt.user).toContain("Usaha Sintetis");
  });

  it("forbids reasoning and keeps the V2 output contract compact", () => {
    const kit = selectGeneratedSiteDesignKit({
      archetype: "generic",
      density: "sparse",
      mediaMode: "graphic",
      primaryJobKind: "inquire",
      hasOperationalDetails: false,
    });
    const prompt = buildReferenceCalibratedWriterPrompt({
      contract: writerContract(),
      kit,
      projectId: "benchmark-project",
      schema: {} as never,
    });

    expect(prompt.system).toContain("Emit no reasoning");
    expect(prompt.system).toContain("Never omit done");
    expect(prompt.system.length + prompt.user.length).toBeLessThan(12_000);
  });

  it("limits reference output to one compact route file", () => {
    const kit = selectGeneratedSiteDesignKit({
      archetype: "generic",
      density: "sparse",
      mediaMode: "graphic",
      primaryJobKind: "inquire",
      hasOperationalDetails: false,
    });
    const prompt = buildReferenceCalibratedWriterPrompt({
      contract: writerContract(),
      kit,
      projectId: "benchmark-project",
      schema: {} as never,
    });

    expect(prompt.system).toContain(
      "Writable paths only: src/routes/index.tsx.",
    );
    expect(prompt.system).toContain("Keep the route compact");
    expect(prompt.system).toContain("8,000 characters");
    expect(prompt.system).not.toContain("src/components/site/sections.tsx");
  });
});

describe("buildReferenceCalibratedCorrectionPrompt", () => {
  it("makes source, fact, and correction scope constraints explicit", () => {
    const kit = selectGeneratedSiteDesignKit({
      archetype: "generic",
      density: "sparse",
      mediaMode: "graphic",
      primaryJobKind: "inquire",
      hasOperationalDetails: false,
    });
    const prompt = buildReferenceCalibratedCorrectionPrompt({
      contract: writerContract(),
      kit,
      projectId: "benchmark-project",
      acceptedPlan: null,
      reason: "source_gate",
      diagnostics: ["site.headline is not rendered"],
      implicatedPaths: ["src/routes/index.tsx"],
      files: [
        {
          path: "src/routes/index.tsx",
          content: "export function HomeRouteComponent() { return null; }",
        },
      ],
    });

    expect(prompt.system).toContain("@/content/site");
    expect(prompt.system).toContain("DESIGN STANDARDS");
    expect(prompt.system).toContain("semantic Tailwind tokens");
    expect(prompt.system).toContain(
      "text-muted, text-card, text-popover, text-secondary, and text-background are surface tokens, never text colors",
    );
    expect(prompt.system).toContain(
      'inside surface="contrast" or any bg-foreground element, text-foreground, text-muted-foreground, text-card-foreground, text-popover-foreground, and text-secondary-foreground are invisible too',
    );
    expect(prompt.system).toContain(
      "bg-accent and bg-primary need text-accent-foreground and text-primary-foreground",
    );
    expect(prompt.system).toContain(
      "site.trustPoints and site.usp are often the same values — never render both",
    );
    expect(prompt.system).toContain("Never invent");
    expect(prompt.system).toContain("site.headline");
    expect(prompt.system).toContain("+6281100000000");
    expect(prompt.system).toContain("SiteSplit accepts children");
    expect(prompt.system).toContain("site.primaryCta is a string");
    expect(prompt.system).toContain("Keep the correction compact");
    expect(prompt.system).toContain("8,000 characters");
    expect(prompt.user).toContain("site.headline is not rendered");
    expect(prompt.user).toContain("src/routes/index.tsx");
  });
});

describe("buildTargetedRepairPrompt", () => {
  it("includes the site.ts data source so the model can render the named site.<field> instead of inventing local data", () => {
    const stagedMap = new Map<string, { content: string; path: string }>();
    stagedMap.set("src/content/site.ts", {
      content: SITE_TS,
      path: "src/content/site.ts",
    });
    stagedMap.set("src/routes/index.tsx", {
      content: INDEX_TSX,
      path: "src/routes/index.tsx",
    });

    const { user } = buildTargetedRepairPrompt({
      diagnostics: [
        "src/routes/index.tsx does not render site.sections — site.ts has data for this field but it never appears inside JSX. Render it as a visible element, not a comment or unused variable.",
      ],
      implicatedPaths: ["src/routes/index.tsx"],
      staged: stagedMap,
      starterFiles: [] as GeneratedProjectFile[],
    });

    expect(user).toContain(SITE_TS);
    expect(user).toMatch(/READ-ONLY data source/i);
  });

  it("does not ask the model to re-emit site.ts (read-only reference)", () => {
    const stagedMap = new Map<string, { content: string; path: string }>();
    stagedMap.set("src/content/site.ts", {
      content: SITE_TS,
      path: "src/content/site.ts",
    });
    stagedMap.set("src/routes/index.tsx", {
      content: INDEX_TSX,
      path: "src/routes/index.tsx",
    });

    const { user } = buildTargetedRepairPrompt({
      diagnostics: [
        "src/routes/index.tsx does not render site.testimonials — render it.",
      ],
      implicatedPaths: ["src/routes/index.tsx"],
      staged: stagedMap,
      starterFiles: [] as GeneratedProjectFile[],
    });

    // site.ts must NOT appear in the "Files to re-emit" section.
    const reEmitMatch = user.match(/Files to re-emit[\s\S]*?(?=\n\n|$)/);
    expect(reEmitMatch?.[0]).not.toContain("src/content/site.ts");
  });
});
