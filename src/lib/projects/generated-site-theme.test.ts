import { describe, expect, it } from "vitest";

import { selectGeneratedSiteDesignKit } from "./generated-site-design-kits/catalog";
import {
  PROFESSIONAL_FONT_STACKS,
  applyGeneratedSiteThemeV2,
  compileGeneratedSiteThemeV2,
  compileProfessionalSiteTheme,
} from "./generated-site-theme";
import { PROFESSIONAL_DESIGN_KITS } from "./professional-site-kits";
import { normalizeSiteSchemaForEmit } from "./scaffold/vite-tanstack-shadcn-starter";

import type { WriterDesignPlanV3 } from "./professional-site-plan";
import type { ProjectSiteSchema } from "./site-schema";

function professionalPlan(
  kitId: "catalog-story" | "bold-typographic" = "catalog-story",
): WriterDesignPlanV3 {
  const kit = PROFESSIONAL_DESIGN_KITS.get(kitId);
  if (!kit) {
    throw new Error("professional kit missing");
  }
  return {
    schemaVersion: 3,
    blueprintHash: "a".repeat(64),
    visualThesis: "An accepted offer leads the first view.",
    signature: {
      route: "/",
      description: "An offer-led signature.",
      sourceAnchor: "offer",
    },
    typography: {
      displayStackId: kit.typography.allowedDisplayStackIds[0],
      bodyStackId: kit.typography.bodyStackId,
    },
    palette: {
      background: kitId === "bold-typographic" ? "#171b2b" : "#f7f3ec",
      foreground: kitId === "bold-typographic" ? "#f3f4ff" : "#3d2b1f",
      muted: kitId === "bold-typographic" ? "#2c3150" : "#e5ddd2",
      accent: kitId === "bold-typographic" ? "#9d7cff" : "#a34f2d",
    },
    routes: [],
    mobileTransforms: [],
  };
}

