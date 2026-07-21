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
import { type ProjectSiteSchema } from "./site-schema";

import { isGeneratedBuildExecutionEnabled } from "@/lib/config";
import { sanitizeBuildLog } from "@/lib/projects/build-logs";
import { validateGeneratedAppManifest } from "@/lib/projects/generated-app-manifest";
import { validateGeneratedBuildPolicy } from "@/lib/projects/generated-build-policy";
import {
  assertGeneratedResourceBudget,
  getGeneratedResourceBudget,
} from "@/lib/projects/generated-resource-budget";

type BuildCommandResult = Omit<BuildGeneratedProjectResult, "distFiles">;

type BuildGeneratedProjectOptions = {
  commandRunner?: (
    command: string[],
    cwd: string,
  ) => Promise<BuildCommandResult>;
  workspaceRoot?: string;
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

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

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

  return buildGeneratedProjectInWorkspace(
    files,
    manifestResult.manifest,
    options,
  );
}

// node:child_process.spawn on Windows requires an absolute path or an
// explicit .exe suffix; the bare name "bun" resolves to ENOENT once the
// child's CWD is anything other than the lookup directory (e.g. a brand-new
// generated workspace). Resolve once at module init and reuse the absolute
// path for every spawn so this works on Windows + POSIX and is independent
// of the calling process's CWD.
function resolveBundledRunner(): string {
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
    toSafeWorkspacePart(manifest.projectId),
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

    const shouldInstall =
      resetBeforeBuild ||
      cacheMetadata?.dependencySignature !== dependencySignature ||
      !(await pathExists(path.join(workspace, "node_modules")));
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
    }

    const buildStartedAt = Date.now();
    const build = await commandRunner(
      [BUNDLED_RUNNER, "run", "build"],
      workspace,
    );
    const collectStartedAt = Date.now();
    let distFiles: GeneratedDistFile[] = [];
    let collectionError = "";

    if (build.ok) {
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
        buildMs: collectStartedAt - buildStartedAt,
        cacheReset: resetBeforeBuild,
        collectMs: Date.now() - collectStartedAt,
        installMs,
        installSkipped,
        totalMs: Date.now() - startedAt,
      }),
      install.log,
      build.log,
      collectionError,
    ]
      .filter(Boolean)
      .join("\n");

    return { distFiles, ok: build.ok && !collectionError, log };
  }

  let result = await attemptBuild(resetWorkspace);

  if (!result.ok && !resetWorkspace) {
    resetWorkspace = true;
    result = await attemptBuild(true);
  }

  return result;
}

async function runCommand(
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

    if (relative === ".cache/generated-app/build-cache.json") {
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

function createDependencySignature(
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
  totalMs,
}: {
  buildMs: number;
  cacheReset: boolean;
  collectMs: number;
  installMs: number;
  installSkipped: boolean;
  totalMs: number;
}) {
  return `[umkm:build] timings ${JSON.stringify({
    buildMs,
    cacheReset,
    collectMs,
    installMs,
    installSkipped,
    totalMs,
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

export function createGeneratedViteTanStackStarterFiles(
  projectId: string,
  schema: ProjectSiteSchema,
): GeneratedProjectFile[] {
  return [
    {
      path: "package.json",
      content: json({
        name: toPackageName(schema.businessName),
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: {
          dev: "vite",
          build: "tsc -b && vite build",
          lint: "eslint .",
          preview: "vite preview",
        },
        dependencies: {
          "@tanstack/react-query": "^5.101.2",
          "@tanstack/react-router": "^1.170.17",
          clsx: "^2.1.1",
          "lucide-react": "^0.575.0",
          react: "^19.2.7",
          "react-dom": "^19.2.7",
          tailwindcss: "^4.0.0",
        },
        devDependencies: {
          "@eslint/js": "^10.0.1",
          "@tailwindcss/vite": "^4.0.0",
          "@types/node": "^24.13.2",
          "@types/react": "^19.2.17",
          "@types/react-dom": "^19.2.3",
          "@vitejs/plugin-react": "^6.0.3",
          eslint: "^10.6.0",
          "eslint-plugin-react-hooks": "^7.1.1",
          "eslint-plugin-react-refresh": "^0.5.3",
          globals: "^17.7.0",
          typescript: "~6.0.2",
          "typescript-eslint": "^8.62.0",
          vite: "^8.1.1",
        },
      }),
    },
    {
      path: "vite.config.ts",
      content: `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nimport tailwindcss from '@tailwindcss/vite'\n\n// https://vite.dev/config/\nexport default defineConfig({\n  base: './',\n  plugins: [tailwindcss(), react()],\n})\n`,
    },
    {
      path: "tsconfig.json",
      content: json({
        files: [],
        references: [
          { path: "./tsconfig.app.json" },
          { path: "./tsconfig.node.json" },
        ],
      }),
    },
    {
      path: "tsconfig.app.json",
      content: json({
        compilerOptions: {
          tsBuildInfoFile: "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
          target: "es2023",
          lib: ["ES2023", "DOM"],
          module: "esnext",
          types: ["vite/client"],
          allowArbitraryExtensions: true,
          skipLibCheck: true,
          moduleResolution: "bundler",
          allowImportingTsExtensions: true,
          verbatimModuleSyntax: true,
          moduleDetection: "force",
          noEmit: true,
          jsx: "react-jsx",
          strict: true,
          noImplicitAny: false,
          strictNullChecks: true,
          noUnusedLocals: false,
          noUnusedParameters: false,
          erasableSyntaxOnly: true,
          noFallthroughCasesInSwitch: true,
        },
        include: ["src"],
      }),
    },
    {
      path: "tsconfig.node.json",
      content: json({
        compilerOptions: {
          tsBuildInfoFile: "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
          target: "es2023",
          lib: ["ES2023"],
          types: ["node"],
          skipLibCheck: true,
          module: "nodenext",
          allowImportingTsExtensions: true,
          verbatimModuleSyntax: true,
          moduleDetection: "force",
          noEmit: true,
        },
        include: ["vite.config.ts"],
      }),
    },
    {
      path: "eslint.config.js",
      content: `import js from '@eslint/js'\nimport globals from 'globals'\nimport reactHooks from 'eslint-plugin-react-hooks'\nimport reactRefresh from 'eslint-plugin-react-refresh'\nimport tseslint from 'typescript-eslint'\nimport { defineConfig, globalIgnores } from 'eslint/config'\n\nexport default defineConfig([\n  globalIgnores(['dist']),\n  {\n    files: ['**/*.{ts,tsx}'],\n    extends: [\n      js.configs.recommended,\n      tseslint.configs.recommended,\n      reactHooks.configs.flat.recommended,\n      reactRefresh.configs.vite,\n    ],\n    languageOptions: {\n      globals: globals.browser,\n    },\n  },\n])\n`,
    },
    {
      path: "index.html",
      content: `<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n`,
    },
    {
      path: "src/main.tsx",
      content: `import { RouterProvider } from "@tanstack/react-router";\nimport { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\n\nimport { router } from "./router";\nimport "./styles.css";\n\ncreateRoot(document.getElementById("root")!).render(\n  <StrictMode>\n    <RouterProvider router={router} />\n  </StrictMode>,\n);\n`,
    },
    {
      path: "src/router.tsx",
      content: `import { createHashHistory, createRoute, createRouter } from "@tanstack/react-router";\n\nimport { rootRoute } from "./routes/__root";\nimport { HomeRouteComponent } from "./routes/index";\n\nconst indexRoute = createRoute({\n  getParentRoute: () => rootRoute,\n  path: "/",\n  component: HomeRouteComponent,\n});\n\nconst routeTree = rootRoute.addChildren([indexRoute]);\nconst history = createHashHistory();\n\nexport const router = createRouter({ history, routeTree });\n\ndeclare module "@tanstack/react-router" {\n  interface Register {\n    router: typeof router;\n  }\n}\n`,
    },
    {
      path: "src/routes/__root.tsx",
      content: `import { createRootRoute, Outlet } from "@tanstack/react-router";\n\nexport const rootRoute = createRootRoute({\n  component: () => <Outlet />,\n});\n`,
    },
    {
      path: "src/routes/index.tsx",
      content: `import { site } from "../content/site";\nimport { usePreviewReady } from "../lib/preview-ready";\n\nexport function HomeRouteComponent() {\n  usePreviewReady();\n  const starterMessage = "Replace this starter route with a custom UMKM app.";\n\n  return (\n    <main className="starter-shell">\n      <p>{site.businessName}</p>\n      <h1>{starterMessage}</h1>\n    </main>\n  );\n}\n`,
    },
    {
      path: "src/content/site.ts",
      content: `export const site = ${json(schema)} as const;\nexport default site;\n`,
    },
    {
      path: "src/lib/preview-ready.ts",
      content: `import { useEffect } from "react";\n\nexport function usePreviewReady() {\n  useEffect(() => {\n    window.parent?.postMessage({ type: "generated-app-preview-ready" }, "*");\n  }, []);\n}\n`,
    },
    {
      path: "src/styles.css",
      content: createStarterContractStyles(schema),
    },
  ];
}

