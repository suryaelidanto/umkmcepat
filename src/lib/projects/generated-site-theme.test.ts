import { describe, expect, it } from "vitest";

import { selectGeneratedSiteDesignKit } from "./generated-site-design-kits/catalog";
import { compileGeneratedSiteThemeV2 } from "./generated-site-theme";

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
});
