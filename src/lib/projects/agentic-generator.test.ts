import { describe, expect, it, vi } from "vitest";

import { runAgenticGenerate } from "./agentic-generator";

vi.mock("ai", () => ({
  generateText: vi.fn(async () => {
    return {
      text: "Done",
      steps: [],
    };
  }),
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

describe("runAgenticGenerate", () => {
  it("initializes starter files and produces agentic result", async () => {
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
});
