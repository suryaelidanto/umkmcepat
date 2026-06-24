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
  return [
    {
      path: ".umkmcepat/project.json",
      content: json({
        schemaVersion: 1,
        projectId,
        template: "vite-react-frontend-static-v1",
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
      content: `import { site } from "./data/site";\nimport "./styles.css";\n\nexport default function App() {\n  return (\n    <main style={{ background: site.theme.background, color: site.theme.foreground }}>\n      <nav className="nav">\n        <strong>{site.businessName}</strong>\n        <span>{site.audience}</span>\n      </nav>\n      <section className="hero">\n        <div>\n          <p className="eyebrow" style={{ color: site.theme.accent }}>{site.eyebrow}</p>\n          <h1>{site.headline}</h1>\n          <p className="lead">{site.subheadline}</p>\n          <div className="actions">\n            <a className="primary" href="#contact">{site.primaryCta}</a>\n            <a className="secondary" href="#details">{site.secondaryCta}</a>\n          </div>\n        </div>\n        <aside className="offer">\n          <span>Penawaran utama</span>\n          <h2>{site.offer}</h2>\n          <ul>{site.trustPoints.map((point) => <li key={point}>{point}</li>)}</ul>\n        </aside>\n      </section>\n      <section id="details" className="sections">\n        {site.sections.map((section, index) => (\n          <article key={section.title}>\n            <span>{String(index + 1).padStart(2, "0")}</span>\n            <h2>{section.title}</h2>\n            <p>{section.body}</p>\n          </article>\n        ))}\n      </section>\n      <section id="contact" className="cta">\n        <h2>Siap bantu pelanggan mengambil langkah berikutnya.</h2>\n        <a className="primary" href="https://wa.me/">{site.primaryCta}</a>\n      </section>\n    </main>\n  );\n}\n`,
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
      content: `@import "tailwindcss";\n*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif}main{min-height:100dvh}.nav{display:flex;justify-content:space-between;padding:24px clamp(20px,5vw,72px);border-bottom:1px solid rgba(0,0,0,.1)}.hero{display:grid;grid-template-columns:1.15fr .85fr;gap:48px;padding:clamp(40px,8vw,112px) clamp(20px,5vw,72px)}.eyebrow{text-transform:uppercase;letter-spacing:.16em;font-weight:700;font-size:13px}h1{max-width:850px;font-size:clamp(56px,9vw,120px);line-height:.86;letter-spacing:-.08em;margin:20px 0}h2{letter-spacing:-.05em}.lead{max-width:620px;font-size:22px;line-height:1.55;opacity:.72}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:32px}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;border-radius:14px;padding:14px 20px;text-decoration:none;font-weight:700}.primary{background:#111;color:white}.secondary{border:1px solid rgba(0,0,0,.16);color:inherit}.offer{border-radius:34px;padding:32px;min-height:420px;background:linear-gradient(145deg,rgba(255,255,255,.9),rgba(255,255,255,.48));box-shadow:inset 24px 0 80px rgba(255,94,39,.18),18px 18px 0 rgba(0,0,0,.78)}.offer h2{font-size:36px}.offer li{margin:10px 0}.sections{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;padding:0 clamp(20px,5vw,72px) 72px}.sections article{border:1px solid rgba(0,0,0,.1);border-radius:24px;padding:28px;background:rgba(255,255,255,.55)}.sections span{font-size:12px;font-weight:800;color:#ff5e27}.sections p{line-height:1.7;opacity:.72}.cta{margin:0 clamp(20px,5vw,72px) 72px;border-radius:32px;padding:40px;background:#111;color:white}.cta h2{font-size:40px;max-width:720px}@media(max-width:760px){.nav,.hero{display:block}.offer{margin-top:36px;min-height:320px}.sections{grid-template-columns:1fr}h1{font-size:56px}}\n`,
    },
    {
      path: "AGENTS.md",
      content:
        "# Generated UMKM Cepat project\n\nKeep this project static/frontend-only unless the owner explicitly enables backend features. Use Bun. Prefer Tailwind/CSS and React components. Do not add dependencies without a real need.\n",
    },
  ];
}
