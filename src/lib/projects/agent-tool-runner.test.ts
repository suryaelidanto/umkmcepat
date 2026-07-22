import { describe, expect, it } from "vitest";

import {
  isAgentEditablePath,
  runGeneratedAppAgentTools,
} from "@/lib/projects/agent-tool-runner";
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
          find: '"offer": "Menu kopi dan lokasi",',
          path: "src/content/site.ts",
          replace: '"offer": "Menu kopi, suasana tempat, dan lokasi",',
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
      '"offer": "Menu kopi, suasana tempat, dan lokasi",',
    );
    expect(result.check?.ok).toBe(true);
    expect(result.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "src/content/site.ts",
          title: "Membaca file",
        }),
        expect.objectContaining({
          path: "src/content/site.ts",
          title: "Mengedit file",
        }),
        expect.objectContaining({ title: "Mengecek app" }),
      ]),
    );
  });

  it("isAgentEditablePath allows only src/ and brief docs", () => {
    for (const path of [
      "src/routes/index.tsx",
      "src/index.css",
      "src/lib/preview-ready.ts",
      "PRODUCT.md",
      "DESIGN.md",
      "AGENTS.md",
    ]) {
      expect(isAgentEditablePath(path)).toBe(true);
    }

    for (const path of [
      "netlify.toml",
      "vercel.json",
      "wrangler.toml",
      "wrangler.json",
      "fly.toml",
      "railway.json",
      "render.yaml",
      "Dockerfile",
      "docker-compose.yml",
      "package.json",
      "package-lock.json",
      "bun.lock",
      "pnpm-lock.yaml",
      "yarn.lock",
      ".npmrc",
      "tsconfig.json",
      "tsconfig.app.json",
      "vite.config.ts",
      "eslint.config.js",
      "index.html",
      "public/favicon.ico",
      "README.md",
      ".github/workflows/deploy.yml",
      "amplify.yml",
      "firebase.json",
      "app.yaml",
    ]) {
      expect(isAgentEditablePath(path)).toBe(false);
    }
  });

  it("rejects write_file for common deploy/host configs", () => {
    const forbidden = [
      "netlify.toml",
      "vercel.json",
      "wrangler.toml",
      "fly.toml",
      "Dockerfile",
      "tsconfig.json",
      "index.html",
      "eslint.config.js",
    ];

    for (const path of forbidden) {
      const result = runGeneratedAppAgentTools({
        commands: [
          {
            content: "blocked\n",
            path,
            type: "write_file",
          },
        ],
        files: createFixtureFiles(),
      });
      expect(result.ok).toBe(false);
      expect(
        result.outputs.some(
          (output) =>
            output.type === "write_file" &&
            typeof output.error === "string" &&
            (output.error.includes("Agent may only edit") ||
              output.error.includes("Platform-owned") ||
              output.error.includes("Unsafe")),
        ),
      ).toBe(true);
      // Must not create new deploy/config files; fixture paths must not get
      // overwritten with the attempted content.
      const written = result.files.find((file) => file.path === path);
      if (written) {
        expect(written.content).not.toBe("blocked\n");
      }
    }

    const packageJson = runGeneratedAppAgentTools({
      commands: [
        {
          find: '"name"',
          path: "package.json",
          replace: '"name-x"',
          type: "replace_in_file",
        },
      ],
      files: createFixtureFiles(),
    });
    expect(packageJson.ok).toBe(false);

    const srcWrite = runGeneratedAppAgentTools({
      commands: [
        {
          content: "export const x = 1\n",
          path: "src/lib/agent-note.ts",
          type: "write_file",
        },
        { type: "check_app" },
      ],
      files: createFixtureFiles(),
    });
    expect(srcWrite.ok).toBe(true);
    expect(readFileContent(srcWrite.files, "src/lib/agent-note.ts")).toContain(
      "export const x = 1",
    );
  });

  it("supports bounded line reads and rejects non-unique replacements", () => {
    const lineRead = runGeneratedAppAgentTools({
      commands: [
        {
          endLineOneIndexedInclusive: 2,
          path: "src/content/site.ts",
          startLineOneIndexed: 1,
          type: "read_file",
        },
        { type: "check_app" },
      ],
      files: createFixtureFiles(),
    });

    expect(lineRead.outputs[0]?.result?.split("\n").length).toBe(2);
    expect(lineRead.operations[0]).toEqual(
      expect.objectContaining({ detail: expect.stringContaining("2 dari") }),
    );

    const duplicateReplace = runGeneratedAppAgentTools({
      commands: [
        {
          find: "Menu kopi dan lokasi",
          path: "src/content/site.ts",
          replace: "Menu kopi premium",
          type: "replace_in_file",
        },
        { type: "check_app" },
      ],
      files: createFixtureFiles(),
    });

    expect(duplicateReplace.ok).toBe(false);
    expect(duplicateReplace.outputs).toContainEqual(
      expect.objectContaining({
        error: expect.stringContaining("must be unique"),
        type: "replace_in_file",
      }),
    );
  });

  it("caps operation trace and file outputs", () => {
    const files = createFixtureFiles();
    const manyListCommands = Array.from({ length: 90 }, () => ({
      type: "list_files" as const,
    }));

    const traced = runGeneratedAppAgentTools({
      commands: [...manyListCommands, { type: "check_app" }],
      files,
    });

    expect(traced.operations).toHaveLength(80);

    const largeRead = runGeneratedAppAgentTools({
      commands: [
        {
          content: "x".repeat(25_000),
          path: "src/content/large.ts",
          type: "write_file",
        },
        { path: "src/content/large.ts", type: "read_file" },
        { type: "check_app" },
      ],
      files,
    });

    expect(largeRead.outputs[1]?.result).toContain("[truncated]");
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

  it("rejects edits to platform-owned build files", () => {
    const originalPackage = readFileContent(
      createFixtureFiles(),
      "package.json",
    );
    const result = runGeneratedAppAgentTools({
      commands: [
        {
          content: JSON.stringify({
            dependencies: { react: "19.2.0" },
            scripts: { build: "node -e 'process.exit(0)'" },
          }),
          path: "package.json",
          type: "write_file",
        },
      ],
      files: createFixtureFiles(),
    });

    expect(result.ok).toBe(false);
    expect(result.outputs).toContainEqual({
      error: "Platform-owned generated file cannot be edited: package.json",
      type: "write_file",
    });
    expect(readFileContent(result.files, "package.json")).toBe(originalPackage);
    expect(result.sideEffects).not.toContainEqual(
      expect.objectContaining({ path: "package.json" }),
    );
  });

  it("fails app check when stored source contains a blocked package", () => {
    const result = runGeneratedAppAgentTools({
      commands: [{ type: "check_app" }],
      files: createFixtureFiles().map((file) =>
        file.path === "package.json"
          ? {
              ...file,
              content: JSON.stringify({
                dependencies: { express: "5.0.0" },
                scripts: { build: "vite build" },
              }),
            }
          : file,
      ),
    });

    expect(result.ok).toBe(false);
    expect(result.check?.issues).toContain(
      "Package is not allowed for vite-react-tanstack-v1: express",
    );
  });

  it("does not report success when source changes were not checked", () => {
    const result = runGeneratedAppAgentTools({
      commands: [
        {
          find: '"offer": "Menu kopi dan lokasi",',
          path: "src/content/site.ts",
          replace: '"offer": "Menu kopi premium",',
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
