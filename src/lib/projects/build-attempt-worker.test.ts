import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildGeneratedProjectMock,
  finalizeProjectOperationMock,
  loadAcceptedHandoffMock,
  publishBuildProgressMock,
  runAgenticGenerateMock,
  snapshotMetadataArgs,
  prismaMock,
  resolveGenerateModeMock,
  chargeEnergyForStepMock,
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
    projectDeployment: {
      create: vi.fn(async () => ({ id: "deployment-1" })),
    },
    projectAsset: {
      findMany: vi.fn(async () => []),
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
            pages: [{ id: "home", path: "/", purpose: "landing" }],
            navigation: [],
            capabilities: [],
          },
          reviewItems: [],
          reviewHash: "r".repeat(64),
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
    finalizeProjectOperationMock: vi.fn(async () => true),
    runAgenticGenerateMock: vi.fn(async (..._input: unknown[]) => {
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
        operationTrace: [],
        skillsRead: ["impeccable", "shadcn"],
      };
    }),
    buildGeneratedProjectMock: vi.fn(async () => ({
      ok: true,
      log: "ok",
      distFiles: [
        { path: "index.html", content: "<html/>", contentType: "text/html" },
      ],
    })),
    loadAcceptedHandoffMock: pMock.projectBuildHandoff.findFirst,
    prismaMock: pMock,
    resolveGenerateModeMock: vi.fn(
      (): "first_generate" | "retry_build" => "first_generate",
    ),
    publishBuildProgressMock: vi.fn(),
    snapshotMetadataArgs: [] as unknown[][],
    chargeEnergyForStepMock: vi.fn(async (..._args: unknown[]) => ({
      energyUsed: 100,
      remaining: 9_000,
    })),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/projects/build-attempt-pubsub", () => ({
  publishBuildProgress: publishBuildProgressMock,
}));

vi.mock("@/lib/payment/user-credits", () => ({
  chargeEnergyForStep: (...args: unknown[]) => chargeEnergyForStepMock(...args),
}));

vi.mock("@/lib/projects/project-operation", () => ({
  claimProjectOperation: vi.fn(async () => ({
    claimed: true,
    token: "lease-1",
  })),
  finalizeProjectOperation: finalizeProjectOperationMock,
  renewProjectOperation: vi.fn(async () => true),
}));

