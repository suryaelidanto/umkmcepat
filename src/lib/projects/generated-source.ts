import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import {
  type BuildGeneratedProjectResult,
  type GeneratedDistFile,
  type GeneratedProjectFile,
} from "./generated-types";

import { isGeneratedBuildExecutionEnabled } from "@/lib/config";
import { devLog } from "@/lib/dev-log";
import { sanitizeBuildLog } from "@/lib/projects/build-logs";
import { validateGeneratedAppManifest } from "@/lib/projects/generated-app-manifest";
import { validateGeneratedBuildPolicy } from "@/lib/projects/generated-build-policy";
import {
  assertGeneratedResourceBudget,
  getGeneratedResourceBudget,
} from "@/lib/projects/generated-resource-budget";
import {
  ensureSharedNodeModules,
  linkSharedNodeModules,
} from "@/lib/projects/shared-node-modules";

type BuildCommandResult = Omit<BuildGeneratedProjectResult, "distFiles">;

type BuildGeneratedProjectOptions = {
  commandRunner?: (
    command: string[],
    cwd: string,
  ) => Promise<BuildCommandResult>;
  workspaceRoot?: string;
  workspaceKey?: string;
};

type BuildCacheMetadata = {
  dependencySignature: string;
  runtimeProfile: string;
  schemaVersion: 1;
};

