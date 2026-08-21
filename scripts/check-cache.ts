import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_VERSION = 1;
const IGNORED_DIRECTORIES = new Set([
  ".agent",
  ".agents",
  ".browser",
  ".cache",
  ".claude",
  ".data",
  ".firecrawl",
  ".git",
  ".next",
  ".nitro",
  ".omc",
  ".output",
  ".pi",
  ".pi-subagents",
  ".playwright-mcp",
  ".superpowers",
  ".tanstack",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "graphify-out",
  "node_modules",
  "shadcn-registry",
  "superpowers",
  "tmp",
  "uploads",
]);

export interface CheckFingerprintInput {
  extensions?: readonly string[];
  path: string;
}

export interface CheckExecutionResult {
  ok: boolean;
  output: string;
}

export function createCheckFingerprint(
  task: string,
  command: readonly string[],
  inputs: readonly CheckFingerprintInput[],
  root = process.cwd(),
) {
  const files = new Map<string, string | null>();

  const addInput = (input: CheckFingerprintInput) => {
    const absolutePath = path.resolve(root, input.path);
    const relativePath = path.relative(root, absolutePath) || ".";

    if (!existsSync(absolutePath)) {
      files.set(relativePath, null);
      return;
    }

    const stat = statSync(absolutePath);
    if (stat.isFile()) {
      if (hasAllowedExtension(relativePath, input.extensions)) {
        files.set(relativePath, absolutePath);
      }
      return;
    }

    if (stat.isDirectory()) {
      collectDirectoryFiles(
        absolutePath,
        relativePath,
        input.extensions,
        files,
      );
    }
  };

  for (const input of inputs) {
    addInput(input);
  }

  const hash = createHash("sha256");
  hash.update(`cache-version:${CACHE_VERSION}\0`);
  hash.update(`task:${task}\0`);
  hash.update(`command:${command.join("\0")}\0`);
  hash.update(`platform:${process.platform}\0`);
  hash.update(`arch:${process.arch}\0`);
  hash.update(`node:${process.version}\0`);
  hash.update(`bun:${process.versions.bun ?? "unknown"}\0`);

  for (const name of ["CI", "LANG", "LC_ALL", "NODE_ENV", "TZ"]) {
    hash.update(`env:${name}=${process.env[name] ?? ""}\0`);
  }

  for (const [relativePath, absolutePath] of [...files.entries()].sort(
    ([first], [second]) => first.localeCompare(second),
  )) {
    hash.update(`${relativePath}\0`);
    if (absolutePath === null) {
      hash.update("missing\0");
      continue;
    }
    hash.update(readFileSync(absolutePath));
    hash.update("\0");
  }

  return hash.digest("hex");
}

function hasAllowedExtension(
  relativePath: string,
  extensions: readonly string[] | undefined,
) {
  return (
    extensions === undefined ||
    extensions.some((extension) => relativePath.endsWith(extension))
  );
}

function collectDirectoryFiles(
  absoluteDirectory: string,
  relativeDirectory: string,
  extensions: readonly string[] | undefined,
  files: Map<string, string | null>,
) {
  for (const entry of readdirSync(absoluteDirectory, {
    withFileTypes: true,
  }).sort((first, second) => first.name.localeCompare(second.name))) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(absoluteDirectory, entry.name);
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      collectDirectoryFiles(absolutePath, relativePath, extensions, files);
    } else if (
      entry.isFile() &&
      hasAllowedExtension(relativePath, extensions)
    ) {
      files.set(relativePath, absolutePath);
    }
  }
}

export interface CachedCheckOptions {
  cacheDirectory: string;
  fingerprint: string;
  run: () => Promise<CheckExecutionResult>;
  task: string;
  useCache?: boolean;
}

export interface CachedCheckResult extends CheckExecutionResult {
  cached: boolean;
}

interface CacheEntry {
  fingerprint: string;
  task: string;
  version: number;
}

function getCachePath(cacheDirectory: string, task: string) {
  const safeTask = task.replace(/[^a-z0-9._-]/gi, "_");
  return path.join(cacheDirectory, `${safeTask}.json`);
}

function isCacheEntry(value: unknown): value is CacheEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.fingerprint === "string" &&
    typeof record.task === "string" &&
    typeof record.version === "number"
  );
}

async function readCacheEntry(cachePath: string) {
  try {
    const raw = await readFile(cachePath, "utf8");
    const value: unknown = JSON.parse(raw);
    return isCacheEntry(value) ? value : null;
  } catch {
    return null;
  }
}

async function writeCacheEntry(
  cacheDirectory: string,
  task: string,
  fingerprint: string,
) {
  const cachePath = getCachePath(cacheDirectory, task);
  const temporaryPath = `${cachePath}.${process.pid}.${randomUUID()}.tmp`;
  const entry: CacheEntry = {
    fingerprint,
    task,
    version: CACHE_VERSION,
  };

  try {
    await mkdir(cacheDirectory, { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(entry), "utf8");
    await rename(temporaryPath, cachePath);
  } catch {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export async function runCachedCheck({
  cacheDirectory,
  fingerprint,
  run,
  task,
  useCache = true,
}: CachedCheckOptions): Promise<CachedCheckResult> {
  if (useCache) {
    const entry = await readCacheEntry(getCachePath(cacheDirectory, task));
    if (
      entry?.version === CACHE_VERSION &&
      entry.task === task &&
      entry.fingerprint === fingerprint
    ) {
      return { cached: true, ok: true, output: "" };
    }
  }

  const result = await run();
  if (useCache && result.ok) {
    await writeCacheEntry(cacheDirectory, task, fingerprint);
  }

  return { ...result, cached: false };
}
