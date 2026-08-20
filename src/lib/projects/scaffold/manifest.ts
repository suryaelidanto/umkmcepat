// src/lib/projects/scaffold/manifest.ts
import { SHADCN_COMPONENT_BY_NAME } from "./shadcn-components";

import type { GeneratedProjectFile } from "@/lib/projects/generated-types";

export type ScaffoldManifest = {
  availableComponents: string[];
  contract: {
    indexRouteShape: string;
    rootLayout: string;
    routerRegistration: string;
  };
  fileTree: string[];
  preSeededComponents: string[];
  themeTokens: string[];
};

const SHADCN_UI_PATH_PATTERN = /^src\/components\/ui\/([a-z0-9-]+)\.tsx$/;
const TOKEN_PATTERN = /(--[a-z0-9-]+)\s*:/gi;

function extract(content: string, fromMark: string, toMark?: string): string {
  const start = content.indexOf(fromMark);
  if (start < 0) {
    return "";
  }
  if (!toMark) {
    return fromMark;
  }
  const end = content.indexOf(toMark, start);
  if (end < 0) {
    return content.slice(start);
  }
  return content.slice(start, end + toMark.length);
}

export function deriveScaffoldManifest(
  starterFiles: GeneratedProjectFile[],
): ScaffoldManifest {
  const fileTree = starterFiles.map((file) => file.path);
  const byPath = new Map(starterFiles.map((file) => [file.path, file]));

  const preSeededComponents = starterFiles
    .map((file) => file.path.match(SHADCN_UI_PATH_PATTERN)?.[1])
    .filter((name): name is string => Boolean(name));

  const cssContent = byPath.get("src/index.css")?.content ?? "";
  const themeTokens = [
    ...new Set(
      [...cssContent.matchAll(TOKEN_PATTERN)].map((match) =>
        match[1].toLowerCase(),
      ),
    ),
  ].sort();

  const mainTsx = byPath.get("src/main.tsx")?.content ?? "";
  const rootTsx = byPath.get("src/routes/__root.tsx")?.content ?? "";
  const indexTsx = byPath.get("src/routes/index.tsx")?.content ?? "";

  return {
    availableComponents: [...SHADCN_COMPONENT_BY_NAME.keys()].sort(),
    contract: {
      // Stable anchors only: the manifest is a descriptor for the prompt,
      routerRegistration: extract(
        mainTsx,
        'import { router } from "./router";',
      ),
      rootLayout: extract(rootTsx, "export const rootRoute", "});"),
      indexRouteShape: extract(
        indexTsx,
        "export function HomeRouteComponent() {",
      ),
    },
    fileTree,
    preSeededComponents,
    themeTokens,
  };
}
