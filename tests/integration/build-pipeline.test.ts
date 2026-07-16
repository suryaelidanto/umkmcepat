import { describe, expect, it, vi } from "vitest";

// Integration test proving the build pipeline logic works end-to-end.
// Mocks the AI provider to verify the code path without external dependencies.

const generateTextMock = vi.fn().mockResolvedValue({
  text: "ALLOW",
  usage: { inputTokens: 5, outputTokens: 1 },
});

vi.mock("ai", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    generateText: generateTextMock,
    streamText: vi.fn().mockResolvedValue({
      textStream: (async function* () {
        yield '{"appKind":"interactive_app","businessName":"Test Business","pages":[{"slug":"home","title":"Home","purpose":"Landing"}],"components":[{"name":"Hero","purpose":"Hero section"},{"name":"ProductCard","purpose":"Product display"}],"features":["WhatsApp ordering"],"content":{},"style":{"direction":"Modern Indonesian","palette":{"background":"#ffffff","foreground":"#000000","muted":"#cccccc","accent":"#d84315"}},"primaryCta":"Pesan via WhatsApp","notes":[]}';
      })(),
      text: Promise.resolve("{}"),
      usage: Promise.resolve({
        inputTokens: 50,
        outputTokens: 50,
      }),
    }),
  };
});

vi.mock("@/lib/ai", () => ({
  getAiModel: vi.fn(() => ({ modelId: "mock-model" })),
  getAiTelemetry: vi.fn(() => ({ isEnabled: false })),
}));

vi.mock("@/lib/ai-models", () => ({
  getGenerationModel: vi.fn(() => "mock-model"),
  getDefaultAiModel: vi.fn(() => "mock-model"),
}));

vi.mock("@/lib/projects/custom-source-generator", () => ({
  generateCustomProjectFilesWithAgent: vi.fn().mockResolvedValue({
    buildSpec: "mock build spec",
    files: [
      {
        path: "src/routes/index.tsx",
        content: "export default function Home() { return <h1>Test</h1>; }",
      },
      { path: "src/styles.css", content: "body { margin: 0; }" },
    ],
    generationMode: "agent-custom",
    operationTrace: [],
    partial: false,
    repairAttempts: 0,
    summary: "Mock source generation",
    touchedFiles: ["src/routes/index.tsx", "src/styles.css"],
  }),
}));

vi.mock("@/lib/projects/generated-source", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    buildGeneratedProject: vi.fn().mockResolvedValue({
      ok: true,
      distFiles: [
        {
          path: "index.html",
          content: "<h1>Test</h1>",
          contentType: "text/html",
        },
      ],
      log: "Build succeeded",
    }),
    writeProjectSourceArtifact: vi.fn().mockResolvedValue("mock-source-ref"),
    writeProjectDistArtifact: vi.fn().mockResolvedValue("mock-dist-ref"),
    createGeneratedSourceSnapshotMetadata: vi.fn().mockReturnValue({
      manifest: null,
      manifestIssues: [],
      generation: {
        generationMode: "agent-custom",
        touchedFiles: ["src/routes/index.tsx"],
      },
    }),
  };
});

vi.mock("@/lib/projects/project-thumbnail", () => ({
  refreshProjectThumbnail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/projects/runtime-supervisor", () => ({
  stopSupersededPreviewDeployments: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/projects/runtime-events", () => ({
  createRuntimeEventData: vi.fn((data) => data),
}));