/** Theme tokens + layout contract the agent should reuse (not invent from zero). */
export function createStarterContractStyles(schema: ProjectSiteSchema) {
  const { background, foreground, muted, accent } = schema.theme;
  return `@import "tailwindcss";\n:root{--bg:${background};--fg:${foreground};--muted:${muted};--accent:${accent};font-family:Plus Jakarta Sans,Inter,ui-sans-serif,system-ui,sans-serif;color:var(--fg);background:var(--bg)}*{box-sizing:border-box}body{margin:0;min-width:320px;background:var(--bg);color:var(--fg)}a{color:inherit;text-decoration:none}img,svg{display:block;max-width:100%}button{font:inherit}.page{min-height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--fg)}.starter-shell{min-height:100dvh;display:grid;place-content:center;padding:40px;text-align:center}.starter-shell h1{max-width:720px;font-size:clamp(32px,5vw,64px);line-height:1}.site-header{position:sticky;top:0;z-index:20;border-bottom:1px solid color-mix(in srgb,var(--fg) 10%,transparent);background:color-mix(in srgb,var(--bg) 92%,white 8%);backdrop-filter:blur(10px)}.site-header__inner{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px clamp(16px,4vw,48px)}.site-header__brand{display:flex;align-items:center;gap:10px;min-width:0}.site-header__mark{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent)}.site-header__brandText{display:flex;flex-direction:column;gap:2px;min-width:0}.site-header__name{font-weight:800;line-height:1.1}.site-header__tagline{color:var(--muted);font-size:12px}.site-header__nav{display:none;gap:16px;font-weight:650}@media(min-width:760px){.site-header__nav{display:flex}}.site-header__cta,.primary{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border-radius:999px;background:var(--fg);color:var(--bg);font-weight:750}.hero{padding:40px clamp(16px,4vw,48px) 28px}.hero__inner{display:grid;gap:24px}@media(min-width:900px){.hero__inner{grid-template-columns:1.1fr .9fr;align-items:center;gap:40px}}.hero__text{display:grid;gap:14px}.eyebrow{margin:0;color:var(--accent);font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.hero__title,h1{margin:0;font-size:clamp(34px,6vw,64px);line-height:1.02;letter-spacing:-.04em}.section{padding:28px clamp(16px,4vw,48px)}.section__title{margin:0 0 16px;font-size:clamp(22px,3vw,32px)}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border-radius:14px;font-weight:750}.secondary{border:1px solid color-mix(in srgb,var(--fg) 14%,transparent);background:transparent;color:var(--fg)}.fab-wa{position:fixed;right:16px;bottom:16px;z-index:30;display:inline-flex;align-items:center;gap:10px;min-height:52px;padding:0 16px;border-radius:999px;background:#25d366;color:#fff;font-weight:800;box-shadow:0 12px 30px color-mix(in srgb,#25d366 35%,transparent)}.fab-wa__text{display:flex;flex-direction:column;line-height:1.15}.fab-wa__label{font-size:12px;opacity:.9}.fab-wa__num{font-size:14px}\n`;
}