describe("professional site theme v3", () => {
  it("compiles local semantic font stacks without remote requests", () => {
    const kit = PROFESSIONAL_DESIGN_KITS.get("catalog-story");
    if (!kit) {
      throw new Error("professional kit missing");
    }
    const compiled = compileProfessionalSiteTheme({
      kit,
      plan: professionalPlan(),
    });
    expect(compiled.css).toContain("--font-display: var(--site-font-display)");
    expect(compiled.css).toContain("--font-body: var(--site-font-body)");
    expect(compiled.css).toContain("--site-font-display:");
    expect(compiled.css).toContain("--site-font-body:");
    expect(compiled.css).toContain("font-family: var(--site-font-body)");
    expect(compiled.css).not.toMatch(
      /url\(|@import[^;]*https?:|font-family:\s*['\"](?:editorial-serif|humanist-sans)/i,
    );
    expect(Object.values(PROFESSIONAL_FONT_STACKS)).toHaveLength(4);
  });

  it("rejects a plan stack outside the selected kit", () => {
    const kit = PROFESSIONAL_DESIGN_KITS.get("catalog-story");
    const wrongKit = PROFESSIONAL_DESIGN_KITS.get("bold-typographic");
    if (!kit || !wrongKit) {
      throw new Error("professional kit missing");
    }
    expect(() =>
      compileProfessionalSiteTheme({
        kit,
        plan: {
          ...professionalPlan(),
          typography: {
            ...professionalPlan().typography,
            displayStackId: wrongKit.typography.allowedDisplayStackIds[0],
          },
        },
      }),
    ).toThrow(/font|stack|kit/i);
  });

  it("is byte deterministic for equal kit and plan inputs", () => {
    const kit = PROFESSIONAL_DESIGN_KITS.get("catalog-story");
    if (!kit) {
      throw new Error("professional kit missing");
    }
    expect(
      compileProfessionalSiteTheme({ kit, plan: professionalPlan() }).css,
    ).toBe(compileProfessionalSiteTheme({ kit, plan: professionalPlan() }).css);
  });
});

describe("generated-site theme v2", () => {
  it("compiles a valid plan palette into readable semantic roles", () => {
    const theme = compileGeneratedSiteThemeV2({
      kit: selectGeneratedSiteDesignKit({
        archetype: "retail-catalog",
        density: "rich",
        mediaMode: "graphic",
        primaryJobKind: "compare",
        hasOperationalDetails: false,
      }),
      palette: {
        background: "#f7f3ec",
        foreground: "#3d2b1f",
        muted: "#e5ddd2",
        accent: "#d4a017",
      },
    });
    expect(theme.css).toContain("--background: #f7f3ec");
    expect(theme.checks.every((check) => check.pass)).toBe(true);
    expect(theme.schemaTheme).not.toEqual({
      background: "#f6f7f4",
      foreground: "#111312",
      muted: "#6b706d",
      accent: "#f05a28",
    });
  });

  it("keeps different kit palettes materially different", () => {
    const editorial = compileGeneratedSiteThemeV2({
      kit: selectGeneratedSiteDesignKit({
        archetype: "service-area",
        density: "sparse",
        mediaMode: "typographic",
        primaryJobKind: "inquire",
        hasOperationalDetails: false,
      }),
      palette: {
        background: "#faf9f6",
        foreground: "#2c1810",
        muted: "#e4ded7",
        accent: "#78350f",
      },
    });
    const bold = compileGeneratedSiteThemeV2({
      kit: selectGeneratedSiteDesignKit({
        archetype: "generic",
        density: "sparse",
        mediaMode: "graphic",
        primaryJobKind: "inquire",
        hasOperationalDetails: false,
      }),
      palette: {
        background: "#171b2b",
        foreground: "#f3f4ff",
        muted: "#2c3150",
        accent: "#9d7cff",
      },
    });
    expect(editorial.css).not.toBe(bold.css);
  });

  it("rejects invalid palette values", () => {
    expect(() =>
      compileGeneratedSiteThemeV2({
        kit: selectGeneratedSiteDesignKit({
          archetype: "generic",
          density: "sparse",
          mediaMode: "graphic",
          primaryJobKind: "inquire",
          hasOperationalDetails: false,
        }),
        palette: {
          background: "#fff",
          foreground: "#111111",
          muted: "#222222",
          accent: "#333333",
        },
      }),
    ).toThrow("invalid generated theme palette");
  });

  it("keeps site.ts normalized when the theme injects the writer's palette", () => {
    // The starter's own site.ts is correctly normalized
    const rawSchema: ProjectSiteSchema = {
      version: 1,
      businessName: "Seblak Surya",
      eyebrow: "Kuliner lokal",
      headline: "H",
      subheadline: "S",
      primaryCta: "Pesan",
      secondaryCta: "Menu",
      audience: "Mahasiswa",
      offer: "Seblak",
      theme: {
        background: "#000000",
        foreground: "#000000",
        muted: "#000000",
        accent: "#000000",
      },
      trustPoints: [],
      sections: [],
      products: [
        { name: "Seblak Ceker", priceRange: "Rp10.000" },
        {
          name: "Seblak Sultan",
          description: "Lengkap",
          priceRange: "Rp20.000",
        },
      ],
      paymentMethods: [{ method: "cash" }, { method: "qris", detail: "app" }],
    };
    const theme = compileGeneratedSiteThemeV2({
      kit: selectGeneratedSiteDesignKit({
        archetype: "retail-catalog",
        density: "rich",
        mediaMode: "graphic",
        primaryJobKind: "compare",
        hasOperationalDetails: false,
      }),
      palette: {
        background: "#f7f3ec",
        foreground: "#3d2b1f",
        muted: "#e5ddd2",
        accent: "#d4a017",
      },
    });
    const applied = applyGeneratedSiteThemeV2({
      files: [{ path: "src/content/site.ts", content: "placeholder" }],
      schema: rawSchema,
      theme,
    });
    const siteFile = applied.find(
      (file) => file.path === "src/content/site.ts",
    );
    const match = siteFile?.content.match(
      /export const site = ([\s\S]+) as const;/,
    );
    const parsed = match
      ? (JSON.parse(match[1]) as Record<string, unknown>)
      : null;

    expect(parsed).toEqual(
      normalizeSiteSchemaForEmit({ ...rawSchema, theme: theme.schemaTheme }),
    );
  });
});
