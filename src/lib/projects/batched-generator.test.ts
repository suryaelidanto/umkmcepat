import { afterEach, describe, expect, it, vi } from "vitest";

const { streamTextMock, recordAiCallMock, chargeEnergyForStepMock } =
  vi.hoisted(() => ({
    streamTextMock: vi.fn(),
    recordAiCallMock: vi.fn(),
    chargeEnergyForStepMock: vi.fn(async () => ({
      charged: true,
      energyUsed: 5,
      remaining: 1_000,
    })),
  }));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: streamTextMock };
});

vi.mock("@/lib/ai", () => ({
  getAiModel: vi.fn((name?: string) => ({ modelId: name ?? "test-model" })),
  getAiTelemetry: vi.fn(() => ({ isEnabled: false })),
  getNoReasoningCallOptions: vi.fn(() => ({ reasoning: "none" })),
}));

vi.mock("@/lib/ai-models", () => ({
  DEFAULT_AI_MODEL: "test/model",
  getDefaultAiModel: vi.fn(() => "test/model"),
  getGenerationModel: vi.fn(() => "test/model"),
}));

vi.mock("@/lib/ai-call-record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai-call-record")>()),
  recordAiCall: recordAiCallMock,
}));

vi.mock("@/lib/user-credits", () => ({
  chargeEnergyForStep: chargeEnergyForStepMock,
}));

import {
  buildBatchedWriterPrompt,
  collectBatchedGateIssues,
  runBatchedGenerate,
} from "./batched-generator";
import { BatchedAdmissionBlockedError } from "./brief-admission";
import { createStepCharger } from "./energy-step-charger";
import { type GeneratedProjectFile } from "./generated-types";
import { createViteTanStackShadcnStarterFiles } from "./scaffold/vite-tanstack-shadcn-starter";
import { createProjectSiteSchemaFromBrief } from "./site-schema";

import type { ProjectBrief } from "./brief";
import type { ImplementationSpec } from "./implementation-spec";

const HOME_TSX = `import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { site } from "@/content/site";
import { usePreviewReady } from "@/lib/preview-ready";

export function HomeRouteComponent() {
  usePreviewReady();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-6 py-16">
      <p className="text-sm font-medium text-muted-foreground">{site.eyebrow}</p>
      <h1 className="text-4xl font-semibold tracking-tight text-foreground">{site.headline}</h1>
      <p className="text-muted-foreground">{site.subheadline}</p>
      <Button size="lg" asChild>
        <Link to="/" hash="kontak">
          {site.primaryCta}
          <ArrowRight className="size-4" />
        </Link>
      </Button>
      <Card><CardContent>{site.offer}</CardContent></Card>
      <section>
        {site.trustPoints.map((tp) => (
          <div key={tp}>{tp}</div>
        ))}
      </section>
      <section>
        {site.sections.map((s) => (
          <article key={s.title}>
            <h2>{s.title}</h2>
            <p>{s.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
`;

function writerStream(text: string, chunkSize = 37) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return {
    fullStream: (async function* () {
      for (const chunk of chunks) {
        yield { type: "text-delta", text: chunk };
      }
    })(),
    usage: Promise.resolve({
      inputTokens: 1200,
      outputTokens: 800,
      totalTokens: 2000,
    }),
    response: Promise.resolve({ modelId: "served/model-x" }),
  };
}

function makeBrief(overrides: Partial<ProjectBrief> = {}): ProjectBrief {
  return {
    version: 1,
    notes: [],
    readyForBuild: true,
    prompt: "buatkan website coffee shop untuk kerja remote",
    businessName: "Kopi Sela",
    businessType: "Coffee shop kecil",
    offer: "Espresso based, manual brew, pastry",
    targetCustomer: "Mahasiswa dan pekerja remote",
    contactOrCta: "Pesan dan tanya lokasi lewat WhatsApp",
    stylePreference: "Hangat premium sederhana",
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
    ...overrides,
  } as ProjectBrief;
}