export function createGeneratedProjectFiles(
  projectId: string,
  schema: ProjectSiteSchema,
): GeneratedProjectFile[] {
  return createGeneratedViteTanStackProjectFiles(projectId, schema);
}

export function createGeneratedViteTanStackProjectFiles(
  projectId: string,
  schema: ProjectSiteSchema,
): GeneratedProjectFile[] {
  const variant = getProjectSiteVariant(schema);
  const routeModule = getBusinessRouteModule(variant);

  return [
    {
      path: "package.json",
      content: json({
        name: toPackageName(schema.businessName),
        private: true,
        type: "module",
        scripts: {
          dev: "vite dev",
          build: "tsc -b && vite build",
          preview: "vite preview",
          lint: "eslint .",
          check: "tsc -b && eslint . && vite build",
        },
        dependencies: {
          "@tanstack/react-query": "^5.101.2",
          "@tanstack/react-router": "^1.170.17",
          clsx: "^2.1.1",
          "lucide-react": "^0.575.0",
          react: "^19.2.7",
          "react-dom": "^19.2.7",
          tailwindcss: "^4.0.0",
        },
        devDependencies: {
          "@eslint/js": "^10.0.1",
          "@tailwindcss/vite": "^4.0.0",
          "@types/node": "^24.13.2",
          "@types/react": "^19.2.17",
          "@types/react-dom": "^19.2.3",
          "@vitejs/plugin-react": "^6.0.3",
          eslint: "^10.6.0",
          "eslint-plugin-react-hooks": "^7.1.1",
          "eslint-plugin-react-refresh": "^0.5.3",
          globals: "^17.7.0",
          typescript: "~6.0.2",
          "typescript-eslint": "^8.62.0",
          vite: "^8.1.1",
        },
      }),
    },
    {
      path: "vite.config.ts",
      content: `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nimport tailwindcss from '@tailwindcss/vite'\n\n// https://vite.dev/config/\nexport default defineConfig({\n  base: './',\n  plugins: [tailwindcss(), react()],\n})\n`,
    },
    {
      path: "tsconfig.json",
      content: json({
        files: [],
        references: [
          { path: "./tsconfig.app.json" },
          { path: "./tsconfig.node.json" },
        ],
      }),
    },
    {
      path: "tsconfig.app.json",
      content: json({
        compilerOptions: {
          tsBuildInfoFile: "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
          target: "es2023",
          lib: ["ES2023", "DOM"],
          module: "esnext",
          types: ["vite/client"],
          allowArbitraryExtensions: true,
          skipLibCheck: true,
          moduleResolution: "bundler",
          allowImportingTsExtensions: true,
          verbatimModuleSyntax: true,
          moduleDetection: "force",
          noEmit: true,
          jsx: "react-jsx",
          strict: true,
          noImplicitAny: false,
          strictNullChecks: true,
          noUnusedLocals: false,
          noUnusedParameters: false,
          erasableSyntaxOnly: true,
          noFallthroughCasesInSwitch: true,
        },
        include: ["src"],
      }),
    },
    {
      path: "tsconfig.node.json",
      content: json({
        compilerOptions: {
          tsBuildInfoFile: "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
          target: "es2023",
          lib: ["ES2023"],
          types: ["node"],
          skipLibCheck: true,
          module: "nodenext",
          allowImportingTsExtensions: true,
          verbatimModuleSyntax: true,
          moduleDetection: "force",
          noEmit: true,
        },
        include: ["vite.config.ts"],
      }),
    },
    {
      path: "eslint.config.js",
      content: `import js from '@eslint/js'\nimport globals from 'globals'\nimport reactHooks from 'eslint-plugin-react-hooks'\nimport reactRefresh from 'eslint-plugin-react-refresh'\nimport tseslint from 'typescript-eslint'\nimport { defineConfig, globalIgnores } from 'eslint/config'\n\nexport default defineConfig([\n  globalIgnores(['dist']),\n  {\n    files: ['**/*.{ts,tsx}'],\n    extends: [\n      js.configs.recommended,\n      tseslint.configs.recommended,\n      reactHooks.configs.flat.recommended,\n      reactRefresh.configs.vite,\n    ],\n    languageOptions: {\n      globals: globals.browser,\n    },\n  },\n])\n`,
    },
    {
      path: "index.html",
      content: `<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n`,
    },
    {
      path: "src/main.tsx",
      content: `import { RouterProvider } from "@tanstack/react-router";\nimport { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\n\nimport { router } from "./router";\nimport "./styles.css";\n\ncreateRoot(document.getElementById("root")!).render(\n  <StrictMode>\n    <RouterProvider router={router} />\n  </StrictMode>,\n);\n`,
    },
    {
      path: "src/router.tsx",
      content: `import { createHashHistory, createRoute, createRouter } from "@tanstack/react-router";\n\nimport { rootRoute } from "./routes/__root";\nimport { HomeRouteComponent } from "./routes/index";\n${routeModule.imports}\n\nconst indexRoute = createRoute({\n  getParentRoute: () => rootRoute,\n  path: "/",\n  component: HomeRouteComponent,\n});\n${routeModule.routeDefinitions}\n\nconst routeTree = rootRoute.addChildren([indexRoute${routeModule.routeNames.length ? `, ${routeModule.routeNames.join(", ")}` : ""}]);\nconst history = createHashHistory();\n\nexport const router = createRouter({ history, routeTree });\n\ndeclare module "@tanstack/react-router" {\n  interface Register {\n    router: typeof router;\n  }\n}\n`,
    },
    {
      path: "src/routes/__root.tsx",
      content: `import { createRootRoute, Outlet } from "@tanstack/react-router";\n\nexport const rootRoute = createRootRoute({\n  component: () => <Outlet />,\n});\n`,
    },
    {
      path: "src/routes/index.tsx",
      content: createHomeRouteSource(schema, variant, routeModule),
    },
    ...routeModule.files,
    {
      path: "src/content/site.ts",
      content: `export const site = ${json(schema)} as const;\nexport default site;\n`,
    },
    {
      path: `src/content/${variant}.ts`,
      content: createBusinessContentSource(schema, variant),
    },
    {
      path: "src/lib/preview-ready.ts",
      content: `import { useEffect } from "react";\n\nexport function usePreviewReady() {\n  useEffect(() => {\n    window.parent?.postMessage({ type: "generated-app-preview-ready" }, "*");\n  }, []);\n}\n`,
    },
    {
      path: "src/styles.css",
      content: createCustomProjectStyles(variant, schema),
    },
    ...createGeneratedDesignContextFiles(schema),
  ];
}

