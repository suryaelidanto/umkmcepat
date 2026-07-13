import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { cleanupProjectResources } from "@/lib/projects/project-cleanup";
import {
  writeProjectDistArtifact,
  writeProjectSourceArtifact,
} from "@/lib/projects/runtime-artifacts";

let tempDir = "";
const originalEnv = { ...process.env };

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
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("stops deployments, deletes artifacts, runtime dirs, workspace dir, and thumbnail", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-cleanup-"));
    const artifactRoot = path.join(tempDir, "artifacts");
    const runtimeRoot = path.join(tempDir, "runtimes");
    const workspaceRoot = path.join(tempDir, "workspaces");
    const thumbnailRoot = path.join(tempDir, "thumbnails");
    process.env.PROJECT_THUMBNAIL_DIR = thumbnailRoot;

    const sourceRef = await writeProjectSourceArtifact({
      artifactId: "snap_1",
      files: [{ content: "x", path: "src/a.ts" }],
      rootDir: artifactRoot,
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
      rootDir: artifactRoot,
    });

    const deploymentId = "dep_1";
    await mkdir(path.join(runtimeRoot, deploymentId, "www"), {
      recursive: true,
    });
    await mkdir(
      path.join(workspaceRoot, "project_1", "vite-react-tanstack-v1"),
      { recursive: true },
    );
    await mkdir(thumbnailRoot, { recursive: true });
    await writeFile(
      path.join(thumbnailRoot, "project_1.jpg"),
      Buffer.from([0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9]),
    );

    const stopDeployment = vi.fn().mockResolvedValue("stopped");
    const thumbnailRef = "project-thumbnail:local:project_1";

    const outcome = await cleanupProjectResources({
      projectId: "project_1",
      artifactRefs: [sourceRef, distRef],
      deploymentIds: [deploymentId],
      thumbnailRef,
      supervisor: { stopDeployment },
      artifactRootDir: artifactRoot,
      runtimeRootDir: runtimeRoot,
      buildWorkspaceRootDir: workspaceRoot,
    });

    expect(outcome.errors).toEqual([]);
    expect(stopDeployment).toHaveBeenCalledWith(deploymentId);
    expect(await dirExists(path.join(artifactRoot, "source", "snap_1"))).toBe(
      false,
    );
    expect(await dirExists(path.join(artifactRoot, "dist", "build_1"))).toBe(
      false,
    );
    expect(await dirExists(path.join(runtimeRoot, deploymentId))).toBe(false);
    expect(await dirExists(path.join(workspaceRoot, "project_1"))).toBe(false);
    expect(await dirExists(path.join(thumbnailRoot, "project_1.jpg"))).toBe(
      false,
    );
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
