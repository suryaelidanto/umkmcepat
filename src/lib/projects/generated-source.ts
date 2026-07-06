import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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
        schemaVersion: 1,
        projectId,
        template: "vite-react-frontend-static-v1",
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

type ProjectSiteVariant =
  | "clean"
  | "editorial"
  | "retail"
  | "technical"
  | "warm";

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

  if (text.includes("laundry") || text.includes("bersih")) {
    return "clean";
  }

  if (
    text.includes("bengkel") ||
    text.includes("servis") ||
    text.includes("motor") ||
    text.includes("mobil")
  ) {
    return "technical";
  }

  if (
    text.includes("toko") ||
    text.includes("produk") ||
    text.includes("katalog") ||
    text.includes("frozen") ||
    text.includes("lauk") ||
    text.includes("camilan")
  ) {
    return "retail";
  }

  if (
    text.includes("angkringan") ||
    text.includes("nasi kucing") ||
    text.includes("hangat") ||
    text.includes("tradisional") ||
    text.includes("kayu")
  ) {
    return "warm";
  }

  return "editorial";
}

function createAppSource(variant: ProjectSiteVariant) {
  const shellClass = `site-shell variant-${variant}`;
  const showcaseClass =
    variant === "clean"
      ? "service-grid"
      : variant === "technical"
        ? "checklist-panel"
        : variant === "retail"
          ? "product-grid"
          : "menu-strip";

  return `import { useEffect } from "react";

import { site } from "./data/site";
import "./styles.css";

const shellClass = "${shellClass}";
const showcaseClass = "${showcaseClass}";

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
          <span>Penawaran utama</span>
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
          <h2>Siap melayani lewat langkah yang jelas.</h2>
        </div>
        <a className="primary" href="https://wa.me/">
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

function createVariantStyles(variant: ProjectSiteVariant) {
  if (variant === "warm") {
    return `.variant-warm .hero-card{box-shadow:14px 14px 0 color-mix(in srgb,currentColor 82%,transparent);background:linear-gradient(180deg,rgba(255,255,255,.78),rgba(255,246,232,.9))}
.menu-strip{display:grid;gap:10px}
.menu-strip p{margin:0;border-left:4px solid currentColor;border-radius:14px;background:rgba(255,255,255,.56);padding:13px 14px;line-height:1.45}
.variant-warm .section-grid span{color:#b7521b}`;
  }

  if (variant === "clean") {
    return `.variant-clean .hero{align-items:center}
.variant-clean .hero-card{background:linear-gradient(180deg,rgba(255,255,255,.88),rgba(235,250,246,.92));box-shadow:0 18px 60px rgba(18,33,29,.12)}
.service-grid{display:grid;grid-template-columns:1fr;gap:12px}
.service-grid p{margin:0;border:1px solid rgba(31,143,122,.18);border-radius:16px;background:rgba(255,255,255,.72);padding:14px;line-height:1.45}
.variant-clean .section-grid span{color:#1f8f7a}`;
  }

  if (variant === "technical") {
    return `.variant-technical .hero-card{background:#f7f7f4;box-shadow:inset 0 0 0 8px rgba(0,0,0,.04)}
.checklist-panel{display:grid;gap:12px}
.checklist-panel p{margin:0;border-radius:12px;background:#151715;color:white;padding:14px;line-height:1.45}
.variant-technical .section-grid span{color:#d3342f}`;
  }

  if (variant === "retail") {
    return `.variant-retail .hero-card{background:linear-gradient(180deg,rgba(255,255,255,.9),rgba(250,247,238,.9))}
.product-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.product-grid p{margin:0;min-height:92px;border:1px solid rgba(0,0,0,.1);border-radius:18px;background:white;padding:14px;line-height:1.45}
.variant-retail .section-grid span{color:#8d6b32}
@media(max-width:520px){.product-grid{grid-template-columns:1fr}}`;
  }

  return `.variant-editorial .hero-card{background:rgba(255,255,255,.72);box-shadow:0 18px 60px rgba(0,0,0,.12)}
.menu-strip{display:grid;gap:10px}
.menu-strip p{margin:0;border-bottom:1px solid rgba(0,0,0,.12);padding:0 0 12px;line-height:1.45}
.variant-editorial .section-grid span{color:#f05a28}`;
}