type BusinessRouteModule = {
  files: GeneratedProjectFile[];
  imports: string;
  routeDefinitions: string;
  routeNames: string[];
  routes: Array<{ path: string; title: string }>;
};

function createGeneratedDesignContextFiles(
  _schema: ProjectSiteSchema,
): GeneratedProjectFile[] {
  return [];
}

function toPackageName(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "generated-app"
  );
}

type ProjectSiteVariant =
  | "angkringan"
  | "automotive"
  | "barber"
  | "coffee"
  | "fashion"
  | "home-food"
  | "laundry"
  | "tutoring";

function getBusinessRouteModule(
  variant: ProjectSiteVariant,
): BusinessRouteModule {
  const routeTitle =
    variant === "automotive"
      ? "Layanan Bengkel"
      : variant === "coffee"
        ? "Menu"
        : variant === "fashion"
          ? "Koleksi"
          : variant === "tutoring"
            ? "Program"
            : variant === "laundry"
              ? "Layanan Laundry"
              : variant === "home-food"
                ? "Menu Harian"
                : "Detail";
  const routePath =
    variant === "automotive"
      ? "/layanan"
      : variant === "tutoring"
        ? "/program"
        : variant === "fashion"
          ? "/koleksi"
          : "/menu";
  const componentName = `${toPascalCase(variant)}DetailRoute`;

  return {
    imports: `import { ${componentName} } from "./routes/${variant}-detail";`,
    routeDefinitions: `const ${variant.replace(/-/g, "")}DetailRoute = createRoute({\n  getParentRoute: () => rootRoute,\n  path: "${routePath}",\n  component: ${componentName},\n});`,
    routeNames: [`${variant.replace(/-/g, "")}DetailRoute`],
    routes: [
      { path: "/", title: "Beranda" },
      { path: routePath, title: routeTitle },
    ],
    files: [
      {
        path: `src/routes/${variant}-detail.tsx`,
        content: createDetailRouteSource(variant, routeTitle),
      },
      {
        path: `src/components/${variant}/Showcase.tsx`,
        content: createShowcaseComponentSource(variant),
      },
    ],
  };
}

function toPascalCase(value: string) {
  return value
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join("");
}

function createHomeRouteSource(
  schema: ProjectSiteSchema,
  variant: ProjectSiteVariant,
  routeModule: BusinessRouteModule,
) {
  const componentName = `${toPascalCase(variant)}Showcase`;
  const detailPath = routeModule.routes[1]?.path ?? "/";

  return `import { Link } from "@tanstack/react-router";\nimport { ArrowRight, MessageCircle } from "lucide-react";\n\nimport { ${componentName} } from "../components/${variant}/Showcase";\nimport { ${variant.replace(/-/g, "")}Highlights, ${variant.replace(/-/g, "")}Steps } from "../content/${variant}";\nimport { site } from "../content/site";\nimport { usePreviewReady } from "../lib/preview-ready";\n\nexport function HomeRouteComponent() {\n  usePreviewReady();\n\n  return (\n    <main className="site-shell variant-${variant}">\n      <nav className="topbar" aria-label="Navigasi utama">\n        <strong>${escapeTsx(schema.businessName)}</strong>\n        <div>\n          <Link to="${detailPath}">Detail</Link>\n          <a href="#contact">{site.primaryCta}</a>\n        </div>\n      </nav>\n\n      <section className="hero">\n        <div className="hero-copy">\n          <p className="eyebrow">{site.eyebrow}</p>\n          <h1>{site.headline}</h1>\n          <p className="lead">{site.subheadline}</p>\n          <div className="actions">\n            <a className="primary" href="#contact"><MessageCircle size={18} />{site.primaryCta}</a>\n            <Link className="secondary" to="${detailPath}">Lihat detail <ArrowRight size={18} /></Link>\n          </div>\n        </div>\n        <${componentName} />\n      </section>\n\n      <section className="insight-grid" aria-label="Ringkasan kebutuhan">\n        {${variant.replace(/-/g, "")}Highlights.map((item) => (\n          <article key={item.title}>\n            <span>{item.kicker}</span>\n            <h2>{item.title}</h2>\n            <p>{item.body}</p>\n          </article>\n        ))}\n      </section>\n\n      <section className="process-strip" aria-label="Langkah berikutnya">\n        {${variant.replace(/-/g, "")}Steps.map((step) => (\n          <div key={step}>{step}</div>\n        ))}\n      </section>\n\n      <section id="contact" className="closing">\n        <div>\n          <p className="eyebrow">Untuk {site.audience}</p>\n          <h2>{site.secondaryCta} atau langsung hubungi kami.</h2>\n        </div>\n        <a className="primary" href="#contact">{site.primaryCta}</a>\n      </section>\n    </main>\n  );\n}\n`;
}