vi.mock("@/lib/projects/progressive-save", () => ({
  createProgressiveSaver: () => ({
    save: vi.fn(),
    flush: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/projects/resolve-generate-mode", () => ({
  resolveGenerateMode: resolveGenerateModeMock,
}));

vi.mock("@/lib/projects/agentic-generator", () => ({
  runAgenticGenerate: runAgenticGenerateMock,
}));

vi.mock("@/lib/projects/generated-source", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/projects/generated-source")>();
  return {
    ...actual,
    buildGeneratedProject: buildGeneratedProjectMock,
    createGeneratedSourceSnapshotMetadata: (...args: unknown[]) => {
      snapshotMetadataArgs.push(args);
      return {};
    },
    createGeneratedViteTanStackStarterFiles: () => [
      {
        path: "src/routes/index.tsx",
        content: "export function HomeRouteComponent() {}",
      },
    ],
    writeProjectSourceArtifact: vi.fn(async () => "artifact-1"),
  };
});

vi.mock("@/lib/projects/build-handoffs", () => ({
  loadAcceptedHandoffForAttempt: loadAcceptedHandoffMock,
}));

vi.mock("@/lib/projects/runtime-artifacts", () => ({
  resolveArtifactFilesDir: vi.fn(() => null),
  writeProjectDistArtifact: vi.fn(async () => "dist-artifact"),
  writeProjectSourceArtifact: vi.fn(async () => "source-artifact"),
}));

vi.mock("@/lib/projects/project-thumbnail", () => ({
  refreshProjectThumbnail: vi.fn(async () => undefined),
}));

vi.mock("@/lib/projects/runtime-supervisor", () => ({
  stopSupersededPreviewDeployments: vi.fn(async () => undefined),
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
      generationEngine: "contract-v1",
    },
    userId: "user-1",
  };
}

describe("runBuildAttempt — tool-loop generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadAcceptedHandoffMock.mockResolvedValue(null);
    resolveGenerateModeMock.mockReturnValue("first_generate");
  });

  it("fails closed when a contract build has no accepted handoff", async () => {
    await runBuildAttempt(baseContext());

    expect(runAgenticGenerateMock).not.toHaveBeenCalled();
    expect(prismaMock.projectEditAttempt.updateMany).toHaveBeenCalled();
  });

  it("records the latest successful retry build time", async () => {
    resolveGenerateModeMock.mockReturnValue("retry_build");

    await runBuildAttempt({
      ...baseContext(),
      generateMode: "retry_build",
      project: {
        ...baseContext().project,
        generationEngine: "legacy",
      },
    });

    expect(finalizeProjectOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          builtAt: expect.any(Date),
        }),
      }),
    );
  });

  it("passes the accepted handoff directly to the writer without a planning call", async () => {
    const acceptedHandoff = {
      id: "handoff-1",
      briefSnapshot: {
        version: 2,
        prompt: "Buat website usaha",
        business: { name: "Usaha", type: "lokal" },
        offers: [{ name: "Layanan", isPrimary: true }],
        visitorJobs: [],
        audience: "Pelanggan sekitar",
        primaryAction: { kind: "browse", label: "Lihat", target: null },
        visualDirection: null,
        fieldState: {},
        content: {
          tagline: null,
          usp: [],
          priceRange: null,
          hours: [],
          address: null,
          deliveryArea: null,
          since: null,
          testimonials: [],
          certifications: [],
          paymentMethods: [],
          socialLinks: [],
          currentPromo: null,
          secondaryAction: null,
        },
        assets: [],
        provenance: { facts: [], decisions: [] },
      },
      contract: {
        identity: { businessName: "Usaha", businessType: "lokal" },
        facts: [],
        ctaIntents: [],
        assets: [],
      },
      plan: {
        pages: [
          {
            path: "/",
            title: "Beranda",
          },
        ],
      },
    };
    loadAcceptedHandoffMock.mockResolvedValue(acceptedHandoff as never);

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

    expect(runAgenticGenerateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        buildContract: acceptedHandoff.contract,
        buildPlan: acceptedHandoff.plan,
      }),
    );
    expect(finalizeProjectOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          activeHandoffId: "handoff-1",
          brief: acceptedHandoff.briefSnapshot,
          workspaceCard: { type: "none" },
        }),
      }),
    );
  });
});

