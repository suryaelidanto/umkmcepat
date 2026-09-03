import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  projectBuildFindManyMock,
  projectDeploymentFindManyMock,
  projectSnapshotFindManyMock,
  projectSnapshotFindFirstMock,
} = vi.hoisted(() => ({
  projectBuildFindManyMock: vi.fn(),
  projectDeploymentFindManyMock: vi.fn(),
  projectSnapshotFindManyMock: vi.fn(),
  projectSnapshotFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectBuild: { findMany: projectBuildFindManyMock },
    projectDeployment: { findMany: projectDeploymentFindManyMock },
    projectSnapshot: {
      findFirst: projectSnapshotFindFirstMock,
      findMany: projectSnapshotFindManyMock,
    },
  },
}));

import {
  countFiles,
  findFileInSnapshot,
  kindOf,
  listSnapshots,
  type SnapshotKind,
} from "@/lib/projects/snapshots";

describe("snapshots — pure helpers", () => {
  describe("countFiles", () => {
    it("counts array entries", () => {
      expect(countFiles([{ path: "a", content: "x" }])).toBe(1);
      expect(countFiles([])).toBe(0);
    });

    it("returns null for non-array or missing files", () => {
      expect(countFiles(null)).toBeNull();
      expect(countFiles(undefined)).toBeNull();
      expect(countFiles({ path: "a" })).toBeNull();
      expect(countFiles("not-an-array")).toBeNull();
    });
  });

  describe("findFileInSnapshot", () => {
    const files = [
      { path: "src/index.tsx", content: "export const a = 1\n" },
      { path: "src/content/site.ts", content: "export const site = {}\n" },
    ];

    it("finds a file by path and returns its content", () => {
      expect(findFileInSnapshot(files, "src/index.tsx")).toBe(
        "export const a = 1\n",
      );
    });

    it("returns null when the path is not present", () => {
      expect(findFileInSnapshot(files, "missing.tsx")).toBeNull();
    });

    it("returns null for non-array snapshot files", () => {
      expect(findFileInSnapshot(null, "src/index.tsx")).toBeNull();
      expect(findFileInSnapshot(undefined, "x")).toBeNull();
      expect(findFileInSnapshot({}, "x")).toBeNull();
    });

    it("ignores malformed entries without throwing", () => {
      const mixed = [
        null,
        "string-entry",
        42,
        { path: "ok.tsx", content: "ok\n" },
        { noPath: true },
      ];
      expect(findFileInSnapshot(mixed, "ok.tsx")).toBe("ok\n");
      expect(findFileInSnapshot(mixed, "nothere")).toBeNull();
    });

    it("returns empty string for a file with no content field", () => {
      expect(findFileInSnapshot([{ path: "empty.tsx" }], "empty.tsx")).toBe("");
    });
  });

  describe("kindOf", () => {
    it("uses metadata.kind when present and known", () => {
      expect(kindOf("generated", { kind: "edit" })).toBe<SnapshotKind>("edit");
      expect(kindOf("generated", { kind: "repair" })).toBe<SnapshotKind>(
        "repair",
      );
    });

    it("falls back to sourceType edit", () => {
      expect(kindOf("edit", null)).toBe<SnapshotKind>("edit");
    });

    it("defaults to initial for generated source with no metadata", () => {
      expect(kindOf("generated", null)).toBe<SnapshotKind>("initial");
      expect(kindOf("generated", {})).toBe<SnapshotKind>("initial");
    });

    it("ignores unknown metadata.kind values", () => {
      expect(kindOf("generated", { kind: "bogus" })).toBe<SnapshotKind>(
        "initial",
      );
    });

    it("ignores non-object metadata", () => {
      expect(kindOf("generated", "string")).toBe<SnapshotKind>("initial");
      expect(kindOf("generated", 42)).toBe<SnapshotKind>("initial");
    });
  });
});

