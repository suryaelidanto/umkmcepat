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
  opts: {
    installRunner?: (cwd: string) => Promise<InstallResult>;
    packageJsonContent?: string;
  } = {},
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

  if (opts.packageJsonContent) {
    await writeFile(
      path.join(sharedRoot, "package.json"),
      opts.packageJsonContent,
      "utf8",
    );
  }

  const install = opts.installRunner ?? defaultInstallRunner;
  const result = await install(sharedRoot);
  if (!result.ok) {
    throw new Error(`Shared node_modules install failed: ${result.log}`);
  }

  await writeFile(sigPath, depSignature, "utf8");
  devLog("shared-node-modules", "provisioned", { sharedRoot, depSignature });
  return nmPath;
}

export async function prewarmSharedNodeModules(): Promise<void> {
  const { createDependencySignature, createGeneratedViteTanStackStarterFiles } =
    await import("@/lib/projects/generated-source");
  const { createProjectSiteSchemaFromBrief } =
    await import("@/lib/projects/site-schema");

  const schema = createProjectSiteSchemaFromBrief({
    version: 1,
    prompt: "prewarm",
    businessName: "prewarm",
    businessType: "prewarm",
    offer: "prewarm",
    targetCustomer: "prewarm",
    contactOrCta: "WhatsApp",
    stylePreference: "bersih",
    notes: [],
    productOrService: null,
    contact: null,
    tagline: null,
    usp: null,
    priceRange: null,
    visuals: null,
    hours: null,
    address: null,
    deliveryArea: null,
    since: null,
    testimonials: null,
    certifications: null,
    paymentMethods: null,
    socialLinks: null,
    currentPromo: null,
    secondaryCta: null,
    readyForBuild: false,
  });
  const files = createGeneratedViteTanStackStarterFiles("prewarm", schema);
  const packageFile = files.find((file) => file.path === "package.json");
  if (!packageFile) {
    throw new Error("Starter package.json missing; cannot prewarm.");
  }

  const workspaceRoot = path.resolve(
    process.env.PROJECT_BUILD_WORKSPACE_DIR ||
      path.join(".data", "project-build-workspaces"),
  );
  const signature = createDependencySignature(files, {
    packageManager: "bun",
    runtimeProfile: "vite-react-tanstack-v1",
    templateId: "vite-react-tanstack-starter",
    templateVersion: "1.0.0",
  });

  await ensureSharedNodeModules(workspaceRoot, signature, {
    packageJsonContent: packageFile.content,
  });
  devLog("shared-node-modules", "prewarm-ok", {
    signature: signature.slice(0, 12),
  });
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
