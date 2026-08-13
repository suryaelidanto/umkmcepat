import type { GeneratedSiteQualityProofV2 } from "@/lib/projects/generated-site-quality-proof";

import { validateGeneratedAppManifest } from "@/lib/projects/generated-app-manifest";
import { PLATFORM_VITE_CONFIG } from "@/lib/projects/generated-build-policy";
import { type GeneratedProjectFile } from "@/lib/projects/generated-types";
import { shadcnThemeCss } from "@/lib/projects/scaffold/shadcn-theme";
import {
  createViteTanStackShadcnStarterFiles,
  toPackageName,
} from "@/lib/projects/scaffold/vite-tanstack-shadcn-starter";
import { type ProjectSiteSchema } from "@/lib/projects/site-schema";

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function createGeneratedViteTanStackStarterFiles(
  projectId: string,
  schema: ProjectSiteSchema,
): GeneratedProjectFile[] {
  return createViteTanStackShadcnStarterFiles(projectId, schema);
}

export function createGeneratedProjectFiles(
  projectId: string,
  schema: ProjectSiteSchema,
): GeneratedProjectFile[] {
  return createGeneratedViteTanStackProjectFiles(projectId, schema);
}

// Emits ONE stylesheet contract (src/index.css) matching the starter: the
// shadcn theme (shadcnThemeCss) prepended to the variant's custom classes.
// main.tsx imports ./index.css. The legacy src/styles.css is retired.
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
      content: PLATFORM_VITE_CONFIG,
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
        },
        include: ["src"],
      }),
    },
    {
      path: "tsconfig.node.json",
      content: json({
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
      content: `import { RouterProvider } from "@tanstack/react-router";\nimport { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\n\nimport { router } from "./router";\nimport "./index.css";\n\ncreateRoot(document.getElementById("root")!).render(\n  <StrictMode>\n    <RouterProvider router={router} />\n  </StrictMode>,\n);\n`,
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
      path: "src/index.css",
      content: `${shadcnThemeCss(schema)}\n${createCustomProjectStyles(variant, schema)}`,
    },
  ];
}

type BusinessRouteModule = {
  files: GeneratedProjectFile[];
  imports: string;
  routeDefinitions: string;
  routeNames: string[];
  routes: Array<{ path: string; title: string }>;
};

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

export type GeneratedSiteQualityProofV1 = {
  version: 1;
  contractHash: string;
  planHash: string;
  recipeId: string;
  recipeVersion: number;
  exampleId: string;
  designPlanVersion: number | null;
  sourceGateStatus: "pass" | "fail";
  browserGateStatus: "pass" | "fail" | "infrastructure_error";
  riskStatus: "clean" | "risky";
  criticStatus: "not_invoked" | "complete" | "unknown" | "unavailable";
  visualRepairCount: 0 | 1;
  outcome: "pass" | "fail";
  timingsMs: { writer: number; build: number; qualification: number };
};

export function createGeneratedSourceSnapshotMetadata(
  files: GeneratedProjectFile[],
  schema: ProjectSiteSchema,
  generation?: {
    buildSpec?: string;
    generationMode?:
      "agent-custom" | "agent-partial" | "loop-detected" | "retry_build";
    operationTrace?: Array<{
      detail: string;
      path?: string;
      state: string;
      title: string;
      type: string;
    }>;
    repairAttempts?: number;
    qualityProof?: GeneratedSiteQualityProofV1 | GeneratedSiteQualityProofV2;
    referenceCalibratedQualityProof?: GeneratedSiteQualityProofV2;
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
          qualityProof: generation.qualityProof,
          referenceCalibratedQualityProof:
            generation.referenceCalibratedQualityProof,
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
