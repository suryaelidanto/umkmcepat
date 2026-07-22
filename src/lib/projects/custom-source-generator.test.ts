import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyStylesCoverStubs,
  buildGeneratedAppAgentInstructions,
  buildGeneratedAppBuildSpec,
  checkAgentSourceQuality,
  cssCoversClassName,
  ensurePreviewReadyCalled,
  ensureRouterRouteWired,
  ensureStylesFileExists,
  extractClassNamesFromTsx,
  findMissingCssClasses,
  generateCustomProjectFilesWithAgent,
  getTailwindCssRule,
  isStarterStylesContent,
} from "@/lib/projects/custom-source-generator";
import { createGeneratedViteTanStackStarterFiles } from "@/lib/projects/generated-source";
import {
  createProjectSiteSchemaFromBrief,
  type ProjectSiteSchema,
} from "@/lib/projects/site-schema";

const agentGenerate = vi.fn();

vi.mock("ai", () => {
  return {
    isStepCount: () => () => false,
    tool: (config: unknown) => config,
    ToolLoopAgent: class ToolLoopAgent {
      tools: Record<string, { execute: (input: never) => unknown }>;

      constructor(config: {
        tools: Record<string, { execute: (input: never) => unknown }>;
      }) {
        this.tools = config.tools;
      }

      generate(input: unknown) {
        return agentGenerate(this.tools, input);
      }
    },
  };
});

vi.mock("@/lib/ai", () => ({
  getAiModel: () => "test-model",
  getAiTelemetry: () => ({ isEnabled: false }),
}));

vi.mock("@/lib/ai-agent-steps", () => ({
  getAgentMaxSteps: (key: "generate" | "repair") =>
    key === "generate" ? 50 : 12,
}));

function schema() {
  return createProjectSiteSchemaFromBrief({
    businessName: "Bengkel Maju",
    businessType: "Bengkel motor",
    contactOrCta: "Booking lewat WhatsApp",
    notes: [],
    offer: "Servis ringan, ganti oli, ban, aki, kelistrikan",
    prompt: "buatkan website bengkel motor",
    stylePreference: "Modern teknis",
    targetCustomer: "Pengendara harian",
    version: 1,
    productOrService: null,
    contact: null,
    tagline: null,
    usp: null,
    priceRange: null,
    visuals: null,
    hours: null,
    address: null,
    deliveryArea: null,
    since: null,
    testimonials: null,
    certifications: null,
    paymentMethods: null,
    socialLinks: null,
    currentPromo: null,
    secondaryCta: null,
    readyForBuild: false,
  });
}

describe("cssCoversClassName (meaningful rule semantics)", () => {
  it("rejects a color-only single-declaration rule as not covered", () => {
    const css = `.product-card{color:var(--fg)}`;
    expect(cssCoversClassName(css, "product-card")).toBe(false);
  });

  it("rejects an auto-cover stub", () => {
    const css = `.product-card{color:var(--fg);/* auto-cover: define layout in agent styles */}`;
    expect(cssCoversClassName(css, "product-card")).toBe(false);
  });

  it("accepts a multi-declaration rule", () => {
    const css = `.product-card{display:grid;gap:16px;color:var(--fg)}`;
    expect(cssCoversClassName(css, "product-card")).toBe(true);
  });

  it("accepts a single non-color declaration", () => {
    const css = `.product-card{display:grid}`;
    expect(cssCoversClassName(css, "product-card")).toBe(true);
  });

  it("accepts allowlisted utility class with a single color declaration", () => {
    const css = `.muted{color:var(--muted)}`;
    expect(cssCoversClassName(css, "muted")).toBe(true);
  });

  it("treats a bare class name with no rule as not covered", () => {
    expect(cssCoversClassName("", "product-card")).toBe(false);
  });
});

