import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  readProjectSourceArtifactMock,
  resolveProjectSourceFilesMock,
} = vi.hoisted(() => ({
  prismaMock: {
    $queryRaw: vi.fn(),
    projectBuild: { findFirst: vi.fn() },
    projectSnapshot: { findFirst: vi.fn() },
  },
  readProjectSourceArtifactMock: vi.fn(),
  resolveProjectSourceFilesMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/projects/runtime-artifacts", () => ({
  isProjectArtifactRefFor: (
    ref: string | null | undefined,
    kind: string,
    artifactId: string,
  ) => ref === `project-artifact:s3:${kind}:${artifactId}`,
  readProjectSourceArtifact: readProjectSourceArtifactMock,
}));
vi.mock("@/lib/projects/resolve-project-source-files", () => ({
  resolveProjectSourceFiles: resolveProjectSourceFilesMock,
}));

import {
  loadPersistedProjectSourceFiles,
  projectHasPersistedSource,
} from "./load-persisted-project-source";

const sample = [{ path: "src/routes/index.tsx", content: "export default 1" }];

describe("loadPersistedProjectSourceFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([{ sourceFiles: null }]);
    prismaMock.projectBuild.findFirst.mockResolvedValue(null);
    prismaMock.projectSnapshot.findFirst.mockResolvedValue(null);
    resolveProjectSourceFilesMock.mockResolvedValue([]);
  });

  it("returns empty when resolver finds nothing", async () => {
    const files = await loadPersistedProjectSourceFiles({
      projectId: "p1",
      userId: "u1",
    });
    expect(files).toEqual([]);
    expect(
      await projectHasPersistedSource({ projectId: "p1", userId: "u1" }),
    ).toBe(false);
  });

  it("returns files when resolver has source", async () => {
    resolveProjectSourceFilesMock.mockResolvedValue(sample);
    const files = await loadPersistedProjectSourceFiles({
      projectId: "p1",
      userId: "u1",
    });
    expect(files).toEqual(sample);
    expect(
      await projectHasPersistedSource({ projectId: "p1", userId: "u1" }),
    ).toBe(true);
  });

  it("removes a source artifact reference that is not tied to its snapshot", async () => {
    prismaMock.projectBuild.findFirst.mockResolvedValue({
      snapshot: {
        id: "s1",
        files: [],
        sourceRef: "project-artifact:s3:source:other",
      },
    });
    resolveProjectSourceFilesMock.mockResolvedValue(sample);

    await loadPersistedProjectSourceFiles({ projectId: "p1", userId: "u1" });

    const [{ readArtifact }] = resolveProjectSourceFilesMock.mock.calls[0] as [
      {
        readArtifact: (
          sourceRef: string,
          snapshot: { id: string },
        ) => Promise<unknown[]>;
      },
    ];
    await expect(
      readArtifact("project-artifact:s3:source:other", { id: "s1" }),
    ).resolves.toEqual([]);
    expect(readProjectSourceArtifactMock).not.toHaveBeenCalled();
  });

  it("scopes persisted build and snapshot reads to the requesting owner", async () => {
    await loadPersistedProjectSourceFiles({ projectId: "p1", userId: "u1" });

    expect(prismaMock.projectBuild.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { project: { userId: "u1" }, projectId: "p1" },
      }),
    );
    expect(prismaMock.projectSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { project: { userId: "u1" }, projectId: "p1" },
      }),
    );
  });

  it("does not pass a build snapshot from another project into the resolver", async () => {
    prismaMock.projectBuild.findFirst.mockResolvedValue({
      snapshot: { id: "s1", files: [], projectId: "p2", sourceRef: null },
    });

    await loadPersistedProjectSourceFiles({ projectId: "p1", userId: "u1" });

    expect(resolveProjectSourceFilesMock).toHaveBeenCalledWith(
      expect.objectContaining({ latestAttemptSnapshot: null }),
    );
  });

  it("passes snapshots and project sourceFiles into resolver", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ sourceFiles: sample }]);
    prismaMock.projectBuild.findFirst.mockResolvedValue({
      snapshot: { id: "s1", files: [], projectId: "p1", sourceRef: null },
    });
    prismaMock.projectSnapshot.findFirst.mockResolvedValue({
      id: "ps1",
      files: [],
      sourceRef: null,
    });
    resolveProjectSourceFilesMock.mockResolvedValue(sample);

    await loadPersistedProjectSourceFiles({ projectId: "p1", userId: "u1" });

    expect(resolveProjectSourceFilesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        latestAttemptSnapshot: {
          id: "s1",
          files: [],
          projectId: "p1",
          sourceRef: null,
        },
        latestProjectSnapshot: { id: "ps1", files: [], sourceRef: null },
        projectSourceFiles: sample,
        readArtifact: expect.any(Function),
      }),
    );
  });
});
