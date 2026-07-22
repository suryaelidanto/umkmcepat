import {
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { devLog } from "@/lib/dev-log";

const SHARED_DIR_NAME = "_shared";

type InstallResult = { ok: boolean; log: string };

export async function ensureSharedNodeModules(
  workspaceRoot: string,
  depSignature: string,
  opts: { installRunner?: (cwd: string) => Promise<InstallResult> } = {},
): Promise<string> {
  const sharedRoot = path.join(workspaceRoot, SHARED_DIR_NAME);
  const nmPath = path.join(sharedRoot, "node_modules");
  const sigPath = path.join(sharedRoot, "dep-signature.txt");

  const existingSig = await readFile(sigPath, "utf8").catch(() => "");
  const nmExists = await pathExists(nmPath);
  if (nmExists && existingSig === depSignature) {
    return nmPath;
  }

  await mkdir(sharedRoot, { recursive: true });
  // Remove a stale/wrong node_modules so bun install is clean on sig change.
  await rm(nmPath, { force: true, recursive: true });

  const install = opts.installRunner ?? defaultInstallRunner;
  const result = await install(sharedRoot);
  if (!result.ok) {
    throw new Error(`Shared node_modules install failed: ${result.log}`);
  }

  await writeFile(sigPath, depSignature, "utf8");
  devLog("shared-node-modules", "provisioned", { sharedRoot, depSignature });
  return nmPath;
}

export async function linkSharedNodeModules(
  workspace: string,
  sharedNodeModulesPath: string,
): Promise<boolean> {
  const linkPath = path.join(workspace, "node_modules");
  if (await pathExists(linkPath)) {
    return true;
  }
  if (!(await pathExists(sharedNodeModulesPath))) {
    return false;
  }
  const type = process.platform === "win32" ? "junction" : "dir";
  try {
    await symlink(sharedNodeModulesPath, linkPath, type);
    devLog("shared-node-modules", "linked", {
      workspace,
      sharedNodeModulesPath,
      type,
    });
    return true;
  } catch (error) {
    devLog("shared-node-modules", "link-failed", {
      workspace,
      error: String(error),
    });
    return false;
  }
}

async function defaultInstallRunner(cwd: string): Promise<InstallResult> {
  // Lazy import avoids a circular dependency at module load.
  const { runCommand, resolveBundledRunner } =
    await import("@/lib/projects/generated-source");
  const runner = resolveBundledRunner();
  return runCommand([runner, "install", "--ignore-scripts"], cwd);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}
