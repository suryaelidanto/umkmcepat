import { afterEach, describe, expect, it, vi } from "vitest";

const {
  runBatchedGenerateMock,
  recordAiCallMock,
  getSettingSyncMock,
  buildGeneratedProjectMock,
  generateTextMock,
  loadAcceptedHandoffMock,
  qualifyGeneratedSiteMock,
} = vi.hoisted(() => ({
  runBatchedGenerateMock: vi.fn(),
  recordAiCallMock: vi.fn(),
  getSettingSyncMock: vi.fn((_key: string, fallback: unknown) => fallback),
  buildGeneratedProjectMock: vi.fn(async () => ({
    ok: true,
    log: "ok",
    distFiles: [
      { path: "index.html", content: "<html/>", contentType: "text/html" },
    ],
  })),
  loadAcceptedHandoffMock: vi.fn(),
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
  generateTextMock: vi.fn(async () => ({
    finishReason: "stop",
    text: `<spec>\n${JSON.stringify({
      appKind: "landing",
      archetype: "generic",
      businessName: "Kopi Sela",
      pages: [{ slug: "/", title: "Home", purpose: "landing" }],
      components: [
        { name: "Hero", purpose: "headline" },
        { name: "ContactCard", purpose: "wa cta" },
      ],
      features: ["landing"],
      content: {},
      style: {
        direction: "warm",
        palette: {
          background: "#ffffff",
          foreground: "#222222",
          muted: "#888888",
          accent: "#f05a28",
        },
      },
      primaryCta: "Hubungi kami",
      notes: [],
    })}\n</spec>`,
    response: { modelId: "served/spec" },
    usage: { inputTokens: 10, outputTokens: 5 },
    toolCalls: [],
  })),
}));

// -- Prisma: single stub object; every call lands on vi.fn so we can assert
// -- what the worker wrote without standing up a real DB.
const prismaMock = vi.hoisted(() => {
  const brief = {
    version: 1,
    notes: [],
    readyForBuild: true,
    prompt: "kopi",
    businessName: "Kopi Sela",
    businessType: "Coffee shop",
    offer: "Espresso",
    targetCustomer: "Remote workers",
    contactOrCta: "WA",
    stylePreference: "Warm",
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
  };
  return {
    $queryRaw: vi.fn(async () => [{ brief }]),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock)),
    projectSnapshot: {
      create: vi.fn(async () => ({ id: "snap-1" })),
      findFirst: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
    },
    projectBuild: {
      create: vi.fn(async () => ({ id: "build-1" })),
      findFirst: vi.fn(async () => null),
      update: vi.fn(async (args: { data?: { status?: string } }) => ({
        id: "build-1",
        ...args,
      })),
    },
    projectEditAttempt: {
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({})),
    },
    projectDeployment: {
      create: vi.fn(async () => ({ id: "deploy-1" })),
    },
    project: {
      findUnique: vi.fn(async () => ({ status: "ready" })),
      updateMany: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    user: {
      findUnique: vi.fn(async () => ({ email: "admin@umkm.test" })),
    },
    runtimeEvent: {
      create: vi.fn(async () => ({})),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/app-settings", () => ({
  getSettingSync: getSettingSyncMock,
}));

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

vi.mock("@/lib/projects/batched-generator", () => ({
  runBatchedGenerate: runBatchedGenerateMock,
}));

vi.mock("@/lib/projects/generated-site-qualification", () => ({
  qualifyGeneratedSite: qualifyGeneratedSiteMock,
}));

vi.mock("@/lib/projects/build-handoffs", () => ({
  loadAcceptedHandoffForAttempt: loadAcceptedHandoffMock,
}));

vi.mock("@/lib/waitlist", () => ({
  isAdminEmail: vi.fn(() => false),
  isWaitlistApproved: vi.fn(async () => false),
}));

vi.mock("@/lib/projects/generated-source", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/projects/generated-source")>();
  return {
    ...actual,
    buildGeneratedProject: buildGeneratedProjectMock,
  };
});

