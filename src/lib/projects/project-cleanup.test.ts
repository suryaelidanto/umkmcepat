import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { cleanupProjectResources } from "@/lib/projects/project-cleanup";
import {
  writeProjectDistArtifact,
  writeProjectSourceArtifact,
} from "@/lib/projects/runtime-artifacts";

const { putMock, getMock, deleteMock, store } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    putMock: vi.fn(
      async (_b: "public" | "private", key: string, body: Buffer) => {
        store.set(key, body.toString("utf8"));
      },
    ),
    getMock: vi.fn(async (_b: "public" | "private", key: string) => {
      const v = store.get(key);
      if (v === undefined) {
        throw new Error("NoSuchKey");
      }
      return Buffer.from(v);
    }),
    deleteMock: vi.fn(async (_b: "public" | "private", key: string) => {
      store.delete(key);
    }),
    store,
  };
});

vi.mock("@/lib/s3-client", () => ({
  getS3Config: () => ({ client: {}, bucket: "pub" }),
  putS3Object: putMock,
  getS3Object: getMock,
  deleteS3Object: deleteMock,
  S3_PREFIXES: {
    artifact: "project-artifacts",
    asset: "project-assets",
    object: "objects",
    thumbnail: "project-thumbnails",
  },
}));

let tempDir = "";

async function dirExists(dir: string) {
  try {
    await readdir(dir);
    return true;
  } catch {
    return false;
  }
}

describe("cleanupProjectResources", () => {
  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true });
      tempDir = "";
    }
    store.clear();
    putMock.mockClear();
    getMock.mockClear();
    deleteMock.mockClear();
    vi.restoreAllMocks();
  });

  it("stops deployments, deletes S3 artifacts, runtime dirs, workspace dir, and thumbnail", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-cleanup-"));
    const runtimeRoot = path.join(tempDir, "runtimes");
    const workspaceRoot = path.join(tempDir, "workspaces");

    const sourceRef = await writeProjectSourceArtifact({
      artifactId: "snap_1",
      files: [{ content: "x", path: "src/a.ts" }],
    });
    const distRef = await writeProjectDistArtifact({
      artifactId: "build_1",
      files: [
        {
          content: "<html></html>",
          contentType: "text/html",
          path: "index.html",
        },
      ],
    });

    const deploymentId = "dep_1";
    await mkdir(path.join(runtimeRoot, deploymentId, "www"), {
      recursive: true,
    });
    await mkdir(
      path.join(workspaceRoot, "project_1", "vite-react-tanstack-v1"),
      { recursive: true },
    );

    const stopDeployment = vi.fn().mockResolvedValue("stopped");
    const thumbnailRef = "project-thumbnail:s3-private:project_1";

    const outcome = await cleanupProjectResources({
      projectId: "project_1",
      artifactRefs: [sourceRef, distRef],
      deploymentIds: [deploymentId],
      thumbnailRef,
      supervisor: { stopDeployment },
      runtimeRootDir: runtimeRoot,
      buildWorkspaceRootDir: workspaceRoot,
    });

    expect(outcome.errors).toEqual([]);
    expect(stopDeployment).toHaveBeenCalledWith(deploymentId);
    // S3 artifact manifests + enumerated files deleted.
    expect(deleteMock).toHaveBeenCalledWith(
      "public",
      "project-artifacts/source/snap_1/manifest.json",
    );
    expect(deleteMock).toHaveBeenCalledWith(
      "public",
      "project-artifacts/source/snap_1/files/src/a.ts",
    );
    expect(deleteMock).toHaveBeenCalledWith(
      "public",
      "project-artifacts/dist/build_1/manifest.json",
    );
    expect(deleteMock).toHaveBeenCalledWith(
      "public",
      "project-artifacts/dist/build_1/files/index.html",
    );
    expect(deleteMock).toHaveBeenCalledWith(
      "private",
      "project-thumbnails/project_1.jpg",
    );
    // Local runtime + workspace dirs removed.
    expect(await dirExists(path.join(runtimeRoot, deploymentId))).toBe(false);
    expect(await dirExists(path.join(workspaceRoot, "project_1"))).toBe(false);
  });

  it("records errors but keeps going when a step fails", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-cleanup-"));
    const runtimeRoot = path.join(tempDir, "runtimes");
    const workspaceRoot = path.join(tempDir, "workspaces");

    const stopDeployment = vi.fn().mockRejectedValue(new Error("stop failed"));

    const outcome = await cleanupProjectResources({
      projectId: "project_1",
      artifactRefs: ["not-a-ref"],
      deploymentIds: ["dep_1"],
      thumbnailRef: null,
      supervisor: { stopDeployment },
      runtimeRootDir: runtimeRoot,
      buildWorkspaceRootDir: workspaceRoot,
    });

    expect(outcome.errors.map((e) => e.step)).toContain("stop-deployment");
    expect(outcome.errors.map((e) => e.step)).not.toContain("delete-artifact");
    // "not-a-ref" parses to null and is a no-op, not an error.
    expect(await dirExists(path.join(workspaceRoot, "project_1"))).toBe(false);
  });
});