function createDetailRouteSource(
  variant: ProjectSiteVariant,
  routeTitle: string,
) {
  const exportName = `${toPascalCase(variant)}DetailRoute`;
  const contentName = `${variant.replace(/-/g, "")}Highlights`;

  return `import { Link } from "@tanstack/react-router";\n\nimport { ${contentName} } from "../content/${variant}";\nimport { site } from "../content/site";\n\nexport function ${exportName}() {\n  return (\n    <main className="detail-page variant-${variant}">\n      <Link className="back-link" to="/">Kembali</Link>\n      <p className="eyebrow">${routeTitle}</p>\n      <h1>{site.offer}</h1>\n      <div className="detail-list">\n        {${contentName}.map((item) => (\n          <article key={item.title}>\n            <span>{item.kicker}</span>\n            <h2>{item.title}</h2>\n            <p>{item.body}</p>\n          </article>\n        ))}\n      </div>\n    </main>\n  );\n}\n`;
}

function createShowcaseComponentSource(variant: ProjectSiteVariant) {
  const exportName = `${toPascalCase(variant)}Showcase`;
  const contentName = `${variant.replace(/-/g, "")}Highlights`;

  return `import { ${contentName} } from "../../content/${variant}";\nimport { site } from "../../content/site";\n\nexport function ${exportName}() {\n  return (\n    <aside className="showcase-card" aria-label="Sorotan utama">\n      <span>{site.offer}</span>\n      <div className="showcase-list">\n        {${contentName}.slice(0, 3).map((item) => (\n          <p key={item.title}>{item.title}</p>\n        ))}\n      </div>\n    </aside>\n  );\n}\n`;
}

function createBusinessContentSource(
  schema: ProjectSiteSchema,
  variant: ProjectSiteVariant,
) {
  const name = variant.replace(/-/g, "");
  const highlights = schema.sections.map((section, index) => ({
    body: section.body,
    kicker: `${String(index + 1).padStart(2, "0")}`,
    title: section.title,
  }));
  const steps = schema.trustPoints.length
    ? schema.trustPoints
    : ["Info jelas", "Mudah dihubungi", "Siap dibuka dari HP"];

  return `export const ${name}Highlights = ${json(highlights)} as const;\n\nexport const ${name}Steps = ${json(steps)} as const;\n`;
}

function createCustomProjectStyles(
  variant: ProjectSiteVariant,
  schema: ProjectSiteSchema,
) {
  return `:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:${schema.theme.foreground};background:${schema.theme.background}}\n*{box-sizing:border-box}\nbody{margin:0;min-width:320px;background:${schema.theme.background}}\na{color:inherit;text-decoration:none}\n.site-shell,.detail-page{min-height:100dvh;overflow-x:hidden}\n.topbar{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:24px clamp(20px,5vw,72px);border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent);background:color-mix(in srgb,${schema.theme.background} 88%,white 12%)}\n.topbar div{display:flex;align-items:center;gap:12px}.topbar a,.back-link{border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:999px;padding:10px 14px;font-weight:750}.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,.9fr);align-items:center;gap:56px;padding:72px clamp(20px,5vw,72px) 48px}.eyebrow{margin:0 0 16px;color:${schema.theme.accent};font-size:12px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}h1{max-width:780px;margin:0;font-size:clamp(44px,7vw,84px);line-height:.95;letter-spacing:-.055em}.lead{max-width:650px;margin:24px 0 0;color:${schema.theme.muted};font-size:20px;line-height:1.7}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:34px}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:48px;border-radius:16px;padding:0 18px;font-weight:850}.primary{background:${schema.theme.foreground};color:${schema.theme.background}}.secondary{border:1px solid color-mix(in srgb,currentColor 16%,transparent)}.showcase-card{border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:32px;padding:30px;background:color-mix(in srgb,white 70%,${schema.theme.background} 30%);box-shadow:16px 16px 0 color-mix(in srgb,${schema.theme.accent} 42%,transparent)}.showcase-card>span{display:block;color:${schema.theme.muted};font-size:14px;line-height:1.5}.showcase-list{display:grid;gap:12px;margin-top:26px}.showcase-list p{margin:0;border-radius:18px;background:color-mix(in srgb,white 72%,${schema.theme.background} 28%);padding:16px;line-height:1.45}.insight-grid,.detail-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;padding:0 clamp(20px,5vw,72px) 48px}.insight-grid article,.detail-list article{border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:24px;padding:26px;background:color-mix(in srgb,white 58%,${schema.theme.background} 42%)}.insight-grid span,.detail-list span{color:${schema.theme.accent};font-size:12px;font-weight:900}.insight-grid h2,.detail-list h2{margin:14px 0 10px;font-size:24px}.insight-grid p,.detail-list p{margin:0;color:${schema.theme.muted};line-height:1.72}.process-strip{display:flex;flex-wrap:wrap;gap:12px;padding:0 clamp(20px,5vw,72px) 48px}.process-strip div{border-radius:999px;background:color-mix(in srgb,${schema.theme.accent} 13%,transparent);padding:12px 16px;font-weight:750}.closing{display:flex;align-items:center;justify-content:space-between;gap:24px;margin:0 clamp(20px,5vw,72px) 72px;border-radius:30px;padding:34px;background:${schema.theme.foreground};color:${schema.theme.background}}.closing .eyebrow{color:color-mix(in srgb,${schema.theme.accent} 65%,white 35%)}.closing h2{max-width:760px;margin:0;font-size:clamp(30px,4vw,48px);line-height:1.06}.detail-page{padding:48px clamp(20px,5vw,72px)}.detail-page h1{margin:28px 0 36px}.detail-page .detail-list{padding:0;grid-template-columns:repeat(2,minmax(0,1fr))}${createVariantAccentStyles(variant, schema)}@media(max-width:820px){.topbar{align-items:flex-start;flex-direction:column}.hero{display:block;padding-top:42px}.showcase-card{margin-top:34px}.insight-grid,.detail-list,.detail-page .detail-list{grid-template-columns:1fr}.closing{align-items:flex-start;flex-direction:column}}\n`;
}