vi.mock("@/lib/projects/project-operation", () => ({
  finalizeProjectOperation: vi.fn(async () => true),
  renewProjectOperation: vi.fn(async () => true),
}));

vi.mock("@/lib/projects/project-thumbnail", () => ({
  refreshProjectThumbnail: vi.fn(async () => undefined),
}));

vi.mock("@/lib/projects/build-attempt-pubsub", () => ({
  publishBuildProgress: vi.fn(),
}));

vi.mock("@/lib/projects/format-generated-source", () => ({
  formatGeneratedSource: vi.fn(async () => undefined),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    // Spec generation succeeds immediately with a minimal valid spec so the
    // attempt always reaches the source-write branch.
    generateText: generateTextMock,
  };
});

import { runBuildAttempt } from "./build-attempt-worker";

const baseContext = () => ({
  abortSignal: new AbortController().signal,
  attemptId: "attempt-1",
  buildId: "build-1",
  generateMode: "first_generate" as const,
  operationToken: "op-1",
  project: { id: "p1", prompt: "kopi", status: "draft" },
  userId: "user-1",
});

describe("runBuildAttempt — contract-v1 batched writer", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("enabled landing quality skips the spec call and passes the compiled contract", async () => {
    getSettingSyncMock.mockImplementation((key: string, fallback: unknown) => {
      if (key === "feature.generated_site_quality_rollout") {
        return "all";
      }
      if (key === "feature.builder_photo_enabled") {
        return false;
      }
      return fallback;
    });
    const contract = {
      schemaVersion: 1,
      revision: 1,
      contentHash: "c".repeat(64),
      identity: { businessName: "Kopi Sela", businessType: "fnb" },
      facts: [],
      decisions: [],
      visitorJobs: [{ id: "job", goal: "Memilih kopi", priority: "primary" }],
      ctaIntents: [{ id: "cta", kind: "browse", label: "Lihat menu" }],
      hardRequirements: [],
      prohibitedClaims: [],
      preferences: {
        visualDirection: "hangat",
        tone: null,
        density: null,
        motion: null,
      },
      assets: [],
      blockers: [],
      omissions: [],
    };
    const plan = {
      schemaVersion: 1,
      revision: 1,
      contractHash: contract.contentHash,
      contentHash: "p".repeat(64),
      appKind: "landing",
      archetype: "fnb-menu",
      pages: [
        {
          id: "home",
          path: "/",
          title: "Kopi Sela",
          purpose: "Memilih kopi",
          visitorJobIds: ["job"],
          requiredFactIds: [],
          sections: [
            {
              id: "menu",
              purpose: "Menu kopi",
              surfaceIntent: "contained",
              requiredFactIds: [],
              requiredAssetIds: [],
            },
          ],
        },
      ],
      navigation: [],
      capabilities: ["catalog"],
      artDirection: {
        businessSpecificReference: "menu kedai",
        antiReferences: [],
        imageStrategy: "typographic",
        fontStrategy: "system_stack",
      },
    };
    loadAcceptedHandoffMock.mockResolvedValue({
      id: "handoff-1",
      contract,
      plan,
      contractHash: contract.contentHash,
      planHash: plan.contentHash,
      contractRevision: 1,
      planRevision: 1,
    });
    runBatchedGenerateMock.mockResolvedValue({
      ok: true,
      files: [{ path: "src/routes/index.tsx", content: "export const x = 1;" }],
      repairRounds: 0,
      summary: "writer ok",
      writtenPaths: ["src/routes/index.tsx"],
    });

    await runBuildAttempt(baseContext());

    expect(loadAcceptedHandoffMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(runBatchedGenerateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contract: expect.objectContaining({
          page: expect.objectContaining({ appKind: "landing" }),
          design: expect.objectContaining({ mediaMode: "graphic" }),
        }),
      }),
    );
    expect(qualifyGeneratedSiteMock).toHaveBeenCalledTimes(1);
  });

  it("batched writer ALWAYS runs (no rollout flag, no legacy fallback)", async () => {
    runBatchedGenerateMock.mockResolvedValue({
      ok: true,
      files: [
        { path: "src/routes/index.tsx", content: "export const x = 1;" },
        { path: "package.json", content: "{}" },
      ],
      repairRounds: 0,
      summary: "writer ok",
      writtenPaths: ["src/routes/index.tsx"],
    });

    await runBuildAttempt(baseContext());

    expect(runBatchedGenerateMock).toHaveBeenCalledTimes(1);
    // No agent-pass fallback telemetry row is ever written.
    expect(
      recordAiCallMock.mock.calls.filter(
        ([entry]) => entry.phase === "fallback",
      ),
    ).toHaveLength(0);
  });

  it("batched needsFallback → attempt FAILS; no legacy fallback", async () => {
    runBatchedGenerateMock.mockResolvedValue({
      needsFallback: true,
      ok: false,
      reason: "validation gates failed after repairs",
      repairRounds: 2,
    });

    await runBuildAttempt(baseContext());

    expect(runBatchedGenerateMock).toHaveBeenCalledTimes(1);
    // The batched failure surfaces as a failed attempt, not a legacy retry.
    const attemptUpdate = prismaMock.projectEditAttempt.updateMany;
    expect(attemptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
        }),
      }),
    );
  });

  it("batched admission block → attempt FAILS; no legacy fallback", async () => {
    const { BatchedAdmissionBlockedError } = await import("./brief-admission");
    runBatchedGenerateMock.mockRejectedValue(
      new BatchedAdmissionBlockedError({
        blockers: ["contactOrCta"],
        reason: "Brief belum siap: kontak atau CTA masih kosong.",
      }),
    );

    await runBuildAttempt(baseContext());

    expect(runBatchedGenerateMock).toHaveBeenCalledTimes(1);
    expect(
      recordAiCallMock.mock.calls.filter(
        ([entry]) => entry.phase === "fallback",
      ),
    ).toHaveLength(0);
    const attemptUpdate = prismaMock.projectEditAttempt.updateMany;
    expect(attemptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
        }),
      }),
    );
  });

  it("batched files write through to the progressive saver (durable staging)", async () => {
    runBatchedGenerateMock.mockImplementation(
      (args: {
        onFileStaged?: (file: { content: string; path: string }) => void;
      }) => {
        args.onFileStaged?.({
          content: "export const x = 1;",
          path: "src/routes/kontak.tsx",
        });
        return Promise.resolve({
          ok: true,
          files: [
            { path: "src/routes/kontak.tsx", content: "export const x = 1;" },
          ],
          repairRounds: 0,
          summary: "writer ok",
          writtenPaths: ["src/routes/kontak.tsx"],
        });
      },
    );

    await runBuildAttempt(baseContext());

    const calls = prismaMock.project.updateMany.mock.calls as unknown as [
      { data?: unknown },
    ][];
    const saves = calls.filter(([args]) =>
      JSON.stringify(args.data).includes("kontak.tsx"),
    );
    expect(saves.length).toBeGreaterThan(0);
  });

  it("user cancel (AbortError) → abort propagates, attempt failed", async () => {
    const abortError = new Error("The operation was aborted.");
    abortError.name = "AbortError";
    runBatchedGenerateMock.mockRejectedValue(abortError);

    await runBuildAttempt(baseContext());

    expect(runBatchedGenerateMock).toHaveBeenCalledTimes(1);
    expect(
      recordAiCallMock.mock.calls.filter(
        ([entry]) => entry.phase === "fallback",
      ),
    ).toHaveLength(0);
    // The attempt was marked failed with the abort message preserved raw.
    const attemptUpdate = prismaMock.projectEditAttempt.updateMany;
    expect(attemptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          errorMessage: expect.stringMatching(/aborted/i),
        }),
      }),
    );
  });
});
