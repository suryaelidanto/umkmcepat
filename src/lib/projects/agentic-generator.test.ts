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
  for (const name of ["impeccable", "shadcn"]) {
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
}

async function completeAgentWorkflow(tools: Record<string, AgentTool>) {
  await readCoreSkills(tools);
  await tools.write_file.execute({
    content: "export const generated = true;",
    path: "src/routes/generated.tsx",
  });
  await tools.check_app.execute({});
}

describe("runAgenticGenerate", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    generateTextMock.mockResolvedValue({ text: "Done", steps: [] });
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

  it("rejects writes until all core skills have been read", async () => {
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      const tools = getTools(args);
      const result = await tools.write_file.execute({
        content: "export const generated = true;",
        path: "src/routes/generated.tsx",
      });
      expect(result).toEqual(
        expect.objectContaining({
          error: expect.stringContaining("impeccable"),
        }),
      );
      return { text: "Done", steps: [] };
    });

    await expect(runAgenticGenerate(createInput())).rejects.toThrow(
      /required skills/i,
    );
  });

  it("rejects arbitrary Tailwind colors before browser qualification", async () => {
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

  it("repairs common internal anchor aliases before the final build", async () => {
    generateTextMock.mockImplementationOnce(async (args: unknown) => {
      const tools = getTools(args);
      await readCoreSkills(tools);
      await tools.write_file.execute({
        content: '<section id="chat">Kontak</section>',
        path: "src/components/site/Contact.tsx",
      });
      await tools.write_file.execute({
        content: '<a href="#chat-box">Chat</a>',
        path: "src/routes/index.tsx",
      });
      await tools.check_app.execute({});
      return { text: "Done", steps: [] };
    });

    const result = await runAgenticGenerate(createInput());
    expect(
      result.files.find((file) => file.path === "src/routes/index.tsx")
        ?.content,
    ).toContain('href="#chat"');
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
        content: "export const generated = true;",
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
    expect(captured.system).toContain("read_skill");
    expect(captured.system).toContain("src/content/site.ts");
    expect(captured.system).toContain("protected");
    expect(captured.prompt).toContain("NOT PROVIDED");
    expect(captured.prompt).not.toContain("08.00-21.00 WIB");
    expect(captured.prompt).not.toContain("Terjangkau");
  });
});