describe("project snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectSnapshotFindManyMock.mockResolvedValue([
      {
        createdAt: new Date("2026-08-20T12:00:00Z"),
        files: [{ content: "source", path: "src/main.tsx" }],
        id: "snapshot_restore",
        metadata: { kind: "restore" },
        parentSnapshotId: "snapshot_old",
        sourceRef: null,
        sourceType: "restore",
      },
    ]);
    projectBuildFindManyMock.mockResolvedValue([
      {
        artifactRef: "project-artifact:s3:dist:build_old",
        id: "build_old",
        projectId: "project_1",
        snapshot: { id: "snapshot_restore", projectId: "project_1" },
        snapshotId: "snapshot_restore",
        status: "succeeded",
      },
    ]);
    projectDeploymentFindManyMock.mockImplementation(async (input: unknown) => {
      const kind = (input as { where?: { kind?: string } }).where?.kind;
      if (kind === "published") {
        return [
          {
            build: {
              artifactRef: "project-artifact:s3:dist:build_published",
              id: "build_published",
              projectId: "project_1",
              snapshot: { id: "snapshot_restore", projectId: "project_1" },
              snapshotId: "snapshot_restore",
              status: "succeeded",
            },
            buildId: "build_published",
            projectId: "project_1",
            snapshot: { id: "snapshot_restore", projectId: "project_1" },
            snapshotId: "snapshot_restore",
          },
        ];
      }
      return [
        {
          build: {
            artifactRef: "project-artifact:s3:dist:build_old",
            id: "build_old",
            projectId: "project_1",
            snapshot: { id: "snapshot_restore", projectId: "project_1" },
            snapshotId: "snapshot_restore",
            status: "succeeded",
          },
          buildId: "build_old",
          projectId: "project_1",
          snapshot: { id: "snapshot_restore", projectId: "project_1" },
          snapshotId: "snapshot_restore",
        },
      ];
    });
  });

  it("marks checked-out preview versions as successful and production versions", async () => {
    const [snapshot] = await listSnapshots("project_1");

    expect(snapshot).toMatchObject({
      buildId: "build_old",
      buildStatus: "succeeded",
      id: "snapshot_restore",
      published: true,
    });
  });

  it("prefers the newest direct build over inherited deployment data", async () => {
    projectSnapshotFindManyMock.mockResolvedValue([
      {
        createdAt: new Date("2026-08-20T12:00:00Z"),
        files: [{ content: "source", path: "src/main.tsx" }],
        id: "snapshot_restore",
        metadata: { kind: "restore" },
        parentSnapshotId: "snapshot_old",
        sourceRef: null,
        sourceType: "restore",
      },
    ]);
    projectBuildFindManyMock.mockResolvedValue([
      {
        artifactRef: "project-artifact:s3:dist:build_direct_new",
        id: "build_direct_new",
        projectId: "project_1",
        snapshot: { id: "snapshot_restore", projectId: "project_1" },
        snapshotId: "snapshot_restore",
        status: "succeeded",
      },
      {
        artifactRef: "project-artifact:s3:dist:build_direct_old",
        id: "build_direct_old",
        projectId: "project_1",
        snapshot: { id: "snapshot_restore", projectId: "project_1" },
        snapshotId: "snapshot_restore",
        status: "succeeded",
      },
      {
        artifactRef: "project-artifact:s3:dist:build_parent",
        id: "build_parent",
        projectId: "project_1",
        snapshot: { id: "snapshot_old", projectId: "project_1" },
        snapshotId: "snapshot_old",
        status: "succeeded",
      },
    ]);
    projectDeploymentFindManyMock.mockImplementation(async (input: unknown) => {
      const kind = (input as { where?: { kind?: string } }).where?.kind;
      if (kind === "published") {
        return [];
      }
      return [
        {
          build: {
            artifactRef: null,
            id: "build_failed_deployment",
            status: "failed",
          },
          snapshotId: "snapshot_restore",
        },
      ];
    });

    const [snapshot] = await listSnapshots("project_1");

    expect(snapshot?.buildId).toBe("build_direct_new");
    expect(snapshot?.buildStatus).toBe("succeeded");
  });

  it("does not use a deployment whose snapshot pointer disagrees with its build", async () => {
    projectSnapshotFindManyMock.mockResolvedValue([
      {
        createdAt: new Date("2026-08-20T12:00:00Z"),
        files: [{ content: "child", path: "src/main.tsx" }],
        id: "snapshot_1",
        metadata: {},
        parentSnapshotId: null,
        sourceRef: null,
        sourceType: "generated",
      },
    ]);
    projectBuildFindManyMock.mockResolvedValue([]);
    projectDeploymentFindManyMock.mockImplementation(async (input: unknown) => {
      const kind = (input as { where?: { kind?: string } }).where?.kind;
      if (kind === "published") {
        return [];
      }
      return [
        {
          build: {
            artifactRef: "project-artifact:s3:dist:build_other",
            id: "build_other",
            projectId: "project_1",
            snapshot: { id: "snapshot_other", projectId: "project_1" },
            snapshotId: "snapshot_other",
            status: "succeeded",
          },
          buildId: "build_other",
          projectId: "project_1",
          snapshot: { id: "snapshot_1", projectId: "project_1" },
          snapshotId: "snapshot_1",
        },
      ];
    });

    await expect(listSnapshots("project_1")).resolves.toEqual([]);
  });

  it("does not assign an ancestor build to a snapshot without a direct build", async () => {
    projectSnapshotFindManyMock.mockResolvedValue([
      {
        createdAt: new Date("2026-08-22T12:00:00Z"),
        files: [{ content: "child", path: "src/main.tsx" }],
        id: "snapshot_child",
        metadata: {},
        parentSnapshotId: "snapshot_parent",
        sourceRef: null,
        sourceType: "generated",
      },
      {
        createdAt: new Date("2026-08-21T12:00:00Z"),
        files: [{ content: "parent", path: "src/main.tsx" }],
        id: "snapshot_parent",
        metadata: {},
        parentSnapshotId: "snapshot_root",
        sourceRef: null,
        sourceType: "generated",
      },
      {
        createdAt: new Date("2026-08-20T12:00:00Z"),
        files: [{ content: "root", path: "src/main.tsx" }],
        id: "snapshot_root",
        metadata: {},
        parentSnapshotId: null,
        sourceRef: null,
        sourceType: "generated",
      },
    ]);
    projectBuildFindManyMock.mockResolvedValue([
      {
        artifactRef: "project-artifact:s3:dist:build_root",
        id: "build_root",
        projectId: "project_1",
        snapshot: { id: "snapshot_root", projectId: "project_1" },
        snapshotId: "snapshot_root",
        status: "succeeded",
      },
    ]);
    projectDeploymentFindManyMock.mockResolvedValue([]);

    const snapshots = await listSnapshots("project_1");

    expect(
      snapshots.map((snapshot) => [snapshot.id, snapshot.buildId]),
    ).toEqual([["snapshot_root", "build_root"]]);
  });

  it("does not list a snapshot with an invalid source artifact reference", async () => {
    projectSnapshotFindManyMock.mockResolvedValue([
      {
        createdAt: new Date("2026-08-20T12:00:00Z"),
        files: [],
        id: "snapshot_1",
        metadata: {},
        parentSnapshotId: null,
        sourceRef: "project-artifact:s3:source:other_snapshot",
        sourceType: "generated",
      },
    ]);
    projectBuildFindManyMock.mockResolvedValue([
      {
        artifactRef: "project-artifact:s3:dist:build_1",
        id: "build_1",
        projectId: "project_1",
        snapshot: { id: "snapshot_1", projectId: "project_1" },
        snapshotId: "snapshot_1",
        status: "succeeded",
      },
    ]);
    projectDeploymentFindManyMock.mockResolvedValue([]);

    await expect(listSnapshots("project_1")).resolves.toEqual([]);
  });

  it("reads snapshot source only within the requested project owner scope", async () => {
    projectSnapshotFindFirstMock.mockResolvedValue({
      files: [{ content: "owned source", path: "src/main.tsx" }],
      sourceRef: null,
    });

    const { readSnapshotFile } = await import("@/lib/projects/snapshots");
    await expect(
      readSnapshotFile("snapshot_1", "src/main.tsx", {
        projectId: "project_1",
        userId: "user_1",
      }),
    ).resolves.toEqual({ content: "owned source" });

    expect(projectSnapshotFindFirstMock).toHaveBeenCalledWith({
      where: {
        id: "snapshot_1",
        project: { userId: "user_1" },
        projectId: "project_1",
      },
      select: { files: true, id: true, sourceRef: true },
    });
  });
});
