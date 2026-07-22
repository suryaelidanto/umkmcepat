import { describe, expect, it } from "vitest";

import { SHADCN_COMPONENT_FILES } from "./shadcn-components";
import { createViteTanStackShadcnStarterFiles } from "./vite-tanstack-shadcn-starter";

import {
  createGeneratedViteTanStackStarterFiles,
  createStarterContractStyles,
} from "@/lib/projects/generated-source";
import { createProjectSiteSchemaFromBrief } from "@/lib/projects/site-schema";

function schema() {
  return createProjectSiteSchemaFromBrief({
    businessName: "Test Biz",
    businessType: "Coffee shop",
    contactOrCta: "WhatsApp",
    notes: [],
    offer: "Menu kopi dan lokasi",
    prompt: "buat website coffee shop",
    stylePreference: "Hangat",
    targetCustomer: "Mahasiswa",
    version: 1,
    productOrService: null,
    contact: null,
    tagline: null,
    usp: null,
    priceRange: null,
    visuals: null,
    hours: null,
    address: null,
    deliveryArea: null,
    since: null,
    testimonials: null,
    certifications: null,
    paymentMethods: null,
    socialLinks: null,
    currentPromo: null,
    secondaryCta: null,
    readyForBuild: false,
  });
}

describe("createViteTanStackShadcnStarterFiles", () => {
  const files = createViteTanStackShadcnStarterFiles("proj_1", schema());
  const paths = files.map((f) => f.path);

  it("includes the shadcn base files", () => {
    expect(paths).toContain("components.json");
    expect(paths).toContain("src/lib/utils.ts");
    expect(paths).toContain("src/components/ui/button.tsx");
    expect(paths).toContain("src/components/ui/card.tsx");
    expect(paths).toContain("src/components/ui/badge.tsx");
    expect(paths).toContain("src/components/ui/input.tsx");
    expect(paths).toContain("src/components/ui/label.tsx");
    expect(paths).toContain("src/components/ui/separator.tsx");
  });

  it("does not emit the legacy src/styles.css", () => {
    expect(paths).not.toContain("src/styles.css");
  });

  it("index.css is Tailwind-v4-only with theme vars, no contract classes", () => {
    const css = files.find((f) => f.path === "src/index.css")?.content ?? "";
    expect(css).toContain('@import "tailwindcss"');
    expect(css).not.toContain(".starter-shell");
    expect(css).not.toContain(".site-header");
    expect(css).not.toContain(".fab-wa");
  });

  it("index.css defines shadcn vars the seeded components reference", () => {
    const css = files.find((f) => f.path === "src/index.css")?.content ?? "";
    // Vars referenced by button/card/badge/input/label/separator + theme.
    expect(css).toContain("--background");
    expect(css).toContain("--foreground");
    expect(css).toContain("--primary");
    expect(css).toContain("--primary-foreground");
    expect(css).toContain("--secondary");
    expect(css).toContain("--secondary-foreground");
    expect(css).toContain("--muted");
    expect(css).toContain("--muted-foreground");
    expect(css).toContain("--accent");
    expect(css).toContain("--accent-foreground");
    expect(css).toContain("--destructive");
    expect(css).toContain("--border");
    expect(css).toContain("--input");
    expect(css).toContain("--ring");
    expect(css).toContain("--card");
    expect(css).toContain("--card-foreground");
  });

  it("router.tsx has a 404 catch-all route and hash history", () => {
    const router =
      files.find((f) => f.path === "src/router.tsx")?.content ?? "";
    expect(router).toContain("createHashHistory");
    expect(router).toMatch(/path:\s*["']\*["']/);
    expect(router).toContain("NotFoundRouteComponent");
  });

  it("vite.config.ts has the @ alias and matches the platform-owned config", () => {
    const vite = files.find((f) => f.path === "vite.config.ts")?.content ?? "";
    expect(vite).toContain("alias");
    expect(vite).toContain('"@"');
    expect(vite).toContain("path.resolve");
  });

  it("tsconfig.app.json has the @ path mapping", () => {
    const tsconfig =
      files.find((f) => f.path === "tsconfig.app.json")?.content ?? "";
    expect(tsconfig).toContain('"baseUrl"');
    expect(tsconfig).toContain('"paths"');
    expect(tsconfig).toContain('"@/*"');
  });

  it("main.tsx imports index.css (not styles.css)", () => {
    const main = files.find((f) => f.path === "src/main.tsx")?.content ?? "";
    expect(main).toContain("./index.css");
    expect(main).not.toContain("styles.css");
  });

  it("index route has the Task-5 stale-starter marker comment and shadcn UI", () => {
    const index =
      files.find((f) => f.path === "src/routes/index.tsx")?.content ?? "";
    expect(index).toContain(
      "// Replace this with the real home page built from the brief",
    );
    expect(index).not.toContain("starterMessage");
    expect(index).toContain("Card");
    expect(index).toContain("Button");
    expect(index).toContain("usePreviewReady");
  });

  it("not-found route uses Button and links home", () => {
    const notFound =
      files.find((f) => f.path === "src/routes/not-found.tsx")?.content ?? "";
    expect(notFound).toContain("Button");
    expect(notFound).toContain("NotFoundRouteComponent");
  });

  it("package.json seeds the shadcn deps with allowed semver specifiers", () => {
    const pkg = JSON.parse(
      files.find((f) => f.path === "package.json")?.content ?? "{}",
    );
    expect(pkg.dependencies).toHaveProperty(
      "class-variance-authority",
      expect.stringMatching(/^\^?\d+\.\d+\.\d+/),
    );
    expect(pkg.dependencies).toHaveProperty("tailwind-merge");
    expect(pkg.dependencies).toHaveProperty("@radix-ui/react-slot");
    expect(pkg.dependencies).toHaveProperty("@radix-ui/react-label");
    expect(pkg.dependencies).toHaveProperty("@radix-ui/react-separator");
  });

  it("exports the starter placeholder site content", () => {
    const site =
      files.find((f) => f.path === "src/content/site.ts")?.content ?? "";
    expect(site).toContain("export const site");
    expect(site).toContain("export default site");
  });
});

describe("createGeneratedViteTanStackStarterFiles (delegation re-export)", () => {
  it("delegates to the shadcn starter (same paths)", () => {
    const delegated = createGeneratedViteTanStackStarterFiles(
      "proj_2",
      schema(),
    );
    const direct = createViteTanStackShadcnStarterFiles("proj_2", schema());
    expect(delegated.map((f) => f.path)).toEqual(direct.map((f) => f.path));
  });

  it("createStarterContractStyles still exists (legacy re-export)", () => {
    // The function is kept as a thin re-export so downstream imports don't
    // break during the transition (custom-source-generator still imports it).
    expect(typeof createStarterContractStyles).toBe("function");
  });
});

describe("SHADCN_COMPONENT_FILES (full shadcn seed)", () => {
  it("seeds the full shadcn component set", () => {
    const paths = SHADCN_COMPONENT_FILES.map((f) => f.path);
    // Representative — the count guard catches missing additions.
    expect(
      paths.filter((p) => p.startsWith("src/components/ui/")).length,
    ).toBeGreaterThanOrEqual(30);
    for (const name of [
      "button",
      "card",
      "dialog",
      "accordion",
      "tabs",
      "dropdown-menu",
      "tooltip",
      "table",
      "form",
      "select",
      "checkbox",
      "command",
      "calendar",
      "carousel",
      "sonner",
      "drawer",
    ]) {
      expect(paths).toContain(`src/components/ui/${name}.tsx`);
    }
  });

  it("uses split @radix-ui/react-* imports, never unified radix-ui", () => {
    for (const f of SHADCN_COMPONENT_FILES) {
      if (!f.path.endsWith(".tsx")) {
        continue;
      }
      expect(f.content).not.toContain('from "radix-ui"');
    }
  });

  it("imports cn from @/lib/utils where cn is used", () => {
    for (const f of SHADCN_COMPONENT_FILES) {
      if (!f.path.endsWith(".tsx")) {
        continue;
      }
      if (f.content.includes("cn(")) {
        expect(f.content).toContain('from "@/lib/utils"');
      }
    }
  });
});
