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

  it("search_files returns per-match line numbers and context when requested", () => {
    const result = runGeneratedAppAgentTools({
      commands: [
        { query: "Menu kopi", contextLines: 2, type: "search_files" },
        { type: "check_app" },
      ],
      files: createFixtureFiles(),
    });

    expect(result.ok).toBe(true);

    const matches = result.outputs[0]?.matches ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(1);

    // Every match carries a 1-indexed line number, a path, and a snippet
    // containing the query.
    for (const match of matches) {
      expect(typeof match.line).toBe("number");
      expect(match.line).toBeGreaterThanOrEqual(1);
      expect(typeof match.path).toBe("string");
      expect(match.path.length).toBeGreaterThan(0);
      expect(match.snippet).toContain("Menu kopi");
    }

    // Backward-compat: paths still lists every matching file (sorted).
    const paths = result.outputs[0]?.paths ?? [];
    expect(paths.length).toBeGreaterThanOrEqual(1);
    const matchPaths = new Set(matches.map((match) => match.path));
    for (const path of paths) {
      expect(matchPaths.has(path)).toBe(true);
    }

    // With contextLines=2, at least one snippet is multi-line (context is
    // present) — unless the match is on line 1 of a single-line file.
    const multiLine = matches.some((match) => match.snippet.includes("\n"));
    expect(multiLine).toBe(true);

    // No single snippet exceeds the bounded size: 2 context lines per side +
    // the match line => at most 5 lines.
    for (const match of matches) {
      expect(match.snippet.split("\n").length).toBeLessThanOrEqual(5);
    }
  });

  it("search_files defaults to no context and caps it", () => {
    // No contextLines requested: each snippet is exactly the matching line.
    const noContext = runGeneratedAppAgentTools({
      commands: [{ query: "Menu kopi", type: "search_files" }],
      files: createFixtureFiles(),
    });
    const noContextMatches = noContext.outputs[0]?.matches ?? [];
    expect(noContextMatches.length).toBeGreaterThanOrEqual(1);
    for (const match of noContextMatches) {
      expect(match.snippet).toContain("Menu kopi");
      // A single line should not contain newlines when contextLines is 0.
      expect(match.snippet.includes("\n")).toBe(false);
    }

    // contextLines clamped to the cap (5): requesting 100 still yields ≤ 5
    // surrounding lines per side + the match line => ≤ 11 lines total.
    const big = runGeneratedAppAgentTools({
      commands: [
        { query: "Menu kopi", contextLines: 100, type: "search_files" },
      ],
      files: createFixtureFiles(),
    });
    const bigMatches = big.outputs[0]?.matches ?? [];
    expect(bigMatches.length).toBeGreaterThanOrEqual(1);
    for (const match of bigMatches) {
      expect(match.snippet.split("\n").length).toBeLessThanOrEqual(11);
    }
  });

  it("search_files dedupes multiple matches on the same line", () => {
    // Write a file where the query appears twice on one line, once on another,
    // then scope the search to that file so other fixture content (which also
    // contains "kopi") doesn't pollute the match count.
    const result = runGeneratedAppAgentTools({
      commands: [
        {
          content: "kopi kopi\nlatte\nkopi\n",
          path: "src/lib/dup.ts",
          type: "write_file",
        },
        {
          query: "kopi",
          contextLines: 0,
          pathPrefix: "src/lib/dup.ts",
          type: "search_files",
        },
      ],
      files: createFixtureFiles(),
    });

    const matches =
      result.outputs.find((output) => output.type === "search_files")
        ?.matches ?? [];
    // Lines 1 and 3 match, but line 1 has the query twice -> one entry.
    expect(matches).toHaveLength(2);
    expect(matches.map((match) => match.line)).toEqual([1, 3]);
  });

  it("search_files rejects an empty query instead of matching everything", () => {
    const result = runGeneratedAppAgentTools({
      commands: [{ query: "", type: "search_files" }],
      files: createFixtureFiles(),
    });
    // Fail-closed: an empty query must error, not silently list every file.
    expect(result.ok).toBe(false);
    expect(result.outputs[0]?.error).toBe("Search query cannot be empty.");
    expect(result.outputs[0]?.matches).toBeUndefined();
    expect(result.outputs[0]?.paths).toBeUndefined();
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

  it("treats a valid query with no matches as a successful empty search, not a tool error", () => {
    const result = runGeneratedAppAgentTools({
      commands: [
        { query: "ZZZ-NOT-PRESENT-XYZ-123", type: "search_files" },
        { type: "check_app" },
      ],
      files: createFixtureFiles(),
    });
    const searchOutput = result.outputs.find(
      (output) => output.type === "search_files",
    );
    expect(searchOutput?.error).toBeUndefined();
    expect(searchOutput?.matches ?? []).toEqual([]);
    expect(searchOutput?.paths ?? []).toEqual([]);
    // ok is driven by check_app, not the empty search result.
    expect(result.ok).toBe(true);
  });
});
