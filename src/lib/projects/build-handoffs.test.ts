import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    projectBuildHandoff: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    project: {
      update: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    projectSnapshot: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { loadActiveHandoff, selectQualifiedHandoff } from "./build-handoffs";

describe("loadActiveHandoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the project has no active handoff", async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      activeHandoffId: null,
    });
    const result = await loadActiveHandoff("project-1");
    expect(result).toBeNull();
  });

  it("loads the active handoff by id", async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      activeHandoffId: "handoff-1",
    });
    prismaMock.projectBuildHandoff.findUnique.mockResolvedValue({
      id: "handoff-1",
      contractHash: "a",
      planHash: "b",
    });
    const result = await loadActiveHandoff("project-1");
    expect(result).toMatchObject({
      id: "handoff-1",
      contractHash: "a",
      planHash: "b",
    });
    expect(prismaMock.projectBuildHandoff.findUnique).toHaveBeenCalledWith({
      where: { id: "handoff-1" },
    });
  });
});

describe("selectQualifiedHandoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects the snapshot and supersedes the prior active handoff atomically", async () => {
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(prismaMock),
    );
    prismaMock.project.findUnique.mockResolvedValue({
      activeOperationToken: "op-1",
      activeHandoffId: "handoff-1",
    });
    await selectQualifiedHandoff({
      projectId: "project-1",
      handoffId: "handoff-2",
      snapshotId: "snap-2",
      operationId: "op-1",
    });
    expect(prismaMock.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "project-1" } }),
    );
  });
});
