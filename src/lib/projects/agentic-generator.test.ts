import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(async (_args: unknown) => ({
    text: "Done",
    steps: [],
  })),
}));

import { runAgenticGenerate } from "./agentic-generator";

vi.mock("ai", () => ({
  generateText: generateTextMock,
  isStepCount: vi.fn((count: number) => (step: unknown) => step === count),
  tool: (config: unknown) => config,
}));

vi.mock("@/lib/ai/ai", () => ({
  getAiModel: vi.fn(() => ({})),
  getAiTelemetry: vi.fn(() => ({})),
  getNoReasoningCallOptions: vi.fn(() => ({})),
}));

vi.mock("@/lib/ai/ai-models", () => ({
  getGenerationModel: vi.fn(() => "default-combo"),
}));

vi.mock("@/lib/config/app-settings", () => ({
  getSettingSync: vi.fn((key: string, def: unknown) => def),
}));

vi.mock("@/lib/projects/generated-source", () => ({
  buildGeneratedProject: vi.fn(async () => ({ ok: true, log: "" })),
  createGeneratedViteTanStackStarterFiles: vi.fn(() => [
    {
      path: "src/routes/index.tsx",
      content: "export function HomeRouteComponent() {}",
    },
  ]),
}));

type AgentTool = {
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};

function getTools(args: unknown): Record<string, AgentTool> {
  if (!args || typeof args !== "object") {
    throw new Error("generateText did not receive an argument object");
  }
  const tools = (args as { tools?: unknown }).tools;
  if (!tools || typeof tools !== "object") {
    throw new Error("generateText did not receive tools");
  }
  return tools as Record<string, AgentTool>;
}

function createInput(
  overrides: Partial<Parameters<typeof runAgenticGenerate>[0]> = {},
) {
  return {
    attemptId: "att-1",
    brief: {
      prompt: "Cuci Sepatu Kilat",
      businessName: "Cuci Sepatu",
      offer: "Cuci Sepatu Express",
    },
    projectId: "proj-1",
    schema: {
      version: 1 as const,
      eyebrow: "Layanan",
      businessName: "Cuci Sepatu",
      offer: "Cuci Sepatu Express",
      headline: "Cuci Sepatu Bersih",
      subheadline: "Cepat dan Rapi",
      primaryCta: "Pesan",
      secondaryCta: "Info",
      audience: "Umum",
      address: "Jakarta",
      hours: [{ dayRange: "Senin-Jumat", open: "08.00", close: "20.00" }],
      priceRange: "Mulai 25rb",
      trustPoints: [],
      products: [],
      theme: {
        background: "#fff",
        foreground: "#000",
        muted: "#eee",
        accent: "#333",
      },
      sections: [],
    },
    userId: "user-1",
    ...overrides,
  };
}

async function readCoreSkills(tools: Record<string, AgentTool>) {
  await tools.run_skill_script.execute({
    args: { mode: "persuade", scope: "direction" },
    script: "concept-seed",
    skill: "impeccable",
  });
  for (const name of [
    "impeccable",
    "shadcn",
    "unslop",
    "impeccable/reference/new-work",
    "impeccable/reference/layout",
    "impeccable/reference/typeset",
    "impeccable/reference/animate",
    "impeccable/reference/polish",
    "impeccable/reference/craft-floor",
  ]) {
    await tools.read_skill.execute({ name });
  }
  await tools.set_design_system.execute({
    accent: "#0369a1",
    accentForeground: "#ffffff",
    background: "#f8fafc",
    bodyFontStackId: "system-humanist",
    border: "#cbd5e1",
    card: "#ffffff",
    cardForeground: "#0f172a",
    displayFontStackId: "system-editorial",
    foreground: "#0f172a",
    muted: "#f1f5f9",
    mutedForeground: "#475569",
    primary: "#0f172a",
    primaryForeground: "#ffffff",
    radiusScale: "restrained",
    ring: "#0369a1",
  });
  await tools.set_design_direction.execute({
    firstViewport: "Offer and action lead.",
    form: "Editorial ledger",
    motionThesis: "One measured reveal.",
    ownWorld: "Ink and paper with a single accent.",
    seedKey: "seed-test",
    story: "Understand the offer and contact the owner.",
    thesis: "The offer leads instead of a generic hero.",
  });
  await tools.run_skill_script.execute({
    script: "scripts/palette.mjs",
    skill: "impeccable",
  });
}

