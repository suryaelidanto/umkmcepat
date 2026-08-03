import { describe, expect, it } from "vitest";

import {
  buildAllowList,
  compileRoutePatterns,
  compileTopologyFiles,
  type CompiledTopology,
} from "./topology-compiler";

function plan() {
  return {
    schemaVersion: 1,
    revision: 1,
    contractHash: "c",
    contentHash: "",
    appKind: "marketing_site",
    archetype: "fnb",
    pages: [
      {
        id: "home",
        path: "/",
        title: "Home",
        purpose: "Landing",
        visitorJobIds: ["order"],
        requiredFactIds: ["contact-primary"],
        sections: [
          {
            id: "hero",
            purpose: "Intro",
            surfaceIntent: "full_bleed",
            requiredFactIds: [],
            requiredAssetIds: [],
          },
        ],
      },
      {
        id: "katalog",
        path: "/katalog",
        title: "Katalog",
        purpose: "Browse offers",
        visitorJobIds: [],
        requiredFactIds: [],
        sections: [],
      },
    ],
    navigation: [{ fromPageId: "home", toPageId: "katalog", label: "Katalog" }],
    capabilities: ["static_content", "whatsapp_cta"],
    artDirection: {
      businessSpecificReference: "",
      antiReferences: [],
      imageStrategy: "typographic",
      fontStrategy: "system_stack",
    },
  } as const;
}

describe("compileRoutePatterns", () => {
  it("returns exactly one root plus every planned route", () => {
    const patterns = compileRoutePatterns(plan() as never);
    expect(patterns).toEqual(["/", "/katalog"]);
  });
});

describe("buildAllowList", () => {
  it("exposes only the generated creative paths, not a broad src/** rule", () => {
    const allow = buildAllowList(plan() as never);
    expect(allow).toContain("src/generated/site-shell.tsx");
    expect(allow).toContain("src/generated/pages/katalog.tsx");
    expect(allow).toContain("src/generated/theme.css");
    // Broad paths must not be allowed.
    expect(allow.includes("src")).toBe(false);
    expect(allow.some((p) => p === "src/router.tsx")).toBe(false);
  });
});

describe("compileTopologyFiles", () => {
  it("compiles one root shell, hash history, and a 404 route", () => {
    const topology = compileTopologyFiles(plan() as never);
    expect(topology.files["src/router.tsx"]).toContain("createHashHistory");
    expect(topology.files["src/routes/__root.tsx"]).toContain(
      "<SiteShell><Outlet /></SiteShell>",
    );
    expect(topology.files["src/routes/not-found.tsx"]).toBeTruthy();
    expect(topology.files["generated-app.manifest.json"]).toBeTruthy();
  });

  it("produces a CompiledTopology with protected files and manifest", () => {
    const topo: CompiledTopology = compileTopologyFiles(plan() as never);
    expect(topo.protectedFiles).toContain("src/router.tsx");
    expect(topo.routePatterns).toContain("/katalog");
    expect(topo.representativePaths).toContain("/katalog");
  });
});
