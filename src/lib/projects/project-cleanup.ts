import { rm } from "node:fs/promises";
import path from "node:path";

import type { RuntimeSupervisor } from "@/lib/projects/runtime-supervisor";

import { getEnv } from "@/lib/config/config";
import { deleteProjectAsset } from "@/lib/projects/project-assets";
import { deleteProjectThumbnail } from "@/lib/projects/project-thumbnail";
import { deleteProjectArtifact } from "@/lib/projects/runtime-artifacts";

export type ProjectCleanupInput = {
  projectId: string;
  artifactRefs: string[];
  deploymentIds: string[];
  thumbnailRef?: string | null;
  assetRefs?: string[];
  gateEvidenceRefs?: string[];
  supervisor?: Pick<RuntimeSupervisor, "stopDeployment">;
  runtimeRootDir?: string;
  buildWorkspaceRootDir?: string;
};

export type ProjectCleanupOutcome = {
  errors: Array<{ step: string; message: string }>;
};

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
        await deleteProjectArtifact(ref);
      } catch (error) {
        note("delete-artifact", error);
      }
    }),
  );

  // Gate-screenshot evidence is private S3 JSON, deleted best-effort like
  await Promise.all(
    (input.gateEvidenceRefs ?? []).map(async (ref) => {
      if (!ref) {
        return;
      }
      try {
        await deleteProjectArtifact(ref);
      } catch (error) {
        note("delete-gate-evidence", error);
      }
    }),
  );

  // Delete materialized runtime dirs (per deployment) and the build
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

  // Delete owner-uploaded project assets (business images / references /
  if (input.assetRefs?.length) {
    await Promise.all(
      input.assetRefs.map(async (ref) => {
        if (!ref) {
          return;
        }
        try {
          await deleteProjectAsset(ref);
        } catch (error) {
          note("delete-asset", error);
        }
      }),
    );
  }

  return { errors };
}
