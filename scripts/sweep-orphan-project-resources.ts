// One-shot sweep: walk .data/project-* and delete any project resource whose
// ID is no longer in the database. Idempotent. Safe to re-run. Removes orphans
// left behind by projects deleted before cleanup was wired up, or by any code
// path that didn't go through the homepage's createServerFn delete handler.

/* eslint-disable no-console */
import { realpathSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../src/lib/prisma";
import {
  deleteProjectThumbnail,
  getProjectThumbnailDir,
  parseProjectThumbnailRef,
} from "../src/lib/projects/project-thumbnail";
import { parseProjectArtifactRef } from "../src/lib/projects/runtime-artifacts";

const REPO_ROOT = realpathSync(process.cwd());

const ARTIFACT_ROOT = path.resolve(
  process.env.PROJECT_ARTIFACT_DIR || ".data/project-artifacts",
);
const RUNTIME_ROOT = path.resolve(
  process.env.PROJECT_RUNTIME_DIR || ".data/project-runtimes",
);
const WORKSPACE_ROOT = path.resolve(
  process.env.PROJECT_BUILD_WORKSPACE_DIR || ".data/project-build-workspaces",
);
const THUMBNAIL_ROOT = path.resolve(getProjectThumbnailDir());

type SweepResult = {
  deleted: string[];
  errors: Array<{ path: string; message: string }>;
};

const result: SweepResult = { deleted: [], errors: [] };

function recordError(target: string, error: unknown) {
  result.errors.push({
    path: target,
    message: error instanceof Error ? error.message : String(error),
  });
}

async function safeRm(target: string) {
  try {
    await rm(target, { force: true, recursive: true });
    result.deleted.push(target);
  } catch (error) {
    recordError(target, error);
  }
}

async function listDirSafe(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function sweepWorkspaces(projectIds: Set<string>) {
  const entries = await listDirSafe(WORKSPACE_ROOT);
  for (const projectId of entries) {
    if (projectIds.has(projectId)) {
      continue;
    }
    const target = path.join(WORKSPACE_ROOT, projectId);
    console.log(`workspace: ${projectId} (orphan)`);
    await safeRm(target);
  }
}

async function sweepRuntimes(deploymentIds: Set<string>) {
  const entries = await listDirSafe(RUNTIME_ROOT);
  for (const deploymentId of entries) {
    if (deploymentIds.has(deploymentId)) {
      continue;
    }
    const target = path.join(RUNTIME_ROOT, deploymentId);
    console.log(`runtime: ${deploymentId} (orphan)`);
    await safeRm(target);
  }
}

async function sweepArtifacts(activeArtifactIds: Set<string>) {
  for (const kind of ["source", "dist"] as const) {
    const kindDir = path.join(ARTIFACT_ROOT, kind);
    const entries = await listDirSafe(kindDir);
    for (const artifactId of entries) {
      if (activeArtifactIds.has(artifactId)) {
        continue;
      }
      const target = path.join(kindDir, artifactId);
      console.log(`artifact ${kind}: ${artifactId} (orphan)`);
      await safeRm(target);
    }
  }
}

async function sweepThumbnails(activeThumbnailIds: Set<string>) {
  const entries = await listDirSafe(THUMBNAIL_ROOT);
  for (const filename of entries) {
    // Thumbnails are stored as <id>.jpg; treat any unmatched file as orphan.
    const stem = filename.replace(/\.[^.]+$/, "");
    if (activeThumbnailIds.has(stem)) {
      continue;
    }
    console.log(`thumbnail: ${filename} (orphan)`);
    try {
      await deleteProjectThumbnail(`project-thumbnail:local:${stem}`);
    } catch (error) {
      recordError(path.join(THUMBNAIL_ROOT, filename), error);
    }
  }
}

async function main() {
  console.log(
    `Sweeping orphans under ${path.relative(REPO_ROOT, REPO_ROOT)}/.data ...`,
  );

  const [projects, snapshots, builds, deployments] = await Promise.all([
    prisma.project.findMany({ select: { id: true, thumbnailRef: true } }),
    prisma.projectSnapshot.findMany({ select: { sourceRef: true } }),
    prisma.projectBuild.findMany({ select: { artifactRef: true } }),
    prisma.projectDeployment.findMany({ select: { id: true } }),
  ]);

  const projectIds = new Set(projects.map((p) => p.id));
  const deploymentIds = new Set(deployments.map((d) => d.id));
  const activeArtifactIds = new Set<string>();
  for (const ref of [
    ...snapshots.map((s) => s.sourceRef),
    ...builds.map((b) => b.artifactRef),
  ]) {
    const parsed = parseProjectArtifactRef(ref);
    if (parsed) {
      activeArtifactIds.add(parsed.artifactId);
    }
  }
  const activeThumbnailIds = new Set(
    projects
      .map((p) => parseProjectThumbnailRef(p.thumbnailRef ?? ""))
      .filter((id): id is string => id !== null),
  );

  console.log(
    `DB has ${projectIds.size} projects, ${deploymentIds.size} deployments, ` +
      `${activeArtifactIds.size} active artifact ids, ${activeThumbnailIds.size} active thumbnails.`,
  );

  await sweepWorkspaces(projectIds);
  await sweepRuntimes(deploymentIds);
  await sweepArtifacts(activeArtifactIds);
  await sweepThumbnails(activeThumbnailIds);

  console.log("");
  console.log(`Deleted: ${result.deleted.length}`);
  if (result.errors.length) {
    console.log(`Errors: ${result.errors.length}`);
    for (const err of result.errors) {
      console.log(`  ${err.path}: ${err.message}`);
    }
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