function createVariantAccentStyles(
  variant: ProjectSiteVariant,
  schema: ProjectSiteSchema,
) {
  if (variant === "automotive") {
    return `.variant-automotive{background:#101211;color:#f7f7f2}.variant-automotive .showcase-card,.variant-automotive .insight-grid article,.variant-automotive .detail-list article{background:#181c1a;border-color:rgba(255,255,255,.12)}.variant-automotive .showcase-card{box-shadow:18px 18px 0 #d3342f}.variant-automotive .primary{background:#d3342f;color:#fff}`;
  }

  if (variant === "fashion") {
    return `.variant-fashion .showcase-card{border-radius:44px 12px 44px 12px}.variant-fashion .insight-grid{grid-template-columns:1.2fr .8fr}`;
  }

  if (variant === "coffee") {
    return `.variant-coffee .showcase-list{grid-template-columns:repeat(2,minmax(0,1fr))}.variant-coffee .showcase-list p{border-radius:999px;text-align:center}`;
  }

  return `.variant-${variant} .showcase-card{outline:2px solid color-mix(in srgb,${schema.theme.accent} 18%,transparent)}`;
}

function escapeTsx(value: string) {
  return value.replace(/[{}<>]/g, "");
}

export function createGeneratedSourceSnapshotMetadata(
  files: GeneratedProjectFile[],
  schema: ProjectSiteSchema,
  generation?: {
    buildSpec?: string;
    generationMode?: "agent-custom" | "agent-partial" | "retry_build";
    operationTrace?: Array<{
      detail: string;
      path?: string;
      state: string;
      title: string;
      type: string;
    }>;
    repairAttempts?: number;
    summary?: string;
    touchedFiles?: string[];
  },
) {
  const manifestResult = validateGeneratedAppManifest(files);
  const manifest = manifestResult.ok ? manifestResult.manifest : null;

  return {
    manifest,
    manifestIssues: manifestResult.ok ? [] : manifestResult.issues,
    generation: generation
      ? {
          buildSpec: generation.buildSpec,
          mode: generation.generationMode,
          operationTrace: generation.operationTrace ?? [],
          repairAttempts: generation.repairAttempts ?? 0,
          summary: generation.summary,
          touchedFiles: generation.touchedFiles ?? [],
        }
      : undefined,
    origin: {
      generator:
        generation?.generationMode === "agent-custom"
          ? "agent-custom"
          : "site-schema",
      sourceType: "generated",
    },
    schemaVersion: schema.version,
    sourceFileCount: files.length,
    summary: {
      businessName: schema.businessName,
      capabilities: manifest?.capabilities ?? [],
      routeCount: manifest?.routes.length ?? 0,
      runtimeProfile: manifest?.runtimeProfile ?? null,
      templateId: manifest?.templateId ?? null,
    },
    template: manifest?.templateId ?? "vite-react-frontend-static-v1",
  };
}

function getProjectSiteVariant(schema: ProjectSiteSchema): ProjectSiteVariant {
  const text = [
    schema.businessName,
    schema.eyebrow,
    schema.headline,
    schema.subheadline,
    schema.audience,
    schema.offer,
    ...schema.trustPoints,
    ...schema.sections.flatMap((section) => [section.title, section.body]),
  ]
    .join(" ")
    .toLowerCase();

  if (text.includes("angkringan") || text.includes("nasi kucing")) {
    return "angkringan";
  }

  if (text.includes("laundry") || text.includes("cuci setrika")) {
    return "laundry";
  }

  if (
    text.includes("coffee") ||
    text.includes("kopi") ||
    text.includes("espresso") ||
    text.includes("manual brew")
  ) {
    return "coffee";
  }

  if (
    text.includes("barber") ||
    text.includes("pangkas") ||
    text.includes("haircut") ||
    text.includes("shave")
  ) {
    return "barber";
  }

  if (
    text.includes("bengkel") ||
    text.includes("motor") ||
    text.includes("mobil") ||
    text.includes("servis") ||
    text.includes("aki") ||
    text.includes("velg")
  ) {
    return "automotive";
  }

  if (
    text.includes("fashion") ||
    text.includes("outfit") ||
    text.includes("koleksi") ||
    text.includes("lookbook")
  ) {
    return "fashion";
  }

  if (
    text.includes("les") ||
    text.includes("tutoring") ||
    text.includes("murid") ||
    text.includes("ujian")
  ) {
    return "tutoring";
  }

  if (
    text.includes("makanan rumahan") ||
    text.includes("nasi box") ||
    text.includes("katering") ||
    text.includes("pre order") ||
    text.includes("lauk")
  ) {
    return "home-food";
  }

  return "angkringan";
}

