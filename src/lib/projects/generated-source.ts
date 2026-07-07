import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { validateGeneratedAppManifest } from "@/lib/projects/generated-app-manifest";
import { validateGeneratedPackagePolicy } from "@/lib/projects/generated-package-policy";

import { type ProjectSiteSchema } from "./site-schema";

export type GeneratedProjectFile = {
  path: string;
  content: string;
};

export type GeneratedDistFile = {
  content: string;
  contentType: string;
  path: string;
};

export type BuildGeneratedProjectResult = {
  distFiles: GeneratedDistFile[];
  ok: boolean;
  log: string;
};

const MAX_LOG_LENGTH = 20_000;
const BUILD_TIMEOUT_MS = 180_000;

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
    filePath === ".env" ||
    filePath.startsWith(".env.") ||
    filePath.includes("/node_modules/") ||
    filePath.startsWith("node_modules/")
  ) {
    throw new Error(`Unsafe generated file path: ${filePath}`);
  }
}

export async function buildGeneratedProject(
  files: GeneratedProjectFile[],
): Promise<BuildGeneratedProjectResult> {
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

  const packagePolicyResult = validateGeneratedPackagePolicy(
    files,
    manifestResult.manifest.runtimeProfile,
  );

  if (!packagePolicyResult.ok) {
    return {
      distFiles: [],
      ok: false,
      log: `Generated app package policy failed preflight:\n${packagePolicyResult.issues
        .map((issue) => `- ${issue}`)
        .join("\n")}`,
    };
  }

  const root = await mkdir(path.join(tmpdir(), "umkmcepat-build-"), {
    recursive: true,
  }).then(() => path.join(tmpdir(), `umkmcepat-build-${crypto.randomUUID()}`));
  await mkdir(root, { recursive: true });

  try {
    for (const file of files) {
      assertSafeProjectFilePath(file.path);
      const target = path.resolve(root, file.path);

      if (!target.startsWith(`${root}${path.sep}`)) {
        throw new Error(`Unsafe generated file path: ${file.path}`);
      }

      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content, "utf8");
    }

    const install = await runCommand(["bun", "install"], root);

    if (!install.ok) {
      return { ...install, distFiles: [] };
    }

    const build = await runCommand(["bun", "run", "build"], root);
    const distFiles = build.ok
      ? await collectDistFiles(path.join(root, "dist"))
      : [];
    return {
      distFiles,
      ok: build.ok,
      log: [install.log, build.log].filter(Boolean).join("\n"),
    };
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

async function runCommand(
  command: string[],
  cwd: string,
): Promise<BuildGeneratedProjectResult> {
  return await new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "production",
      },
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const timeout = setTimeout(() => {
      child.kill();
      resolve({
        distFiles: [],
        ok: false,
        log: truncateLog(`${output}\nBuild timed out.`),
      });
    }, BUILD_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({
        distFiles: [],
        ok: false,
        log: truncateLog(`${output}\n${error.message}`),
      });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        distFiles: [],
        ok: code === 0,
        log: truncateLog(output.trim()),
      });
    });
  });
}

function truncateLog(value: string) {
  return value.length > MAX_LOG_LENGTH
    ? `${value.slice(0, MAX_LOG_LENGTH)}\n...[truncated]`
    : value;
}

async function collectDistFiles(root: string): Promise<GeneratedDistFile[]> {
  const files: GeneratedDistFile[] = [];

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

export function createGeneratedProjectFiles(
  projectId: string,
  schema: ProjectSiteSchema,
): GeneratedProjectFile[] {
  const variant = getProjectSiteVariant(schema);

  return [
    {
      path: ".umkmcepat/project.json",
      content: json({
        buildCommand: "bun run build",
        capabilities: getProjectCapabilities(schema),
        outputDirectory: "dist",
        packageManager: "bun",
        projectId,
        routes: [{ path: "/", title: schema.businessName || "Beranda" }],
        runtimeProfile: "static-react-v1",
        schemaVersion: "1",
        templateId: "vite-react-frontend-static",
        templateVersion: "1.0.0",
        variant,
      }),
    },
    {
      path: "package.json",
      content: json({
        name:
          schema.businessName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "umkm-website",
        private: true,
        type: "module",
        scripts: {
          dev: "vite dev",
          build: "vite build",
          preview: "vite preview",
        },
        dependencies: {
          "@vitejs/plugin-react": "5.2.0",
          vite: "8.0.16",
          typescript: "5.8.3",
          react: "19.2.0",
          "react-dom": "19.2.0",
          tailwindcss: "4.2.1",
          "@tailwindcss/vite": "4.2.1",
          "lucide-react": "0.575.0",
        },
        devDependencies: {},
      }),
    },
    {
      path: "vite.config.ts",
      content: `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nimport tailwindcss from "@tailwindcss/vite";\n\nexport default defineConfig({ base: "./", plugins: [react(), tailwindcss()] });\n`,
    },
    {
      path: "src/data/site.ts",
      content: `export const site = ${json(schema)} as const;\n`,
    },
    {
      path: "src/App.tsx",
      content: createAppSource(variant),
    },
    {
      path: "src/main.tsx",
      content: `import { createRoot } from "react-dom/client";\nimport App from "./App";\n\ncreateRoot(document.getElementById("root")!).render(<App />);\n`,
    },
    {
      path: "index.html",
      content: `<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n`,
    },
    {
      path: "src/styles.css",
      content: createStyles(variant),
    },
    {
      path: "AGENTS.md",
      content:
        "# Generated UMKM Cepat project\n\nKeep this project static/frontend-only unless the owner explicitly enables backend features. Use Bun. Prefer Tailwind/CSS and React components. Do not add dependencies without a real need.\n",
    },
  ];
}

export function createGeneratedSourceSnapshotMetadata(
  files: GeneratedProjectFile[],
  schema: ProjectSiteSchema,
) {
  const manifestResult = validateGeneratedAppManifest(files);
  const manifest = manifestResult.ok ? manifestResult.manifest : null;

  return {
    manifest,
    manifestIssues: manifestResult.ok ? [] : manifestResult.issues,
    origin: {
      generator: "site-schema",
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

function getProjectCapabilities(schema: ProjectSiteSchema) {
  const text = [
    schema.businessName,
    schema.primaryCta,
    schema.secondaryCta,
    schema.offer,
    ...schema.trustPoints,
    ...schema.sections.flatMap((section) => [section.title, section.body]),
  ]
    .join(" ")
    .toLowerCase();
  const capabilities = new Set(["lead_intent", "static_content"]);

  if (/\b(wa|whatsapp)\b/i.test(text)) {
    capabilities.add("whatsapp_cta");
  }

  if (/(alamat|lokasi|maps|map|google maps)/i.test(text)) {
    capabilities.add("location");
  }

  if (/(harga|katalog|menu|paket|produk|layanan)/i.test(text)) {
    capabilities.add("catalog");
  }

  if (/(payment link|link pembayaran|bayar)/i.test(text)) {
    capabilities.add("payment_link_placeholder");
  }

  return [...capabilities].sort();
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

function createAppSource(variant: ProjectSiteVariant) {
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
    window.parent?.postMessage({ type: "umkmcepat-preview-ready" }, "*");
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

function createStyles(variant: ProjectSiteVariant) {
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