describe("findMissingCssClasses (meaningful rule semantics)", () => {
  it("flags a component class that only has a color-only stub", () => {
    const files = [
      {
        path: "src/components/Card.tsx",
        content: `export function Card(){return <div className="product-card">x</div>}`,
      },
      {
        path: "src/index.css",
        content: `.product-card{color:var(--fg)}`,
      },
    ];
    expect(findMissingCssClasses(files, files[1].content)).toContain(
      "product-card",
    );
  });

  it("does not flag a component class with a real layout rule", () => {
    const files = [
      {
        path: "src/components/Card.tsx",
        content: `export function Card(){return <div className="product-card">x</div>}`,
      },
      {
        path: "src/index.css",
        content: `.product-card{display:grid;gap:16px;padding:12px}`,
      },
    ];
    expect(findMissingCssClasses(files, files[1].content)).not.toContain(
      "product-card",
    );
  });

  it("does not flag allowlisted utility classes with single color decl", () => {
    const files = [
      {
        path: "src/components/Mute.tsx",
        content: `export function Mute(){return <span className="muted small">y</span>}`,
      },
      {
        path: "src/index.css",
        content: `.muted{color:var(--muted)}.small{color:var(--muted)}`,
      },
    ];
    expect(findMissingCssClasses(files, files[1].content)).not.toContain(
      "muted",
    );
    expect(findMissingCssClasses(files, files[1].content)).not.toContain(
      "small",
    );
  });
});

