// One-shot sweep: walk .data/project-* and delete any project resource whose
// ID is no longer in the database. Idempotent. Safe to re-run. Removes orphans
// left behind by projects deleted before cleanup was wired up, or by any code
// path that didn't go through the homepage's createServerFn delete handler.

/* eslint-disable no-console */
import { realpathSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../src/lib/prisma";

const REPO_ROOT = realpathSync(process.cwd());

// Thumbnails + artifacts live in S3 now; the orphan sweep only touches the
// local runtime + workspace dirs that still hold on-disk project state.
const RUNTIME_ROOT = path.resolve(
  process.env.PROJECT_RUNTIME_DIR || ".data/project-runtimes",
);
const WORKSPACE_ROOT = path.resolve(
  process.env.PROJECT_BUILD_WORKSPACE_DIR || ".data/project-build-workspaces",
);

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

async function main() {
  console.log(
    `Sweeping orphans under ${path.relative(REPO_ROOT, REPO_ROOT)}/.data ...`,
  );

  const [projects, deployments] = await Promise.all([
    prisma.project.findMany({ select: { id: true } }),
    prisma.projectDeployment.findMany({ select: { id: true } }),
  ]);

  const projectIds = new Set(projects.map((p) => p.id));
  const deploymentIds = new Set(deployments.map((d) => d.id));

  console.log(
    `DB has ${projectIds.size} projects, ${deploymentIds.size} deployments.`,
  );

  await sweepWorkspaces(projectIds);
  await sweepRuntimes(deploymentIds);

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
