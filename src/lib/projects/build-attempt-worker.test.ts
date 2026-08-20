import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  recordAiCallMock,
  getSettingSyncMock,
  buildGeneratedProjectMock,
  generateTextMock,
  loadAcceptedHandoffMock,
  qualifyGeneratedSiteMock,
  prismaMock,
} = vi.hoisted(() => {
  const pMock = {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => [{ brief: { prompt: "kopi" } }]),
    $transaction: vi.fn(async (callback) =>
      typeof callback === "function" ? callback(pMock) : [],
    ),
    aiCallRecord: { create: vi.fn(async () => ({})) },
    project: {
      findFirst: vi.fn(async () => ({
        id: "project-1",
        status: "building",
        buildStatus: "running",
        title: "Kopi Sela",
        prompt: "kopi",
        generationEngine: "contract-v1",
      })),
      findUnique: vi.fn(async () => ({
        id: "project-1",
        status: "building",
        buildStatus: "running",
        title: "Kopi Sela",
        prompt: "kopi",
        generationEngine: "contract-v1",
      })),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    projectBuild: {
      create: vi.fn(async () => ({ id: "build-1" })),
      findFirst: vi.fn(async () => null),
      update: vi.fn(async () => ({ id: "build-1" })),
    },
    projectBuildHandoff: {
      findFirst: vi.fn(),
    },
    projectEditAttempt: {
      findFirst: vi.fn(async () => ({
        id: "attempt-1",
        kind: "generate",
        leaseToken: "lease-1",
        status: "generating",
      })),
      findUnique: vi.fn(async () => ({
        id: "attempt-1",
        projectId: "project-1",
        userId: "user-1",
        kind: "generate",
        leaseToken: "lease-1",
        status: "generating",
        handoff: {
          id: "h1",
          projectId: "project-1",
          userId: "user-1",
          status: "accepted",
          engine: "contract-v1",
          briefRevision: 2,
          briefHash: "b".repeat(64),
          briefSnapshot: {
            version: 2,
            business: { name: "Kopi Sela", type: "fnb" },
            offers: [{ name: "Espresso", isPrimary: true }],
            audience: "Umum",
            primaryAction: { type: "whatsapp", value: "08123" },
            visualDirection: "warm",
          },
          contract: {
            schemaVersion: 1,
            revision: 1,
            contentHash: "c".repeat(64),
            identity: { businessName: "Kopi Sela", businessType: "fnb" },
            facts: [],
            decisions: [],
            omissions: [],
            ctaIntents: [],
            visitorJobs: [],
            preferences: {},
            assets: [],
            prohibitedClaims: [],
            hardRequirements: [],
            blockers: [],
          },
          plan: {
            schemaVersion: 1,
            revision: 1,
            contractHash: "c".repeat(64),
            contentHash: "p".repeat(64),
            appKind: "marketing_site",
            archetype: "fnb",
            pages: [{ id: "home", path: "/", purpose: "landing" }],
            navigation: [],
            capabilities: [],
            artDirection: {
              businessSpecificReference: "",
              antiReferences: [],
              imageStrategy: "graphic",
              fontStrategy: "system_stack",
            },
          },
          reviewItems: [],
          reviewHash: "r".repeat(64),
          creativeDirection: null,
        },
      })),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    projectSnapshot: {
      create: vi.fn(async () => ({ id: "snap-1" })),
      findFirst: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
    },
    runtimeEvent: {
      create: vi.fn(async () => ({})),
    },
  };

  return {
    recordAiCallMock: vi.fn(),
    getSettingSyncMock: vi.fn((_key: string, fallback: unknown) => fallback),
    buildGeneratedProjectMock: vi.fn(async () => ({
      ok: true,
      log: "ok",
      distFiles: [
        { path: "index.html", content: "<html/>", contentType: "text/html" },
      ],
    })),
    loadAcceptedHandoffMock: pMock.projectBuildHandoff.findFirst,
    qualifyGeneratedSiteMock: vi.fn(async (files) => ({
      ok: true,
      files,
      browserReport: {
        version: 1,
        status: "pass",
        routes: [],
        evidenceIds: [],
        overheadMs: 1,
      },
      riskReport: { version: 1, risky: false, reasons: [] },
      criticReport: null,
      visualRepairCount: 0,
    })),
    generateTextMock: vi.fn(async (args: unknown) => {
      const prompt = (args as { prompt?: string })?.prompt || "";
      if (prompt.includes("<implementation_spec>")) {
        return {
          finishReason: "stop",
          text: `<spec>\n${JSON.stringify({
            appKind: "landing",
            archetype: "generic",
            businessName: "Kopi Sela",
            pages: [{ slug: "/", title: "Home", purpose: "landing" }],
            components: [],
            features: ["landing"],
            content: {},
            style: {
              direction: "warm",
              palette: {
                background: "#fff",
                foreground: "#000",
                muted: "#888",
                accent: "#f00",
              },
            },
            primaryCta: "Hubungi",
            notes: [],
          })}\n</spec>`,
          response: { modelId: "served/spec" },
          usage: { inputTokens: 10, outputTokens: 5 },
          toolCalls: [],
        };
      }
      return {
        finishReason: "stop",
        text: "ok",
        response: { modelId: "served/spec" },
        usage: { inputTokens: 10, outputTokens: 5 },
        toolCalls: [],
      };
    }),
    prismaMock: pMock,
  };
});

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: generateTextMock,
    isStepCount: vi.fn((count: number) => (step: unknown) => step === count),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/projects/project-operation", () => ({
  claimProjectOperation: vi.fn(async () => ({
    claimed: true,
    token: "lease-1",
  })),
  finalizeProjectOperation: vi.fn(async () => true),
  renewProjectOperation: vi.fn(async () => true),
}));

