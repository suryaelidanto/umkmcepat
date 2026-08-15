import { describe, expect, it } from "vitest";

import { compileProfessionalSiteRouter } from "./professional-site-router";

import type { ProfessionalRouteBinding } from "./professional-site-blueprint";

const homeBinding: ProfessionalRouteBinding = {
  path: "/",
  filePath: "src/routes/index.tsx",
  exportName: "HomeRouteComponent",
  purpose: "Beranda",
  primaryJob: "Memilih produk",
  requiredFactIds: ["offer-1"],
  requiredContentPaths: ["site.businessName", "site.offers", "site.primaryCta"],
  firstView: {
    identityText: "Kedai Senja",
    offerTexts: ["Kopi Senja"],
    primaryCtaLabel: "Pesan",
    primaryCtaHref: "https://wa.me/628123456789",
  },
  allowedPatternIds: ["full-field-lockup"],
  sections: [],
};

const kelasBinding: ProfessionalRouteBinding = {
  ...homeBinding,
  path: "/kelas",
  filePath: "src/routes/kelas.tsx",
  exportName: "KelasRouteComponent",
};

describe("compileProfessionalSiteRouter", () => {
  it("compiles protected static routes with hash history", () => {
    const file = compileProfessionalSiteRouter([homeBinding, kelasBinding]);

    expect(file.path).toBe("src/router.tsx");
    expect(file.content).toContain(
      'import { HomeRouteComponent } from "./routes/index"',
    );
    expect(file.content).toContain(
      'import { KelasRouteComponent } from "./routes/kelas"',
    );
    expect(file.content).toContain('path: "/kelas"');
    expect(file.content).toContain("createHashHistory()");
    expect(file.content).toContain(
      "rootRoute.addChildren([indexRoute, kelasRoute, notFoundRoute])",
    );
  });

  it("keeps route imports and definitions in binding order", () => {
    const file = compileProfessionalSiteRouter([homeBinding, kelasBinding]);
    expect(file.content.indexOf("HomeRouteComponent")).toBeLessThan(
      file.content.indexOf("KelasRouteComponent"),
    );
    expect(file.content).toContain("const indexRoute = createRoute");
    expect(file.content).toContain("const kelasRoute = createRoute");
    expect(file.content).not.toContain("createFileRoute");
  });

  it.each([
    ["duplicate paths", [homeBinding, homeBinding]],
    [
      "wrong root mapping",
      [{ ...homeBinding, filePath: "src/routes/home.tsx" }],
    ],
    [
      "unsafe import path",
      [{ ...homeBinding, filePath: "src/routes/../evil.tsx" }],
    ],
    [
      "too many routes",
      [
        homeBinding,
        kelasBinding,
        {
          ...kelasBinding,
          path: "/cerita",
          filePath: "src/routes/cerita.tsx",
          exportName: "CeritaRouteComponent",
        },
        {
          ...kelasBinding,
          path: "/kontak",
          filePath: "src/routes/kontak.tsx",
          exportName: "KontakRouteComponent",
        },
      ],
    ],
  ])("rejects %s", (_label, routes) => {
    expect(() => compileProfessionalSiteRouter(routes)).toThrow();
  });
});
