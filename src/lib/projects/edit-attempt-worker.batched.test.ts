import { afterEach, describe, expect, it, vi } from "vitest";

const { runBatchedEditMock, recordAiCallMock } = vi.hoisted(() => ({
  runBatchedEditMock: vi.fn(),
  recordAiCallMock: vi.fn(),
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

describe("runEditAttempt — contract-v1 batched edit", () => {
  afterEach(() => vi.clearAllMocks());

  it("batched edit ALWAYS runs (no rollout flag, no legacy fallback)", async () => {
    runBatchedEditMock.mockResolvedValue(batchedOk());

    await runEditAttempt(baseArgs());

    expect(runBatchedEditMock).toHaveBeenCalledTimes(1);
    // First arg shape: sourceFiles + instruction from the attempt.
    expect(runBatchedEditMock.mock.calls[0][0]).toMatchObject({
      attemptId: "attempt-1",
      instruction: "ubah katalog jadi dua kolom",
    });
    expect(
      recordAiCallMock.mock.calls.filter(([e]) => e.phase === "fallback"),
    ).toHaveLength(0);
    expect(prismaMock.projectSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            generation: expect.objectContaining({ mode: "batched-edit" }),
          }),
        }),
      }),
    );
  });

  it("batched needsFallback → attempt FAILS; no legacy fallback", async () => {
    runBatchedEditMock.mockResolvedValue({
      needsFallback: true,
      ok: false,
      reason: "gates failed after 2 repairs",
      repairRounds: 2,
    });

    await runEditAttempt(baseArgs());

    expect(runBatchedEditMock).toHaveBeenCalledTimes(1);
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

  it("batched durable write-through reaches the progressive saver", async () => {
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

  it("protected/TSX-broken staged files never reach the progressive saver", async () => {
    runBatchedEditMock.mockImplementation(
      (args: {
        onFileStaged?: (file: { content: string; path: string }) => void;
      }) => {
        args.onFileStaged?.({
          content: "export const k = 2;",
          path: "src/routes/katalog.tsx",
        });
        args.onFileStaged?.({
          content: "/* hijacked */",
          path: "src/content/site.ts",
        });
        args.onFileStaged?.({
          content: "/* hijacked root */",
          path: "src/main.tsx",
        });
        args.onFileStaged?.({
          content: "export function Broken( { return (<div>;",
          path: "src/routes/broken.tsx",
        });
        return Promise.resolve(batchedOk());
      },
    );

    await runEditAttempt(baseArgs());

    const writes = prismaMock.project.updateMany.mock.calls as unknown as [
      { data?: { sourceFiles?: { path: string }[] } },
    ][];
    const stagedPaths = new Set<string>();
    for (const [call] of writes) {
      for (const file of call.data?.sourceFiles ?? []) {
        stagedPaths.add(file.path);
      }
    }
    expect(stagedPaths.has("src/routes/katalog.tsx")).toBe(true);
    expect(stagedPaths.has("src/content/site.ts")).toBe(false);
    expect(stagedPaths.has("src/main.tsx")).toBe(false);
    expect(stagedPaths.has("src/routes/broken.tsx")).toBe(false);
  });

  it("user cancel (AbortError) → abort propagates, attempt failed", async () => {
    const abortError = new Error("The operation was aborted.");
    abortError.name = "AbortError";
    runBatchedEditMock.mockRejectedValue(abortError);

    await runEditAttempt(baseArgs());

    expect(runBatchedEditMock).toHaveBeenCalledTimes(1);
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
