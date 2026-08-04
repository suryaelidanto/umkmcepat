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

// Per-step charging records its own ledger rows (phase-less); the tests only
// assert on the writer/repair rows from runBatchedEdit itself.
vi.mock("./energy-step-charger", () => ({
  createStepCharger: vi.fn(() => ({
    isExhausted: () => false,
    modelId: "test/model",
    onStepFinish: vi.fn(async () => undefined),
    totals: () => ({ energyUsed: 0, inputTokens: 0, outputTokens: 0 }),
    userId: "u-test",
  })),
}));

import {
  buildBatchedEditPrompt,
  runBatchedEdit,
  selectBatchedEditTargets,
} from "./batched-edit";
import { createStepCharger } from "./energy-step-charger";
import { type GeneratedProjectFile } from "./generated-types";

const INDEX_TSX = `import { site } from "@/content/site";
import { usePreviewReady } from "@/lib/preview-ready";

export function HomeRouteComponent() {
  usePreviewReady();
  return <main className="min-h-dvh"><h1>{site.headline}</h1></main>;
}
`;

const INDEX_TSX_EDITED = INDEX_TSX.replace("min-h-dvh", "min-h-dvh bg-accent");

const KATALOG_TSX = `export function KatalogRouteComponent() {
  return <div>katalog</div>;
}
`;

function makeFiles(): GeneratedProjectFile[] {
  return [
    {
      path: "package.json",
      content: JSON.stringify({
        dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
        devDependencies: {},
      }),
    },
    { path: "src/content/site.ts", content: "export const site = {};" },
    {
      path: "src/index.css",
      content:
        ":root{ --background: 0 0% 100%; --foreground: 0 0% 3.9%; --accent: 24 95% 55%; }",
    },
    { path: "src/routes/index.tsx", content: INDEX_TSX },
    { path: "src/routes/katalog.tsx", content: KATALOG_TSX },
  ];
}

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
    usage: Promise.resolve({ inputTokens: 500, outputTokens: 300 }),
    response: Promise.resolve({ modelId: "served/model-x" }),
  };
}

function makeCharger() {
  return createStepCharger({
    modelId: "test/model",
    projectId: "p1",
    reason: "edit:step",
    userId: "u-test",
  });
}

const baseArgs = () => ({
  attemptId: "a1",
  instruction: "ubah halaman katalog jadi dua kolom",
  sourceFiles: makeFiles(),
});

describe("selectBatchedEditTargets", () => {
  const files = makeFiles();

  it("matches path nouns from the instruction (exact basename)", () => {
    const result = selectBatchedEditTargets({
      instruction: "ubah halaman katalog jadi dua kolom",
      sourceFiles: files,
    });
    expect(result.targets).toEqual(["src/routes/katalog.tsx"]);
    expect(result.needsSelfSelection).toBe(false);
  });

  it("matches nouns inside longer path stems", () => {
    const result = selectBatchedEditTargets({
      instruction: "update katalog page",
      sourceFiles: files,
    });
    expect(result.targets).toContain("src/routes/katalog.tsx");
    expect(result.needsSelfSelection).toBe(false);
  });

  it("falls back to self-selection when nothing matches", () => {
    const result = selectBatchedEditTargets({
      instruction: "make the hero pop",
      sourceFiles: files,
    });
    expect(result.targets).toEqual([]);
    expect(result.needsSelfSelection).toBe(true);
    expect(result.samplePaths).toContain("src/routes/index.tsx");
    expect(result.samplePaths).toContain("src/routes/katalog.tsx");
  });

  it("falls back to self-selection when matches exceed the ambiguity cap", () => {
    // A generated app surface (only src/ paths are candidates) bigger than 8
    // files, all matching the noun → genuinely ambiguous.
    const many = Array.from({ length: 9 }, (_, i) => ({
      content: "export const x = 1;",
      path: `src/routes/page-${i}.tsx`,
    }));
    const result = selectBatchedEditTargets({
      instruction: "update page",
      sourceFiles: many,
    });
    expect(result.needsSelfSelection).toBe(true);
  });

  it("maps annotation selectorPaths onto route files (none here → self-select)", () => {
    const result = selectBatchedEditTargets({
      annotationContext: "main section h1",
      instruction: "make it bigger",
      sourceFiles: files,
    });
    expect(result.needsSelfSelection).toBe(true);
    expect(result.samplePaths.length).toBeGreaterThan(0);
  });
});

