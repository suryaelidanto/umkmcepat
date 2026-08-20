import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  projectBuildFindManyMock,
  projectDeploymentFindManyMock,
  projectSnapshotFindManyMock,
} = vi.hoisted(() => ({
  projectBuildFindManyMock: vi.fn(),
  projectDeploymentFindManyMock: vi.fn(),
  projectSnapshotFindManyMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectBuild: { findMany: projectBuildFindManyMock },
    projectDeployment: { findMany: projectDeploymentFindManyMock },
    projectSnapshot: { findMany: projectSnapshotFindManyMock },
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
        id: "build_old",
        snapshotId: "snapshot_old",
        status: "succeeded",
      },
    ]);
    projectDeploymentFindManyMock.mockImplementation(async (input: unknown) => {
      const kind = (input as { where?: { kind?: string } }).where?.kind;
      if (kind === "published") {
        return [{ snapshotId: "snapshot_restore" }];
      }
      return [
        {
          build: {
            id: "build_old",
            status: "succeeded",
          },
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
});
