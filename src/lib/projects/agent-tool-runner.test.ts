import { describe, expect, it } from "vitest";

import { runGeneratedAppAgentTools } from "@/lib/projects/agent-tool-runner";
import { createGeneratedProjectFiles } from "@/lib/projects/generated-source";
import { createProjectSiteSchemaFromBrief } from "@/lib/projects/site-schema";

function createFixtureFiles() {
  return createGeneratedProjectFiles(
    "project_agent_tools",
    createProjectSiteSchemaFromBrief({
      businessName: "",
      businessType: "Coffee shop kecil",
      contactOrCta: "WhatsApp",
      notes: [],
      offer: "Menu kopi dan lokasi",
      prompt: "buat website coffee shop",
      stylePreference: "Hangat",
      targetCustomer: "Mahasiswa",
      version: 1,
    }),
  );
}

function readFileContent(
  files: Array<{ content: string; path: string }>,
  filePath: string,
) {
  return files.find((file) => file.path === filePath)?.content ?? "";
}

describe("generated app agent tool runner", () => {
  it("can read, edit, and check the current generated source", () => {
    const result = runGeneratedAppAgentTools({
      commands: [
        { type: "list_files" },
        { path: "src/content/site.ts", type: "read_file" },
        {
          query: "Menu kopi",
          type: "search_files",
        },
        {
          find: "Menu kopi dan lokasi",
          path: "src/content/site.ts",
          replace: "Menu kopi, suasana tempat, dan lokasi",
          type: "replace_in_file",
        },
        { type: "check_app" },
      ],
      files: createFixtureFiles(),
    });

    expect(result.ok).toBe(true);
    expect(result.sideEffects).toContainEqual(
      expect.objectContaining({
        path: "src/content/site.ts",
        type: "replace_in_file",
      }),
    );
    expect(result.outputs).toContainEqual(
      expect.objectContaining({
        paths: expect.arrayContaining(["src/content/site.ts"]),
        type: "list_files",
      }),
    );
    expect(result.outputs).toContainEqual(
      expect.objectContaining({
        result: expect.stringContaining("Menu kopi dan lokasi"),
        type: "read_file",
      }),
    );
    expect(result.outputs).toContainEqual(
      expect.objectContaining({
        paths: expect.arrayContaining(["src/content/site.ts"]),
        type: "search_files",
      }),
    );
    expect(readFileContent(result.files, "src/content/site.ts")).toContain(
      "Menu kopi, suasana tempat, dan lokasi",
    );
    expect(result.check?.ok).toBe(true);
  });

  it("rejects writes outside the generated project source boundary", () => {
    const result = runGeneratedAppAgentTools({
      commands: [
        {
          content: "DATABASE_URL=postgres://secret",
          path: "../.env",
          type: "write_file",
        },
      ],
      files: createFixtureFiles(),
    });

    expect(result.ok).toBe(false);
    expect(result.outputs).toContainEqual(
      expect.objectContaining({
        error: "Unsafe generated file path: ../.env",
        type: "write_file",
      }),
    );
  });

  it("fails app check when a tool adds a blocked package", () => {
    const result = runGeneratedAppAgentTools({
      commands: [
        {
          content: JSON.stringify({
            dependencies: { express: "5.0.0" },
            scripts: { build: "vite build" },
          }),
          path: "package.json",
          type: "write_file",
        },
        { type: "check_app" },
      ],
      files: createFixtureFiles(),
    });

    expect(result.ok).toBe(false);
    expect(result.check?.issues).toContain(
      "Package is not allowed for vite-react-tanstack-v1: express",
    );
    expect(result.sideEffects).toContainEqual(
      expect.objectContaining({ path: "package.json", type: "write_file" }),
    );
  });

  it("does not report success when source changes were not checked", () => {
    const result = runGeneratedAppAgentTools({
      commands: [
        {
          find: "Menu kopi dan lokasi",
          path: "src/content/site.ts",
          replace: "Menu kopi premium",
          type: "replace_in_file",
        },
      ],
      files: createFixtureFiles(),
    });

    expect(result.ok).toBe(false);
    expect(result.check).toEqual({
      issues: ["App check must run after source changes."],
      ok: false,
    });
  });

  it("does not report success when a requested tool operation failed", () => {
    const result = runGeneratedAppAgentTools({
      commands: [
        {
          find: "not present in this file",
          path: "src/content/site.ts",
          replace: "new text",
          type: "replace_in_file",
        },
        { type: "check_app" },
      ],
      files: createFixtureFiles(),
    });

    expect(result.ok).toBe(false);
    expect(result.outputs).toContainEqual(
      expect.objectContaining({
        error: "Replacement target not found in src/content/site.ts.",
        type: "replace_in_file",
      }),
    );
    expect(result.check?.ok).toBe(true);
  });

  it("rejects unsafe list and search prefixes", () => {
    const result = runGeneratedAppAgentTools({
      commands: [
        { pathPrefix: "../", type: "list_files" },
        { pathPrefix: "C:/secret", query: "secret", type: "search_files" },
      ],
      files: createFixtureFiles(),
    });

    expect(result.ok).toBe(false);
    expect(result.outputs).toContainEqual(
      expect.objectContaining({
        error: "Unsafe generated file path: ../index",
        type: "list_files",
      }),
    );
    expect(result.outputs).toContainEqual(
      expect.objectContaining({
        error: "Unsafe generated file path: C:/secret",
        type: "search_files",
      }),
    );
  });
});