function _createAppSource(variant: ProjectSiteVariant) {
  const config = getVariantConfig(variant);
  const shellClass = `site-shell variant-${variant}`;
  const showcaseClass = config.showcaseClass;

  return `import { useEffect } from "react";

import { site } from "./data/site";
import "./styles.css";

const shellClass = "${shellClass}";
const showcaseClass = "${showcaseClass}";
const variantLabel = "${config.label}";
const closingTitle = "${config.closingTitle}";

export default function App() {
  useEffect(() => {
    window.parent?.postMessage({ type: "generated-app-preview-ready" }, "*");
  }, []);

  return (
    <main
      className={shellClass}
      style={{ background: site.theme.background, color: site.theme.foreground }}
    >
      <nav className="topbar" aria-label="Navigasi utama">
        <strong>{site.businessName}</strong>
        <a href="#contact">{site.primaryCta}</a>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow" style={{ color: site.theme.accent }}>
            {site.eyebrow}
          </p>
          <h1>{site.headline}</h1>
          <p className="lead">{site.subheadline}</p>
          <div className="actions">
            <a className="primary" href="#contact">
              {site.primaryCta}
            </a>
            <a className="secondary" href="#details">
              {site.secondaryCta}
            </a>
          </div>
        </div>

        <aside className="hero-card" aria-label="Ringkasan penawaran">
          <span>{variantLabel}</span>
          <h2>{site.offer}</h2>
          <div className={showcaseClass}>
            {site.trustPoints.map((point) => (
              <p key={point}>{point}</p>
            ))}
          </div>
        </aside>
      </section>

      <section id="details" className="section-grid" aria-label="Detail usaha">
        {site.sections.map((section, index) => (
          <article key={section.title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </article>
        ))}
      </section>

      <section id="contact" className="closing">
        <div>
          <p className="eyebrow" style={{ color: site.theme.accent }}>
            Untuk {site.audience}
          </p>
          <h2>{closingTitle}</h2>
        </div>
        <a className="primary" href="#contact">
          {site.primaryCta}
        </a>
      </section>
    </main>
  );
}
`;
}

function _createStyles(variant: ProjectSiteVariant) {
  return `${createBaseStyles()}
${createVariantStyles(variant)}
`;
}

function createBaseStyles() {
  return `@import "tailwindcss";
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#f7f4ed}
a{color:inherit}
.site-shell{min-height:100dvh;overflow-x:hidden}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 64px;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent)}
.topbar strong{font-size:18px}
.topbar a{border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:12px;padding:10px 14px;text-decoration:none;font-weight:700}
.hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(320px,.95fr);gap:54px;align-items:stretch;padding:72px 64px 54px}
.hero-copy{display:flex;min-width:0;flex-direction:column;justify-content:center}
.eyebrow{margin:0 0 18px;text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:800}
h1{max-width:820px;margin:0;font-size:76px;line-height:.96;letter-spacing:0}
.lead{max-width:640px;margin:24px 0 0;font-size:21px;line-height:1.62;color:color-mix(in srgb,currentColor 68%,transparent)}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:34px}
.primary,.secondary{display:inline-flex;min-height:48px;align-items:center;justify-content:center;border-radius:14px;padding:0 20px;text-decoration:none;font-weight:800}
.primary{background:#111312;color:#fff}
.secondary{border:1px solid color-mix(in srgb,currentColor 18%,transparent)}
.hero-card{display:flex;min-height:430px;flex-direction:column;justify-content:space-between;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:28px;padding:30px;background:color-mix(in srgb,white 72%,transparent)}
.hero-card>span{color:color-mix(in srgb,currentColor 56%,transparent);font-size:14px}
.hero-card h2{margin:14px 0 28px;font-size:34px;line-height:1.12;letter-spacing:0}
.section-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;padding:0 64px 64px}
.section-grid article{border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:22px;padding:26px;background:color-mix(in srgb,white 58%,transparent)}
.section-grid span{font-size:12px;font-weight:900}
.section-grid h2{margin:14px 0 10px;font-size:24px;letter-spacing:0}
.section-grid p{margin:0;line-height:1.72;color:color-mix(in srgb,currentColor 66%,transparent)}
.closing{display:flex;align-items:center;justify-content:space-between;gap:24px;margin:0 64px 72px;border-radius:28px;padding:34px;background:#111312;color:#fff}
.closing .primary{background:#fff;color:#111312}
.closing h2{max-width:680px;margin:0;font-size:36px;line-height:1.12;letter-spacing:0}
@media(max-width:820px){.topbar,.hero,.section-grid{padding-left:22px;padding-right:22px}.topbar{align-items:flex-start;flex-direction:column}.hero{display:block;padding-top:42px}.hero-card{min-height:320px;margin-top:34px}.section-grid{grid-template-columns:1fr}.closing{align-items:flex-start;flex-direction:column;margin-left:22px;margin-right:22px}h1{font-size:46px}.lead{font-size:18px}.hero-card h2{font-size:28px}.closing h2{font-size:30px}}
`;
}

function getVariantConfig(variant: ProjectSiteVariant) {
  const configs: Record<
    ProjectSiteVariant,
    { closingTitle: string; label: string; showcaseClass: string }
  > = {
    angkringan: {
      closingTitle: "Datang malam ini atau tanya menu yang masih hangat.",
      label: "Menu malam favorit",
      showcaseClass: "night-menu",
    },
    automotive: {
      closingTitle:
        "Booking servis, cek estimasi, atau tanya keluhan motor sebelum datang.",
      label: "Layanan bengkel",
      showcaseClass: "garage-board",
    },
    barber: {
      closingTitle: "Pilih jam potong, datang rapi tanpa antre panjang.",
      label: "Layanan grooming",
      showcaseClass: "cut-list",
    },
    coffee: {
      closingTitle: "Cek menu dan mampir untuk kerja atau ngobrol santai.",
      label: "Racikan dan suasana",
      showcaseClass: "brew-board",
    },
    fashion: {
      closingTitle: "Tanya stok, ukuran, dan padanan sebelum pesan.",
      label: "Lookbook pilihan",
      showcaseClass: "lookbook-grid",
    },
    "home-food": {
      closingTitle: "Pesan menu rumahan hari ini sebelum kuota habis.",
      label: "Menu harian",
      showcaseClass: "daily-menu",
    },
    laundry: {
      closingTitle: "Atur pickup cucian dan dapatkan estimasi yang jelas.",
      label: "Layanan laundry",
      showcaseClass: "service-grid",
    },
    tutoring: {
      closingTitle: "Diskusikan kebutuhan belajar anak dan jadwal yang cocok.",
      label: "Rencana belajar",
      showcaseClass: "learning-path",
    },
  };

  return configs[variant];
}