const MAX_LOG_LENGTH = 20_000;
const MAX_IN_FLIGHT_LOG_LENGTH = 1024 * 1024;
const BUILD_TIMEOUT_MS = 180_000;
const BLOCKED_GENERATED_PATHS = new Set([
  ".env",
  ".env.local",
  ".env.production",
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);
const BLOCKED_WINDOWS_BASENAMES = new Set([
  "aux",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "con",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
  "nul",
  "prn",
]);

export function parseGeneratedDistFiles(value: unknown): GeneratedDistFile[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((file): file is GeneratedDistFile => {
    if (!file || typeof file !== "object") {
      return false;
    }

    const item = file as Partial<GeneratedDistFile>;
    return (
      typeof item.path === "string" &&
      typeof item.content === "string" &&
      typeof item.contentType === "string"
    );
  });
}

export function parseGeneratedProjectFiles(
  value: unknown,
): GeneratedProjectFile[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((file): file is GeneratedProjectFile => {
    if (!file || typeof file !== "object") {
      return false;
    }

    const item = file as Partial<GeneratedProjectFile>;
    return typeof item.path === "string" && typeof item.content === "string";
  });
}

export function assertSafeProjectFilePath(filePath: string) {
  if (
    !filePath ||
    /^[A-Za-z]:[\\/]/.test(filePath) ||
    path.isAbsolute(filePath) ||
    filePath.includes("\\") ||
    filePath.split("/").some((part) => part === "..") ||
    BLOCKED_GENERATED_PATHS.has(filePath) ||
    filePath.startsWith(".env.") ||
    (filePath.startsWith(".") && !isAllowedGeneratedDotPath(filePath)) ||
    (filePath.includes("/.") && !isAllowedGeneratedDotPath(filePath)) ||
    filePath.includes("/node_modules/") ||
    filePath.startsWith("node_modules/") ||
    filePath.startsWith(".data/") ||
    filePath.startsWith(".next/") ||
    filePath.startsWith(".pi/") ||
    filePath.startsWith(".browser/") ||
    filePath.split("/").some(isBlockedWindowsPathPart)
  ) {
    throw new Error(`Unsafe generated file path: ${filePath}`);
  }
}

function isAllowedGeneratedDotPath(_filePath: string) {
  return false;
}

function isBlockedWindowsPathPart(part: string) {
  const basename = part.split(".")[0]?.toLowerCase() ?? "";
  return BLOCKED_WINDOWS_BASENAMES.has(basename);
}

export async function buildGeneratedProject(
  files: GeneratedProjectFile[],
  options: BuildGeneratedProjectOptions = {},
): Promise<BuildGeneratedProjectResult> {
  if (!isGeneratedBuildExecutionEnabled()) {
    return {
      distFiles: [],
      log: "Generated build execution is disabled by platform policy.",
      ok: false,
    };
  }

  try {
    assertGeneratedResourceBudget(files, "source");
  } catch (error) {
    return {
      distFiles: [],
      log:
        error instanceof Error
          ? error.message
          : "Generated source exceeds platform limits.",
      ok: false,
    };
  }

  const manifestResult = validateGeneratedAppManifest(files);

  if (!manifestResult.ok) {
    return {
      distFiles: [],
      ok: false,
      log: `Generated app manifest failed preflight:\n${manifestResult.issues
        .map((issue) => `- ${issue}`)
        .join("\n")}`,
    };
  }

  const buildPolicyResult = validateGeneratedBuildPolicy(
    files,
    manifestResult.manifest.runtimeProfile,
  );

  if (!buildPolicyResult.ok) {
    return {
      distFiles: [],
      ok: false,
      log: `Generated app build policy failed preflight:\n${buildPolicyResult.issues
        .map((issue) => `- ${issue}`)
        .join("\n")}`,
    };
  }

  return buildGeneratedProjectInWorkspace(files, manifestResult.manifest, {
    ...options,
    workspaceKey: options.workspaceKey ?? manifestResult.manifest.projectId,
  });
}

// node:child_process.spawn on Windows requires an absolute path or an
// explicit .exe suffix; the bare name "bun" resolves to ENOENT once the
// child's CWD is anything other than the lookup directory (e.g. a brand-new
// generated workspace). Resolve once at module init and reuse the absolute
// path for every spawn so this works on Windows + POSIX and is independent
// of the calling process's CWD.
export function resolveBundledRunner(): string {
  const explicit = process.env.PROJECT_BUILD_BUN_PATH?.trim();
  if (explicit) {
    return explicit;
  }

  const candidateNames =
    process.platform === "win32" ? ["bun.exe", "bun"] : ["bun"];

  function firstExisting(dirs: string[]): string | null {
    for (const dir of dirs) {
      if (!dir) {
        continue;
      }
      for (const name of candidateNames) {
        const full = path.join(dir, name);
        try {
          statSync(full);
          return full;
        } catch {
          // keep searching
        }
      }
    }
    return null;
  }

  // If this process is itself running under bun (the normal `bun run dev`
  // case), execPath is already an absolute path to the bun binary.
  if (path.basename(process.execPath).toLowerCase().startsWith("bun")) {
    return process.execPath;
  }

  // This code can also run inside a plain node subprocess spawned by the
  // dev/SSR toolchain (e.g. Nitro), which may not inherit the shell's PATH.
  // bun always installs to ~/.bun/bin regardless of OS or install method
  // (official install script, Windows installer, Homebrew symlink target),
  // so check that fixed location before falling back to PATH search.
  const fromHome = firstExisting([path.join(homedir(), ".bun", "bin")]);
  if (fromHome) {
    return fromHome;
  }

  const pathDirs = (process.env.PATH ?? "").split(path.delimiter);
  const fromPath = firstExisting(pathDirs);
  if (fromPath) {
    return fromPath;
  }

  // Last resort: rely on PATH lookup with the OS-correct suffix.
  return candidateNames[0];
}

const BUNDLED_RUNNER = resolveBundledRunner();

async function buildGeneratedProjectInWorkspace(
  files: GeneratedProjectFile[],
  manifest: {
    packageManager: "bun";
    projectId: string;
    runtimeProfile: string;
    templateId: string;
    templateVersion: string;
  },
  options: BuildGeneratedProjectOptions,
): Promise<BuildGeneratedProjectResult> {
  const startedAt = Date.now();
  const commandRunner = options.commandRunner ?? runCommand;
  const workspaceRoot = resolveBuildWorkspaceRoot(options.workspaceRoot);
  const workspace = path.join(
    workspaceRoot,
    toSafeWorkspacePart(options.workspaceKey ?? manifest.projectId),
    toSafeWorkspacePart(manifest.runtimeProfile),
  );
  const metadataPath = path.join(
    workspace,
    ".cache",
    "generated-app",
    "build-cache.json",
  );
  const dependencySignature = createDependencySignature(files, manifest);
  let cacheMetadata = await readBuildCacheMetadata(metadataPath);
  let installSkipped = false;
  let resetWorkspace =
    cacheMetadata?.dependencySignature !== dependencySignature ||
    cacheMetadata.runtimeProfile !== manifest.runtimeProfile ||
    !(await pathExists(path.join(workspace, "node_modules")));

  async function attemptBuild(resetBeforeBuild: boolean) {
    if (resetBeforeBuild) {
      await rm(workspace, { force: true, recursive: true });
      cacheMetadata = null;
    }

    await mkdir(workspace, { recursive: true });
    await syncGeneratedProjectFiles(workspace, files);

    // Link the shared golden node_modules (read-only) before the install check.
    // On repeat builds the link keeps node_modules present so shouldInstall
    // stays false; a broken golden falls through to the normal install path.
    let goldenLinked = false;
    try {
      const packageJsonContent = files.find(
        (file) => file.path === "package.json",
      )?.content;
      const sharedNm = await ensureSharedNodeModules(
        workspaceRoot,
        dependencySignature,
        {
          installRunner: (cwd) =>
            commandRunner([BUNDLED_RUNNER, "install", "--ignore-scripts"], cwd),
          packageJsonContent,
        },
      );
      goldenLinked = await linkSharedNodeModules(workspace, sharedNm);
      if (!goldenLinked) {
        devLog("generate", "shared-nm.link-skipped", { workspace });
      }
    } catch (error) {
      devLog("generate", "shared-nm.error", {
        workspace,
        error: String(error),
      });
    }

    // A successful golden link is authoritative: ensureSharedNodeModules
    // provisions the golden for EXACTLY dependencySignature (re-provisioning
    // on sig mismatch), so the linked node_modules matches the sig by
    // construction. Skip the workspace install, and write cache metadata so
    // the next repeat build also skips via the sig-match path. A broken link
    // falls through to the normal install path below.
    const shouldInstall =
      !goldenLinked &&
      (resetBeforeBuild ||
        cacheMetadata?.dependencySignature !== dependencySignature ||
        !(await pathExists(path.join(workspace, "node_modules"))));
    let installMs = 0;
    let install: BuildCommandResult = { ok: true, log: "" };

    installSkipped = !shouldInstall;

    if (shouldInstall) {
      const installStartedAt = Date.now();
      install = await commandRunner(
        [BUNDLED_RUNNER, "install", "--ignore-scripts"],
        workspace,
      );
      installMs = Date.now() - installStartedAt;

      if (!install.ok) {
        return { ...install, distFiles: [] };
      }

      await writeBuildCacheMetadata(metadataPath, {
        dependencySignature,
        runtimeProfile: manifest.runtimeProfile,
        schemaVersion: 1,
      });
    } else if (goldenLinked) {
      // Mirror the install-success path so repeat builds skip via sig-match.
      await writeBuildCacheMetadata(metadataPath, {
        dependencySignature,
        runtimeProfile: manifest.runtimeProfile,
        schemaVersion: 1,
      });
    }

    // tsc gates vite (same failure semantics as `tsc -b && vite build` in a
    // single npm script), but as two invocations so each step is timed.
    const tscStartedAt = Date.now();
    const tsc = await commandRunner(
      [BUNDLED_RUNNER, "x", "tsc", "-b"],
      workspace,
    );
    const viteStartedAt = Date.now();
    let vite: BuildCommandResult = { ok: true, log: "" };

    if (tsc.ok) {
      vite = await commandRunner(
        [BUNDLED_RUNNER, "x", "vite", "build"],
        workspace,
      );
    }
    const tscMs = viteStartedAt - tscStartedAt;
    const viteMs = tsc.ok ? Date.now() - viteStartedAt : 0;
    const buildOk = tsc.ok && vite.ok;
    const collectStartedAt = Date.now();
    let distFiles: GeneratedDistFile[] = [];
    let collectionError = "";

    if (buildOk) {
      try {
        distFiles = await collectDistFiles(path.join(workspace, "dist"));
      } catch (error) {
        collectionError =
          error instanceof Error
            ? error.message
            : "Generated dist collection failed.";
      }
    }

    const log = [
      createBuildTimingLog({
        buildMs: tscMs + viteMs,
        cacheReset: resetBeforeBuild,
        collectMs: Date.now() - collectStartedAt,
        installMs,
        installSkipped,
        tscMs,
        totalMs: Date.now() - startedAt,
        viteMs,
      }),
      install.log,
      tsc.log,
      vite.log,
      collectionError,
    ]
      .filter(Boolean)
      .join("\n");

    return { distFiles, ok: buildOk && !collectionError, log };
  }

  let result = await attemptBuild(resetWorkspace);

  if (!result.ok && !resetWorkspace) {
    resetWorkspace = true;
    result = await attemptBuild(true);
  }

  return result;
}

export async function runCommand(
  command: string[],
  cwd: string,
): Promise<BuildCommandResult> {
  return await new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "production",
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let outputTruncated = false;

    function appendOutput(chunk: Buffer) {
      output += chunk.toString();

      if (output.length > MAX_IN_FLIGHT_LOG_LENGTH) {
        output = output.slice(-MAX_IN_FLIGHT_LOG_LENGTH);
        outputTruncated = true;
      }
    }

    function capturedOutput() {
      return outputTruncated
        ? `[earlier build output truncated]\n${output}`
        : output;
    }

    const timeout = setTimeout(() => {
      child.kill();
      resolve({
        ok: false,
        log: truncateLog(`${capturedOutput()}\nBuild timed out.`),
      });
    }, BUILD_TIMEOUT_MS);

    child.stdout.on("data", appendOutput);
    child.stderr.on("data", appendOutput);
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({
        ok: false,
        log: truncateLog(`${capturedOutput()}\n${error.message}`),
      });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        ok: code === 0,
        log: truncateLog(capturedOutput().trim()),
      });
    });
  });
}

