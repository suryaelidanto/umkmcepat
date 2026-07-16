import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildGeneratedAppBuildSpec,
  ensureStylesCoverClassNames,
  extractClassNamesFromTsx,
  findMissingCssClasses,
  generateCustomProjectFilesWithAgent,
  isStarterStylesContent,
} from "@/lib/projects/custom-source-generator";
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
  });
}

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
    agentGenerate.mockResolvedValue({ text: "no edits" });

    await expect(
      generateCustomProjectFilesWithAgent({
        projectId: "project_no_fake_source",
        schema: schema(),
      }),
    ).rejects.toThrow("AI agent produced invalid source");
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
    const files = ensureStylesCoverClassNames(
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

    const css = files.find((file) => file.path === "src/styles.css")?.content;
    expect(css).toContain("--accent");
    expect(css).toContain(".page{");
    expect(css).toContain(".bakso-card{");
    expect(isStarterStylesContent(css ?? "")).toBe(false);
    expect(findMissingCssClasses(files, css ?? "")).toEqual([]);
  });
});
