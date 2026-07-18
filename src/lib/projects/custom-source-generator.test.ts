import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyStylesCoverStubs,
  buildGeneratedAppBuildSpec,
  checkAgentSourceQuality,
  cssCoversClassName,
  ensureStylesFileExists,
  extractClassNamesFromTsx,
  findMissingCssClasses,
  generateCustomProjectFilesWithAgent,
  isStarterStylesContent,
} from "@/lib/projects/custom-source-generator";
import { createGeneratedViteTanStackStarterFiles } from "@/lib/projects/generated-source";
import { createProjectSiteSchemaFromBrief } from "@/lib/projects/site-schema";

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
        path: "src/styles.css",
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
        path: "src/styles.css",
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
        path: "src/styles.css",
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
        find: "<h1>{starterMessage}</h1>",
        replace:
          '<h1>Servis motor harian yang jelas sebelum dibongkar.</h1>\n      <section className="agent-proof">Servis motor harian, aki, ban, dan kelistrikan.</section>',
      });
      await tools.replace_in_file.execute({
        path: "src/content/site.ts",
        find: "Bengkel Maju",
        replace: "Bengkel Maju Presisi",
      });
      await tools.replace_in_file.execute({
        path: "src/styles.css",
        find: "text-align:center",
        replace: "text-align:center\n.agent-proof{display:block}",
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
        find: "<h1>{starterMessage}</h1>",
        replace:
          '<h1>Rental PS dengan paket konsol dan game siap main.</h1>\n      <section className="agent-proof">Paket remaja, booking WhatsApp, dan jadwal sewa jelas.</section>',
      });
      await tools.replace_in_file.execute({
        path: "src/content/site.ts",
        find: "Bengkel Maju",
        replace: "Rental PS Neon",
      });
      await tools.replace_in_file.execute({
        path: "src/styles.css",
        find: "text-align:center",
        replace: "text-align:center\n.agent-proof{display:block}",
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
        "src/styles.css",
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

  it("recovers via forced rewrite when first pass has no meaningful edits", async () => {
    agentGenerate
      .mockImplementationOnce(async () => ({ text: "only reads" }))
      .mockImplementationOnce(async (tools) => {
        await tools.replace_in_file.execute({
          path: "src/routes/index.tsx",
          find: "<h1>{starterMessage}</h1>",
          replace:
            '<h1>Servis motor harian yang jelas.</h1>\n      <section className="agent-proof">Oli, ban, aki.</section>',
        });
        await tools.replace_in_file.execute({
          path: "src/content/site.ts",
          find: "Bengkel Maju",
          replace: "Bengkel Maju Rewrite",
        });
        await tools.replace_in_file.execute({
          path: "src/styles.css",
          find: "text-align:center",
          replace: "text-align:center\n.agent-proof{display:block}",
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
        "src/styles.css",
      ]),
    );
    expect(agentGenerate).toHaveBeenCalledTimes(2);
  });

  it("checkAgentSourceQuality does not fail on payment/login business copy", async () => {
    agentGenerate.mockImplementation(async (tools) => {
      await tools.replace_in_file.execute({
        path: "src/routes/index.tsx",
        find: "<h1>{starterMessage}</h1>",
        replace:
          '<h1>Cara payment & login member info.</h1>\n      <section className="agent-proof">checkout register api/orders ok as copy</section>',
      });
      await tools.replace_in_file.execute({
        path: "src/content/site.ts",
        find: "Bengkel Maju",
        replace: "Bengkel Payment Copy",
      });
      await tools.replace_in_file.execute({
        path: "src/styles.css",
        find: "text-align:center",
        replace: "text-align:center\n.agent-proof{display:block}",
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
      new Set([
        "src/content/site.ts",
        "src/routes/index.tsx",
        "src/styles.css",
      ]),
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
    const onlyAuto = new Set<string>(["src/styles.css"]);
    const quality = checkAgentSourceQuality(files, onlyAuto);
    expect(quality.ok).toBe(false);
    if (!quality.ok) {
      // styles.css alone counts as presentation path but fails size < 2.
      expect(quality.issues).toContain("agent did not edit enough files");
    }
  });

  it("checkAgentSourceQuality passes when content + route were agent-edited", async () => {
    agentGenerate.mockImplementation(async (tools) => {
      await tools.replace_in_file.execute({
        path: "src/routes/index.tsx",
        find: "<h1>{starterMessage}</h1>",
        replace:
          '<h1>Checklist pass.</h1>\n      <section className="agent-proof">ok</section>',
      });
      await tools.replace_in_file.execute({
        path: "src/content/site.ts",
        find: "Bengkel Maju",
        replace: "Bengkel Checklist",
      });
      await tools.replace_in_file.execute({
        path: "src/styles.css",
        find: "text-align:center",
        replace: "text-align:center\n.agent-proof{display:block}",
      });
      await tools.check_app.execute({});
      return { text: "ok" };
    });

    const result = await generateCustomProjectFilesWithAgent({
      projectId: "project_quality_pass",
      schema: schema(),
    });

    const agentEdited = new Set(
      result.touchedFiles.filter((path) => path !== "src/styles.css" || true),
    );
    // Use paths the agent actually edited in the mock (all three + auto).
    const quality = checkAgentSourceQuality(
      result.files,
      new Set([
        "src/content/site.ts",
        "src/routes/index.tsx",
        "src/styles.css",
      ]),
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

    const legacyStarter =
      ":root{color:#111}.starter-shell{min-height:100dvh;display:grid}";
    expect(isStarterStylesContent(legacyStarter)).toBe(true);
    expect(
      findMissingCssClasses(
        [{ path: "src/routes/index.tsx", content: tsx }],
        legacyStarter,
      ),
    ).toEqual(["fab-wa", "hero", "site-header"]);
  });

  it("upgrades starter CSS and stubs missing classNames so custom JSX is never unstyled", () => {
    let files = ensureStylesFileExists(
      [
        {
          path: "src/routes/index.tsx",
          content:
            'export function Home(){return <div className="page bakso-card">ok</div>}',
        },
        {
          path: "src/styles.css",
          content:
            ":root{color:#111}.starter-shell{min-height:100dvh;display:grid}",
        },
      ],
      schema(),
    );
    // Last-resort stub pass (mirrors the generate flow ordering: ensure file,
    // then stub only as fallback).
    files = applyStylesCoverStubs(files).files;

    const css = files.find((file) => file.path === "src/styles.css")?.content;
    expect(css).toContain("--accent");
    expect(css).toContain(".page{");
    expect(css).toContain(".bakso-card{");
    expect(isStarterStylesContent(css ?? "")).toBe(false);
    // A color-only stub no longer counts as meaningful coverage, so the
    // validator correctly keeps flagging the class as missing — the fix is
    // a rewrite pass (real CSS), not the stub. This is the behavior change
    // that stops broken UI from silently shipping.
    expect(findMissingCssClasses(files, css ?? "")).toContain("bakso-card");
  });
});