async function syncGeneratedProjectFiles(
  root: string,
  files: GeneratedProjectFile[],
) {
  const expectedFiles = new Map<string, string>();

  for (const file of files) {
    assertSafeProjectFilePath(file.path);
    expectedFiles.set(file.path, file.content);
  }

  await removeStaleWorkspaceFiles(root, expectedFiles);

  for (const [filePath, content] of expectedFiles) {
    const target = resolveSafeBuildWorkspacePath(root, filePath);
    const existing = await readFile(target, "utf8").catch(() => null);

    if (existing === content) {
      continue;
    }

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}

async function removeStaleWorkspaceFiles(
  root: string,
  expectedFiles: Map<string, string>,
) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    if (entry.name === "node_modules") {
      continue;
    }

    const absolute = path.join(root, entry.name);

    if (entry.isDirectory()) {
      await removeStaleWorkspaceFiles(absolute, expectedFiles);
      await removeEmptyDirectory(absolute);
      continue;
    }

    if (!entry.isFile()) {
      await rm(absolute, { force: true, recursive: true });
      continue;
    }

    const relative = path.relative(root, absolute).replace(/\\/g, "/");

    // Per-workspace caches (tsbuildinfo, vite cacheDir, build metadata)
    // survive syncs; stale cleanup never treats them as deletable files.
    if (relative.startsWith(".cache/generated-app/")) {
      continue;
    }

    if (!expectedFiles.has(relative)) {
      await rm(absolute, { force: true });
    }
  }
}