function makeSpec(): ImplementationSpec | undefined {
  return undefined; // spec is optional on the writer path
}

function makeCharger() {
  return createStepCharger({
    modelId: "test/model",
    projectId: "p1",
    reason: "build:step",
    userId: "u-test",
  });
}

const baseArgs = () => {
  const brief = makeBrief();
  const schema = createProjectSiteSchemaFromBrief(brief);
  return {
    brief,
    implementationSpec: makeSpec(),
    projectId: "p1",
    schema,
    attemptId: "a1",
    userId: "u-test",
  };
};

describe("runBatchedGenerate — happy path", () => {
  afterEach(() => vi.clearAllMocks());

  it("streams a valid multi-file response, emits file events, records writer telemetry", async () => {
    const responseText =
      `<file path="src/routes/index.tsx">\n${HOME_TSX}</file>\n` +
      `<file path="src/routes/katalog.tsx">\nexport function KatalogRouteComponent() { return <div>katalog</div>; }\n</file>\n` +
      `<done summary="Wrote 2 pages." />`;
    streamTextMock.mockReturnValueOnce(writerStream(responseText));

    const events: Array<Record<string, unknown>> = [];
    const result = await runBatchedGenerate({
      ...baseArgs(),
      onEvent: (type, data) => events.push({ ...data, eventType: type }),
      stepCharger: makeCharger(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected ok result");
    }
    expect(result.writtenPaths).toContain("src/routes/katalog.tsx");
    expect(result.repairRounds).toBe(0);
    expect(result.summary).toBe("Wrote 2 pages.");

    const writerCalls = recordAiCallMock.mock.calls.filter(
      ([entry]) => entry.phase === "writer" && entry.task === "build-step",
    );
    expect(writerCalls).toHaveLength(1);
    expect(writerCalls[0][0]).toMatchObject({
      attemptId: "a1",
      projectId: "p1",
      status: "ok",
      modelRequested: "test/model",
      inputTokens: 1200,
      outputTokens: 800,
    });
    // Streaming: first text-delta marks ttftMs, bounded by requestMs.
    expect(writerCalls[0][0].ttftMs).toBeGreaterThanOrEqual(0);
    expect(writerCalls[0][0].ttftMs).toBeLessThanOrEqual(
      writerCalls[0][0].requestMs,
    );

    const operationEvents = events.filter((e) => e.eventType === "operation");
    expect(
      operationEvents.some((e) => e.path === "src/routes/katalog.tsx"),
    ).toBe(true);

    // Starter files merge; batched files overlay.
    const batchedArgs = baseArgs();
    const starter = createViteTanStackShadcnStarterFiles(
      batchedArgs.projectId,
      batchedArgs.schema,
    );
    expect(result.files.length).toBeGreaterThan(starter.length - 2);
    expect(
      result.files.find((f) => f.path === "src/routes/katalog.tsx"),
    ).toBeDefined();
  });

  it("passes a bounded source-generation abort signal to the writer", async () => {
    streamTextMock.mockReturnValueOnce(
      writerStream(
        `<file path="src/routes/index.tsx">\n${HOME_TSX}</file>\n<done summary="ok" />`,
      ),
    );
    await runBatchedGenerate({ ...baseArgs(), stepCharger: makeCharger() });
    expect(streamTextMock.mock.calls[0]?.[0]?.abortSignal).toBeInstanceOf(
      AbortSignal,
    );
    expect(streamTextMock.mock.calls[0]?.[0]?.maxOutputTokens).toBe(9_000);
  });

  it("auto-approves valid propose blocks by materializing registry components", async () => {
    const responseText =
      `<propose path="src/components/ui/badge.tsx">need trust badges</propose>\n` +
      `<file path="src/routes/index.tsx">\n${HOME_TSX}\n</file>\n` +
      `<done summary="with badge" />`;
    streamTextMock.mockReturnValueOnce(writerStream(responseText));

    const result = await runBatchedGenerate({
      ...baseArgs(),
      stepCharger: makeCharger(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected ok result");
    }
    expect(
      result.files.find((f) => f.path === "src/components/ui/badge.tsx"),
    ).toBeDefined();
  });
});

describe("runBatchedGenerate — durable stage write-through", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls onFileStaged with content as each file closes, mid-stream", async () => {
    const responseText =
      `<file path="src/routes/index.tsx">\n${HOME_TSX}</file>\n` +
      `<file path="src/routes/katalog.tsx">\nexport function KatalogRouteComponent() { return <div>katalog</div>; }\n</file>\n` +
      `<done summary="Wrote 2 pages." />`;
    streamTextMock.mockReturnValueOnce(writerStream(responseText));

    const staged: { content: string; path: string }[] = [];
    const operationOrder: string[] = [];
    const result = await runBatchedGenerate({
      ...baseArgs(),
      onEvent: () => undefined,
      onFileStaged(file: { content: string; path: string }) {
        staged.push(file);
      },
      stepCharger: makeCharger(),
    });

    expect(result.ok).toBe(true);
    expect(staged.map((f) => f.path).sort()).toEqual(
      ["src/routes/index.tsx", "src/routes/katalog.tsx"].sort(),
    );
    // Content lands whole — a crash mid-flight already has these bytes on disk.
    expect(staged[0].content).toContain("function");
    expect(operationOrder).toEqual([]);
  });
});

describe("runBatchedGenerate — admission + failure paths", () => {
  afterEach(() => vi.clearAllMocks());

  it("blocks before any AI call when the brief is incomplete (no energy spent)", async () => {
    // The 2-field minimum requires businessName + offer. Empty offer blocks.
    const args = baseArgs();
    args.brief = makeBrief({ offer: "" });
    let caught: unknown;
    try {
      await runBatchedGenerate({ ...args, stepCharger: makeCharger() });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BatchedAdmissionBlockedError);
    expect((caught as BatchedAdmissionBlockedError).reason).toMatch(
      /penawaran|rief belum/i,
    );
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(chargeEnergyForStepMock).not.toHaveBeenCalled();
  });

  it("malformed stream triggers exactly one format-repair then succeeds", async () => {
    streamTextMock
      .mockReturnValueOnce(writerStream('<file path="src/a.ts">x</edit>'))
      .mockReturnValueOnce(
        writerStream(
          `<file path="src/routes/index.tsx">\n${HOME_TSX}</file>\n<done summary="fixed" />`,
        ),
      );

    const result = await runBatchedGenerate({
      ...baseArgs(),
      stepCharger: makeCharger(),
    });

    expect(result.ok).toBe(true);
    expect(streamTextMock).toHaveBeenCalledTimes(2);
    const phases = recordAiCallMock.mock.calls.map(([entry]) => entry.phase);
    expect(phases).toContain("format-repair");
  });

  it("gate failure triggers one targeted repair with diagnostics", async () => {
    const badTsx = `export function HomeRouteComponent() { return (<div>broken`; // syntax error
    streamTextMock
      .mockReturnValueOnce(
        writerStream(
          `<file path="src/routes/index.tsx">\n${badTsx}\n</file>\n<done summary="oops" />`,
        ),
      )
      .mockReturnValueOnce(
        writerStream(
          `<file path="src/routes/index.tsx">\n${HOME_TSX}</file>\n<done summary="fixed" />`,
        ),
      );

    const events: Array<Record<string, unknown>> = [];
    const result = await runBatchedGenerate({
      ...baseArgs(),
      onEvent: (type, data) => events.push({ ...data, eventType: type }),
      stepCharger: makeCharger(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.repairRounds).toBe(1);
    }
    const phases = recordAiCallMock.mock.calls.map(([entry]) => entry.phase);
    expect(phases).toContain("writer");
    expect(phases.filter((p) => p === "repair")).toHaveLength(1);
    // Repair prompt cites the implicated file + diagnostics.
    const repairCall = streamTextMock.mock.calls[1][0];
    const repairPrompt = JSON.stringify(
      repairCall.messages ?? repairCall.prompt,
    );
    expect(repairPrompt).toContain("src/routes/index.tsx");
    expect(repairPrompt).toMatch(/invalid|syntax|diagnostic/i);
  });

  it("drops repair files emitted outside the requested scope", async () => {
    const badTsx = `export function HomeRouteComponent() { return (<div>broken`;
    streamTextMock
      // Writer: broken index → gates fail, index.tsx implicated.
      .mockReturnValueOnce(
        writerStream(
          `<file path="src/routes/index.tsx">\n${badTsx}\n</file>\n<done summary="1" />`,
        ),
      )
      // Repair 1: fixes index.tsx but also sneaks in an unrequested file.
      .mockReturnValueOnce(
        writerStream(
          `<file path="src/routes/index.tsx">\n${HOME_TSX}</file>\n` +
            `<file path="src/routes/sneaky.tsx">\nexport function SneakyRouteComponent() { return <div>sneaky</div>; }\n</file>\n` +
            `<done summary="2" />`,
        ),
      )
      // Repair 2 (triggered by the out-of-scope diagnostic): in-scope only.
      .mockReturnValueOnce(
        writerStream(
          `<file path="src/routes/index.tsx">\n${HOME_TSX}</file>\n<done summary="3" />`,
        ),
      );

    const result = await runBatchedGenerate({
      ...baseArgs(),
      stepCharger: makeCharger(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.repairRounds).toBe(2);
      // Out-of-scope file never landed in the stage or the merged output.
      expect(result.writtenPaths).not.toContain("src/routes/sneaky.tsx");
      expect(
        result.files.find((f) => f.path === "src/routes/sneaky.tsx"),
      ).toBeUndefined();
    }
    // Round 2's repair prompt cites the dropped path as a diagnostic.
    const round2Call = streamTextMock.mock.calls[2][0];
    const round2Prompt = JSON.stringify(
      round2Call.messages ?? round2Call.prompt,
    );
    expect(round2Prompt).toContain("src/routes/sneaky.tsx");
    expect(round2Prompt).toMatch(/outside the requested scope/i);
  });

  it("accepts a repair that renames a JSX-bearing .ts content file to .tsx", async () => {
    // The writer emits JSX into a data-only .ts file (src/content/menu.ts);
    // the gate flags it. The natural repair renames the file to .tsx — the
    // renamed sibling must be in scope, otherwise the fix is dropped and the
    // whole build falls back to the slow legacy loop.
    streamTextMock
      .mockReturnValueOnce(
        writerStream(
          `<file path="src/routes/index.tsx">\n${HOME_TSX}</file>\n` +
            `<file path="src/content/menu.ts">\nexport const menu = <div>Menu</div>;\n</file>\n<done summary="1" />`,
        ),
      )
      .mockReturnValueOnce(
        writerStream(
          `<file path="src/content/menu.tsx">\nexport const menu = <div>Menu</div>;\n</file>\n<done summary="2" />`,
        ),
      );

    const result = await runBatchedGenerate({
      ...baseArgs(),
      stepCharger: makeCharger(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.repairRounds).toBe(1);
      expect(result.writtenPaths).toContain("src/content/menu.tsx");
      expect(result.writtenPaths).not.toContain("src/content/menu.ts");
      expect(
        result.files.find((f) => f.path === "src/content/menu.tsx"),
      ).toBeDefined();
    }
  });

  it("exhausts 2 targeted repairs then signals fallback", async () => {
    const badTsx = `export function HomeRouteComponent() { return (<div>broken`;
    streamTextMock
      .mockReturnValueOnce(
        writerStream(
          `<file path="src/routes/index.tsx">\n${badTsx}\n</file>\n<done summary="1" />`,
        ),
      )
      .mockReturnValueOnce(
        writerStream(
          `<file path="src/routes/index.tsx">\n${badTsx}\n</file>\n<done summary="2" />`,
        ),
      )
      .mockReturnValueOnce(
        writerStream(
          `<file path="src/routes/index.tsx">\n${badTsx}\n</file>\n<done summary="3" />`,
        ),
      );

    const result = await runBatchedGenerate({
      ...baseArgs(),
      stepCharger: makeCharger(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.needsFallback).toBe(true);
      expect(result.repairRounds).toBe(2);
    }
    expect(streamTextMock).toHaveBeenCalledTimes(3);
  });

  it("transport error before any chunk leaves ttftMs null, requestMs set", async () => {
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        throw new Error("socket hangup");
      })(),
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
      response: Promise.resolve({ modelId: "served/model-x" }),
    }));

    await expect(
      runBatchedGenerate({ ...baseArgs(), stepCharger: makeCharger() }),
    ).rejects.toThrow(/socket hangup/i);
    const errorRows = recordAiCallMock.mock.calls.filter(
      ([entry]) => entry.status === "error",
    );
    expect(errorRows.length).toBeGreaterThan(0);
    expect(errorRows[0][0].ttftMs).toBeNull();
    expect(errorRows[0][0].requestMs).toBeGreaterThanOrEqual(0);
  });

  it("transport error on writer throws (worker falls back)", async () => {
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        yield { type: "text-delta", text: "<file path=" };
        throw new Error("socket hangup");
      })(),
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
      response: Promise.resolve({ modelId: "served/model-x" }),
    }));

    await expect(
      runBatchedGenerate({ ...baseArgs(), stepCharger: makeCharger() }),
    ).rejects.toThrow(/socket hangup/i);
    const errorRows = recordAiCallMock.mock.calls.filter(
      ([entry]) => entry.status === "error",
    );
    expect(errorRows.length).toBeGreaterThan(0);
    expect(errorRows[0][0].phase).toBe("writer");
  });

  it("WriterTsxSyntaxError fast-fail still charges energy and records an error-tagged row", async () => {
    const broken = `<file path="src/routes/index.tsx">\nexport function HomeRouteComponent() { return (<div>;\n</file>\n<done summary="x" />`;
    streamTextMock
      .mockReturnValueOnce(writerStream(broken))
      // Targeted repair re-receives the same broken stream so the writer-phase
      // assertions below stay deterministic (the run still ends needsFallback).
      .mockReturnValueOnce(writerStream(broken))
      .mockReturnValueOnce(writerStream(broken));

    const result = await runBatchedGenerate({
      ...baseArgs(),
      stepCharger: makeCharger(),
    });

    // Fast-fail short-circuits the writer; the caller falls back. Either way
    // the attempt cannot succeed from a structurally-broken stream.
    expect(result.ok).toBe(false);
    // Energy was consumed generating tokens up to the broken block — the same
    // per-step ledger used on success must charge them (writer + 2 repairs all
    // fast-fail the same way here, so each leg produces exactly one debit).
    expect(chargeEnergyForStepMock).toHaveBeenCalledTimes(3);
    expect(chargeEnergyForStepMock).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 1200,
        outputTokens: 800,
        reason: "build:step",
        userId: "u-test",
      }),
    );
    // The writer leg's AiCall row is tagged status=error (not "ok"), with the
    // partial usage attached so telemetry matches the energy debit.
    const writerErrorRows = recordAiCallMock.mock.calls.filter(
      ([entry]) => entry.phase === "writer" && entry.status === "error",
    );
    expect(writerErrorRows).toHaveLength(1);
    expect(writerErrorRows[0][0]).toMatchObject({
      attemptId: "a1",
      projectId: "p1",
      inputTokens: 1200,
      outputTokens: 800,
      task: "build-step",
    });
    // No extra "ok" writer row for this leg.
    const okWriterRows = recordAiCallMock.mock.calls.filter(
      ([entry]) => entry.phase === "writer" && entry.status === "ok",
    );
    expect(okWriterRows).toHaveLength(0);
  });
});

