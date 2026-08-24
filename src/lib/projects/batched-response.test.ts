import { describe, expect, it } from "vitest";

import {
  BatchedParseError,
  createBatchedResponseParser,
  isAllowedBatchedPath,
} from "./batched-response";
import { selectGeneratedSiteDesignKit } from "./generated-site-design-kits/catalog";
import { deriveDefaultWriterDesignPlanV2 } from "./generated-site-design-plan";
import {
  isProtectedScaffoldPath,
  PROTECTED_SCAFFOLD_PATHS,
} from "./scaffold/protected-paths";

describe("isAllowedBatchedPath", () => {
  it("allows src/ and public/ paths", () => {
    expect(isAllowedBatchedPath("src/routes/index.tsx")).toBe(true);
    expect(isAllowedBatchedPath("public/hero.txt")).toBe(true);
  });

  it("rejects other roots and traversal", () => {
    expect(isAllowedBatchedPath("package.json")).toBe(false);
    expect(isAllowedBatchedPath("vite.config.ts")).toBe(false);
    expect(isAllowedBatchedPath("src/../package.json")).toBe(false);
    expect(isAllowedBatchedPath("src//double")).toBe(false);
    expect(isAllowedBatchedPath("./src/x")).toBe(false);
    expect(isAllowedBatchedPath("")).toBe(false);
  });

  it("flags protected scaffold files (semantic gate; parser still accepts syntactically)", () => {
    // The parser's allow-list is syntactic — protected paths are dropped by
    for (const path of PROTECTED_SCAFFOLD_PATHS) {
      expect(isProtectedScaffoldPath(path)).toBe(true);
      expect(isAllowedBatchedPath(path)).toBe(true);
    }
  });

  it("drops a complete disallowed file and continues parsing valid files", () => {
    const parser = createBatchedResponseParser();
    parser.push(
      '<file path="index.html">protected</file><file path="src/routes/index.tsx">export const Home = () => null;</file><done summary="ok" />',
    );
    const result = parser.finalize();
    expect(result.files.has("index.html")).toBe(false);
    expect(result.files.has("src/routes/index.tsx")).toBe(true);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "disallowed-path",
          path: "index.html",
        }),
      ]),
    );
  });

  it("rejects imports, backslashes, and env files", () => {
    expect(isAllowedBatchedPath("src\\routes\\index.tsx")).toBe(false);
    expect(isAllowedBatchedPath("src/.env.local")).toBe(false);
  });
});

