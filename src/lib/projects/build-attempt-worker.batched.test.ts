import { afterEach, describe, expect, it, vi } from "vitest";

const {
  generateCustomProjectFilesWithAgentMock,
  runBatchedGenerateMock,
  recordAiCallMock,
  getSettingSyncMock,
  buildGeneratedProjectMock,
  isAdminEmailMock,
} = vi.hoisted(() => ({
  generateCustomProjectFilesWithAgentMock: vi.fn(),
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
  isAdminEmailMock: vi.fn(() => true),
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

vi.mock("@/lib/waitlist", () => ({
  isAdminEmail: isAdminEmailMock,
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

vi.mock("@/lib/projects/custom-source-generator", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/projects/custom-source-generator")
    >();
  return {
    ...actual,
    generateCustomProjectFilesWithAgent:
      generateCustomProjectFilesWithAgentMock,
  };
});

vi.mock("@/lib/projects/batched-generator", () => ({
  runBatchedGenerate: runBatchedGenerateMock,
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
    // Spec generation succeeds immediately with a minimal valid spec via a
    // single tool call so the attempt always reaches the source-write branch.
    generateText: vi.fn(async () => ({
      finishReason: "tool-calls",
      text: "",
      response: { modelId: "served/spec" },
      usage: { inputTokens: 10, outputTokens: 5 },
      toolCalls: [
        {
          input: {
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
                background: "#fff",
                foreground: "#222",
                muted: "#888",
                accent: "#f05a28",
              },
            },
            primaryCta: "Hubungi kami",
            notes: [],
          },
        },
      ],
    })),
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

describe("runBuildAttempt — batched rollout wiring", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("flag=off →batched runner NOT called, legacy agent runs", async () => {
    getSettingSyncMock.mockImplementation((key: string, fb: unknown) =>
      key === "generation.batched_rollout" ? "off" : fb,
    );
    generateCustomProjectFilesWithAgentMock.mockResolvedValue({
      buildSpec: "spec",
      energyExhausted: false,
      files: [{ path: "src/routes/index.tsx", content: "export const x = 1;" }],
      generationMode: "agent-custom",
      operationTrace: [],
      repairAttempts: 0,
      summary: "ok",
      touchedFiles: ["src/routes/index.tsx"],
    });

    await runBuildAttempt(baseContext());

    expect(runBatchedGenerateMock).not.toHaveBeenCalled();
    expect(generateCustomProjectFilesWithAgentMock).toHaveBeenCalledTimes(1);
    // No fallback marker — the legacy path is plain build-step here.
    expect(
      recordAiCallMock.mock.calls.filter(
        ([entry]) => entry.phase === "fallback",
      ),
    ).toHaveLength(0);
  });

  it("flag=all + batched success → legacy agent NOT called", async () => {
    getSettingSyncMock.mockImplementation((key: string, fb: unknown) =>
      key === "generation.batched_rollout" ? "all" : fb,
    );
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
    expect(generateCustomProjectFilesWithAgentMock).not.toHaveBeenCalled();
    // Writer telemetry rows flow through the runner itself (mocked out
    // here), but the worker must NOT write an agent-pass fallback row.
    expect(
      recordAiCallMock.mock.calls.filter(
        ([entry]) => entry.phase === "fallback",
      ),
    ).toHaveLength(0);
  });

  it("flag=all + batched needsFallback → legacy agent runs + telemetry marks phase=fallback", async () => {
    getSettingSyncMock.mockImplementation((key: string, fb: unknown) =>
      key === "generation.batched_rollout" ? "all" : fb,
    );
    runBatchedGenerateMock.mockResolvedValue({
      needsFallback: true,
      ok: false,
      reason: "validation gates failed after repairs",
      repairRounds: 2,
    });
    generateCustomProjectFilesWithAgentMock.mockResolvedValue({
      buildSpec: "spec",
      energyExhausted: false,
      files: [{ path: "src/routes/index.tsx", content: "legacy" }],
      generationMode: "agent-custom",
      operationTrace: [],
      repairAttempts: 0,
      summary: "legacy ok",
      touchedFiles: ["src/routes/index.tsx"],
    });

    await runBuildAttempt(baseContext());

    expect(runBatchedGenerateMock).toHaveBeenCalledTimes(1);
    expect(generateCustomProjectFilesWithAgentMock).toHaveBeenCalledTimes(1);
    const fallbackRows = recordAiCallMock.mock.calls.filter(
      ([entry]) => entry.phase === "fallback",
    );
    expect(fallbackRows.length).toBeGreaterThanOrEqual(1);
    expect(fallbackRows[0][0]).toMatchObject({
      attemptId: "attempt-1",
      projectId: "p1",
      task: "build-step",
    });
  });

  it("flag=internal + admin owner → batched tried", async () => {
    getSettingSyncMock.mockImplementation((key: string, fb: unknown) =>
      key === "generation.batched_rollout" ? "internal" : fb,
    );
    isAdminEmailMock.mockReturnValue(true);
    runBatchedGenerateMock.mockResolvedValue({
      ok: true,
      files: [{ path: "src/routes/index.tsx", content: "export const x = 1;" }],
      repairRounds: 0,
      summary: "writer ok",
      writtenPaths: ["src/routes/index.tsx"],
    });

    await runBuildAttempt(baseContext());

    expect(runBatchedGenerateMock).toHaveBeenCalledTimes(1);
    expect(generateCustomProjectFilesWithAgentMock).not.toHaveBeenCalled();
  });

  it("flag=internal + non-admin owner → legacy only", async () => {
    getSettingSyncMock.mockImplementation((key: string, fb: unknown) =>
      key === "generation.batched_rollout" ? "internal" : fb,
    );
    isAdminEmailMock.mockReturnValue(false);
    generateCustomProjectFilesWithAgentMock.mockResolvedValue({
      buildSpec: "spec",
      energyExhausted: false,
      files: [{ path: "src/routes/index.tsx", content: "x" }],
      generationMode: "agent-custom",
      operationTrace: [],
      repairAttempts: 0,
      summary: "legacy ok",
      touchedFiles: ["src/routes/index.tsx"],
    });

    await runBuildAttempt(baseContext());

    expect(runBatchedGenerateMock).not.toHaveBeenCalled();
    expect(generateCustomProjectFilesWithAgentMock).toHaveBeenCalledTimes(1);
  });

  it("admission block → legacy agent still runs (no user-visible abort)", async () => {
    getSettingSyncMock.mockImplementation((key: string, fb: unknown) =>
      key === "generation.batched_rollout" ? "all" : fb,
    );
    const { BatchedAdmissionBlockedError } = await import("./brief-admission");
    runBatchedGenerateMock.mockRejectedValue(
      new BatchedAdmissionBlockedError({
        blockers: ["contactOrCta"],
        reason: "Brief belum siap: kontak atau CTA masih kosong.",
      }),
    );
    generateCustomProjectFilesWithAgentMock.mockResolvedValue({
      buildSpec: "spec",
      energyExhausted: false,
      files: [{ path: "src/routes/index.tsx", content: "legacy" }],
      generationMode: "agent-custom",
      operationTrace: [],
      repairAttempts: 0,
      summary: "legacy ok",
      touchedFiles: ["src/routes/index.tsx"],
    });

    await runBuildAttempt(baseContext());

    expect(runBatchedGenerateMock).toHaveBeenCalledTimes(1);
    expect(generateCustomProjectFilesWithAgentMock).toHaveBeenCalledTimes(1);
    // Fallback telemetry row records the legacy pass.
    const fallbackRows = recordAiCallMock.mock.calls.filter(
      ([entry]) => entry.phase === "fallback",
    );
    expect(fallbackRows.length).toBeGreaterThanOrEqual(1);
  });

  it("user cancel (AbortError) → NO legacy fallback, abort propagates", async () => {
    getSettingSyncMock.mockImplementation((key: string, fb: unknown) =>
      key === "generation.batched_rollout" ? "all" : fb,
    );
    const abortError = new Error("The operation was aborted.");
    abortError.name = "AbortError";
    runBatchedGenerateMock.mockRejectedValue(abortError);

    // runBuildAttempt swallows errors into a user-facing "error" event; the
    // pin is that legacy never ran and no fallback telemetry was written.
    await runBuildAttempt(baseContext());

    expect(runBatchedGenerateMock).toHaveBeenCalledTimes(1);
    expect(generateCustomProjectFilesWithAgentMock).not.toHaveBeenCalled();
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