describe("runBatchedEdit — happy path", () => {
  afterEach(() => vi.clearAllMocks());

  it("streams one targeted response, merges into source, records task=edit", async () => {
    const stream = writerStream(
      `<file path="src/routes/index.tsx">\n${INDEX_TSX_EDITED}</file>\n` +
        `<done summary="Perbarui beranda." />`,
    );
    streamTextMock.mockReturnValueOnce(stream);

    const events: Array<Record<string, unknown>> = [];
    const result = await runBatchedEdit({
      ...baseArgs(),
      onEvent: (type, data) => events.push({ ...data, eventType: type }),
      stepCharger: makeCharger(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected ok");
    }
    expect(result.writtenPaths).toContain("src/routes/index.tsx");
    // Written file content replaces the original; the parser trims exactly
    // one trailing newline, so compare normalized.
    expect(
      result.files
        .find((f) => f.path === "src/routes/index.tsx")
        ?.content.replace(/\n$/, ""),
    ).toBe(INDEX_TSX_EDITED.replace(/\n$/, ""));
    // Untouched files pass through.
    expect(
      result.files.find((f) => f.path === "src/routes/katalog.tsx"),
    ).toEqual(makeFiles().find((f) => f.path === "src/routes/katalog.tsx"));
    expect(
      recordAiCallMock.mock.calls
        .filter(([entry]) => entry.task === "edit")
        .map(([entry]) => entry.phase),
    ).toContain("writer");

    const edits = recordAiCallMock.mock.calls.filter(
      ([entry]) => entry.task === "edit",
    );
    expect(edits.length).toBeGreaterThan(0);
    expect(edits.map(([entry]) => entry.phase)).toContain("writer");
    expect(edits[0][0]).toMatchObject({
      attemptId: "a1",
      status: "ok",
      outputTokens: 300,
      inputTokens: 500,
    });

    const ops = events.filter((e) => e.eventType === "operation");
    expect(ops.some((e) => e.path === "src/routes/index.tsx")).toBe(true);
  });

  it("ambiguous instruction → prompt includes target list + self-selection directive", async () => {
    streamTextMock.mockReturnValueOnce(
      writerStream(
        `<file path="src/routes/index.tsx">\n${INDEX_TSX_EDITED}</file>\n` +
          `<done summary="hero pop" />`,
      ),
    );

    const result = await runBatchedEdit({
      ...baseArgs(),
      instruction: "make the hero pop",
      stepCharger: makeCharger(),
    });

    expect(result.ok).toBe(true);
    const call = streamTextMock.mock.calls[0][0];
    const prompt = `${call.system}\n${JSON.stringify(call.messages)}`;
    expect(prompt).toContain("src/routes/index.tsx");
    expect(prompt).toMatch(/pilih|self-select|choose.*files|TARGET LIST/s);
  });

  it("annotation context is inlined in the prompt when provided", async () => {
    streamTextMock.mockReturnValueOnce(
      writerStream(
        `<file path="src/routes/index.tsx">\n${INDEX_TSX_EDITED}</file>\n` +
          `<done summary="annotated" />`,
      ),
    );

    await runBatchedEdit({
      ...baseArgs(),
      annotationContext: "header nav",
      stepCharger: makeCharger(),
    });

    const call = streamTextMock.mock.calls[0][0];
    const prompt = `${call.system}\n${JSON.stringify(call.messages)}`;
    expect(prompt).toContain("header nav");
  });

  it("durable write-through: onFileStaged fires per closed block", async () => {
    streamTextMock.mockReturnValueOnce(
      writerStream(
        `<file path="src/routes/index.tsx">\n${INDEX_TSX_EDITED}</file>\n` +
          `<done summary="x" />`,
      ),
    );
    const staged: { content: string; path: string }[] = [];
    await runBatchedEdit({
      ...baseArgs(),
      onFileStaged(file) {
        staged.push(file);
      },
      stepCharger: makeCharger(),
    });
    expect(staged.map((f) => f.path)).toEqual(["src/routes/index.tsx"]);
  });
});

describe("runBatchedEdit — failure paths", () => {
  afterEach(() => vi.clearAllMocks());

  it("unparseable after ONE format-repair → needsFallback", async () => {
    // Per-call fresh generator — a returned stream object is one-shot.
    streamTextMock.mockImplementation(() =>
      writerStream('<file path="src/routes/index.tsx">x</edit>'),
    );
    const result = await runBatchedEdit({
      ...baseArgs(),
      stepCharger: makeCharger(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error();
    }
    expect(result.needsFallback).toBe(true);
    // One writer + one format-repair, never a third call.
    expect(streamTextMock).toHaveBeenCalledTimes(2);
    expect(recordAiCallMock.mock.calls.map((c) => c[0].phase)).toEqual([
      "writer",
      "format-repair",
    ]);
  });

  it("a TS-parse gate failure triggers targeted repair and succeeds", async () => {
    const broken = `export function HomeRouteComponent() { return (<div>;`;
    streamTextMock
      .mockReturnValueOnce(
        writerStream(
          `<file path="src/routes/index.tsx">\n${broken}\n</file>\n<done summary="1" />`,
        ),
      )
      .mockReturnValueOnce(
        writerStream(
          `<file path="src/routes/index.tsx">\n${INDEX_TSX_EDITED}</file>\n<done summary="2" />`,
        ),
      );

    const result = await runBatchedEdit({
      ...baseArgs(),
      stepCharger: makeCharger(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.repairRounds).toBe(1);
    }
    expect(streamTextMock).toHaveBeenCalledTimes(2);
    expect(recordAiCallMock.mock.calls.map((c) => c[0].phase)).toEqual([
      "writer",
      "repair",
    ]);
    expect(recordAiCallMock.mock.calls.every((c) => c[0].task === "edit")).toBe(
      true,
    );
  });

  it("out-of-scope repair files are dropped and re-prompted", async () => {
    const broken = `export function HomeRouteComponent() { return (<div>;`;
    streamTextMock
      .mockReturnValueOnce(
        writerStream(
          `<file path="src/routes/index.tsx">\n${broken}\n</file>\n<done summary="1" />`,
        ),
      )
      .mockReturnValueOnce(
        writerStream(
          `<file path="src/routes/index.tsx">\n${INDEX_TSX_EDITED}</file>\n` +
            `<file path="src/routes/sneaky.tsx">\nexport const sneaky = 1;\n</file>\n` +
            `<done summary="2" />`,
        ),
      )
      .mockReturnValueOnce(
        writerStream(
          `<file path="src/routes/index.tsx">\n${INDEX_TSX_EDITED}</file>\n<done summary="3" />`,
        ),
      );

    const result = await runBatchedEdit({
      ...baseArgs(),
      stepCharger: makeCharger(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.repairRounds).toBe(2);
      expect(result.writtenPaths).not.toContain("src/routes/sneaky.tsx");
      expect(
        result.files.find((f) => f.path === "src/routes/sneaky.tsx"),
      ).toBeUndefined();
    }
  });

  it("gates still failing after 2 targeted repairs → needsFallback", async () => {
    const broken = `export function HomeRouteComponent() { return (<div>;`;
    streamTextMock.mockReturnValue(
      writerStream(
        `<file path="src/routes/index.tsx">\n${broken}\n</file>\n<done summary="x" />`,
      ),
    );
    const result = await runBatchedEdit({
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

  it("transport error on writer throws (worker falls back)", async () => {
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        yield { type: "text-delta", text: "<file" };
        throw new Error("socket hangup");
      })(),
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
      response: Promise.resolve({ modelId: "served/model-x" }),
    }));
    await expect(
      runBatchedEdit({ ...baseArgs(), stepCharger: makeCharger() }),
    ).rejects.toThrow(/socket hangup/i);
    expect(
      recordAiCallMock.mock.calls.some(
        (c) => c[0].status === "error" && c[0].task === "edit",
      ),
    ).toBe(true);
  });
});

describe("buildBatchedEditPrompt", () => {
  it("contains the response contract, manifests, and edit-only directive", () => {
    const { system, user } = buildBatchedEditPrompt({
      annotationContext: undefined,
      instruction: "ubah katalog",
      needsSelfSelection: false,
      sourceFiles: makeFiles(),
      targets: ["src/routes/katalog.tsx"],
    });
    expect(system).toContain("<file");
    expect(system).toContain("<done");
    expect(system).toContain("src/routes/katalog.tsx");
    expect(system).toMatch(/ONLY the listed files/i);
    expect(user).toContain("ubah katalog");
  });
});
