import { describe, expect, it, vi } from "vitest";

import {
  runGeneratedSitePipeline,
  type GeneratedSitePipelineDeps,
} from "./generated-site-pipeline";

const files = [
  { path: "src/routes/index.tsx", content: "export const page = true" },
];
const browserAssertionNames = [
  "route-load",
  "console-clean",
  "required-content-visible",
  "primary-cta",
  "internal-links",
  "horizontal-overflow",
  "heading-overflow",
  "image-health",
  "media-policy",
  "computed-contrast",
  "focus-visible",
  "touch-target",
] as const;
const browserReport = {
  version: 1 as const,
  status: "pass" as const,
  routes: (["mobile", "desktop"] as const).map((viewport) => ({
    route: "/",
    viewport,
    assertions: browserAssertionNames.map((name) => ({
      name,
      status: "pass" as const,
    })),
  })),
  evidenceIds: ["mobile", "desktop"],
  overheadMs: 1,
};

describe("runGeneratedSitePipeline", () => {
  it("runs contract, kit, writer, build, browser, evidence, and one review in order", async () => {
    const order: string[] = [];
    const deps = {
      deriveKitInput: vi.fn(() => {
        order.push("derive-kit-input");
        return {
          archetype: "generic",
          density: "sparse",
          mediaMode: "graphic",
          primaryJobKind: "inquire",
          hasOperationalDetails: false,
        };
      }),
      selectKit: vi.fn(() => {
        order.push("select-kit");
        return { id: "bold-typographic", version: 1 } as never;
      }),
      compileContract: vi.fn(() => {
        order.push("compile-contract");
        return {
          contractHash: "a".repeat(64),
          media: { mode: "graphic" },
        } as never;
      }),
      runWriter: vi.fn(async ({ budget }) => {
        order.push("writer");
        budget.consumeWriter();
        return {
          ok: true,
          files,
          designPlan: {
            kit: { id: "bold-typographic", version: 1 },
            contractHash: "a".repeat(64),
            schemaVersion: 2,
            mediaMode: "graphic",
            visualThesis: "A strong visual thesis.",
            compositionPatternId: "full-field-lockup",
            palette: {
              background: "#111111",
              foreground: "#ffffff",
              muted: "#222222",
              accent: "#ff0000",
            },
            typography: { displayRole: "sans", bodyRole: "sans" },
            sections: [],
            sectionOrder: [],
            mobileStrategy: ["stack"],
            signatureElement: "lockup",
          },
          writerMs: 20,
          firstFileClosedMs: 10,
          editableBytes: 30,
          summary: "ok",
          writtenPaths: ["src/routes/index.tsx"],
        } as never;
      }),
      build: vi.fn(async () => {
        order.push("build");
        return { ok: true, distFiles: [], log: "" };
      }),
      runBrowser: vi.fn(async () => {
        order.push("browser");
        return browserReport;
      }),
      loadVisualEvidence: vi.fn(async () => {
        order.push("load-visual-evidence");
        return [new Uint8Array([1])];
      }),
      reviewVisual: vi.fn(async ({ budget }) => {
        order.push("visual-review");
        budget.consumeCritic();
        return { status: "complete", findings: [], modelId: "critic" };
      }),
      runCorrection: vi.fn(),
      now: vi.fn(() => 100),
    } as unknown as GeneratedSitePipelineDeps;

    const result = await runGeneratedSitePipeline(
      {
        attemptId: "a1",
        buildId: null,
        projectId: "p1",
        userId: "u1",
        brief: {} as never,
        briefSnapshot: {} as never,
        handoff: {} as never,
        schema: {} as never,
        photoEnabled: false,
      },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(order).toEqual([
      "derive-kit-input",
      "select-kit",
      "compile-contract",
      "writer",
      "build",
      "browser",
      "load-visual-evidence",
      "visual-review",
    ]);
    expect(result.proof.calls).toMatchObject({
      writerCalls: 1,
      criticCalls: 1,
      correctionCalls: 0,
    });
  });

  it("accepts deterministic gates when visual review is unavailable", async () => {
    const deps = {
      deriveKitInput: vi.fn(() => ({
        archetype: "generic",
        density: "sparse",
        mediaMode: "graphic",
        primaryJobKind: "inquire",
        hasOperationalDetails: false,
      })),
      selectKit: vi.fn(() => ({ id: "bold-typographic", version: 1 }) as never),
      compileContract: vi.fn(
        () =>
          ({
            contractHash: "a".repeat(64),
            media: { mode: "graphic" },
          }) as never,
      ),
      runWriter: vi.fn(async ({ budget }) => {
        budget.consumeWriter();
        return {
          ok: true,
          files,
          designPlan: {
            kit: { id: "bold-typographic", version: 1 },
            contractHash: "a".repeat(64),
            schemaVersion: 2,
            mediaMode: "graphic",
            visualThesis: "A strong visual thesis.",
            compositionPatternId: "full-field-lockup",
            palette: {
              background: "#111111",
              foreground: "#ffffff",
              muted: "#222222",
              accent: "#ff0000",
            },
            typography: { displayRole: "sans", bodyRole: "sans" },
            sections: [],
            sectionOrder: [],
            mobileStrategy: ["stack"],
            signatureElement: "lockup",
          },
          writerMs: 1,
          firstFileClosedMs: 1,
          editableBytes: 1,
          summary: "ok",
          writtenPaths: ["src/routes/index.tsx"],
        } as never;
      }),
      build: vi.fn(async () => ({ ok: true, distFiles: [], log: "" })),
      runBrowser: vi.fn(async () => browserReport),
      loadVisualEvidence: vi.fn(async () => []),
      reviewVisual: vi.fn(async () => ({ status: "unknown", findings: [] })),
      runCorrection: vi.fn(),
      now: vi.fn(() => 1),
    } as unknown as GeneratedSitePipelineDeps;

    const result = await runGeneratedSitePipeline(
      {
        attemptId: "a1",
        buildId: null,
        projectId: "p1",
        userId: "u1",
        brief: {} as never,
        briefSnapshot: {} as never,
        handoff: {} as never,
        schema: {} as never,
        photoEnabled: false,
      },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(result.proof.gates.visual).toBe("unknown");
    expect(result.proof.outcome).toBe("pass");
  });

  it("records a consumed correction when a failed writer cannot be repaired", async () => {
    const runCorrection = vi.fn(async () => {
      throw new Error("correction response ended early");
    });
    const deps = {
      deriveKitInput: vi.fn(() => ({
        archetype: "generic",
        density: "sparse",
        mediaMode: "graphic",
        primaryJobKind: "inquire",
        hasOperationalDetails: false,
      })),
      selectKit: vi.fn(() => ({ id: "bold-typographic", version: 1 }) as never),
      compileContract: vi.fn(
        () =>
          ({
            contractHash: "a".repeat(64),
            media: { mode: "graphic" },
          }) as never,
      ),
      runWriter: vi.fn(async ({ budget }) => {
        budget.consumeWriter();
        return {
          ok: false,
          reason: "source gate failed",
          stagedFiles: files,
          designPlan: null,
          writerMs: 1,
          firstFileClosedMs: 1,
          editableBytes: 10,
        };
      }),
      build: vi.fn(),
      runBrowser: vi.fn(),
      loadVisualEvidence: vi.fn(),
      reviewVisual: vi.fn(),
      runCorrection,
      now: vi.fn(() => 1),
    } as unknown as GeneratedSitePipelineDeps;

    const result = await runGeneratedSitePipeline(
      {
        attemptId: "a1",
        buildId: null,
        projectId: "p1",
        userId: "u1",
        brief: {} as never,
        briefSnapshot: {} as never,
        handoff: {} as never,
        schema: {} as never,
        photoEnabled: false,
      },
      deps,
    );

    expect(result.ok).toBe(false);
    expect(runCorrection).toHaveBeenCalledTimes(1);
    expect(result.proof.calls).toMatchObject({
      writerCalls: 1,
      correctionCalls: 1,
      correctionReason: "response_contract",
    });
  });

  it("does not invoke review when the browser has a hard failure", async () => {
    const reviewVisual = vi.fn();
    const deps = {
      deriveKitInput: vi.fn(() => ({
        archetype: "generic",
        density: "sparse",
        mediaMode: "graphic",
        primaryJobKind: "inquire",
        hasOperationalDetails: false,
      })),
      selectKit: vi.fn(() => ({ id: "bold-typographic", version: 1 }) as never),
      compileContract: vi.fn(
        () =>
          ({
            contractHash: "a".repeat(64),
            media: { mode: "graphic" },
          }) as never,
      ),
      runWriter: vi.fn(
        async () =>
          ({
            ok: true,
            files,
            designPlan: { kit: { id: "bold-typographic", version: 1 } },
            writerMs: 1,
            firstFileClosedMs: 1,
            editableBytes: 1,
            summary: "ok",
            writtenPaths: [],
          }) as never,
      ),
      build: vi.fn(async () => ({ ok: true, distFiles: [], log: "" })),
      runBrowser: vi.fn(async () => ({
        ...browserReport,
        status: "fail" as const,
      })),
      loadVisualEvidence: vi.fn(),
      reviewVisual,
      runCorrection: vi.fn(),
      now: vi.fn(() => 1),
    } as unknown as GeneratedSitePipelineDeps;
    const result = await runGeneratedSitePipeline(
      {
        attemptId: "a1",
        buildId: null,
        projectId: "p1",
        userId: "u1",
        brief: {} as never,
        briefSnapshot: {} as never,
        handoff: {} as never,
        schema: {} as never,
        photoEnabled: false,
      },
      deps,
    );
    expect(result.ok).toBe(false);
    expect(reviewVisual).not.toHaveBeenCalled();
  });
});
