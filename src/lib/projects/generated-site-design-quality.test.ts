import { describe, expect, it } from "vitest";

import { deriveGeneratedSitePageStrategy } from "./generated-site-design-quality";

function routes(paths: string[]) {
  return {
    obligations: {
      routes: paths.map((path) => ({
        path,
        purpose: path === "/" ? "Beranda" : "Katalog",
        requiredFactIds: [],
        requiredSectionIds: [path === "/" ? "hero" : "catalog"],
      })),
    },
  };
}

describe("generated-site design quality", () => {
  it("keeps one route as a single-page strategy", () => {
    expect(deriveGeneratedSitePageStrategy(routes(["/"]))).toEqual({
      mode: "single",
      reason: "single-primary-job",
      routeCount: 1,
    });
  });

  it("keeps distinct accepted routes as a multi-page strategy", () => {
    expect(deriveGeneratedSitePageStrategy(routes(["/", "/katalog"]))).toEqual({
      mode: "multi",
      reason: "distinct-routes",
      routeCount: 2,
    });
  });
});
