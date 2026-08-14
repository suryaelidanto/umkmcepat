import { describe, expect, it } from "vitest";

import {
  buildReferenceCalibratedCorrectionPrompt,
  buildReferenceCalibratedWriterPrompt,
  buildTargetedRepairPrompt,
} from "./batched-prompt";
import { selectGeneratedSiteDesignKit } from "./generated-site-design-kits/catalog";

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
    expect(prompt.system).toContain("<design-plan>");
    expect(prompt.system).toContain("src/content/site.ts");
    expect(prompt.system).toContain("SiteSection accepts children");
    expect(prompt.system).toContain("site.primaryCta is a string");
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
    expect(prompt.system).toContain("semantic Tailwind tokens");
    expect(prompt.system).toContain("Never invent");
    expect(prompt.system).toContain("site.headline");
    expect(prompt.system).toContain("+6281100000000");
    expect(prompt.system).toContain("SiteSplit accepts children");
    expect(prompt.system).toContain("site.primaryCta is a string");
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