describe("batched response parser — design plan", () => {
  const designPlan = {
    contractHash: "a".repeat(64),
    recipeId: "retail-catalog",
    mediaMode: "graphic",
    visualThesis: "Etalase perangkat yang presisi.",
    hierarchy: ["offer", "catalog", "contact"],
    sectionOrder: ["catalog", "contact"],
    signatureElement: "comparison rail",
  };

  it("parses one leading design plan before files", () => {
    const parser = createBatchedResponseParser({ requireDesignPlan: true });
    parser.push(
      `<design-plan>${JSON.stringify(designPlan)}</design-plan><file path="src/a.ts">a</file><done summary="ok" />`,
    );
    const result = parser.finalize();
    expect(result.designPlan).toEqual(designPlan);
  });

  it("rejects files before the required design plan", () => {
    const parser = createBatchedResponseParser({ requireDesignPlan: true });
    expect(() =>
      parser.push('<file path="src/a.ts">a</file><done summary="ok" />'),
    ).toThrow(/design-plan must precede files/);
  });

  it("parses a V2 design plan through the shared semantic validator", () => {
    const kit = selectGeneratedSiteDesignKit({
      archetype: "retail-catalog",
      density: "rich",
      mediaMode: "graphic",
      primaryJobKind: "compare",
      hasOperationalDetails: false,
    });
    const plan = {
      schemaVersion: 2,
      contractHash: "b".repeat(64),
      kit: { id: kit.id, version: 1 },
      mediaMode: "graphic",
      pageStrategy: "single",
      taste: kit.taste,
      visualThesis: "A comparison-led catalog with a quiet close.",
      compositionPatternId: "product-rail",
      palette: {
        background: "#f7f3ec",
        foreground: "#3d2b1f",
        muted: "#e5ddd2",
        accent: "#d4a017",
      },
      typography: { displayRole: "serif", bodyRole: "sans" },
      sections: [
        {
          id: "catalog",
          treatment: "rail",
          surface: "base",
          density: "regular",
        },
        {
          id: "contact",
          treatment: "close",
          surface: "contrast",
          density: "regular",
        },
      ],
      mobileStrategy: ["stack content", "keep actions visible"],
      signatureElement: "comparison rail",
    };
    const parser = createBatchedResponseParser({
      requireDesignPlan: true,
      designPlanV2Expected: {
        contractHash: "b".repeat(64),
        kit,
        mediaMode: "graphic",
        requiredSectionIds: ["catalog", "contact"],
      },
    });
    parser.push(
      `<design-plan>${JSON.stringify(plan)}</design-plan><file path="src/routes/index.tsx">export function HomeRouteComponent() { return null; }</file><done summary="ok" />`,
    );
    const result = parser.finalize();
    expect(result.designPlan).toBeNull();
    expect(result.designPlanV2).toBeDefined();
  });

  it("normalizes model-specific section vocabulary onto the kit frame", () => {
    const kit = selectGeneratedSiteDesignKit({
      archetype: "retail-catalog",
      density: "rich",
      mediaMode: "graphic",
      primaryJobKind: "compare",
      hasOperationalDetails: false,
    });
    const frame = deriveDefaultWriterDesignPlanV2({
      contractHash: "d".repeat(64),
      kit,
      mediaMode: "graphic",
      requiredSectionIds: ["hero", "products"],
    });
    const candidate = {
      ...frame,
      sections: frame.sections.map((section) => ({
        ...section,
        surface: section.id === "hero" ? "subtle" : "dark",
        density: "sparse",
        treatment: `${section.id} treatment`,
      })),
      visualThesis: "A concise comparison story for decisive buyers.",
      signatureElement: "numbered product notes",
    };
    const parser = createBatchedResponseParser({
      requireDesignPlan: true,
      designPlanV2Expected: {
        contractHash: frame.contractHash,
        kit,
        mediaMode: "graphic",
        requiredSectionIds: ["hero", "products"],
      },
      designPlanV2Fallback: frame,
    });

    parser.push(
      `<design-plan>${JSON.stringify(candidate)}</design-plan><file path="src/routes/index.tsx">export function HomeRouteComponent() { return null; }</file><done summary="ok" />`,
    );

    const plan = parser.finalize().designPlanV2;
    expect(plan?.sections.map((section) => section.surface)).toEqual(
      frame.sections.map((section) => section.surface),
    );
    expect(plan?.sections.map((section) => section.treatment)).toEqual([
      "hero treatment",
      "products treatment",
    ]);
    expect(plan?.visualThesis).toBe(candidate.visualThesis);
    expect(plan?.signatureElement).toBe(candidate.signatureElement);
  });

  it("uses the kit frame when a V2 writer omits its design plan", () => {
    const kit = selectGeneratedSiteDesignKit({
      archetype: "retail-catalog",
      density: "rich",
      mediaMode: "graphic",
      primaryJobKind: "compare",
      hasOperationalDetails: false,
    });
    const fallback = deriveDefaultWriterDesignPlanV2({
      contractHash: "c".repeat(64),
      kit,
      mediaMode: "graphic",
      requiredSectionIds: ["catalog"],
    });
    const parser = createBatchedResponseParser({
      requireDesignPlan: true,
      designPlanV2Expected: {
        contractHash: "c".repeat(64),
        kit,
        mediaMode: "graphic",
        requiredSectionIds: ["catalog"],
      },
      designPlanV2Fallback: fallback,
    });

    parser.push(
      '<file path="src/routes/index.tsx">export function HomeRouteComponent() { return null; }</file><done summary="ok" />',
    );

    expect(parser.finalize().designPlanV2).toEqual(fallback);
  });

  it("accepts a complete route when trailing writer output omits done", () => {
    const kit = selectGeneratedSiteDesignKit({
      archetype: "retail-catalog",
      density: "rich",
      mediaMode: "graphic",
      primaryJobKind: "compare",
      hasOperationalDetails: false,
    });
    const fallback = deriveDefaultWriterDesignPlanV2({
      contractHash: "e".repeat(64),
      kit,
      mediaMode: "graphic",
      requiredSectionIds: ["catalog"],
    });
    const parser = createBatchedResponseParser({
      requireDesignPlan: true,
      designPlanV2Expected: {
        contractHash: "e".repeat(64),
        kit,
        mediaMode: "graphic",
        requiredSectionIds: ["catalog"],
      },
      designPlanV2Fallback: fallback,
      implicitDoneSummary: "Route file emitted.",
      stopAfterFilePath: "src/routes/index.tsx",
    });

    parser.push(
      '<file path="src/routes/index.tsx">export function HomeRouteComponent() { return null; }</file><file path="src/routes/ignored.tsx">ignored</file>',
    );
    expect(parser.stoppedAfterFilePath).toBe(true);

    const result = parser.finalize();
    expect(result.done).toEqual({ summary: "Route file emitted." });
    expect([...result.files.keys()]).toEqual(["src/routes/index.tsx"]);
  });

  it("stops after every required multi-page writer file closes", () => {
    const kit = selectGeneratedSiteDesignKit({
      archetype: "retail-catalog",
      density: "rich",
      mediaMode: "graphic",
      primaryJobKind: "compare",
      hasOperationalDetails: false,
    });
    const fallback = deriveDefaultWriterDesignPlanV2({
      contractHash: "f".repeat(64),
      kit,
      mediaMode: "graphic",
      requiredSectionIds: ["catalog"],
    });
    const requiredFilePaths = [
      "src/routes/index.tsx",
      "src/routes/katalog.tsx",
      "src/components/site/generated-shell.tsx",
    ];
    const parser = createBatchedResponseParser({
      requireDesignPlan: true,
      designPlanV2Expected: {
        contractHash: "f".repeat(64),
        kit,
        mediaMode: "graphic",
        requiredSectionIds: ["catalog"],
      },
      designPlanV2Fallback: fallback,
      requiredFilePaths,
      stopAfterRequiredFilePaths: true,
      implicitDoneSummary: "Route files emitted.",
    });

    parser.push(
      requiredFilePaths
        .map(
          (path) =>
            `<file path="${path}">export const Generated = () => null;</file>`,
        )
        .join("") + '<file path="src/routes/ignored.tsx">ignored</file>',
    );

    expect(parser.stoppedAfterRequiredFilePaths).toBe(true);
    const result = parser.finalize();
    expect(result.done).toEqual({ summary: "Route files emitted." });
    expect([...result.files.keys()]).toEqual(requiredFilePaths);
  });

  it("rejects malformed, duplicate, or missing design plans", () => {
    const malformed = createBatchedResponseParser({ requireDesignPlan: true });
    expect(() => malformed.push("<design-plan>{bad}</design-plan>")).toThrow(
      /invalid design-plan JSON/,
    );

    const duplicate = createBatchedResponseParser({ requireDesignPlan: true });
    duplicate.push(`<design-plan>${JSON.stringify(designPlan)}</design-plan>`);
    expect(() =>
      duplicate.push(
        `<design-plan>${JSON.stringify(designPlan)}</design-plan>`,
      ),
    ).toThrow(/only one design-plan/);

    const missing = createBatchedResponseParser({ requireDesignPlan: true });
    expect(() => missing.finalize()).toThrow(/design-plan is required/);
  });
});