describe("custom generated source agent", () => {
  beforeEach(() => {
    process.env.VITEST = "1";
    agentGenerate.mockReset();
  });

  it("lets the coding agent edit generated files through constrained tools", async () => {
    agentGenerate.mockImplementation(async (tools) => {
      await tools.list_files.execute({});
      await tools.read_file.execute({ path: "src/routes/index.tsx" });
      await tools.write_file.execute({
        path: "src/components/automotive/ServiceMatrix.tsx",
        content:
          "export function ServiceMatrix() { return <section>Diagnosa kelistrikan dan servis harian</section>; }\n",
      });
      await tools.replace_in_file.execute({
        path: "src/routes/index.tsx",
        find: "// Replace this with the real home page built from the brief",
        replace: "// Agent-authored bengkel home route",
      });
      await tools.replace_in_file.execute({
        path: "src/routes/index.tsx",
        find: "{site.headline}",
        replace:
          '<h1>Servis motor harian yang jelas sebelum dibongkar.</h1>\n      <section className="agent-proof">Servis motor harian, aki, ban, dan kelistrikan.</section>',
      });
      await tools.replace_in_file.execute({
        path: "src/content/site.ts",
        find: "Bengkel Maju",
        replace: "Bengkel Maju Presisi",
      });
      await tools.replace_in_file.execute({
        path: "src/index.css",
        find: "--background:",
        replace:
          "--background: #f7f7f7; /* agent-proof */\n.agent-proof{display:block}",
      });
      await tools.check_app.execute({});

      return { text: "custom bengkel source written" };
    });

    const result = await generateCustomProjectFilesWithAgent({
      projectId: "project_agentic",
      schema: schema(),
    });

    expect(result.generationMode).toBe("agent-custom");
    expect(result.buildSpec).toContain("Build intent:");
    expect(result.touchedFiles).toContain("src/routes/index.tsx");
    expect(result.touchedFiles).toContain(
      "src/components/automotive/ServiceMatrix.tsx",
    );
    expect(result.operationTrace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Membaca struktur file" }),
        expect.objectContaining({ title: "Menulis file" }),
        expect.objectContaining({ title: "Mengecek app" }),
      ]),
    );
    expect(
      result.files.find((file) => file.path === "src/routes/index.tsx")
        ?.content,
    ).toContain("agent-proof");
  });

  it("keeps valid custom output even when the agent uses CSS instead of a component file", async () => {
    agentGenerate.mockImplementation(async (tools) => {
      await tools.replace_in_file.execute({
        path: "src/routes/index.tsx",
        find: "// Replace this with the real home page built from the brief",
        replace: "// Agent-authored rental PS home route",
      });
      await tools.replace_in_file.execute({
        path: "src/routes/index.tsx",
        find: "{site.headline}",
        replace:
          '<h1>Rental PS dengan paket konsol dan game siap main.</h1>\n      <section className="agent-proof">Paket remaja, booking WhatsApp, dan jadwal sewa jelas.</section>',
      });
      await tools.replace_in_file.execute({
        path: "src/content/site.ts",
        find: "Bengkel Maju",
        replace: "Rental PS Neon",
      });
      await tools.replace_in_file.execute({
        path: "src/index.css",
        find: "--background:",
        replace:
          "--background: #f7f7f7; /* agent-proof */\n.agent-proof{display:block}",
      });
      await tools.check_app.execute({});

      return { text: "custom source without component" };
    });

    const result = await generateCustomProjectFilesWithAgent({
      projectId: "project_custom_no_component",
      schema: schema(),
    });

    expect(result.generationMode).toBe("agent-custom");
    expect(result.touchedFiles).toEqual(
      expect.arrayContaining([
        "src/content/site.ts",
        "src/routes/index.tsx",
        "src/index.css",
      ]),
    );
  });

  it("builds an implementation PRD/spec instead of handing raw Q&A to the coding agent", () => {
    const spec = buildGeneratedAppBuildSpec(
      schema(),
      "Produk/jasa utama: rental PS paket lengkap\nArah visual: gaming neon",
    );

    expect(spec).toContain("Build intent:");
    expect(spec).toContain("Required source shape:");
    expect(spec).toContain("not a transcript");
    expect(spec).toContain("rental PS paket lengkap");
  });

  it("fails instead of inventing fallback source when the agent does not produce checked custom edits", async () => {
    // First pass + forced rewrite both produce zero writes.
    agentGenerate.mockResolvedValue({ text: "no edits" });

    await expect(
      generateCustomProjectFilesWithAgent({
        projectId: "project_no_fake_source",
        schema: schema(),
      }),
    ).rejects.toThrow("AI agent produced invalid source");
    expect(agentGenerate).toHaveBeenCalledTimes(2);
  });

  it("blocks check_app until src/routes/index.tsx is written, even if other files exist", async () => {
    // Agent writes src/content/site.ts but NOT src/routes/index.tsx, then
    // calls check_app. The guard must block it and name src/routes/index.tsx.
    const checkAppResults: { error?: string }[] = [];
    agentGenerate.mockImplementation(async (tools) => {
      await tools.replace_in_file.execute({
        path: "src/content/site.ts",
        find: "Bengkel Maju",
        replace: "Bengkel Skip Index",
      });
      checkAppResults.push(
        (await tools.check_app.execute({})) as { error?: string },
      );
      return { text: "done without index" };
    });

    await expect(
      generateCustomProjectFilesWithAgent({
        projectId: "project_check_app_guard",
        schema: schema(),
      }),
    ).rejects.toThrow();

    expect(checkAppResults.at(0)?.error ?? "").toContain(
      "src/routes/index.tsx",
    );
  });

  it("recovers via forced rewrite when first pass has no meaningful edits", async () => {
    agentGenerate
      .mockImplementationOnce(async () => ({ text: "only reads" }))
      .mockImplementationOnce(async (tools) => {
        await tools.replace_in_file.execute({
          path: "src/routes/index.tsx",
          find: "// Replace this with the real home page built from the brief",
          replace: "// Agent-authored bengkel home route",
        });
        await tools.replace_in_file.execute({
          path: "src/routes/index.tsx",
          find: "{site.headline}",
          replace:
            '<h1>Servis motor harian yang jelas.</h1>\n      <section className="agent-proof">Oli, ban, aki.</section>',
        });
        await tools.replace_in_file.execute({
          path: "src/content/site.ts",
          find: "Bengkel Maju",
          replace: "Bengkel Maju Rewrite",
        });
        await tools.replace_in_file.execute({
          path: "src/index.css",
          find: "--primary:",
          replace: "--primary: #ff0000\n.agent-proof{display:block}",
        });
        await tools.check_app.execute({});
        return { text: "forced rewrite ok" };
      });

    const result = await generateCustomProjectFilesWithAgent({
      projectId: "project_forced_rewrite",
      schema: schema(),
    });

    expect(result.generationMode).toBe("agent-custom");
    expect(result.touchedFiles).toEqual(
      expect.arrayContaining([
        "src/content/site.ts",
        "src/routes/index.tsx",
        "src/index.css",
      ]),
    );
    expect(agentGenerate).toHaveBeenCalledTimes(2);
  });

  it("checkAgentSourceQuality does not fail on payment/login business copy", async () => {
    agentGenerate.mockImplementation(async (tools) => {
      await tools.replace_in_file.execute({
        path: "src/routes/index.tsx",
        find: "// Replace this with the real home page built from the brief",
        replace: "// Agent-authored home route",
      });
      await tools.replace_in_file.execute({
        path: "src/routes/index.tsx",
        find: "{site.headline}",
        replace:
          '<h1>Cara payment & login member info.</h1>\n      <section className="agent-proof">checkout register api/orders ok as copy</section>',
      });
      await tools.replace_in_file.execute({
        path: "src/content/site.ts",
        find: "Bengkel Maju",
        replace: "Bengkel Payment Copy",
      });
      await tools.replace_in_file.execute({
        path: "src/index.css",
        find: "--background:",
        replace:
          "--background: #f7f7f7; /* agent-proof */\n.agent-proof{display:block}",
      });
      await tools.check_app.execute({});
      return { text: "ok" };
    });

    const result = await generateCustomProjectFilesWithAgent({
      projectId: "project_quality_payment_copy",
      schema: schema(),
    });

    const quality = checkAgentSourceQuality(
      result.files,
      new Set(["src/content/site.ts", "src/routes/index.tsx", "src/index.css"]),
    );
    expect(quality.issues ?? []).not.toContain(
      "unsupported fake backend/auth/payment language detected",
    );
    expect(quality.ok).toBe(true);
  });

  it("checkAgentSourceQuality fails on auto styles-only touch", () => {
    const site = schema();
    const files = ensureStylesFileExists(
      createGeneratedViteTanStackStarterFiles("p_quality", site),
      site,
    );
    const onlyAuto = new Set<string>(["src/index.css"]);
    const quality = checkAgentSourceQuality(files, onlyAuto);
    expect(quality.ok).toBe(false);
    if (!quality.ok) {
      // index.css alone leaves the starter placeholder in place; the
      // stale-starter marker is the real reason styles-only touches fail
      // now that size<2 is relaxed to size<1.
      expect(quality.issues).toContain(
        "home route is still the starter placeholder",
      );
    }
  });

  it("checkAgentSourceQuality fails when index.tsx is still the starter placeholder", () => {
    const files = createGeneratedViteTanStackStarterFiles("p1", schema());
    // Agent "touched" the route but left the starter content in place.
    const edited = new Set<string>(["src/routes/index.tsx"]);
    const quality = checkAgentSourceQuality(files, edited);
    expect(quality.ok).toBe(false);
    expect(quality.issues).toContain(
      "home route is still the starter placeholder",
    );
  });

  it("fails the gate when the agent did not edit src/routes/index.tsx", () => {
    const files = createGeneratedViteTanStackStarterFiles("p1", schema());
    // Agent edited site.ts only — NOT index.tsx.
    const edited = new Set<string>(["src/content/site.ts"]);
    const quality = checkAgentSourceQuality(files, edited);
    expect(quality.ok).toBe(false);
    expect(quality.issues).toContain("home route was not written by the agent");
  });

  it("checkAgentSourceQuality passes when content + route were agent-edited", async () => {
    agentGenerate.mockImplementation(async (tools) => {
      await tools.replace_in_file.execute({
        path: "src/routes/index.tsx",
        find: "// Replace this with the real home page built from the brief",
        replace: "// Agent-authored home route",
      });
      await tools.replace_in_file.execute({
        path: "src/routes/index.tsx",
        find: "{site.headline}",
        replace:
          '<h1>Checklist pass.</h1>\n      <section className="agent-proof">ok</section>',
      });
      await tools.replace_in_file.execute({
        path: "src/content/site.ts",
        find: "Bengkel Maju",
        replace: "Bengkel Checklist",
      });
      await tools.replace_in_file.execute({
        path: "src/index.css",
        find: "--background:",
        replace:
          "--background: #f7f7f7; /* agent-proof */\n.agent-proof{display:block}",
      });
      await tools.check_app.execute({});
      return { text: "ok" };
    });

    const result = await generateCustomProjectFilesWithAgent({
      projectId: "project_quality_pass",
      schema: schema(),
    });

    const agentEdited = new Set(
      result.touchedFiles.filter((path) => path !== "src/index.css" || true),
    );
    // Use paths the agent actually edited in the mock (all three + auto).
    const quality = checkAgentSourceQuality(
      result.files,
      new Set(["src/content/site.ts", "src/routes/index.tsx", "src/index.css"]),
    );
    expect(quality.ok).toBe(true);
    expect(agentEdited.size).toBeGreaterThan(0);
  });

  it("extracts multi-class classNames and detects missing CSS", () => {
    const tsx = `<div className="site-header hero"><span className="fab-wa">x</span></div>`;
    expect([...extractClassNamesFromTsx(tsx)].sort()).toEqual([
      "fab-wa",
      "hero",
      "site-header",
    ]);

    const customCss =
      ":root{color:#111}.layout{min-height:100dvh;display:grid}";
    // Non-empty CSS with real rules is not starter content under the
    // Tailwind-only contract (the `.starter-shell` legacy marker retired).
    expect(isStarterStylesContent(customCss)).toBe(false);
    expect(
      findMissingCssClasses(
        [{ path: "src/routes/index.tsx", content: tsx }],
        customCss,
      ),
    ).toEqual(["fab-wa", "hero", "site-header"]);
  });

  it("upgrades starter CSS and stubs missing classNames so custom JSX is never unstyled", () => {
    let files = ensureStylesFileExists(
      [
        {
          path: "src/routes/index.tsx",
          content:
            'export function Home(){return <div className="bakso-card">ok</div>}',
        },
        { path: "src/index.css", content: "" },
      ],
      schema(),
    );
    // Last-resort stub pass (mirrors the generate flow ordering: ensure file,
    // then stub only as fallback).
    files = applyStylesCoverStubs(files).files;

    const css = files.find((file) => file.path === "src/index.css")?.content;
    expect(css).toContain("--accent");
    expect(css).toContain(".bakso-card{");
    expect(isStarterStylesContent(css ?? "")).toBe(false);
    // Stubs now include a non-color declaration (display: inline-block) so
    // they satisfy the meaningful-rule check — the site renders text/visuals
    // instead of staying silently broken. The class is no longer flagged as
    // missing, which is the intended behavior change.
    expect(findMissingCssClasses(files, css ?? "")).not.toContain("bakso-card");
  });

  it("checkAgentSourceQuality fails when usePreviewReady is defined but never called", async () => {
    // Generate valid files first
    agentGenerate.mockImplementation(async (tools) => {
      await tools.replace_in_file.execute({
        path: "src/routes/index.tsx",
        find: "// Replace this with the real home page built from the brief",
        replace: "// Agent-authored home route",
      });
      await tools.replace_in_file.execute({
        path: "src/routes/index.tsx",
        find: "{site.headline}",
        replace:
          '<h1>Checklist pass.</h1>\n      <section className="agent-proof">ok</section>',
      });
      await tools.replace_in_file.execute({
        path: "src/content/site.ts",
        find: "Bengkel Maju",
        replace: "Bengkel Checklist",
      });
      await tools.replace_in_file.execute({
        path: "src/index.css",
        find: "--background:",
        replace:
          "--background: #f7f7f7; /* agent-proof */\n.agent-proof{display:block}",
      });
      await tools.check_app.execute({});
      return { text: "ok" };
    });

    const result = await generateCustomProjectFilesWithAgent({
      projectId: "project_quality_no_call",
      schema: schema(),
    });

    // Remove the call site from the generated routes
    const filesWithoutCall = result.files.map((file) => {
      if (file.path === "src/routes/index.tsx") {
        return {
          ...file,
          // Replace both the import and the call
          content: file.content
            .replace("usePreviewReady();", "")
            .replace(/import.*usePreviewReady.*/, ""),
        };
      }
      return file;
    });

    const quality = checkAgentSourceQuality(
      filesWithoutCall,
      new Set(["src/routes/index.tsx", "src/content/site.ts"]),
    );
    expect(quality.ok).toBe(false);
    expect(quality.issues).toContain(
      "preview-ready signal defined but never called (usePreviewReady must be invoked in a route/component)",
    );
  });

  it("checkAgentSourceQuality passes when usePreviewReady is called outside its definition", async () => {
    agentGenerate.mockImplementation(async (tools) => {
      await tools.replace_in_file.execute({
        path: "src/routes/index.tsx",
        find: "// Replace this with the real home page built from the brief",
        replace: "// Agent-authored home route",
      });
      await tools.replace_in_file.execute({
        path: "src/routes/index.tsx",
        find: "{site.headline}",
        replace:
          '<h1>Checklist pass.</h1>\n      <section className="agent-proof">ok</section>',
      });
      await tools.replace_in_file.execute({
        path: "src/content/site.ts",
        find: "Bengkel Maju",
        replace: "Bengkel Checklist",
      });
      await tools.replace_in_file.execute({
        path: "src/index.css",
        find: "--background:",
        replace:
          "--background: #f7f7f7; /* agent-proof */\n.agent-proof{display:block}",
      });
      await tools.check_app.execute({});
      return { text: "ok" };
    });

    const result = await generateCustomProjectFilesWithAgent({
      projectId: "project_quality_has_call",
      schema: schema(),
    });

    const quality = checkAgentSourceQuality(
      result.files,
      new Set(["src/routes/index.tsx", "src/content/site.ts"]),
    );
    expect(quality.ok).toBe(true);
  });

  describe("ensurePreviewReadyCalled", () => {
    it("auto-injects usePreviewReady import and call if missing", () => {
      const files = [
        {
          path: "src/routes/index.tsx",
          content: `import { site } from "../content/site";
export function HomeRouteComponent() {
  return <div>{site.businessName}</div>;
}`,
        },
      ];
      const healed = ensurePreviewReadyCalled(files);
      const healedContent = healed[0].content;
      expect(healedContent).toContain("import { usePreviewReady } from");
      expect(healedContent).toContain("usePreviewReady();");
    });

    it("does not modify if usePreviewReady call is already present", () => {
      const files = [
        {
          path: "src/routes/index.tsx",
          content: `import { usePreviewReady } from "../lib/preview-ready";
export function HomeRouteComponent() {
  usePreviewReady();
  return <div>ok</div>;
}`,
        },
      ];
      const healed = ensurePreviewReadyCalled(files);
      expect(healed).toEqual(files);
    });
  });

  describe("ensureRouterRouteWired", () => {
    it("drops the alias on the rootRoute import and removes local createRootRoute", () => {
      const files = [
        {
          path: "src/router.tsx",
          content: `import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { rootRoute as RootComponent } from './routes/__root';
import IndexComponent from './routes/index';

const rootRoute = createRootRoute({
  component: RootComponent,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexComponent,
});

const routeTree = rootRoute.addChildren([indexRoute]);
export const router = createRouter({ routeTree });`,
        },
      ];
      const healed = ensureRouterRouteWired(files);
      const healedContent = healed[0].content;
      expect(healedContent).toContain(
        `import { rootRoute } from "./routes/__root";`,
      );
      expect(healedContent).not.toContain("as RootComponent");
      expect(healedContent).not.toContain("const rootRoute = createRootRoute");
    });

    it("does not modify a correct router.tsx", () => {
      const files = [
        {
          path: "src/router.tsx",
          content: `import { createRoute, createRouter } from '@tanstack/react-router';
import { rootRoute } from './routes/__root';
import IndexComponent from './routes/index';

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexComponent,
});

const routeTree = rootRoute.addChildren([indexRoute]);
export const router = createRouter({ routeTree });`,
        },
      ];
      const healed = ensureRouterRouteWired(files);
      expect(healed).toEqual(files);
    });
  });

  describe("getTailwindCssRule", () => {
    it("maps common Tailwind layout and color classNames correctly", () => {
      expect(getTailwindCssRule("space-y-4")).toBe(
        ".space-y-4>*+*{margin-top:1rem}",
      );
      expect(getTailwindCssRule("mb-4")).toBe(".mb-4{margin-bottom:1rem}");
      expect(getTailwindCssRule("text-emerald-600")).toBe(
        ".text-emerald-600{color:#059669}",
      );
      expect(getTailwindCssRule("flex")).toBe(".flex{display:flex}");
      expect(getTailwindCssRule("items-center")).toBe(
        ".items-center{align-items:center}",
      );
      expect(getTailwindCssRule("rounded-lg")).toBe(
        ".rounded-lg{border-radius:0.5rem}",
      );
    });
  });

  describe("cssCoversClassName color declarations", () => {
    it("treats real color values as meaningful coverage", () => {
      // Color-only Tailwind-style rules should count as coverage now that
      // agent-generated fallbacks set real hex/rgb values.
      expect(
        cssCoversClassName(
          ".text-emerald-600{color:#059669}",
          "text-emerald-600",
        ),
      ).toBe(true);
      // The legacy lazy stub must still be rejected.
      expect(
        cssCoversClassName(
          ".some-lazy-stub{color:var(--fg)}",
          "some-lazy-stub",
        ),
      ).toBe(false);
    });
  });
});

