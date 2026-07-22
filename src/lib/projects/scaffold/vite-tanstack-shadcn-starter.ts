import { SHADCN_COMPONENT_FILES } from "./shadcn-components";
import { shadcnThemeCss } from "./shadcn-theme";

import { PLATFORM_VITE_CONFIG } from "@/lib/projects/generated-build-policy";
import { type GeneratedProjectFile } from "@/lib/projects/generated-types";
import { type ProjectSiteSchema } from "@/lib/projects/site-schema";

/**
 * shadcn-seeded locked-stack scaffold for generated UMKM apps.
 *
 * Stack: Vite + React 19 + TanStack Router (hash history, static,
 * multi-page) + Tailwind CSS v4 (@tailwindcss/vite, CSS-first, no
 * tailwind.config.js) + shadcn/ui ("new-york", source-copied components).
 *
 * The AI composes known-good shadcn components instead of inventing
 * structure from a blank canvas — the reliability lever behind broken-CSS
 * and stale-placeholder output. Step 9 downstream tests (Task 2) repoint
 * src/styles.css references to src/index.css where needed.
 */
export function createViteTanStackShadcnStarterFiles(
  _projectId: string,
  schema: ProjectSiteSchema,
): GeneratedProjectFile[] {
  return [
    {
      path: "package.json",
      content: JSON.stringify(
        {
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
            "@radix-ui/react-label": "^2.1.2",
            "@radix-ui/react-separator": "^1.1.2",
            "@radix-ui/react-slot": "^1.1.2",
            "@tanstack/react-query": "^5.101.2",
            "@tanstack/react-router": "^1.170.17",
            "class-variance-authority": "^0.7.1",
            clsx: "^2.1.1",
            "lucide-react": "^0.575.0",
            react: "^19.2.7",
            "react-dom": "^19.2.7",
            "tailwind-merge": "^3.6.0",
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
        },
        null,
        2,
      ),
    },
    { path: "vite.config.ts", content: PLATFORM_VITE_CONFIG },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          files: [],
          references: [
            { path: "./tsconfig.app.json" },
            { path: "./tsconfig.node.json" },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: "tsconfig.app.json",
      content: JSON.stringify(
        {
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
            baseUrl: ".",
            paths: {
              "@/*": ["./src/*"],
            },
          },
          include: ["src"],
        },
        null,
        2,
      ),
    },
    {
      path: "tsconfig.node.json",
      content: JSON.stringify(
        {
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
        },
        null,
        2,
      ),
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
      content: `import { RouterProvider } from "@tanstack/react-router";\nimport { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\n\nimport { router } from "./router";\nimport "./index.css";\n\ncreateRoot(document.getElementById("root")!).render(\n  <StrictMode>\n    <RouterProvider router={router} />\n  </StrictMode>,\n);\n`,
    },
    { path: "src/index.css", content: shadcnThemeCss(schema) },
    ...SHADCN_COMPONENT_FILES,
    {
      path: "src/router.tsx",
      content: `import { createHashHistory, createRoute, createRouter } from "@tanstack/react-router";\n\nimport { rootRoute } from "./routes/__root";\nimport { HomeRouteComponent } from "./routes/index";\nimport { NotFoundRouteComponent } from "./routes/not-found";\n\nconst indexRoute = createRoute({\n  getParentRoute: () => rootRoute,\n  path: "/",\n  component: HomeRouteComponent,\n});\n\nconst notFoundRoute = createRoute({\n  getParentRoute: () => rootRoute,\n  path: "*",\n  component: NotFoundRouteComponent,\n});\n\nconst routeTree = rootRoute.addChildren([indexRoute, notFoundRoute]);\nconst history = createHashHistory();\n\nexport const router = createRouter({ history, routeTree });\n\ndeclare module "@tanstack/react-router" {\n  interface Register {\n    router: typeof router;\n  }\n}\n`,
    },
    {
      path: "src/routes/__root.tsx",
      content: `import { createRootRoute, Outlet } from "@tanstack/react-router";\n\nexport const rootRoute = createRootRoute({\n  component: () => <Outlet />,\n});\n`,
    },
    {
      path: "src/routes/index.tsx",
      content: `import { ArrowRight } from "lucide-react";\n\nimport { Button } from "@/components/ui/button";\nimport { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";\nimport { site } from "@/content/site";\nimport { usePreviewReady } from "@/lib/preview-ready";\n\n// Replace this with the real home page built from the brief\nexport function HomeRouteComponent() {\n  usePreviewReady();\n\n  return (\n    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 py-16">\n      <p className="text-sm font-medium text-muted-foreground">\n        {site.eyebrow}\n      </p>\n      <h1 className="text-center text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">\n        {site.headline}\n      </h1>\n      <p className="max-w-xl text-center text-base text-muted-foreground">\n        {site.subheadline}\n      </p>\n      <div className="flex flex-wrap items-center justify-center gap-3">\n        <Button size="lg" asChild>\n          <a href="#kontak">\n            {site.primaryCta}\n            <ArrowRight className="size-4" />\n          </a>\n        </Button>\n        <Button size="lg" variant="outline">\n          {site.secondaryCta}\n        </Button>\n      </div>\n      <Card className="mt-4 w-full max-w-xl">\n        <CardHeader>\n          <CardTitle>{site.businessName}</CardTitle>\n          <CardDescription>{site.offer}</CardDescription>\n        </CardHeader>\n        <CardContent>\n          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">\n            {site.trustPoints.map((point) => (\n              <li key={point}>{point}</li>\n            ))}\n          </ul>\n        </CardContent>\n      </Card>\n    </main>\n  );\n}\n`,
    },
    {
      path: "src/routes/not-found.tsx",
      content: `import { Button } from "@/components/ui/button";\n\nexport function NotFoundRouteComponent() {\n  return (\n    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6 py-16 text-center">\n      <p className="text-sm font-medium text-muted-foreground">404</p>\n      <h1 className="text-3xl font-semibold tracking-tight text-foreground">\n        Halaman tidak ditemukan\n      </h1>\n      <p className="text-base text-muted-foreground">\n        Halaman yang kamu cari tidak tersedia atau sudah dipindahkan.\n      </p>\n      <Button asChild>\n        <a href="#/">Kembali ke beranda</a>\n      </Button>\n    </main>\n  );\n}\n`,
    },
    {
      path: "src/content/site.ts",
      content: `export const site = ${JSON.stringify(schema, null, 2)} as const;\nexport default site;\n`,
    },
    {
      path: "src/lib/preview-ready.ts",
      content: `import { useEffect } from "react";\n\nexport function usePreviewReady() {\n  useEffect(() => {\n    window.parent?.postMessage({ type: "generated-app-preview-ready" }, "*");\n  }, []);\n}\n`,
    },
  ];
}

function toPackageName(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "generated-app"
  );
}
