import { afterEach, describe, expect, it, vi } from "vitest";

const {
  editGeneratedSourceWithAgentMock,
  runBatchedEditMock,
  recordAiCallMock,
  getSettingSyncMock,
  isAdminEmailMock,
} = vi.hoisted(() => ({
  editGeneratedSourceWithAgentMock: vi.fn(),
  runBatchedEditMock: vi.fn(),
  recordAiCallMock: vi.fn(),
  getSettingSyncMock: vi.fn((_key: string, fallback: unknown) => fallback),
  isAdminEmailMock: vi.fn(() => true),
}));

// -- Prisma: stubbed so the worker runs without a DB. Minimal surface for the
// -- happy path: attempt + project + active deployment + snapshot writes.
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock)),
  projectEditAttempt: {
    findFirst: vi.fn(async () => ({
      id: "attempt-1",
      instruction: "ubah katalog jadi dua kolom",
      parentSnapshotId: "snap-base",
      status: "running",
    })),
    update: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({})),
  },
  project: {
    findFirst: vi.fn(async () => ({
      buildStatus: "passed",
      id: "p1",
      prompt: "kopi",
      siteSchema: null,
      status: "ready",
    })),
    updateMany: vi.fn(async () => ({})),
  },
  projectDeployment: {
    findMany: vi.fn(async () => [
      {
        build: {
          artifactRef: "artifact-prev",
          createdAt: new Date(),
          id: "build-prev",
          snapshotId: "snap-base",
          status: "succeeded",
          updatedAt: new Date(),
        },
        buildId: "build-prev",
        createdAt: new Date(),
        id: "deploy-prev",
        kind: "preview",
        snapshot: {
          files: [
            { content: "export const x = 1;", path: "src/routes/index.tsx" },
            { content: "export const k = 1;", path: "src/routes/katalog.tsx" },
          ],
          id: "snap-base",
          sourceRef: null,
        },
        snapshotId: "snap-base",
        status: "created",
        updatedAt: new Date(),
      },
    ]),
    create: vi.fn(async () => ({ id: "deploy-1" })),
    updateMany: vi.fn(async () => ({})),
  },
  projectSnapshot: {
    create: vi.fn(async () => ({ id: "snap-1" })),
    update: vi.fn(async () => ({})),
  },
  projectBuild: {
    create: vi.fn(async () => ({ id: "build-1" })),
    updateMany: vi.fn(async () => ({})),
  },
  user: {
    findUnique: vi.fn(async () => ({ email: "admin@umkm.test" })),
  },
  runtimeEvent: {
    create: vi.fn(async () => ({})),
  },
}));

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

vi.mock("@/lib/projects/source-edit-agent", () => ({
  editGeneratedSourceWithAgent: editGeneratedSourceWithAgentMock,
}));

vi.mock("@/lib/projects/batched-edit", () => ({
  runBatchedEdit: runBatchedEditMock,
}));

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

vi.mock("@/lib/projects/attempt-queue", () => ({
  enqueueAndWaitEditBuild: vi.fn(async () => ({
    artifactRef: "artifact-1",
    buildStatus: "succeeded",
    logText: "ok",
  })),
}));

vi.mock("@/lib/projects/runtime-artifacts", () => ({
  readProjectSourceArtifact: vi.fn(async () => []),
  writeProjectSourceArtifact: vi.fn(async () => "srcref-1"),
  resolveArtifactFilesDir: vi.fn(() => null),
}));

vi.mock("@/lib/projects/runtime-supervisor", () => ({
  stopSupersededPreviewDeployments: vi.fn(async () => undefined),
}));

import { runEditAttempt } from "./edit-attempt-worker";

const baseArgs = () => ({
  abortSignal: new AbortController().signal,
  attemptId: "attempt-1",
  operationToken: "op-1",
  projectId: "p1",
  userId: "user-1",
});

function legacyOk() {
  return {
    files: [{ content: "export const x = 2;", path: "src/routes/index.tsx" }],
    modelId: "test/model",
    ok: true,
    operations: [{ path: "src/routes/index.tsx", type: "write_file" }],
    outputs: [],
    sideEffects: [{ path: "src/routes/index.tsx", type: "write_file" }],
    usage: { inputTokens: 10, outputTokens: 5 },
  };
}

function batchedOk() {
  return {
    ok: true as const,
    files: [
      { content: "export const x = 1;", path: "src/routes/index.tsx" },
      { content: "export const k = 2;", path: "src/routes/katalog.tsx" },
    ],
    repairRounds: 0,
    summary: "batched edit ok",
    writtenPaths: ["src/routes/katalog.tsx"],
  };
}

