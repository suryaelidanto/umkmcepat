import { rm } from "node:fs/promises";
import path from "node:path";

import type { RuntimeSupervisor } from "@/lib/projects/runtime-supervisor";

import { getEnv } from "@/lib/config";
import { deleteProjectAsset } from "@/lib/projects/project-assets";
import { deleteProjectThumbnail } from "@/lib/projects/project-thumbnail";
import { deleteProjectArtifact } from "@/lib/projects/runtime-artifacts";

export type ProjectCleanupInput = {
  projectId: string;
  artifactRefs: string[];
  deploymentIds: string[];
  thumbnailRef?: string | null;
  assetRefs?: string[];
  supervisor?: Pick<RuntimeSupervisor, "stopDeployment">;
  artifactRootDir?: string;
  assetRootDir?: string;
  runtimeRootDir?: string;
  buildWorkspaceRootDir?: string;
};

export type ProjectCleanupOutcome = {
  errors: Array<{ step: string; message: string }>;
};

/**
 * Stop runtime deployments and delete every on-disk/R2 resource tied to a
 * project: source/dist artifacts, materialized runtime dirs, build workspace
 * dirs, and the project thumbnail. Best-effort: each failure is recorded and
 * never blocks the next step or the caller's DB row delete. Idempotent: re-running
 * after a partial failure safely clears whatever remains.
 */
export async function cleanupProjectResources(
  input: ProjectCleanupInput,
): Promise<ProjectCleanupOutcome> {
  const errors: ProjectCleanupOutcome["errors"] = [];
  const note = (step: string, error: unknown) =>
    errors.push({
      step,
      message: error instanceof Error ? error.message : String(error),
    });

  if (input.supervisor) {
    await Promise.all(
      input.deploymentIds.map(async (deploymentId) => {
        try {
          await input.supervisor!.stopDeployment(deploymentId);
        } catch (error) {
          note("stop-deployment", error);
        }
      }),
    );
  }

  await Promise.all(
    input.artifactRefs.map(async (ref) => {
      if (!ref) {
        return;
      }
      try {
        await deleteProjectArtifact(ref, { rootDir: input.artifactRootDir });
      } catch (error) {
        note("delete-artifact", error);
      }
    }),
  );

  // 3. Delete materialized runtime dirs (per deployment) and the build
  //    workspace dir (per project). Safe to rm missing dirs (force: true).
  const runtimeRoot = path.resolve(
    input.runtimeRootDir ||
      getEnv("PROJECT_RUNTIME_DIR", ".data/project-runtimes"),
  );
  const buildWorkspaceRoot = path.resolve(
    input.buildWorkspaceRootDir ||
      getEnv("PROJECT_BUILD_WORKSPACE_DIR", ".data/project-build-workspaces"),
  );
  const dirsToDelete = [
    ...input.deploymentIds.map((id) => path.join(runtimeRoot, id)),
    path.join(buildWorkspaceRoot, input.projectId),
  ];
  await Promise.all(
    dirsToDelete.map(async (dir) => {
      try {
        await rm(dir, { force: true, recursive: true });
      } catch (error) {
        note("delete-runtime-workspace", error);
      }
    }),
  );

  if (input.thumbnailRef) {
    try {
      await deleteProjectThumbnail(input.thumbnailRef);
    } catch (error) {
      note("delete-thumbnail", error);
    }
  }

  // 5. Delete owner-uploaded project assets (business images / references /
  //    logos) stored under .data/project-assets. Best-effort, idempotent.
  if (input.assetRefs?.length) {
    await Promise.all(
      input.assetRefs.map(async (ref) => {
        if (!ref) {
          return;
        }
        try {
          await deleteProjectAsset(ref, {
            rootDir: input.assetRootDir,
          });
        } catch (error) {
          note("delete-asset", error);
        }
      }),
    );
  }

  return { errors };
}