describe("batched response parser — well-formed", () => {
  it("parses a single file block and done", () => {
    const parser = createBatchedResponseParser();
    parser.push(
      '<file path="src/pages/home.tsx">\nexport const x = 1;\n</file>\n<done summary="Wrote 1 file." />',
    );
    const result = parser.finalize();
    expect(result.diagnostics).toEqual([]);
    expect(result.done).toEqual({ summary: "Wrote 1 file." });
    expect([...result.files.keys()]).toEqual(["src/pages/home.tsx"]);
    expect(result.files.get("src/pages/home.tsx")?.content).toBe(
      "export const x = 1;",
    );
  });

  it("parses multiple file blocks across chunk boundaries", () => {
    const response =
      '<file path="src/a.ts">const a = "</file";\n</file>\n<file path="src/b.ts">\nlet b = 2;\n</file>\n<done summary="two" />';
    const parser = createBatchedResponseParser();
    for (const chunk of [
      response.slice(0, 10),
      response.slice(10, 23),
      response.slice(23, 60),
      response.slice(60),
    ]) {
      parser.push(chunk);
    }
    const result = parser.finalize();
    expect(result.diagnostics).toEqual([]);
    expect(result.files.get("src/a.ts")?.content).toBe('const a = "</file";');
    expect(result.files.get("src/b.ts")?.content).toBe("let b = 2;");
  });

  it("keeps literal </file> inside quoted content on the same line", () => {
    const parser = createBatchedResponseParser();
    parser.push(
      '<file path="src/x.ts">export const tag = "</file>";</file><done summary="ok" />',
    );
    const result = parser.finalize();
    expect(result.diagnostics).toEqual([]);
    expect(result.files.get("src/x.ts")?.content).toBe(
      'export const tag = "</file>";',
    );
  });

  it("handles unicode content and attribute whitespace variants", () => {
    const parser = createBatchedResponseParser();
    parser.push(
      '<file\n  path = "src/routes/index.tsx" >\nexport const copy = "Kopi Sela — hangat ☕";\n</file>\n<done\n summary = "selesai" />',
    );
    const result = parser.finalize();
    expect(result.diagnostics).toEqual([]);
    expect(result.files.get("src/routes/index.tsx")?.content).toContain("☕");
    expect(result.done?.summary).toBe("selesai");
  });

  it("decodes entities in attributes", () => {
    const parser = createBatchedResponseParser();
    parser.push(
      '<file path="src/a.ts">x</file><done summary="bersih &amp; rapi; it&apos;s &quot;done&quot;" />',
    );
    const result = parser.finalize();
    expect(result.done?.summary).toBe(`bersih & rapi; it's "done"`);
  });

  it("parses propose blocks and validates known basenames", () => {
    const parser = createBatchedResponseParser();
    parser.push(
      '<propose path="src/components/ui/badge.tsx">need a badge</propose>\n<file path="src/a.ts">a</file>\n<done summary="ok" />',
    );
    const result = parser.finalize();
    expect(result.diagnostics).toEqual([]);
    expect(result.proposals).toEqual([
      { path: "src/components/ui/badge.tsx", reason: "need a badge" },
    ]);
  });

  it("records a diagnostic for unknown propose basenames but keeps parsing", () => {
    const parser = createBatchedResponseParser();
    parser.push(
      '<propose path="src/lib/api/contact.ts">fake api</propose><file path="src/a.ts">a</file><done summary="ok" />',
    );
    const result = parser.finalize();
    expect(result.proposals).toHaveLength(1);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe("unknown-component");
    expect(result.diagnostics[0].path).toBe("src/lib/api/contact.ts");
    expect(typeof result.diagnostics[0].offset).toBe("number");
    // A diagnostic is not a rejection: the file still stages.
    expect(result.files.has("src/a.ts")).toBe(true);
  });

  it("handles a large multi-file response (35k tokens scale)", () => {
    const parser = createBatchedResponseParser();
    const big = "const filler = `".padEnd(2_000, "x") + "`;";
    let response = "";
    for (let i = 0; i < 35; i++) {
      response += `<file path="src/gen/file-${i}.ts">\n${big}\n</file>\n`;
    }
    response += '<done summary="35 files" />';
    // Pathological chunking: one byte at a time for the head, then bulk.
    for (const char of response.slice(0, 200)) {
      parser.push(char);
    }
    parser.push(response.slice(200));
    const result = parser.finalize();
    expect(result.diagnostics).toEqual([]);
    expect(result.files.size).toBe(35);
    expect(result.done?.summary).toBe("35 files");
  });

  it("accepts text outside blocks as prose", () => {
    const parser = createBatchedResponseParser();
    parser.push(
      'Here are the files.\n<file path="src/a.ts">a</file>\nThat is all.\n<done summary="ok" />',
    );
    const result = parser.finalize();
    expect(result.diagnostics).toEqual([]);
    expect(result.files.size).toBe(1);
  });
});

