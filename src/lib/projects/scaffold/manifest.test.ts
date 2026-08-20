import { describe, expect, it } from "vitest";

import { deriveScaffoldManifest } from "./manifest";
import { createViteTanStackShadcnStarterFiles } from "./vite-tanstack-shadcn-starter";

import { createProjectSiteSchemaFromBrief } from "@/lib/projects/site-schema";

function sampleStarterFiles() {
  const schema = createProjectSiteSchemaFromBrief({
    version: 1,
    notes: [],
    readyForBuild: true,
    prompt: "coffee shop",
    businessName: "Kopi Sela",
    businessType: "Coffee shop",
    offer: "Espresso, manual brew",
    targetCustomer: "Remote workers",
    contactOrCta: "WhatsApp",
    stylePreference: "Warm",
  } as never);
  return createViteTanStackShadcnStarterFiles("proj_test", schema);
}

describe("deriveScaffoldManifest", () => {
  it("lists the full starter file tree in stable order", () => {
    const manifest = deriveScaffoldManifest(sampleStarterFiles());
    expect(manifest.fileTree).toMatchInlineSnapshot(`
      [
        "public/placeholder.svg",
        "public/placeholder-vertical.svg",
        "package.json",
        "vite.config.ts",
        "tsconfig.json",
        "tsconfig.app.json",
        "tsconfig.node.json",
        "eslint.config.js",
        "index.html",
        "src/main.tsx",
        "src/index.css",
        "src/lib/utils.ts",
        "components.json",
        "src/components/ui/button.tsx",
        "src/components/ui/card.tsx",
        "src/router.tsx",
        "src/routes/__root.tsx",
        "src/routes/index.tsx",
        "src/routes/not-found.tsx",
        "src/content/site.ts",
        "src/lib/preview-ready.ts",
      ]
    `);
  });

  it("captures the structural contract sections verbatim", () => {
    const manifest = deriveScaffoldManifest(sampleStarterFiles());
    expect(manifest.contract.routerRegistration).toBe(
      'import { router } from "./router";',
    );
    expect(manifest.contract.rootLayout).toBe(
      "export const rootRoute = createRootRoute({\n  component: () => <Outlet />,\n});",
    );
    expect(manifest.contract.indexRouteShape).toBe(
      "export function HomeRouteComponent() {",
    );
  });

  it("exposes the pre-seeded shadcn components plus the copy_component registry", () => {
    const manifest = deriveScaffoldManifest(sampleStarterFiles());
    expect(manifest.preSeededComponents).toEqual(["button", "card"]);
    expect(manifest.availableComponents).toContain("accordion");
    expect(manifest.availableComponents).toContain("tooltip");
    expect(manifest.availableComponents.length).toBeGreaterThan(35);
  });

  it("surfaces the theme tokens declared by the starter CSS", () => {
    const manifest = deriveScaffoldManifest(sampleStarterFiles());
    for (const token of [
      "--background",
      "--foreground",
      "--muted",
      "--accent",
      "--primary",
    ]) {
      expect(manifest.themeTokens).toContain(token);
    }
  });

  it(
    "matches the checked-in scaffold shape exactly — update this snapshot " +
      "only when changing the scaffold on purpose",
    () => {
      const manifest = deriveScaffoldManifest(sampleStarterFiles());
      // Structural digest; drift here = prompt drift risk. Fix the scaffold
      expect({
        fileCount: manifest.fileTree.length,
        preSeeded: manifest.preSeededComponents,
        tokenCount: manifest.themeTokens.length,
        componentCount: manifest.availableComponents.length,
      }).toMatchInlineSnapshot(`
        {
          "componentCount": 45,
          "fileCount": 21,
          "preSeeded": [
            "button",
            "card",
          ],
          "tokenCount": 46,
        }
      `);
    },
  );
});
