import { type ProjectSiteSchema } from "./site-schema";

export type GeneratedProjectFile = {
  path: string;
  content: string;
};

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
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
        generatedAt: new Date(0).toISOString(),
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
          "@vitejs/plugin-react": "latest",
          vite: "latest",
          typescript: "latest",
          react: "latest",
          "react-dom": "latest",
          tailwindcss: "latest",
          "@tailwindcss/vite": "latest",
          "lucide-react": "latest",
        },
        devDependencies: {},
      }),
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
      content: `*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif}main{min-height:100dvh}.nav{display:flex;justify-content:space-between;padding:24px clamp(20px,5vw,72px);border-bottom:1px solid rgba(0,0,0,.1)}.hero{display:grid;grid-template-columns:1.15fr .85fr;gap:48px;padding:clamp(40px,8vw,112px) clamp(20px,5vw,72px)}.eyebrow{text-transform:uppercase;letter-spacing:.16em;font-weight:700;font-size:13px}h1{max-width:850px;font-size:clamp(56px,9vw,120px);line-height:.86;letter-spacing:-.08em;margin:20px 0}h2{letter-spacing:-.05em}.lead{max-width:620px;font-size:22px;line-height:1.55;opacity:.72}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:32px}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;border-radius:14px;padding:14px 20px;text-decoration:none;font-weight:700}.primary{background:#111;color:white}.secondary{border:1px solid rgba(0,0,0,.16);color:inherit}.offer{border-radius:34px;padding:32px;min-height:420px;background:linear-gradient(145deg,rgba(255,255,255,.9),rgba(255,255,255,.48));box-shadow:inset 24px 0 80px rgba(255,94,39,.18),18px 18px 0 rgba(0,0,0,.78)}.offer h2{font-size:36px}.offer li{margin:10px 0}.sections{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;padding:0 clamp(20px,5vw,72px) 72px}.sections article{border:1px solid rgba(0,0,0,.1);border-radius:24px;padding:28px;background:rgba(255,255,255,.55)}.sections span{font-size:12px;font-weight:800;color:#ff5e27}.sections p{line-height:1.7;opacity:.72}.cta{margin:0 clamp(20px,5vw,72px) 72px;border-radius:32px;padding:40px;background:#111;color:white}.cta h2{font-size:40px;max-width:720px}@media(max-width:760px){.nav,.hero{display:block}.offer{margin-top:36px;min-height:320px}.sections{grid-template-columns:1fr}h1{font-size:56px}}\n`,
    },
    {
      path: "AGENTS.md",
      content:
        "# Generated UMKM Cepat project\n\nKeep this project static/frontend-only unless the owner explicitly enables backend features. Use Bun. Prefer Tailwind/CSS and React components. Do not add dependencies without a real need.\n",
    },
  ];
}
