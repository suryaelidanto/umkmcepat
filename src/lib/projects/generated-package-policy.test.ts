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
});