function runExpectingError(response: string): BatchedParseError {
  const parser = createBatchedResponseParser();
  try {
    parser.push(response);
    parser.finalize();
  } catch (error) {
    expect(error).toBeInstanceOf(BatchedParseError);
    return error as BatchedParseError;
  }
  expect.unreachable("expected BatchedParseError");
  throw new Error("unreachable");
}

describe("batched response parser — hard errors", () => {
  it("rejects unknown top-level tags with byte offset", () => {
    const error = runExpectingError(
      '<file path="src/a.ts">a</file>\n  <edit name="x">boom</edit>',
    );
    expect(error.code).toBe("unknown-tag");
    expect(error.offset).toBe(33);
    expect(error.message).toContain("<edit>");
  });

  it("rejects a file block without a path attribute", () => {
    expect(runExpectingError("<file>no path</file>").code).toBe("missing-path");
  });

  it("rejects an empty path attribute", () => {
    const error = runExpectingError('<file path="">x</file>');
    expect(error.code).toBe("missing-path");
    expect(error.message).toContain("path");
  });

  it("rejects duplicate path attributes on one tag", () => {
    expect(
      runExpectingError('<file path="src/a.ts" path="src/a.ts">dup</file>')
        .code,
    ).toBe("duplicate-attr");
  });

  it("detects truncation mid-file", () => {
    const error = runExpectingError(
      '<file path="src/routes/index.tsx">\nexport function Home() {',
    );
    expect(error.code).toBe("truncated-file");
    expect(error.path).toBe("src/routes/index.tsx");
  });

  it("detects truncation mid-open-tag and mid-done", () => {
    for (const prefix of ['<file path="src/a.t', '<done summary="x', "<pro"]) {
      expect(runExpectingError(prefix).code).toMatch(/^truncated-tag$/);
    }
  });

  it("rejects empty file content", () => {
    expect(
      runExpectingError('<file path="src/a.ts">\n</file>').message,
    ).toMatch(/empty content/);
  });

  it("rejects stray closing tags outside a block", () => {
    expect(runExpectingError("intro </file> outro").code).toBe(
      "stray-close-tag",
    );
  });

  it("rejects done tags carrying unknown attributes", () => {
    expect(
      runExpectingError(
        '<file path="src/a.ts">a</file><done summary="x" extra="y" />',
      ).code,
    ).toBe("unknown-attr");
  });

  it("rejects unknown self-closing tags", () => {
    expect(
      runExpectingError('<file path="src/a.ts">a</file><finished />').message,
    ).toMatch(/<finished>/);
  });
});