async function completeAgentWorkflow(tools: Record<string, AgentTool>) {
  await readCoreSkills(tools);
  await tools.write_file.execute({
    content:
      "export const generated = true;\n/* authored entrance: @keyframes umkm-entrance */",
    path: "src/routes/generated.tsx",
  });
  await tools.check_app.execute({});
}

describe("runAgenticGenerate", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    generateTextMock.mockResolvedValue({ text: "Done", steps: [] });
  });

  it("passes bounded timeouts to each upstream generation step", async () => {
    let captured: { timeout?: unknown } | undefined;
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      captured = args as { timeout?: unknown };
      await completeAgentWorkflow(getTools(args));
      return { text: "Done", steps: [] };
    });

    await expect(runAgenticGenerate(createInput())).resolves.toMatchObject({
      generationMode: "agentic",
    });

    expect(captured?.timeout).toEqual({
      chunkMs: 180_000,
      firstChunkMs: 180_000,
      stepMs: 180_000,
    });
  });

  it("initializes starter files and produces agentic result", async () => {
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      await completeAgentWorkflow(getTools(args));
      return { text: "Done", steps: [] };
    });
    const staged: string[] = [];
    const result = await runAgenticGenerate({
      attemptId: "att-1",
      brief: {
        prompt: "Cuci Sepatu Kilat",
        businessName: "Cuci Sepatu",
        offer: "Cuci Sepatu Express",
      },
      projectId: "proj-1",
      schema: {
        version: 1,
        eyebrow: "Layanan",
        businessName: "Cuci Sepatu",
        offer: "Cuci Sepatu Express",
        headline: "Cuci Sepatu Bersih",
        subheadline: "Cepat dan Rapi",
        primaryCta: "Pesan",
        secondaryCta: "Info",
        audience: "Umum",
        address: "Jakarta",
        hours: [{ dayRange: "Senin-Jumat", open: "08.00", close: "20.00" }],
        priceRange: "Mulai 25rb",
        trustPoints: [],
        products: [],
        theme: {
          background: "#fff",
          foreground: "#000",
          muted: "#eee",
          accent: "#333",
        },
        sections: [],
      },
      userId: "user-1",
      onFileStaged: (f) => staged.push(f.path),
    });

    expect(result.generationMode).toBe("agentic");
    expect(result.files.length).toBeGreaterThan(0);
    expect(staged).toContain("src/content/site.ts");
  });

  it("seeds site.ts with named and default exports so both import styles compile", async () => {
    let seededSite = "";
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      await completeAgentWorkflow(getTools(args));
      return { text: "Done", steps: [] };
    });
    await runAgenticGenerate(
      createInput({
        onFileStaged: (file: { path: string; content: string }) => {
          if (file.path === "src/content/site.ts") {
            seededSite = file.content;
          }
        },
      }),
    );
    expect(seededSite).toMatch(/export const site/);
    expect(seededSite).toMatch(/export default site/);
  });

  it("preserves the accepted protected site data during revisions", async () => {
    const preservedSiteContent =
      "export const site = { primaryCtaTarget: 'accepted' };";
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      const tools = getTools(args);
      await readCoreSkills(tools);
      await tools.write_file.execute({
        content:
          "export const generated = true;\n/* authored entrance: @keyframes umkm-entrance */",
        path: "src/routes/generated.tsx",
      });
      await tools.check_app.execute({});
      return { text: "Done", steps: [] };
    });

    const result = await runAgenticGenerate(
      createInput({
        initialFiles: [
          { path: "src/content/site.ts", content: preservedSiteContent },
        ],
        revisionBrief: "Perbarui tampilan tanpa mengubah data usaha.",
      }),
    );

    expect(
      result.files.find((file) => file.path === "src/content/site.ts")?.content,
    ).toBe(preservedSiteContent);
  });

  it("requires the agent to read core skills before writing source", async () => {
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      const tools = getTools(args);
      await tools.set_design_system.execute({
        accent: "#0369a1",
        accentForeground: "#ffffff",
        background: "#f8fafc",
        bodyFontStackId: "system-humanist",
        border: "#cbd5e1",
        card: "#ffffff",
        cardForeground: "#0f172a",
        displayFontStackId: "system-editorial",
        foreground: "#0f172a",
        muted: "#f1f5f9",
        mutedForeground: "#475569",
        primary: "#0f172a",
        primaryForeground: "#ffffff",
        radiusScale: "restrained",
        ring: "#0369a1",
      });
      const rejected = await tools.write_file.execute({
        content:
          "export const generated = true;\n/* authored entrance: @keyframes umkm-entrance */",
        path: "src/routes/generated.tsx",
      });
      expect(rejected).toMatchObject({
        error: expect.stringContaining("Read the required skills"),
      });
      await readCoreSkills(tools);
      const write = await tools.write_file.execute({
        content:
          "export const generated = true;\n/* authored entrance: @keyframes umkm-entrance */",
        path: "src/routes/generated.tsx",
      });
      expect(write).toMatchObject({ success: true });
      await tools.check_app.execute({});
      return { text: "Done", steps: [] };
    });

    await expect(runAgenticGenerate(createInput())).resolves.toMatchObject({
      skillsRead: expect.arrayContaining(["impeccable", "shadcn"]),
    });
  });

  it("requires a committed design direction before initial source writes", async () => {
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      const tools = getTools(args);
      for (const name of [
        "impeccable",
        "shadcn",
        "unslop",
        "impeccable/reference/new-work",
        "impeccable/reference/layout",
        "impeccable/reference/typeset",
        "impeccable/reference/animate",
        "impeccable/reference/polish",
        "impeccable/reference/craft-floor",
      ]) {
        await tools.read_skill.execute({ name });
      }
      await tools.set_design_system.execute({
        accent: "#0369a1",
        accentForeground: "#ffffff",
        background: "#f8fafc",
        bodyFontStackId: "system-humanist",
        border: "#cbd5e1",
        card: "#ffffff",
        cardForeground: "#0f172a",
        displayFontStackId: "system-editorial",
        foreground: "#0f172a",
        muted: "#f1f5f9",
        mutedForeground: "#475569",
        primary: "#0f172a",
        primaryForeground: "#ffffff",
        radiusScale: "restrained",
        ring: "#0369a1",
      });
      const rejected = await tools.write_file.execute({
        content:
          "export const generated = true;\n/* authored entrance: @keyframes umkm-entrance */",
        path: "src/routes/generated.tsx",
      });
      expect(rejected).toMatchObject({
        error: expect.stringContaining("design direction"),
      });
      await tools.run_skill_script.execute({
        args: { mode: "persuade", scope: "direction" },
        script: "concept-seed",
        skill: "impeccable",
      });
      await tools.set_design_direction.execute({
        firstViewport: "Offer and action lead.",
        form: "Editorial ledger",
        motionThesis: "One measured reveal.",
        ownWorld: "Ink and paper with a single accent.",
        seedKey: "seed-test",
        story: "Understand the offer and contact the owner.",
        thesis: "The offer leads instead of a generic hero.",
      });
      await tools.run_skill_script.execute({
        script: "scripts/palette.mjs",
        skill: "impeccable",
      });
      await tools.write_file.execute({
        content:
          "export const generated = true;\n/* authored entrance: @keyframes umkm-entrance */",
        path: "src/routes/generated.tsx",
      });
      await tools.check_app.execute({});
      return { text: "Done", steps: [] };
    });

    await expect(runAgenticGenerate(createInput())).resolves.toMatchObject({
      generationMode: "agentic",
    });
  });

  it("exposes the bundled skill script runner", async () => {
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      const tools = getTools(args);
      expect(tools.run_skill_script).toBeDefined();
      await completeAgentWorkflow(tools);
      return { text: "Done", steps: [] };
    });

    await expect(runAgenticGenerate(createInput())).resolves.toMatchObject({
      generationMode: "agentic",
    });
  });

  it("exposes read_skill and returns the selected local document", async () => {
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      const tools = getTools(args);
      const skill = await tools.read_skill.execute({
        name: "impeccable",
      });
      expect(skill).toMatchObject({ name: "impeccable" });
      expect(skill).toEqual(
        expect.objectContaining({
          content: expect.stringContaining("name: impeccable"),
        }),
      );
      await completeAgentWorkflow(tools);
      return { text: "Done", steps: [] };
    });

    const result = await runAgenticGenerate(createInput());

    expect(result.skillsRead).toContain("impeccable");
    expect(result.skillsRead).toContain("shadcn");
    const skillOperations = result.operationTrace.filter(
      (operation) => operation.type === "read_skill",
    );
    expect(skillOperations.length).toBeGreaterThan(0);
    expect(skillOperations.every((operation) => !operation.path)).toBe(true);
  });

  it("rejects writes until design system has been set", async () => {
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      const tools = getTools(args);
      await tools.run_skill_script.execute({
        args: { mode: "persuade", scope: "direction" },
        script: "concept-seed",
        skill: "impeccable",
      });
      for (const name of [
        "impeccable",
        "shadcn",
        "unslop",
        "impeccable/reference/new-work",
        "impeccable/reference/layout",
        "impeccable/reference/typeset",
        "impeccable/reference/animate",
        "impeccable/reference/polish",
        "impeccable/reference/craft-floor",
      ]) {
        await tools.read_skill.execute({ name });
      }
      await tools.set_design_direction.execute({
        firstViewport: "Offer and action lead.",
        form: "Editorial ledger",
        motionThesis: "One measured reveal.",
        ownWorld: "Ink and paper with a single accent.",
        seedKey: "seed-test",
        story: "Understand the offer and contact the owner.",
        thesis: "The offer leads instead of a generic hero.",
      });
      const result = await tools.write_file.execute({
        content:
          "export const generated = true;\n/* authored entrance: @keyframes umkm-entrance */",
        path: "src/routes/generated.tsx",
      });
      expect(result).toEqual(
        expect.objectContaining({
          error: expect.stringContaining("set_design_system"),
        }),
      );
      await tools.run_skill_script.execute({
        script: "scripts/palette.mjs",
        skill: "impeccable",
      });
      await tools.check_app.execute({});
      return { text: "Done", steps: [] };
    });

    await expect(runAgenticGenerate(createInput())).rejects.toThrow(
      /custom source file/i,
    );
  });

  it("rejects arbitrary Tailwind colors before source acceptance", async () => {
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      const tools = getTools(args);
      await readCoreSkills(tools);
      const result = await tools.write_file.execute({
        content:
          '<div className="bg-[#faeee5] text-[#c24920]">Tidak aman</div>',
        path: "src/components/site/Palette.tsx",
      });
      expect(result).toEqual(
        expect.objectContaining({
          error: expect.stringContaining("semantic theme tokens"),
        }),
      );
      await completeAgentWorkflow(tools);
      return { text: "Done", steps: [] };
    });

    await expect(runAgenticGenerate(createInput())).resolves.toMatchObject({
      generationMode: "agentic",
    });
  });

  it("rejects unsupported high-risk literals in generated source", async () => {
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      const tools = getTools(args);
      await readCoreSkills(tools);
      const result = await tools.write_file.execute({
        content: 'export const claim = "Paling laris, hubungi 08123456789";',
        path: "src/components/site/Claim.tsx",
      });
      expect(result).toEqual(
        expect.objectContaining({
          error: expect.stringContaining("accepted facts"),
        }),
      );
      await completeAgentWorkflow(tools);
      return { text: "Done", steps: [] };
    });

    await expect(runAgenticGenerate(createInput())).resolves.toMatchObject({
      generationMode: "agentic",
    });
  });

  it("rejects protected scaffold writes after the skill gate", async () => {
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      const tools = getTools(args);
      await readCoreSkills(tools);
      const result = await tools.write_file.execute({
        content: "export const forged = true;",
        path: "src/content/site.ts",
      });
      expect(result).toEqual(
        expect.objectContaining({
          error: expect.stringContaining("Protected"),
        }),
      );
      await completeAgentWorkflow(tools);
      return { text: "Done", steps: [] };
    });

    await expect(runAgenticGenerate(createInput())).resolves.toMatchObject({
      generationMode: "agentic",
    });
  });

  it("rejects unresolved module imports with the exact missing path", async () => {
    let importError = "";
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      const tools = getTools(args);
      await readCoreSkills(tools);
      const rejected = await tools.write_file.execute({
        content:
          "import { Hero } from '@/components/site/Hero';\nexport default Hero;",
        path: "src/routes/index.tsx",
      });
      importError = JSON.stringify(rejected);
      const missingUi = await tools.write_file.execute({
        content:
          "import { Badge } from '@/components/ui/badge';\nexport default Badge;",
        path: "src/routes/badge-test.tsx",
      });
      expect(missingUi).toMatchObject({ success: true });
      const unknownUi = await tools.write_file.execute({
        content:
          "import { X } from '@/components/ui/not-a-component';\nexport default X;",
        path: "src/routes/unknown-ui.tsx",
      });
      importError += JSON.stringify(unknownUi);
      await completeAgentWorkflow(tools);
      return { text: "Done", steps: [] };
    });

    await runAgenticGenerate(createInput());
    expect(importError).toContain("@/components/site/Hero");
    expect(importError).toContain("write_file");
    expect(importError).toContain("@/components/ui/not-a-component");
  });

  it("keeps visual review tools out of the writer contract", async () => {
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      const tools = getTools(args);
      expect(tools.run_design_audit).toBeUndefined();
      expect(tools.generate_palette).toBeUndefined();
      await completeAgentWorkflow(tools);
      return { text: "Done", steps: [] };
    });

    await runAgenticGenerate(createInput());
  });

  it("does not require or suggest animation as a content visibility mechanism", async () => {
    let systemPrompt = "";
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      systemPrompt = (args as { system?: string }).system ?? "";
      await completeAgentWorkflow(getTools(args));
      return { text: "Done", steps: [] };
    });

    await runAgenticGenerate(createInput());

    expect(systemPrompt).not.toMatch(
      /motion\/react|whileInView|intersection observer/i,
    );
  });

  it("requires a custom write and performs a final check when the agent omits one", async () => {
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      const tools = getTools(args);
      await readCoreSkills(tools);
      return { text: "Done", steps: [] };
    });

    await expect(runAgenticGenerate(createInput())).rejects.toThrow(
      /custom source file/i,
    );

    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      const tools = getTools(args);
      await readCoreSkills(tools);
      await tools.write_file.execute({
        content:
          "export const generated = true;\n/* authored entrance: @keyframes umkm-entrance */",
        path: "src/routes/generated.tsx",
      });
      return { text: "Done", steps: [] };
    });

    const result = await runAgenticGenerate(createInput());
    expect(result).toMatchObject({ generationMode: "agentic" });
    expect(result.operationTrace.at(-1)).toMatchObject({
      state: "succeeded",
      type: "check_app",
    });
  });

  it("allows theme/palette revisions via set_design_system without separate write_file", async () => {
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      const tools = getTools(args);
      await readCoreSkills(tools);
      await tools.set_design_system.execute({
        accent: "#1c1c1c",
        accentForeground: "#ffffff",
        background: "#ffffff",
        bodyFontStackId: "system-grotesk",
        border: "#e5e7eb",
        card: "#ffffff",
        cardForeground: "#1c1c1c",
        displayFontStackId: "system-editorial",
        foreground: "#1c1c1c",
        muted: "#f3f4f6",
        mutedForeground: "#6b7280",
        primary: "#1c1c1c",
        primaryForeground: "#ffffff",
        radiusScale: "sharp",
        ring: "#1c1c1c",
      });
      await tools.check_app.execute({
        detail: "Checking build",
        label: "Check",
      });
      return { text: "Done", steps: [] };
    });

    const result = await runAgenticGenerate(
      createInput({
        initialFiles: [
          { path: "src/components/site/Hero.tsx", content: "// hero" },
          { path: "src/routes/index.tsx", content: "// index" },
        ],
      }),
    );
    expect(result).toMatchObject({ generationMode: "agentic" });
  });

  it("builds a fact-grounded system and user prompt", async () => {
    let captured: { prompt?: string; system?: string } | undefined;
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      captured = args as { prompt?: string; system?: string };
      return { text: "Done", steps: [] };
    });

    await expect(
      runAgenticGenerate(
        createInput({
          brief: {
            prompt: "buat website usaha",
            businessName: null,
            offer: null,
            address: null,
            hours: null,
            priceRange: null,
            targetCustomer: null,
          },
        }),
      ),
    ).rejects.toThrow();

    if (!captured) {
      throw new Error("generateText arguments were not captured");
    }
    expect(captured.system).toEqual(expect.any(String));
    expect(captured.prompt).toEqual(expect.any(String));
    expect(captured.prompt).not.toContain("Terjangkau");
  });
});

