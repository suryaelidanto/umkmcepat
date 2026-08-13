import { describe, expect, it } from "vitest";

import { createGeneratedSitePrimitiveFiles } from "./generated-site-primitives";
import { selectGeneratedSiteDesignKit } from "../generated-site-design-kits/catalog";

describe("generated-site portable primitives", () => {
  it("emits one safe layout module for every kit", () => {
    const kit = selectGeneratedSiteDesignKit({
      archetype: "retail-catalog",
      density: "rich",
      mediaMode: "graphic",
      primaryJobKind: "compare",
      hasOperationalDetails: false,
    });
    const files = createGeneratedSitePrimitiveFiles(kit);
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe("src/components/site/layout.tsx");
    expect(files[0]?.content).toContain("export function SiteSection");
    expect(files[0]?.content).not.toMatch(
      /Lorem|Example Business|https?:\/\//i,
    );
    expect(files[0]?.content).not.toContain("dangerouslySetInnerHTML");
  });

  it("does not emit a complete fixed page sequence", () => {
    const kit = selectGeneratedSiteDesignKit({
      archetype: "generic",
      density: "sparse",
      mediaMode: "typographic",
      primaryJobKind: "inquire",
      hasOperationalDetails: false,
    });
    const [file] = createGeneratedSitePrimitiveFiles(kit);
    expect(file?.content).not.toMatch(/site\.(headline|products|testimonials)/);
    expect(file?.content).not.toMatch(/<h1|<footer|<header/);
  });
});