describe("runEditAttempt — batched rollout wiring", () => {
  afterEach(() => vi.clearAllMocks());

  it("flag=off → batched edit NOT called; legacy agent runs", async () => {
    getSettingSyncMock.mockImplementation((key: string, fb: unknown) =>
      key === "generation.batched_rollout" ? "off" : fb,
    );
    editGeneratedSourceWithAgentMock.mockResolvedValue(legacyOk());

    await runEditAttempt(baseArgs());

    expect(runBatchedEditMock).not.toHaveBeenCalled();
    expect(editGeneratedSourceWithAgentMock).toHaveBeenCalled();
    expect(
      recordAiCallMock.mock.calls.filter(([e]) => e.phase === "fallback"),
    ).toHaveLength(0);
  });

  it("flag=all + batched success → legacy agent NOT called; no fallback row", async () => {
    getSettingSyncMock.mockImplementation((key: string, fb: unknown) =>
      key === "generation.batched_rollout" ? "all" : fb,
    );
    runBatchedEditMock.mockResolvedValue(batchedOk());

    await runEditAttempt(baseArgs());

    expect(runBatchedEditMock).toHaveBeenCalledTimes(1);
    // First arg shape: sourceFiles + instruction from the attempt.
    expect(runBatchedEditMock.mock.calls[0][0]).toMatchObject({
      attemptId: "attempt-1",
      instruction: "ubah katalog jadi dua kolom",
    });
    expect(editGeneratedSourceWithAgentMock).not.toHaveBeenCalled();
    expect(
      recordAiCallMock.mock.calls.filter(([e]) => e.phase === "fallback"),
    ).toHaveLength(0);
  });

  it("flag=all + batched needsFallback → legacy agent runs; fallback telemetry task=edit", async () => {
    getSettingSyncMock.mockImplementation((key: string, fb: unknown) =>
      key === "generation.batched_rollout" ? "all" : fb,
    );
    runBatchedEditMock.mockResolvedValue({
      needsFallback: true,
      ok: false,
      reason: "gates failed after 2 repairs",
      repairRounds: 2,
    });
    editGeneratedSourceWithAgentMock.mockResolvedValue(legacyOk());

    await runEditAttempt(baseArgs());

    expect(runBatchedEditMock).toHaveBeenCalledTimes(1);
    expect(editGeneratedSourceWithAgentMock).toHaveBeenCalled();
    const fallbackRows = recordAiCallMock.mock.calls.filter(
      ([e]) => e.phase === "fallback" && e.task === "edit",
    );
    expect(fallbackRows.length).toBeGreaterThanOrEqual(1);
    expect(fallbackRows[0][0]).toMatchObject({
      attemptId: "attempt-1",
      projectId: "p1",
    });
  });

  it("flag=internal + admin owner → batched tried", async () => {
    getSettingSyncMock.mockImplementation((key: string, fb: unknown) =>
      key === "generation.batched_rollout" ? "internal" : fb,
    );
    isAdminEmailMock.mockReturnValue(true);
    runBatchedEditMock.mockResolvedValue(batchedOk());

    await runEditAttempt(baseArgs());

    expect(runBatchedEditMock).toHaveBeenCalledTimes(1);
    expect(editGeneratedSourceWithAgentMock).not.toHaveBeenCalled();
  });

  it("flag=internal + non-admin owner → legacy only", async () => {
    getSettingSyncMock.mockImplementation((key: string, fb: unknown) =>
      key === "generation.batched_rollout" ? "internal" : fb,
    );
    isAdminEmailMock.mockReturnValue(false);
    editGeneratedSourceWithAgentMock.mockResolvedValue(legacyOk());

    await runEditAttempt(baseArgs());

    expect(runBatchedEditMock).not.toHaveBeenCalled();
    expect(editGeneratedSourceWithAgentMock).toHaveBeenCalled();
  });

  it("flag=all → batched durable write-through reaches the progressive saver", async () => {
    getSettingSyncMock.mockImplementation((key: string, fb: unknown) =>
      key === "generation.batched_rollout" ? "all" : fb,
    );
    runBatchedEditMock.mockImplementation(
      (args: {
        onFileStaged?: (file: { content: string; path: string }) => void;
      }) => {
        args.onFileStaged?.({
          content: "export const k = 2;",
          path: "src/routes/katalog.tsx",
        });
        return Promise.resolve(batchedOk());
      },
    );

    await runEditAttempt(baseArgs());

    const saves = (
      prismaMock.project.updateMany.mock.calls as unknown as [
        { data?: unknown },
      ][]
    ).filter(([args]) => JSON.stringify(args.data).includes("katalog.tsx"));
    expect(saves.length).toBeGreaterThan(0);
  });

  it("user cancel (AbortError) → NO legacy fallback, abort propagates", async () => {
    getSettingSyncMock.mockImplementation((key: string, fb: unknown) =>
      key === "generation.batched_rollout" ? "all" : fb,
    );
    const abortError = new Error("The operation was aborted.");
    abortError.name = "AbortError";
    runBatchedEditMock.mockRejectedValue(abortError);

    await runEditAttempt(baseArgs());

    expect(runBatchedEditMock).toHaveBeenCalledTimes(1);
    expect(editGeneratedSourceWithAgentMock).not.toHaveBeenCalled();
    expect(
      recordAiCallMock.mock.calls.filter(([e]) => e.phase === "fallback"),
    ).toHaveLength(0);
    expect(prismaMock.projectEditAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
        }),
      }),
    );
  });
});
