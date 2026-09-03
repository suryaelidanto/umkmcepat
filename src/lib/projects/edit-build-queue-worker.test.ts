import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLocalBuildWorkerMock,
  prismaProjectBuildFindFirstMock,
  prismaProjectBuildUpdateMock,
  readProjectSourceArtifactMock,
} = vi.hoisted(() => ({
  createLocalBuildWorkerMock: vi.fn(),
  prismaProjectBuildFindFirstMock: vi.fn(),
  prismaProjectBuildUpdateMock: vi.fn(),
  readProjectSourceArtifactMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectBuild: {
      findFirst: prismaProjectBuildFindFirstMock,
      update: prismaProjectBuildUpdateMock,
    },
  },
}));
vi.mock("@/lib/projects/build-worker", () => ({
  createLocalBuildWorker: createLocalBuildWorkerMock,
}));
vi.mock("@/lib/projects/runtime-artifacts", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/projects/runtime-artifacts")
  >("@/lib/projects/runtime-artifacts");

  return {
    ...actual,
    readProjectSourceArtifact: readProjectSourceArtifactMock,
  };
});

import { runQueuedEditBuild } from "@/lib/projects/edit-build-queue-worker";

const baseJob = {
  attemptId: "attempt_1",
  buildId: "build_1",
  kind: "edit-build" as const,
  operationToken: "operation_1",
  projectId: "project_1",
  snapshotId: "snapshot_1",
  sourceRef: "project-artifact:s3:source:snapshot_1",
  userId: "user_1",
};

describe("queued edit build lineage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaProjectBuildFindFirstMock.mockResolvedValue({
      id: "build_1",
      projectId: "project_1",
      snapshot: {
        id: "snapshot_1",
        projectId: "project_1",
        sourceRef: baseJob.sourceRef,
      },
      snapshotId: "snapshot_1",
    });
  });

  it("fails closed when the queued build is not owned by the job project", async () => {
    prismaProjectBuildFindFirstMock.mockResolvedValue(null);

    const result = await runQueuedEditBuild(baseJob);

    expect(result).toEqual({
      artifactRef: null,
      buildStatus: "failed",
      logText: "Stored source artifact does not match the edit snapshot.",
    });
    expect(prismaProjectBuildFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "build_1",
          project: { userId: "user_1" },
          projectId: "project_1",
          snapshot: { projectId: "project_1" },
          snapshotId: "snapshot_1",
        },
      }),
    );
    expect(prismaProjectBuildUpdateMock).not.toHaveBeenCalled();
    expect(readProjectSourceArtifactMock).not.toHaveBeenCalled();
    expect(createLocalBuildWorkerMock).not.toHaveBeenCalled();
  });

  it("fails closed before reading a source artifact owned by another snapshot", async () => {
    const result = await runQueuedEditBuild({
      ...baseJob,
      sourceRef: "project-artifact:s3:source:other_snapshot",
    });

    expect(result).toEqual({
      artifactRef: null,
      buildStatus: "failed",
      logText: "Stored source artifact does not match the edit snapshot.",
    });
    expect(prismaProjectBuildUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed" }),
        where: { id: "build_1" },
      }),
    );
    expect(readProjectSourceArtifactMock).not.toHaveBeenCalled();
    expect(createLocalBuildWorkerMock).not.toHaveBeenCalled();
  });
});
