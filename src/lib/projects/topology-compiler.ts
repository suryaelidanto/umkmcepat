// src/lib/projects/topology-compiler.ts
import type { BuildPlanV1 } from "./build-plan";

export type CompiledTopology = {
  protectedFiles: string[];
  files: Record<string, string>;
  routePatterns: string[];
  representativePaths: string[];
  manifest: Record<string, unknown>;
};

export function compileRoutePatterns(plan: BuildPlanV1): string[] {
  const patterns = plan.pages.map((p) => p.path);
  return patterns.length ? patterns : ["/"];
}

export function compileRepresentativePaths(plan: BuildPlanV1): string[] {
  return plan.pages.map((p) => p.representativePath ?? p.path);
}

export function buildAllowList(plan: BuildPlanV1): string[] {
  const paths = new Set<string>([
    "src/generated/site-shell.tsx",
    "src/generated/theme.css",
  ]);
  for (const page of plan.pages) {
    const slug =
      page.path === "/"
        ? "home"
        : page.path.replace(/^\//, "").replace(/[^a-z0-9-]/g, "");
    paths.add(`src/generated/pages/${slug}.tsx`);
  }
  paths.add("src/generated/components/**");
  paths.add("src/generated/content/**");
  return [...paths];
}

export function compileTopologyFiles(plan: BuildPlanV1): CompiledTopology {
  const routePatterns = compileRoutePatterns(plan);
  const representativePaths = compileRepresentativePaths(plan);
  const routeFiles: Record<string, string> = {};

  for (const page of plan.pages) {
    const slug =
      page.path === "/"
        ? "home"
        : page.path.replace(/^\//, "").replace(/[^a-z0-9-]/g, "");
    routeFiles[`src/generated/pages/${slug}.tsx`] = pageStub(
      page.title,
      page.purpose,
    );
  }

  const manifest = {
    runtimeProfile: "vite-react-tanstack-v1",
    templateId: "vite-react-tanstack-starter",
    projectId: "contract-v1",
    routes: routePatterns.map((path, i) => ({
      path,
      title: plan.pages[i]?.title ?? path,
    })),
    capabilities: plan.capabilities,
  };

  const router = `import { createHashHistory } from "@tanstack/react-router";
const routes = ${JSON.stringify(routePatterns)};
export const hashHistory = createHashHistory();
export const routePatterns = routes;
`;

  const root = `<SiteShell><Outlet /></SiteShell>`;

  const files: Record<string, string> = {
    "src/router.tsx": router,
    "src/routes/__root.tsx": root,
    "src/routes/not-found.tsx": `export default function NotFound() {
  return <main><a href="/">Beranda</a></main>;
}
`,
    "src/lib/preview-ready.ts": `export const previewReady = true;
`,
    "generated-app.manifest.json": JSON.stringify(manifest, null, 2),
    ...routeFiles,
  };

  return {
    protectedFiles: Object.keys(files),
    files,
    routePatterns,
    representativePaths,
    manifest,
  };
}

function pageStub(title: string, purpose: string): string {
  return `export default function Page() {
  return (
    <section data-page-title={${JSON.stringify(title)}}>
      <h1>${title}</h1>
      <p>${purpose}</p>
    </section>
  );
}
`;
}