describe("batched response parser — soft diagnostics", () => {
  it("overwrites duplicate paths idempotently", () => {
    const parser = createBatchedResponseParser();
    parser.push(
      '<file path="src/a.ts">first</file><file path="src/a.ts">second</file><done summary="ok" />',
    );
    const result = parser.finalize();
    expect(result.diagnostics.some((d) => d.code === "duplicate-file")).toBe(
      true,
    );
    expect(result.files.get("src/a.ts")?.content).toBe("second");
  });

  it("tolerates emojis in content and summary", () => {
    const parser = createBatchedResponseParser();
    parser.push(
      'Siap 🚀\n<file path="src/a.ts">const copy = "halo 👋";</file>\n<done summary="selesai ✅" />',
    );
    const result = parser.finalize();
    expect(result.diagnostics).toEqual([]);
    expect(result.files.get("src/a.ts")?.content).toContain("👋");
    expect(result.done?.summary).toBe("selesai ✅");
  });

  it("flags unterminated oversized payloads as truncated-file", () => {
    const parser = createBatchedResponseParser();
    parser.push(`<file path="src/big.ts">${"x".repeat(300_000)}`);
    try {
      parser.finalize();
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BatchedParseError);
      expect((error as BatchedParseError).code).toBe("truncated-file");
      expect((error as BatchedParseError).path).toBe("src/big.ts");
    }
  });

  it("fails runaway prose beyond the scan cap", () => {
    const parser = createBatchedResponseParser();
    expect(() => parser.push("x".repeat(300_000))).toThrow(BatchedParseError);
    expect(() => parser.push("")).toThrow(/limit/);
  });
});