describe("runBuildAttempt — bounded self-repair loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadAcceptedHandoffMock.mockResolvedValue(null);
    resolveGenerateModeMock.mockReturnValue("first_generate");
    chargeEnergyForStepMock.mockResolvedValue({
      energyUsed: 100,
      remaining: 9_000,
    });
    publishBuildProgressMock.mockClear();
    snapshotMetadataArgs.length = 0;
    runAgenticGenerateMock.mockImplementation(async (rawInput: unknown) => {
      const input = rawInput as {
        stepCharger?: {
          onStepFinish: (step: {
            usage: { inputTokens: number; outputTokens: number };
          }) => Promise<void>;
        };
      };
      if (input.stepCharger) {
        await input.stepCharger.onStepFinish({
          usage: { inputTokens: 10, outputTokens: 5 },
        });
      }
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
        operationTrace: [],
        skillsRead: ["impeccable", "shadcn"],
      };
    });
  });

  function publishedEvents() {
    return publishBuildProgressMock.mock.calls.map(
      (call) => call[1] as { type: string; label?: string },
    );
  }

  it("repairs through three rounds, succeeds, and never emits an error", async () => {
    buildGeneratedProjectMock
      .mockResolvedValueOnce({
        ok: false,
        log: "error TS2322: src/routes/index.tsx: Property 'x' is missing",
        distFiles: [],
      })
      .mockResolvedValueOnce({
        ok: false,
        log: "error TS2304: src/components/site/hero.tsx: Cannot find name 'y'",
        distFiles: [],
      })
      .mockResolvedValue({
        ok: true,
        log: "ok",
        distFiles: [
          { path: "index.html", content: "<html/>", contentType: "text/html" },
        ],
      });

    await runBuildAttempt({
      ...baseContext(),
      project: { ...baseContext().project, generationEngine: "legacy" },
    });

    expect(runAgenticGenerateMock).toHaveBeenCalledTimes(3);
    expect(buildGeneratedProjectMock).toHaveBeenCalledTimes(3);
    const thirdInput = runAgenticGenerateMock.mock.calls[2][0] as {
      repairContext?: { logExcerpt: string; failingFiles: string[] } | null;
    };
    expect(thirdInput.repairContext?.logExcerpt).toContain("TS2304");
    expect(thirdInput.repairContext?.failingFiles).toContain(
      "src/components/site/hero.tsx",
    );
    expect(prismaMock.projectDeployment.create).toHaveBeenCalledTimes(1);
    expect(publishedEvents().filter((e) => e.type === "error")).toHaveLength(0);
    expect(
      publishedEvents().filter(
        (e) => e.type === "progress" && e.label?.includes("Merapikan"),
      ),
    ).toHaveLength(2);
    expect(publishedEvents().filter((e) => e.type === "energy")).toHaveLength(
      3,
    );
    const generationArg = snapshotMetadataArgs.at(-1)?.[2] as
      { repairRounds?: number } | undefined;
    expect(generationArg?.repairRounds).toBe(3);
  });

  it("stops with exactly one error after the round cap plus one clean rebuild", async () => {
    buildGeneratedProjectMock.mockResolvedValue({
      ok: false,
      log: "error TS2322: everywhere",
      distFiles: [],
    });

    await runBuildAttempt({
      ...baseContext(),
      project: { ...baseContext().project, generationEngine: "legacy" },
    });

    expect(runAgenticGenerateMock).toHaveBeenCalledTimes(3);
    expect(buildGeneratedProjectMock).toHaveBeenCalledTimes(4);
    expect(publishedEvents().filter((e) => e.type === "error")).toHaveLength(1);
    expect(finalizeProjectOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ buildStatus: "failed" }),
      }),
    );
  });

  it("retries transient generation errors without consuming a repair round", async () => {
    buildGeneratedProjectMock.mockResolvedValue({
      ok: true,
      log: "ok",
      distFiles: [
        { path: "index.html", content: "<html/>", contentType: "text/html" },
      ],
    });
    runAgenticGenerateMock
      .mockRejectedValueOnce(new Error("fetch failed: ECONNRESET"))
      .mockResolvedValueOnce({
        files: [
          {
            path: "src/routes/index.tsx",
            content: "export function Home() {}",
          },
        ],
        generationMode: "agentic" as const,
        summary: "done",
        touchedFiles: ["src/routes/index.tsx"],
        operationTrace: [],
        skillsRead: ["impeccable", "shadcn"],
      });

    await runBuildAttempt({
      ...baseContext(),
      project: { ...baseContext().project, generationEngine: "legacy" },
    });

    expect(runAgenticGenerateMock).toHaveBeenCalledTimes(2);
    const generationArg = snapshotMetadataArgs.at(-1)?.[2] as
      { repairRounds?: number } | undefined;
    expect(generationArg?.repairRounds).toBe(1);
    expect(prismaMock.projectDeployment.create).toHaveBeenCalledTimes(1);
    expect(publishedEvents().filter((e) => e.type === "error")).toHaveLength(0);
  });
});