describe("buildGeneratedAppAgentInstructions (prompt coherence)", () => {
  const schema = { businessName: "Test" } as unknown as ProjectSiteSchema;
  const instructions = buildGeneratedAppAgentInstructions(
    schema,
    undefined,
    "generate",
  );

  it("does not contradict itself about site.ts or styles", () => {
    expect(instructions).not.toContain("WRITE first: src/content/site.ts");
    expect(instructions).not.toContain(
      "WRITE first: src/content/site.ts, src/routes/index.tsx, src/styles.css",
    );
  });

  it("permits real multi-page routing with <Link>", () => {
    expect(instructions).not.toContain("Do NOT use TanStack Router's <Link>");
    expect(instructions).not.toContain(
      "implement them as React state-based tab",
    );
    expect(instructions).toContain("<Link to=");
    expect(instructions).toContain("createRoute({ getParentRoute");
    expect(instructions).toContain("rootRoute.addChildren");
  });

  it("directs the agent to use shadcn components", () => {
    expect(instructions).toContain("shadcn");
  });

  it("still forbids backend/auth/db", () => {
    expect(instructions.toLowerCase()).toContain("no auth");
    expect(instructions.toLowerCase()).toContain("no backend");
  });

  it("prompts name index.tsx as the first required write", () => {
    expect(instructions).toContain("src/routes/index.tsx");
    expect(instructions).toMatch(/FIRST STEP.*src\/routes\/index\.tsx/);

    const rewrite = buildGeneratedAppAgentInstructions(
      schema,
      undefined,
      "rewrite",
    );
    expect(rewrite).toContain("src/routes/index.tsx");
    expect(rewrite).toMatch(/FIRST STEP.*src\/routes\/index\.tsx/);
  });
});
