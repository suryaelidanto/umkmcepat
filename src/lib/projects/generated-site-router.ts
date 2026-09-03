import type { GeneratedProjectFile } from "./generated-types";
export type GeneratedRouteBinding = {
  path: string;
  filePath: string;
  exportName: string;
};

export function generatedRouteBinding(path: string): GeneratedRouteBinding {
  return {
    path,
    filePath:
      path === "/" ? "src/routes/index.tsx" : `src/routes/${path.slice(1)}.tsx`,
    exportName: routeExportName(path),
  };
}

export function compileGeneratedSiteRouter(
  routes: readonly GeneratedRouteBinding[],
): GeneratedProjectFile {
  validateRoutes(routes);
  const imports = routes.map(
    (route) =>
      `import * as ${routeVariableName(route.path)}Module from ${JSON.stringify(routeImportPath(route))};`,
  );
  const componentResolutions = routes.map((route) => {
    const variable = routeVariableName(route.path);
    return `const ${route.exportName} =
  ${variable}Module.${route.exportName} ??
  (${variable}Module as { default?: typeof ${variable}Module.${route.exportName} }).default;`;
  });
  const definitions = routes.map((route) => {
    const variable = routeVariableName(route.path);
    return `const ${variable} = createRoute({
  getParentRoute: () => rootRoute,
  path: ${JSON.stringify(route.path)},
  component: ${route.exportName},
});`;
  });
  const routeVariables = routes.map((route) => routeVariableName(route.path));
  return {
    path: "src/router.tsx",
    content: `import { createHashHistory, createRoute, createRouter } from "@tanstack/react-router";

import { rootRoute } from "./routes/__root";
${imports.join("\n")}
import * as notFoundRouteModule from "./routes/not-found";

const NotFoundRouteComponent =
  notFoundRouteModule.NotFoundRouteComponent ??
  (notFoundRouteModule as { default?: typeof notFoundRouteModule.NotFoundRouteComponent })
    .default;

${componentResolutions.join("\n")}

${definitions.join("\n\n")}
const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "*",
  component: NotFoundRouteComponent,
});

const routeTree = rootRoute.addChildren([${routeVariables.join(", ")}, notFoundRoute]);
const history = createHashHistory();

export const router = createRouter({ history, routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
`,
  };
}

function validateRoutes(routes: readonly GeneratedRouteBinding[]): void {
  if (routes.length < 1 || routes.length > 3) {
    throw new Error("generated site router supports one to three routes");
  }
  if (routes[0]?.path !== "/") {
    throw new Error("generated site router requires the root route first");
  }
  const paths = new Set<string>();
  const variables = new Set<string>();
  for (const route of routes) {
    if (route.path.includes(":")) {
      throw new Error("dynamic routes are unsupported");
    }
    if (route.path.includes("*")) {
      throw new Error("wildcard routes are unsupported");
    }
    if (
      !/^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(route.path) &&
      route.path !== "/"
    ) {
      throw new Error(`unsafe route path: ${route.path}`);
    }
    if (paths.has(route.path)) {
      throw new Error(`duplicate route: ${route.path}`);
    }
    paths.add(route.path);
    const expectedFilePath =
      route.path === "/"
        ? "src/routes/index.tsx"
        : `src/routes/${route.path.slice(1)}.tsx`;
    if (route.filePath !== expectedFilePath) {
      throw new Error(`route binding file mismatch: ${route.path}`);
    }
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(route.exportName)) {
      throw new Error(`unsafe route export: ${route.exportName}`);
    }
    if (route.path === "/" && route.exportName !== "HomeRouteComponent") {
      throw new Error("root route export must be HomeRouteComponent");
    }
    const variable = routeVariableName(route.path);
    if (variables.has(variable)) {
      throw new Error(`duplicate route variable: ${variable}`);
    }
    variables.add(variable);
  }
}

function routeImportPath(route: GeneratedRouteBinding): string {
  return `./${route.filePath.replace(/^src\//, "").replace(/\.tsx$/, "")}`;
}

function routeVariableName(path: string): string {
  if (path === "/") {
    return "indexRoute";
  }
  const words = path
    .slice(1)
    .split("/")
    .flatMap((word) => word.split("-"))
    .map((word) => `${word.charAt(0).toLowerCase()}${word.slice(1)}`);
  return `${words.join("")}Route`;
}

function routeExportName(path: string): string {
  if (path === "/") {
    return "HomeRouteComponent";
  }
  const words = path
    .slice(1)
    .split("/")
    .flatMap((word) => word.split("-"))
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`);
  return `${words.join("")}RouteComponent`;
}
