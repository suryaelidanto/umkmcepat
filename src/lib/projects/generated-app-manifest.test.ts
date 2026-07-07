import { describe, expect, it } from "vitest";

import {
  GENERATED_APP_MANIFEST_PATH,
  validateGeneratedAppManifest,
  type GeneratedAppManifest,
} from "@/lib/projects/generated-app-manifest";
import { type GeneratedProjectFile } from "@/lib/projects/generated-source";

const validManifest: GeneratedAppManifest = {
  buildCommand: "bun run build",
  capabilities: ["static_content", "whatsapp_cta", "location"],
  outputDirectory: "dist",
  packageManager: "bun",
  projectId: "project_1",
  routes: [{ path: "/", title: "Beranda" }],
  runtimeProfile: "static-react-v1",
  schemaVersion: "1",
  templateId: "vite-react-frontend-static",
  templateVersion: "1.0.0",
};

function filesWithManifest(
  manifest: unknown = validManifest,
): GeneratedProjectFile[] {
  return [
    {
      content: JSON.stringify(manifest),
      path: GENERATED_APP_MANIFEST_PATH,
    },
  ];
}

describe("generated app manifest", () => {
  it("accepts the static React v1 generated app contract", () => {
    expect(validateGeneratedAppManifest(filesWithManifest())).toEqual({
      issues: [],
      manifest: validManifest,
      ok: true,
    });
  });

  it("requires the manifest file", () => {
    const result = validateGeneratedAppManifest([]);

    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      "Missing .umkmcepat/project.json manifest.",
    );
  });

  it("rejects unsupported runtime profiles", () => {
    const result = validateGeneratedAppManifest(
      filesWithManifest({
        ...validManifest,
        runtimeProfile: "node-server-v1",
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("Manifest runtimeProfile is unsupported.");
  });

  it("rejects unsupported capabilities", () => {
    const result = validateGeneratedAppManifest(
      filesWithManifest({
        ...validManifest,
        capabilities: ["static_content", "ffmpeg"],
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      "Manifest capability is unsupported: ffmpeg",
    );
  });

  it("rejects invalid route metadata", () => {
    const result = validateGeneratedAppManifest(
      filesWithManifest({
        ...validManifest,
        routes: [
          { path: "/", title: "Beranda" },
          { path: "/", title: "Duplikat" },
          { path: "/../admin", title: "" },
        ],
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("Manifest route path is duplicated: /");
    expect(result.issues).toContain(
      "Manifest route path is invalid: /../admin",
    );
    expect(result.issues).toContain("Manifest route title is invalid: ");
  });
});
