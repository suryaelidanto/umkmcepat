import { describe, expect, it } from "vitest";

import {
  DESIGN_DOC_HEADERS,
  buildDesignAnchorContext,
  buildDesignMarkdown,
  buildProductMarkdown,
  designDirectionSchema,
  DESIGN_DOC_PATH,
  PRODUCT_DOC_PATH,
} from "./generated-design-docs";

import type { ProjectSiteSchema } from "@/lib/projects/site-schema";

const schema: ProjectSiteSchema = {
  version: 1,
  businessName: "Cuci Sepatu",
  eyebrow: "Layanan",
  headline: "Cuci Sepatu Bersih",
  subheadline: "Cepat dan Rapi",
  primaryCta: "Pesan",
  secondaryCta: "Info",
  audience: "Umum",
  offer: "Cuci Sepatu Express",
  theme: {
    background: "#ffffff",
    foreground: "#0f172a",
    muted: "#f1f5f9",
    accent: "#0369a1",
  },
  trustPoints: [],
  sections: [],
  products: [{ name: "Cuci Sepatu Express", priceRange: "Mulai 25rb" }],
  contact: { channel: "whatsapp", value: "628123456789" },
};

const direction = {
  contentArchitecture: "Offer, proof, and contact follow a clear reading path.",
  conversionThesis:
    "One visible action should move a ready visitor to contact.",
  firstViewport: "Offer and action lead.",
  responsiveIntent:
    "Stack the offer and action before secondary detail on small screens.",
  form: "Editorial ledger",
  motionThesis: "One measured reveal.",
  sparseDataStrategy:
    "Use typography, rhythm, and empty space when owner evidence is absent.",
  ownWorld: "Ink and paper with a single accent.",
  seedKey: "seed-test",
  story: "Understand the offer and contact the owner.",
  thesis: "The offer leads instead of a generic hero.",
};

describe("generated design docs", () => {
  it.each([
    "thesis",
    "conversionThesis",
    "ownWorld",
    "contentArchitecture",
    "firstViewport",
    "responsiveIntent",
    "sparseDataStrategy",
    "motionThesis",
  ] as const)("rejects a direction without %s", (field) => {
    const candidate: Record<string, unknown> = { ...direction };
    delete candidate[field];

    expect(designDirectionSchema.safeParse(candidate).success).toBe(false);
  });

  it("emits product facts and claim boundaries from the schema", () => {
    const md = buildProductMarkdown(schema);
    expect(md).toContain("# PRODUCT");
    expect(md).toContain("Cuci Sepatu");
    expect(md).toContain("Cuci Sepatu Express");
    expect(md).toContain("628123456789");
    expect(md).toContain("Batasan klaim");
  });

  it("emits every design contract block after direction and system", () => {
    const md = buildDesignMarkdown({
      direction,
      system: {
        accent: "#0369a1",
        accentForeground: "#ffffff",
        background: "#f8fafc",
        bodyFontStackId: "system-humanist",
        border: "#cbd5e1",
        card: "#ffffff",
        cardForeground: "#0f172a",
        displayFontStackId: "system-editorial",
        foreground: "#0f172a",
        muted: "#f1f5f9",
        mutedForeground: "#475569",
        primary: "#0f172a",
        primaryForeground: "#ffffff",
        radiusScale: "restrained",
        ring: "#0369a1",
      },
    });
    for (const header of DESIGN_DOC_HEADERS) {
      expect(md).toContain(header);
    }
    expect(md).toContain("#f8fafc");
    expect(md).toContain("system-editorial");
    expect(md).toContain("seed-test");
  });

  it("keeps content visible and reduced-motion honored in the motion block", () => {
    const md = buildDesignMarkdown({ direction, system: null });
    expect(md).toContain("prefers-reduced-motion");
    const optOut = buildDesignMarkdown({
      direction,
      motionOptOut: true,
      system: null,
    });
    expect(optOut).toContain("Tanpa animasi");
  });

  it("injects both docs into the iteration anchor context", () => {
    const files = [
      { content: "FAKTA MARKER", path: PRODUCT_DOC_PATH },
      { content: "DESAIN MARKER", path: DESIGN_DOC_PATH },
      { content: "site", path: "src/content/site.ts" },
    ];
    const context = buildDesignAnchorContext(files);
    expect(context).toContain("FAKTA MARKER");
    expect(context).toContain("DESAIN MARKER");
    expect(context).not.toContain("src/content/site.ts");
  });

  it("returns empty context when neither doc exists", () => {
    expect(
      buildDesignAnchorContext([
        { content: "site", path: "src/content/site.ts" },
      ]),
    ).toBe("");
  });
});