describe("generated design docs", () => {
  it("adds exactly PRODUCT.md and DESIGN.md on first build", async () => {
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      await completeAgentWorkflow(getTools(args));
      return { text: "Done", steps: [] };
    });
    const result = await runAgenticGenerate(createInput());
    const mdFiles = result.files
      .map((f) => f.path)
      .filter((p) => p.endsWith(".md"))
      .sort();
    expect(mdFiles).toEqual(["DESIGN.md", "PRODUCT.md"]);
    const design = result.files.find((f) => f.path === "DESIGN.md");
    expect(design?.content).toContain("## THESIS");
    expect(design?.content).toContain("## OWN-WORLD");
    expect(design?.content).toContain("## STORY");
    expect(design?.content).toContain("## FIRST VIEWPORT");
    expect(design?.content).toContain("## MOTION");
  });

  it("injects persisted docs into the revision prompt as anchors", async () => {
    let capturedPrompt = "";
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      capturedPrompt = (args as { prompt?: string }).prompt ?? "";
      await completeAgentWorkflow(getTools(args));
      return { text: "Done", steps: [] };
    });
    await runAgenticGenerate(
      createInput({
        initialFiles: [
          {
            content: "PRODUCT ANCHOR MARKER",
            path: "PRODUCT.md",
          },
          {
            content: "DESIGN ANCHOR MARKER",
            path: "DESIGN.md",
          },
          {
            content: "export const site = {};",
            path: "src/content/site.ts",
          },
          {
            content: "export default function Home() { return null; }",
            path: "src/routes/index.tsx",
          },
        ],
        revisionBrief: "perbarui bagian offer",
      }),
    );
    expect(capturedPrompt).toContain("PRODUCT ANCHOR MARKER");
    expect(capturedPrompt).toContain("DESIGN ANCHOR MARKER");
  });

  it("regenerates both docs on a full rebuild and keeps them on partial revisions", async () => {
    const oldDocs = [
      { content: "OLD PRODUCT MARKER", path: "PRODUCT.md" },
      { content: "OLD DESIGN MARKER", path: "DESIGN.md" },
      { content: "export const site = {};", path: "src/content/site.ts" },
      {
        content: "export default function Home() { return null; }",
        path: "src/routes/index.tsx",
      },
    ];

    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      await completeAgentWorkflow(getTools(args));
      return { text: "Done", steps: [] };
    });
    const rebuilt = await runAgenticGenerate(
      createInput({
        fullRebuild: true,
        initialFiles: oldDocs,
        revisionBrief: "rombak total websitenya",
      }),
    );
    const rebuiltProduct = rebuilt.files.find((f) => f.path === "PRODUCT.md");
    const rebuiltDesign = rebuilt.files.find((f) => f.path === "DESIGN.md");
    expect(rebuiltProduct?.content).not.toContain("OLD PRODUCT MARKER");
    expect(rebuiltDesign?.content).not.toContain("OLD DESIGN MARKER");

    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      await completeAgentWorkflow(getTools(args));
      return { text: "Done", steps: [] };
    });
    const partial = await runAgenticGenerate(
      createInput({
        initialFiles: [
          ...oldDocs,
          { content: "x", path: "src/components/site/hero.tsx" },
        ],
        revisionBrief: "ganti warna tombol",
      }),
    );
    const partialProduct = partial.files.find((f) => f.path === "PRODUCT.md");
    expect(partialProduct?.content).toContain("OLD PRODUCT MARKER");
  });
});