vi.mock("@/lib/projects/progressive-save", () => ({
  createProgressiveSaver: () => ({
    save: vi.fn(),
    flush: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/projects/resolve-generate-mode", () => ({
  resolveGenerateMode: vi.fn(() => "first_generate"),
}));

vi.mock("@/lib/projects/agentic-generator", async () => {
  return {
    runAgenticGenerate: vi.fn(async () => {
      await buildGeneratedProjectMock();
      return {
        files: [
          {
            path: "src/routes/index.tsx",
            content: "export function Home() {}",
          },
        ],
        generationMode: "agentic" as const,
        summary: "done",
        touchedFiles: ["src/routes/index.tsx"],
        repairAttempts: 0,
        operationTrace: [],
      };
    }),
  };
});

vi.mock("@/lib/projects/generated-source", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/projects/generated-source")>();
  return {
    ...actual,
    buildGeneratedProject: buildGeneratedProjectMock,
    createGeneratedSourceSnapshotMetadata: () => ({}),
    createGeneratedViteTanStackStarterFiles: () => [
      {
        path: "src/routes/index.tsx",
        content: "export function HomeRouteComponent() {}",
      },
    ],
    writeProjectSourceArtifact: vi.fn(async () => "artifact-1"),
  };
});

vi.mock("@/lib/projects/generated-site-qualification", () => ({
  qualifyGeneratedSite: (files: unknown) => qualifyGeneratedSiteMock(files),
}));

vi.mock("@/lib/projects/build-handoffs", () => ({
  loadAcceptedHandoffForAttempt: vi.fn(async () => null),
}));

vi.mock("@/lib/ai/ai-call-record", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/ai/ai-call-record")>();
  return {
    ...actual,
    recordAiCall: (...args: unknown[]) => recordAiCallMock(...args),
  };
});

vi.mock("@/lib/config/app-settings", () => ({
  getSettingSync: (key: string, fallback: unknown) =>
    getSettingSyncMock(key, fallback),
}));

vi.mock("@/lib/ai/ai", () => ({
  getAiModel: vi.fn(() => ({ modelId: "test/model" })),
  getAiTelemetry: vi.fn(() => ({ isEnabled: false })),
  getNoReasoningCallOptions: vi.fn(() => ({ reasoning: "none" })),
}));

vi.mock("@/lib/ai/ai-models", () => ({
  getGenerationModel: vi.fn(() => "test/model"),
}));

import { runBuildAttempt } from "./build-attempt-worker";

function baseContext() {
  return {
    abortSignal: new AbortController().signal,
    attemptId: "attempt-1",
    buildId: "build-1",
    generateMode: "first_generate" as const,
    operationToken: "lease-1",
    project: {
      id: "project-1",
      prompt: "kopi",
      status: "building",
    },
    userId: "user-1",
  };
}

describe("runBuildAttempt — tool-loop generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSettingSyncMock.mockImplementation((_key, fallback) => fallback);
    loadAcceptedHandoffMock.mockResolvedValue(null);
  });

  it("runs agentic tool-loop and builds project successfully", async () => {
    buildGeneratedProjectMock.mockResolvedValue({
      ok: true,
      log: "ok",
      distFiles: [
        { path: "index.html", content: "<html/>", contentType: "text/html" },
      ],
    });
    prismaMock.projectEditAttempt.findUnique.mockResolvedValue({
      id: "attempt-1",
      projectId: "project-1",
      userId: "user-1",
      kind: "generate",
      leaseToken: "lease-1",
      status: "generating",
      handoff: null,
    } as never);
    await runBuildAttempt(baseContext());

    expect(buildGeneratedProjectMock).toHaveBeenCalled();
  });
});
