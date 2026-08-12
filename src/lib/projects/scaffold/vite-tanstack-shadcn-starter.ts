import {
  SHADCN_BUTTON_FILE,
  SHADCN_CARD_FILE,
  SHADCN_COMPONENTS_JSON_FILE,
  SHADCN_UTILS_FILE,
} from "./shadcn-components";
import { shadcnThemeCss } from "./shadcn-theme";

import { PLATFORM_VITE_CONFIG } from "@/lib/projects/generated-build-policy";
import { type GeneratedProjectFile } from "@/lib/projects/generated-types";
import {
  LANDSCAPE_PLACEHOLDER_SVG,
  PORTRAIT_PLACEHOLDER_SVG,
} from "@/lib/projects/placeholders";
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
    { path: "public/placeholder.svg", content: LANDSCAPE_PLACEHOLDER_SVG },
    {
      path: "public/placeholder-vertical.svg",
      content: PORTRAIT_PLACEHOLDER_SVG,
    },
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
            "@radix-ui/react-accordion": "^1.2.17",
            "@radix-ui/react-alert-dialog": "^1.1.20",
            "@radix-ui/react-aspect-ratio": "^1.1.12",
            "@radix-ui/react-avatar": "^1.2.3",
            "@radix-ui/react-checkbox": "^1.3.8",
            "@radix-ui/react-collapsible": "^1.1.17",
            "@radix-ui/react-context-menu": "^2.3.4",
            "@radix-ui/react-dialog": "^1.1.20",
            "@radix-ui/react-dropdown-menu": "^2.1.21",
            "@radix-ui/react-hover-card": "^1.1.20",
            "@radix-ui/react-label": "^2.1.12",
            "@radix-ui/react-menubar": "^1.1.21",
            "@radix-ui/react-navigation-menu": "^1.2.19",
            "@radix-ui/react-popover": "^1.1.20",
            "@radix-ui/react-progress": "^1.1.13",
            "@radix-ui/react-radio-group": "^1.4.4",
            "@radix-ui/react-scroll-area": "^1.2.15",
            "@radix-ui/react-select": "^2.3.4",
            "@radix-ui/react-separator": "^1.1.12",
            "@radix-ui/react-slider": "^1.4.4",
            "@radix-ui/react-slot": "^1.3.0",
            "@radix-ui/react-switch": "^1.3.4",
            "@radix-ui/react-tabs": "^1.1.18",
            "@radix-ui/react-toggle": "^1.1.15",
            "@radix-ui/react-toggle-group": "^1.1.16",
            "@radix-ui/react-tooltip": "^1.2.13",
            "@tanstack/react-query": "^5.101.2",
            "@tanstack/react-router": "^1.170.17",
            "class-variance-authority": "^0.7.1",
            clsx: "^2.1.1",
            cmdk: "^1.1.1",
            "embla-carousel-react": "^8.6.0",
            "input-otp": "^1.4.2",
            "lucide-react": "^0.575.0",
            motion: "^12.42.0",
            "next-themes": "^0.4.6",
            react: "^19.2.7",
            "react-day-picker": "^10.0.1",
            "react-dom": "^19.2.7",
            "react-hook-form": "^7.82.0",
            "react-resizable-panels": "^4.12.2",
            sonner: "^2.0.7",
            "tailwind-merge": "^3.6.0",
            tailwindcss: "^4.0.0",
            vaul: "^1.1.2",
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
            tsBuildInfoFile: "./.cache/generated-app/tsconfig.app.tsbuildinfo",
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
            // TS 6.x emits a hard TS5101 error for `baseUrl`, which would
            // fail every generated project's `tsc -b && vite build`. Keep
            // `baseUrl` (the scaffold test asserts it; the @/ path alias
            // relies on it) but silence the deprecation per TS guidance.
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
            tsBuildInfoFile: "./.cache/generated-app/tsconfig.node.tsbuildinfo",
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
    SHADCN_UTILS_FILE,
    SHADCN_COMPONENTS_JSON_FILE,
    SHADCN_BUTTON_FILE,
    SHADCN_CARD_FILE,
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
      content: `import { usePreviewReady } from "@/lib/preview-ready";

export function HomeRouteComponent() {
  usePreviewReady();

  return <main data-generated-site-starter />;
}
`,
    },
    {
      path: "src/routes/not-found.tsx",
      content: `import { Button } from "@/components/ui/button";\n\nexport function NotFoundRouteComponent() {\n  return (\n    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6 py-16 text-center">\n      <p className="text-sm font-medium text-muted-foreground">404</p>\n      <h1 className="text-3xl font-semibold tracking-tight text-foreground">\n        Halaman tidak ditemukan\n      </h1>\n      <p className="text-base text-muted-foreground">\n        Halaman yang kamu cari tidak tersedia atau sudah dipindahkan.\n      </p>\n      <Button asChild>\n        <a href="#/">Kembali ke beranda</a>\n      </Button>\n    </main>\n  );\n}\n`,
    },
    {
      path: "src/content/site.ts",
      content: `export const site = ${JSON.stringify(normalizeSiteSchemaForEmit(schema), null, 2)};\nexport default site;\n`,
    },
    {
      path: "src/lib/preview-ready.ts",
      content: `import { useEffect } from "react";\n\nexport function usePreviewReady() {\n  useEffect(() => {\n    window.parent?.postMessage({ type: "generated-app-preview-ready" }, "*");\n  }, []);\n}\n`,
    },
  ];
}

export function toPackageName(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "generated-app"
  );
}

/**
 * Normalize a site schema before emitting `as const` so TS sees uniform
 * object shapes per array. `as const` narrows each array element to its
 * literal type, so arrays of objects with optional keys (e.g. paymentMethods
 * where only some entries carry `detail`) become a union where accessing the
 * optional key errors on members that lack it. Filling the missing keys with
 * empty strings makes every element share the same shape, so the generated
 * index route can safely read e.g. `pm.detail` without a TS error.
 */
function normalizeSiteSchemaForEmit(schema: ProjectSiteSchema): object {
  const normalized = structuredClone(schema);
  if (Array.isArray(normalized.paymentMethods)) {
    normalized.paymentMethods = normalized.paymentMethods.map((entry) => ({
      method: entry.method,
      detail: entry.detail ?? "",
    }));
  }
  if (Array.isArray(normalized.products)) {
    normalized.products = normalized.products.map((entry) => ({
      name: entry.name,
      description: entry.description ?? "",
      priceRange: entry.priceRange ?? "",
    }));
  }
  return normalized;
}