async function removeEmptyDirectory(directory: string) {
  const entries = await readdir(directory).catch(() => ["not-empty"]);

  if (!entries.length) {
    await rm(directory, { force: true, recursive: true });
  }
}

function resolveSafeBuildWorkspacePath(root: string, filePath: string) {
  assertSafeProjectFilePath(filePath);
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, filePath);

  if (!target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Unsafe generated file path: ${filePath}`);
  }

  return target;
}

export function createDependencySignature(
  files: GeneratedProjectFile[],
  manifest: {
    packageManager: "bun";
    runtimeProfile: string;
    templateId: string;
    templateVersion: string;
  },
) {
  const packageFile = files.find((file) => file.path === "package.json");
  const packageJson = packageFile ? parseStableJson(packageFile.content) : null;

  return createHash("sha256")
    .update(
      JSON.stringify({
        bunVersion: process.versions.bun || "unknown",
        packageJson,
        packageManager: manifest.packageManager,
        runtimeProfile: manifest.runtimeProfile,
        templateId: manifest.templateId,
        templateVersion: manifest.templateVersion,
      }),
    )
    .digest("hex");
}

function parseStableJson(value: string) {
  try {
    return sortJson(JSON.parse(value));
  } catch {
    return value;
  }
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(([key, item]) => [key, sortJson(item)]),
    );
  }

  return value;
}

async function readBuildCacheMetadata(
  metadataPath: string,
): Promise<BuildCacheMetadata | null> {
  const raw = await readFile(metadataPath, "utf8").catch(() => "");

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<BuildCacheMetadata>;

    if (
      parsed.schemaVersion === 1 &&
      typeof parsed.dependencySignature === "string" &&
      typeof parsed.runtimeProfile === "string"
    ) {
      return parsed as BuildCacheMetadata;
    }
  } catch {
    return null;
  }

  return null;
}

async function writeBuildCacheMetadata(
  metadataPath: string,
  metadata: BuildCacheMetadata,
) {
  await mkdir(path.dirname(metadataPath), { recursive: true });
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
}

function resolveBuildWorkspaceRoot(root?: string) {
  return path.resolve(
    root ||
      process.env.PROJECT_BUILD_WORKSPACE_DIR ||
      path.join(".data", "project-build-workspaces"),
  );
}

function toSafeWorkspacePart(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 120) || "unknown";
}

async function pathExists(target: string) {
  return stat(target)
    .then(() => true)
    .catch(() => false);
}

function createBuildTimingLog({
  buildMs,
  cacheReset,
  collectMs,
  installMs,
  installSkipped,
  tscMs,
  totalMs,
  viteMs,
}: {
  buildMs: number;
  cacheReset: boolean;
  collectMs: number;
  installMs: number;
  installSkipped: boolean;
  tscMs: number;
  totalMs: number;
  viteMs: number;
}) {
  return `[umkm:build] timings ${JSON.stringify({
    buildMs,
    cacheReset,
    collectMs,
    installMs,
    installSkipped,
    tscMs,
    totalMs,
    viteMs,
  })}`;
}

function truncateLog(value: string) {
  const bounded =
    value.length > MAX_LOG_LENGTH
      ? `[earlier output truncated]\n${value.slice(-MAX_LOG_LENGTH)}`
      : value;

  return sanitizeBuildLog(bounded);
}

async function collectDistFiles(root: string): Promise<GeneratedDistFile[]> {
  const files: GeneratedDistFile[] = [];
  const budget = getGeneratedResourceBudget("dist");
  let totalBytes = 0;

  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const absolute = path.join(current, entry.name);

      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = path.relative(root, absolute).replace(/\\/g, "/");
      assertSafeProjectFilePath(relativePath);
      const fileSize = (await stat(absolute)).size;

      if (files.length + 1 > budget.maxFiles) {
        throw new Error(`Generated dist exceeds ${budget.maxFiles} files.`);
      }

      if (fileSize > budget.maxFileBytes) {
        throw new Error(
          `Generated dist file exceeds ${budget.maxFileBytes} bytes: ${relativePath}`,
        );
      }

      totalBytes += fileSize;

      if (totalBytes > budget.maxTotalBytes) {
        throw new Error(
          `Generated dist exceeds ${budget.maxTotalBytes} aggregate bytes.`,
        );
      }

      files.push({
        content: await readFile(absolute, "utf8"),
        contentType: getContentType(relativePath),
        path: relativePath,
      });
    }
  }

  await walk(root);
  return files;
}

function getContentType(filePath: string) {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }

  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }

  if (filePath.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }

  if (filePath.endsWith(".svg")) {
    return "image/svg+xml";
  }

  return "text/plain; charset=utf-8";
}

export {
  createGeneratedSourceSnapshotMetadata,
  createGeneratedProjectFiles,
  createGeneratedViteTanStackStarterFiles,
} from "@/lib/projects/generated-starter";