describe("mandatory authored motion gate", () => {
  it("fails check_app with motion_missing when custom source has no motion", async () => {
    let gateResult: { failureReason?: string | null } | undefined;
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      const tools = getTools(args);
      await readCoreSkills(tools);
      await tools.write_file.execute({
        content: "export const generated = true;",
        path: "src/routes/generated.tsx",
      });
      gateResult = (await tools.check_app.execute({})) as {
        failureReason?: string | null;
      };
      return { text: "Done", steps: [] };
    });
    await expect(runAgenticGenerate(createInput())).rejects.toThrow(
      /Motion gate/,
    );
    expect(gateResult?.failureReason).toBe("motion_missing");
  });

  it("passes the gate when custom source carries an authored motion marker", async () => {
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      const tools = getTools(args);
      await readCoreSkills(tools);
      await tools.write_file.execute({
        content:
          "export const generated = true;\n/* authored entrance: @keyframes umkm-entrance */",
        path: "src/routes/generated.tsx",
      });
      await tools.check_app.execute({});
      return { text: "Done", steps: [] };
    });
    await expect(runAgenticGenerate(createInput())).resolves.toMatchObject({
      generationMode: "agentic",
    });
  });

  it("skips the motion gate on explicit motionOptOut", async () => {
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      const tools = getTools(args);
      await readCoreSkills(tools);
      await tools.write_file.execute({
        content: "export const generated = true;",
        path: "src/routes/generated.tsx",
      });
      await tools.check_app.execute({});
      return { text: "Done", steps: [] };
    });
    await expect(
      runAgenticGenerate(createInput({ motionOptOut: true })),
    ).resolves.toMatchObject({ generationMode: "agentic" });
  });

  it("maps contract motion preferences with moderate as the default", async () => {
    const { resolveMotionIntensity } = await import("./motion-policy");
    expect(resolveMotionIntensity(null)).toBe("moderate");
    expect(resolveMotionIntensity("minimal")).toBe("minimal");
    expect(resolveMotionIntensity("expressive")).toBe("expressive");
  });
});
