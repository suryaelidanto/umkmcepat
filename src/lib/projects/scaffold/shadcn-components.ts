import fs from "node:fs";
import path from "node:path";

import type { GeneratedProjectFile } from "@/lib/projects/generated-types";

const REGISTRY_DIRECTORY = path.resolve(
  process.cwd(),
  "src/lib/projects/scaffold/shadcn-registry",
);
const LOCAL_IMPORT_PATTERN =
  /from\s+["']@\/(components\/ui|hooks|lib)\/([a-z0-9-]+)["']/g;
const OFFICIAL_SOURCE_PATTERN = /\.(?:ts|tsx)$/;

function readRegistryFromDisk(
  directory: string = REGISTRY_DIRECTORY,
): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      Object.assign(sources, readRegistryFromDisk(absolutePath));
      continue;
    }
    if (
      entry.name === "components.json" ||
      OFFICIAL_SOURCE_PATTERN.test(entry.name)
    ) {
      const relativePath = path
        .relative(REGISTRY_DIRECTORY, absolutePath)
        .replace(/\\/g, "/");
      sources[relativePath] = fs.readFileSync(absolutePath, "utf8");
    }
  }
  return sources;
}

const bundledRegistry =
  typeof import.meta.glob === "function"
    ? import.meta.glob<string>("./shadcn-registry/**/*.{ts,tsx,json}", {
        eager: true,
        import: "default",
        query: "?raw",
      })
    : undefined;

function loadOfficialSources(): Record<string, string> {
  if (!bundledRegistry) {
    return readRegistryFromDisk();
  }

  return Object.fromEntries(
    Object.entries(bundledRegistry).map(([modulePath, content]) => [
      modulePath.replace(/^\.\/shadcn-registry\//, ""),
      content,
    ]),
  );
}

function toProjectPath(registryPath: string): string {
  if (registryPath === "components.json") {
    return registryPath;
  }
  return `src/${registryPath}`;
}

export const SHADCN_COMPONENT_FILES: GeneratedProjectFile[] = Object.entries(
  loadOfficialSources(),
)
  .map(([registryPath, content]) => ({
    content:
      registryPath === "components.json"
        ? content.replace('"css": "src/styles.css"', '"css": "src/index.css"')
        : content,
    path: toProjectPath(registryPath),
  }))
  .sort((left, right) => left.path.localeCompare(right.path));

const UI_PATH_PREFIX = "src/components/ui/";

export const SHADCN_COMPONENT_BY_NAME = new Map<string, GeneratedProjectFile>(
  SHADCN_COMPONENT_FILES.flatMap((file) => {
    if (!file.path.startsWith(UI_PATH_PREFIX) || !file.path.endsWith(".tsx")) {
      return [];
    }
    const name = file.path.slice(UI_PATH_PREFIX.length, -".tsx".length);
    return [[name, file] as const];
  }),
);

const SHADCN_SOURCE_BY_IMPORT = new Map<string, GeneratedProjectFile>(
  SHADCN_COMPONENT_FILES.flatMap((file) => {
    const match = file.path.match(
      /^src\/(components\/ui|hooks)\/([a-z0-9-]+)\.(?:ts|tsx)$/,
    );
    return match ? [[`${match[1]}/${match[2]}`, file] as const] : [];
  }),
);

export function resolveShadcnDeps(
  file: GeneratedProjectFile,
  present: GeneratedProjectFile[],
): GeneratedProjectFile[] {
  const presentPaths = new Set(present.map((candidate) => candidate.path));
  const ordered: GeneratedProjectFile[] = [];
  const visited = new Set<string>();

  function visit(current: GeneratedProjectFile) {
    if (visited.has(current.path)) {
      return;
    }
    visited.add(current.path);

    for (const match of current.content.matchAll(LOCAL_IMPORT_PATTERN)) {
      const dependency = SHADCN_SOURCE_BY_IMPORT.get(`${match[1]}/${match[2]}`);
      if (
        !dependency ||
        presentPaths.has(dependency.path) ||
        dependency.path === current.path
      ) {
        continue;
      }
      visit(dependency);
    }

    if (!presentPaths.has(current.path) && current.path !== file.path) {
      ordered.push(current);
    }
  }

  visit(file);
  return ordered;
}

export const SHADCN_UTILS_FILE = SHADCN_COMPONENT_FILES.find(
  (file) => file.path === "src/lib/utils.ts",
)!;
export const SHADCN_COMPONENTS_JSON_FILE = SHADCN_COMPONENT_FILES.find(
  (file) => file.path === "components.json",
)!;
export const SHADCN_BUTTON_FILE = SHADCN_COMPONENT_BY_NAME.get("button")!;
export const SHADCN_CARD_FILE = SHADCN_COMPONENT_BY_NAME.get("card")!;