function createVariantStyles(variant: ProjectSiteVariant) {
  if (variant === "angkringan") {
    return `.variant-angkringan .hero-card{box-shadow:14px 14px 0 color-mix(in srgb,currentColor 82%,transparent);background:linear-gradient(180deg,rgba(255,255,255,.78),rgba(255,246,232,.9))}
.night-menu{display:grid;gap:10px}
.night-menu p{margin:0;border-left:4px solid currentColor;border-radius:14px;background:rgba(255,255,255,.56);padding:13px 14px;line-height:1.45}
.variant-angkringan .section-grid span{color:#b7521b}`;
  }

  if (variant === "laundry") {
    return `.variant-laundry .hero{align-items:center}
.variant-laundry .hero-card{background:linear-gradient(180deg,rgba(255,255,255,.88),rgba(235,250,246,.92));box-shadow:0 18px 60px rgba(18,33,29,.12)}
.service-grid{display:grid;grid-template-columns:1fr;gap:12px}
.service-grid p{margin:0;border:1px solid rgba(31,143,122,.18);border-radius:16px;background:rgba(255,255,255,.72);padding:14px;line-height:1.45}
.variant-laundry .section-grid span{color:#1f8f7a}`;
  }

  if (variant === "coffee") {
    return `.variant-coffee .hero{grid-template-columns:minmax(0,.9fr) minmax(360px,1.1fr)}
.variant-coffee .hero-card{background:radial-gradient(circle at top right,rgba(148,92,52,.22),transparent 42%),#fff8ef;box-shadow:0 24px 70px rgba(73,44,24,.16)}
.brew-board{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.brew-board p{margin:0;border-radius:999px;background:#3b2418;color:#fff7ed;padding:12px 14px;line-height:1.35;text-align:center}
.variant-coffee .section-grid article:first-child{grid-column:span 2}
.variant-coffee .section-grid span{color:#8a4b24}
@media(max-width:820px){.variant-coffee .section-grid article:first-child{grid-column:auto}}`;
  }

  if (variant === "automotive") {
    return `.variant-automotive{background:#101211!important;color:#f7f7f2!important}
.variant-automotive .topbar,.variant-automotive .hero-card,.variant-automotive .section-grid article{border-color:rgba(247,247,242,.14)}
.variant-automotive .hero{grid-template-columns:minmax(0,.88fr) minmax(420px,1.12fr)}
.variant-automotive .hero-card{background:linear-gradient(145deg,#1b1f1d,#111312);box-shadow:16px 16px 0 rgba(211,52,47,.72)}
.garage-board{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.garage-board p{margin:0;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(255,255,255,.07);padding:14px;line-height:1.45;font-weight:750}
.variant-automotive .section-grid article{background:rgba(255,255,255,.055)}
.variant-automotive .section-grid span{color:#ff6b62}
.variant-automotive .primary{background:#d3342f;color:#fff}
@media(max-width:820px){.variant-automotive .hero{display:block}.garage-board{grid-template-columns:1fr}}`;
  }

  if (variant === "barber") {
    return `.variant-barber{background:#111312!important;color:#f8f3ea!important}
.variant-barber .topbar,.variant-barber .hero-card,.variant-barber .section-grid article{border-color:rgba(248,243,234,.16)}
.variant-barber .hero-card{background:#1c1f1d;box-shadow:inset 0 0 0 8px rgba(255,255,255,.04)}
.cut-list{display:grid;gap:12px;counter-reset:cuts}
.cut-list p{counter-increment:cuts;margin:0;border-radius:12px;background:#f8f3ea;color:#111312;padding:14px;line-height:1.45;font-weight:800}
.cut-list p:before{content:counter(cuts) ". ";color:#9b1c1c}
.variant-barber .section-grid article{background:rgba(255,255,255,.06)}
.variant-barber .section-grid span{color:#ffcf6f}`;
  }

  if (variant === "fashion") {
    return `.variant-fashion .hero{grid-template-columns:minmax(0,1fr) minmax(380px,.9fr)}
.variant-fashion .hero-card{background:linear-gradient(135deg,#fff,#f3eee7);border-radius:44px 12px 44px 12px}
.lookbook-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.lookbook-grid p{margin:0;min-height:96px;border:1px solid rgba(0,0,0,.1);border-radius:24px 24px 6px 24px;background:white;padding:14px;line-height:1.45}
.variant-fashion .section-grid{grid-template-columns:1.2fr .8fr}
.variant-fashion .section-grid span{color:#a05a7a}
@media(max-width:820px){.variant-fashion .section-grid{grid-template-columns:1fr}}`;
  }

  if (variant === "tutoring") {
    return `.variant-tutoring .hero-card{background:linear-gradient(180deg,rgba(255,255,255,.92),rgba(239,244,255,.94));box-shadow:0 18px 60px rgba(31,51,91,.12)}
.learning-path{display:grid;gap:0;border:1px solid rgba(31,51,91,.14);border-radius:20px;overflow:hidden}
.learning-path p{margin:0;background:white;padding:15px 16px;line-height:1.45;border-bottom:1px solid rgba(31,51,91,.1)}
.learning-path p:last-child{border-bottom:0}
.variant-tutoring .section-grid article{background:#fbfcff}
.variant-tutoring .section-grid span{color:#3155a4}`;
  }

  return `.variant-home-food .hero-card{background:radial-gradient(circle at top left,rgba(255,126,74,.22),transparent 40%),#fffaf2;box-shadow:0 18px 55px rgba(116,64,29,.14)}
.daily-menu{display:grid;grid-template-columns:1fr;gap:12px}
.daily-menu p{margin:0;border:1px dashed rgba(116,64,29,.32);border-radius:18px;background:rgba(255,255,255,.76);padding:14px 16px;line-height:1.45}
.variant-home-food .section-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
.variant-home-food .section-grid article{background:#fffaf2}
.variant-home-food .section-grid span{color:#c65b2c}
@media(max-width:820px){.variant-home-food .section-grid{grid-template-columns:1fr}}`;
}