describe("collectBatchedGateIssues", () => {
  it("flags missing required files and placeholder URLs", () => {
    const issues = collectBatchedGateIssues(
      [{ path: "public/x.svg", content: "<svg />" }] as GeneratedProjectFile[],
      { indexCss: "--background: oklch(0.99 0 0);" },
    );
    expect(issues.join("\n")).toMatch(/src\/routes\/index\.tsx/);
  });

  it("flags external placeholder URLs in TSX", () => {
    const issues = collectBatchedGateIssues(
      [
        {
          path: "src/routes/index.tsx",
          content:
            'export function HomeRouteComponent() { return <img src="https://placehold.co/600x400" />; }',
        },
      ] as GeneratedProjectFile[],
      { indexCss: "--background: oklch(0.99 0 0);" },
    );
    expect(issues.join("\n")).toMatch(/placeholder|external/i);
  });

  it("flags createFileRoute in route files (regression: tsc build gate)", () => {
    // The scaffold routes manually via createRoute in src/router.tsx; the
    // file-route API (createFileRoute('/')) fails tsc and never reaches the
    // router tree, failing the whole build after the AI pass.
    const issues = collectBatchedGateIssues(
      [
        {
          path: "src/routes/index.tsx",
          content:
            "import { createFileRoute } from '@tanstack/react-router';\nexport const Route = createFileRoute('/')({ component: HomeRouteComponent });\nexport function HomeRouteComponent() { return <div>Home</div>; }",
        },
      ] as GeneratedProjectFile[],
      { indexCss: "--background: oklch(0.99 0 0);" },
    );
    expect(issues.join("\n")).toMatch(/createFileRoute/);
  });

  it("flags a home route that never calls usePreviewReady (preview iframe hangs)", () => {
    const issues = collectBatchedGateIssues(
      [
        {
          path: "src/routes/index.tsx",
          content:
            "export function HomeRouteComponent() { return <div>Kopi Lanang</div>; }",
        },
        {
          path: "src/lib/preview-ready.ts",
          content: "export function usePreviewReady() {}",
        },
      ] as GeneratedProjectFile[],
      { indexCss: "--background: oklch(0.99 0 0);" },
    );
    expect(issues.join("\n")).toMatch(/usePreviewReady/);
  });

  it("flags a generic stub home route with no brief content", () => {
    const issues = collectBatchedGateIssues(
      [
        {
          path: "src/routes/index.tsx",
          content:
            "export function HomeRouteComponent() {\n  usePreviewReady();\n  return <div><h1>Home</h1><p>Welcome to the home page.</p></div>;\n}",
        },
        {
          path: "src/lib/preview-ready.ts",
          content: "export function usePreviewReady() {}",
        },
      ] as GeneratedProjectFile[],
      { indexCss: "--background: oklch(0.99 0 0);" },
    );
    expect(issues.join("\n")).toMatch(/generic stub/);
  });

  it("passes a clean stage", () => {
    const issues = collectBatchedGateIssues(
      [
        { path: "src/routes/index.tsx", content: HOME_TSX },
      ] as GeneratedProjectFile[],
      {
        indexCss:
          "--background: oklch(0.98 0.01 95); --foreground: oklch(0.2 0.01 95); --accent: oklch(0.6 0.15 40);",
      },
    );
    expect(issues).toEqual([]);
  });

  it("rejects starter boilerplate CTAs and feature cards (scaffold rot)", () => {
    const issues = collectBatchedGateIssues(
      [
        {
          path: "src/routes/index.tsx",
          content:
            'import { site } from "@/content/site";\nimport { usePreviewReady } from "@/lib/preview-ready";\nexport function HomeRouteComponent() {\n  usePreviewReady();\n  return (<div><h1>{site.businessName}</h1><p>{site.headline}</p><a href="/blog">Read the Blog</a><a href="https://github.com">View on GitHub</a></div>);\n}',
        },
      ] as GeneratedProjectFile[],
      { indexCss: "--background: oklch(0.99 0 0);" },
    );
    expect(issues.join("\n")).toMatch(/starter boilerplate|scaffold rot/);
  });

  it("flags populated site.ts fields not rendered in index.tsx (completeness gate)", () => {
    // site.ts has products + testimonials + faq, but index.tsx only renders
    // headline. The gate must catch each unrendered populated field.
    const siteTs =
      'export const site = { businessName: "Toko A", headline: "Selamat datang", subheadline: "", primaryCta: "Pesan", offer: "Barang", trustPoints: [], sections: [], products: [{ name: "A" }], testimonials: [{ quote: "q", author: "a" }], faq: [{ q: "q", a: "a" }], currentPromo: "", socialLinks: [] } as const;\nexport default site;';
    const indexTsx =
      'import { site } from "@/content/site";\nimport { usePreviewReady } from "@/lib/preview-ready";\nexport function HomeRouteComponent() {\n  usePreviewReady();\n  return (<main><h1>{site.headline}</h1></main>);\n}';
    const issues = collectBatchedGateIssues(
      [
        { path: "src/routes/index.tsx", content: indexTsx },
        { path: "src/content/site.ts", content: siteTs },
      ] as GeneratedProjectFile[],
      { indexCss: "--background: ok; --foreground: ok; --accent: ok;" },
    );
    const joined = issues.join("\n");
    expect(joined).toMatch(/site\.offer/);
    expect(joined).toMatch(/site\.primaryCta/);
    expect(joined).toMatch(/site\.products/);
    expect(joined).toMatch(/site\.testimonials/);
    expect(joined).toMatch(/site\.faq/);
  });

  it("does not flag empty site.ts fields (data-driven — minimal brief not penalized)", () => {
    // Only businessName + headline populated; everything else empty. The gate
    // must only enforce rendering of populated fields, so a minimal brief is
    // not penalized for skipping products/testimonials/faq.
    const siteTs =
      'export const site = { businessName: "Toko A", headline: "Selamat datang", subheadline: "", primaryCta: "", offer: "", trustPoints: [], sections: [], products: [], testimonials: [], faq: [], currentPromo: "", socialLinks: [] } as const;\nexport default site;';
    const indexTsx =
      'import { site } from "@/content/site";\nimport { usePreviewReady } from "@/lib/preview-ready";\nexport function HomeRouteComponent() {\n  usePreviewReady();\n  return (<main><h1>{site.headline}</h1></main>);\n}';
    const issues = collectBatchedGateIssues(
      [
        { path: "src/routes/index.tsx", content: indexTsx },
        { path: "src/content/site.ts", content: siteTs },
      ] as GeneratedProjectFile[],
      { indexCss: "--background: ok; --foreground: ok; --accent: ok;" },
    );
    // headline is populated and rendered — no issues expected.
    expect(issues).toEqual([]);
  });
});

describe("buildBatchedWriterPrompt", () => {
  it("system prompt contains the response contract, scaffold manifest, and speed rules", () => {
    const { system, user } = buildBatchedWriterPrompt({
      brief: makeBrief(),
      implementationSpec: undefined,
      projectId: "p1",
      schema: createProjectSiteSchemaFromBrief(makeBrief()),
    });
    expect(system).toContain("<file");
    expect(system).toContain("<done");
    expect(system).toContain("src/routes/index.tsx");
    expect(system).toContain("SPEED RULES");
    expect(system).toContain("<file path=");
    expect(user).toContain("Kopi Sela");
  });

  it("system prompt contains EXACT FIELD NAMES table so the AI uses correct property names", () => {
    const { system } = buildBatchedWriterPrompt({
      brief: makeBrief(),
      implementationSpec: undefined,
      projectId: "p1",
      schema: createProjectSiteSchemaFromBrief(makeBrief()),
    });
    expect(system).toContain("EXACT FIELD NAMES");
    expect(system).toContain("priceRange");
    expect(system).toContain("quote");
    expect(system).toContain("author");
    expect(system).toMatch(/NOT price|NOT question/i);
  });
});
