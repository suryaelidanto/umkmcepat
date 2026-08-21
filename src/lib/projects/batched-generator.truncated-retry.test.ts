import { afterEach, describe, expect, it, vi } from "vitest";

const { streamTextMock, recordAiCallMock, chargeEnergyForStepMock } =
  vi.hoisted(() => ({
    streamTextMock: vi.fn(),
    recordAiCallMock: vi.fn(),
    chargeEnergyForStepMock: vi.fn(async () => ({
      charged: true,
      energyUsed: 5,
      remaining: 1_000,
    })),
  }));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: streamTextMock };
});

vi.mock("@/lib/ai/ai", () => ({
  getAiModel: vi.fn((name?: string) => ({ modelId: name ?? "test-model" })),
  getAiTelemetry: vi.fn(() => ({ isEnabled: false })),
  getNoReasoningCallOptions: vi.fn(() => ({ reasoning: "none" })),
}));

vi.mock("@/lib/ai/ai-models", () => ({
  DEFAULT_AI_MODEL: "test/model",
  getDefaultAiModel: vi.fn(() => "test/model"),
  getGenerationModel: vi.fn(() => "test/model"),
}));

vi.mock("@/lib/ai/ai-call-record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/ai-call-record")>()),
  recordAiCall: recordAiCallMock,
}));

vi.mock("@/lib/payment/user-credits", () => ({
  chargeEnergyForStep: chargeEnergyForStepMock,
}));

import { runBatchedGenerate } from "./batched-generator";
import { createStepCharger } from "./energy-step-charger";
import { createProjectSiteSchemaFromBrief } from "./site-schema";

import type { ProjectBrief } from "./brief";

const HOME_TSX = `import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { site } from "@/content/site";
import { usePreviewReady } from "@/lib/preview-ready";
export function HomeRouteComponent() {
  usePreviewReady();
  return (<main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-6 py-16"><p>{site.eyebrow}</p><h1>{site.headline}</h1><p>{site.subheadline}</p><Button size="lg" render={<Link to="/" hash="kontak" />}>{site.primaryCta}<ArrowRight className="size-4" /></Button><Card><CardContent>{site.offer}</CardContent></Card><section>{site.trustPoints.map((tp) => <div key={tp}>{tp}</div>)}</section><section>{site.sections.map((s) => <article key={s.title}><h2>{s.title}</h2><p>{s.body}</p></article>)}</section></main>);
}
`;

const PRODUCT_TSX = `import { site } from "@/content/site";
export function ProductSection(){ return <section><h2>{site.offer}</h2><p>Product details with many lines to exceed token limit simulation. Repeat. Repeat. Repeat.</p></section>; }
`;

function writerStream(text: string, chunkSize = 37) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return {
    fullStream: (async function* () {
      for (const chunk of chunks) {
        yield { type: "text-delta", text: chunk };
      }
    })(),
    usage: Promise.resolve({
      inputTokens: 1200,
      outputTokens: 800,
      totalTokens: 2000,
    }),
    response: Promise.resolve({ modelId: "served/model-x" }),
  };
}

function makeBrief(overrides: Partial<ProjectBrief> = {}): ProjectBrief {
  return {
    version: 1,
    notes: [],
    readyForBuild: true,
    prompt: "buatkan website coffee shop untuk kerja remote",
    businessName: "Kopi Sela",
    businessType: "Coffee shop kecil",
    offer: "Espresso based, manual brew, pastry",
    targetCustomer: "Mahasiswa dan pekerja remote",
    contactOrCta: "Pesan dan tanya lokasi lewat WhatsApp",
    stylePreference: "Hangat premium sederhana",
    productOrService: null,
    contact: null,
    umkmType: "jasa_online",
    fieldState: { visuals: "declined" },
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
    ...overrides,
  } as ProjectBrief;
}
function makeCharger() {
  return createStepCharger({
    modelId: "test/model",
    projectId: "p1",
    reason: "build:step",
    userId: "u-test",
  });
}
const baseArgs = () => {
  const brief = makeBrief();
  const schema = createProjectSiteSchemaFromBrief(brief);
  return {
    brief,
    implementationSpec: undefined,
    projectId: "p1",
    schema,
    attemptId: "a1",
    userId: "u-test",
  };
};

describe("runBatchedGenerate — truncated <file> stream retry (hardening)", () => {
  afterEach(() => vi.clearAllMocks());

  it("retries a truncated <file> block with staged-file preservation and succeeds (cmspc6zv failure)", async () => {
    // Simulate cmspc6zv300084lm3n3gqoq8g: writer streamed ProductSection.tsx but truncated mid-block, then format-repair also truncated.
    const writerPartial =
      `<file path="src/routes/index.tsx">\n${HOME_TSX}</file>\n` +
      `<file path="src/components/sections/ProductSection.tsx">\n${PRODUCT_TSX.slice(0, 200)}`;
    const formatRepairAlsoTruncated = `<file path="src/components/sections/ProductSection.tsx">\n${PRODUCT_TSX.slice(0, 200)}`;
    const truncationResumeSuccess =
      `<file path="src/components/sections/ProductSection.tsx">\n${PRODUCT_TSX}</file>\n` +
      `<file path="src/routes/katalog.tsx">\nexport function KatalogRouteComponent(){ return <div>katalog</div>; }\n</file>\n` +
      `<done summary="completed after truncation resume" />`;

    streamTextMock
      .mockReturnValueOnce(writerStream(writerPartial))
      .mockReturnValueOnce(writerStream(formatRepairAlsoTruncated))
      .mockReturnValueOnce(writerStream(truncationResumeSuccess));

    const staged: string[] = [];
    const result = await runBatchedGenerate({
      ...baseArgs(),
      onFileStaged: (f) => staged.push(f.path),
      stepCharger: makeCharger(),
    });

    // Hardened behavior: should succeed by merging staged files across the truncated retry, not return needsFallback.
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected ok");
    }
    expect(result.writtenPaths).toContain("src/routes/index.tsx");
    expect(result.writtenPaths).toContain(
      "src/components/sections/ProductSection.tsx",
    );
    expect(result.writtenPaths).toContain("src/routes/katalog.tsx");
    // Must have called 3 times (writer + format-repair + truncation-resume), not 2.
    expect(streamTextMock).toHaveBeenCalledTimes(3);
    // Staged files preserved even though first two streams truncated.
    expect(staged).toContain("src/routes/index.tsx");
  });
});