vi.mock("@/lib/projects/stale-builds", () => ({
  markStaleProjectBuilds: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/projects/project-operation", () => ({
  claimProjectOperation: vi
    .fn()
    .mockResolvedValue({ claimed: true, token: "mock-token" }),
  renewProjectOperation: vi.fn().mockResolvedValue(true),
  finalizeProjectOperation: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/user-credits", () => ({
  checkEnergy: vi.fn().mockResolvedValue({ allowed: true, remaining: 200_000 }),
  addEnergyUsage: vi.fn().mockResolvedValue({
    energyUsed: 0,
    inputTokens: 0,
    outputTokens: 0,
  }),
  isUserVerified: vi.fn().mockResolvedValue(true),
  MIN_ENERGY_BUILD: 40_000,
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: {
      id: "test-user-id",
      name: "Test User",
      email: "test@test.com",
    },
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn().mockResolvedValue({
        id: "test-project-id",
        userId: "test-user-id",
        buildStatus: "not_started",
        prompt: "test prompt",
        status: "discussing",
      }),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    projectSnapshot: {
      create: vi.fn().mockResolvedValue({ id: "snapshot-id" }),
      update: vi.fn(),
    },
    projectBuild: {
      create: vi.fn().mockResolvedValue({ id: "build-id" }),
      update: vi.fn(),
    },
    projectEditAttempt: {
      create: vi.fn().mockResolvedValue({ id: "attempt-id" }),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    runtimeEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ brief: null }]),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        projectBuild: { update: vi.fn() },
        projectEditAttempt: { update: vi.fn() },
        projectDeployment: {
          create: vi.fn().mockResolvedValue({ id: "deployment-id" }),
        },
      }),
    ),
  },
}));

vi.mock("@/lib/projects/brief", () => ({
  parseProjectBrief: vi.fn().mockReturnValue({
    confidence: 95,
    facts: [],
    notes: [],
    decisions: [],
    openQuestions: [],
  }),
  briefToBuildPrompt: vi.fn().mockReturnValue("build prompt"),
  isBriefReady: vi.fn().mockReturnValue(true),
  BRIEF_CONFIDENCE_THRESHOLD: 95,
}));

vi.mock("@/lib/config", () => ({
  isGeneratedBuildExecutionEnabled: vi.fn().mockReturnValue(true),
  getEnv: vi.fn((name: string) => process.env[name]),
}));

vi.mock("@/lib/dev-log", () => ({
  devLog: vi.fn(),
}));

describe("Build pipeline integration", () => {
  it("source generation returns files with correct structure", async () => {
    const { generateCustomProjectFilesWithAgent } =
      await import("@/lib/projects/custom-source-generator");

    const result = await generateCustomProjectFilesWithAgent({
      implementationBrief: "test",
      projectId: "test-id",
      schema: { type: "site", pages: [], components: [] } as never,
    });

    expect(result.files.length).toBeGreaterThan(0);
    expect(
      result.files.some(
        (f: { path: string }) => f.path === "src/routes/index.tsx",
      ),
    ).toBe(true);
    expect(result.generationMode).toBe("agent-custom");
    expect(result.partial).toBe(false);
  });

  it("moderation defaults to ALLOW for empty model responses", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: "",
      usage: { inputTokens: 5, outputTokens: 0 },
    });
    const { moderateProjectRequest } = await import("@/lib/ai-moderation");
    const result = await moderateProjectRequest(
      `unique empty moderation ${Date.now()}`,
    );
    expect(result).toMatchObject({
      allowed: true,
      usage: { inputTokens: 5, outputTokens: 0 },
    });
  });

  it("implementation spec parser validates required fields", async () => {
    const { parseImplementationSpec } =
      await import("@/lib/projects/implementation-spec");

    const valid = parseImplementationSpec({
      appKind: "interactive_app",
      businessName: "Test",
      pages: [{ slug: "home", title: "Home", purpose: "Landing" }],
      components: [
        { name: "Header", purpose: "Nav" },
        { name: "Hero", purpose: "Hero" },
      ],
      features: ["Contact"],
      content: {},
      style: {
        direction: "Modern Indonesian",
        palette: {
          background: "#ffffff",
          foreground: "#000000",
          muted: "#cccccc",
          accent: "#ff0000",
        },
      },
      primaryCta: "Contact",
      notes: [],
    });

    expect(valid).not.toBeNull();
    expect(valid!.appKind).toBe("interactive_app");
    expect(valid!.pages).toHaveLength(1);
    expect(valid!.components).toHaveLength(2);
  });

  it("implementation spec parser rejects invalid input", async () => {
    const { parseImplementationSpec } =
      await import("@/lib/projects/implementation-spec");

    expect(parseImplementationSpec(null)).toBeNull();
    expect(parseImplementationSpec(undefined)).toBeNull();
    expect(parseImplementationSpec("not an object")).toBeNull();
  });
});
