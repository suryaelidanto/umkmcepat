import { describe, expect, it } from "vitest";

import { compileGeneratedSiteRouter } from "./generated-site-router";

import type { GeneratedRouteBinding } from "./generated-site-router";

const homeBinding: GeneratedRouteBinding = {
  path: "/",
  filePath: "src/routes/index.tsx",
  exportName: "HomeRouteComponent",
};

const kelasBinding: GeneratedRouteBinding = {
  ...homeBinding,
  path: "/kelas",
  filePath: "src/routes/kelas.tsx",
  exportName: "KelasRouteComponent",
};

describe("compileGeneratedSiteRouter", () => {
  it("compiles protected static routes with hash history", () => {
    const file = compileGeneratedSiteRouter([homeBinding, kelasBinding]);

    expect(file.path).toBe("src/router.tsx");
    expect(file.content).toContain(
      'import * as indexRouteModule from "./routes/index"',
    );
    expect(file.content).toContain("indexRouteModule.HomeRouteComponent ??");
    expect(file.content).toContain(
      'import * as kelasRouteModule from "./routes/kelas"',
    );
    expect(file.content).toContain('path: "/kelas"');
    expect(file.content).toContain("createHashHistory()");
    expect(file.content).toContain(
      "rootRoute.addChildren([indexRoute, kelasRoute, notFoundRoute])",
    );
  });

  it("keeps route imports and definitions in binding order", () => {
    const file = compileGeneratedSiteRouter([homeBinding, kelasBinding]);
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
    expect(() => compileGeneratedSiteRouter(routes)).toThrow();
  });
});

describe("compileGeneratedSiteRouter", () => {
  it("registers every accepted route without extra metadata", () => {
    const file = compileGeneratedSiteRouter([
      {
        path: "/",
        filePath: "src/routes/index.tsx",
        exportName: "HomeRouteComponent",
      },
      {
        path: "/katalog",
        filePath: "src/routes/katalog.tsx",
        exportName: "KatalogRouteComponent",
      },
    ]);

    expect(file.content).toContain(
      'import * as katalogRouteModule from "./routes/katalog"',
    );
    expect(file.content).toContain('path: "/katalog"');
    expect(file.content).toContain(
      "rootRoute.addChildren([indexRoute, katalogRoute, notFoundRoute])",
    );
  });

  it("rejects unsafe or incomplete live bindings", () => {
    expect(() =>
      compileGeneratedSiteRouter([
        {
          path: "/",
          filePath: "src/routes/index.tsx",
          exportName: "HomeRouteComponent",
        },
        {
          path: "/katalog/:id",
          filePath: "src/routes/katalog.tsx",
          exportName: "KatalogRouteComponent",
        },
      ]),
    ).toThrow();
  });
});
