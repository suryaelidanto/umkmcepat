import { generateText, tool } from "ai";
import { z } from "zod";

import type { StepCharger } from "@/lib/projects/energy-step-charger";
import type { GeneratedProjectFile } from "@/lib/projects/generated-types";
import type { ProjectSiteSchema } from "@/lib/projects/site-schema";

import {
  getAiModel,
  getAiTelemetry,
  getNoReasoningCallOptions,
} from "@/lib/ai";
import { getGenerationModel } from "@/lib/ai-models";
import { getSettingSync } from "@/lib/app-settings";
import { devLog } from "@/lib/dev-log";
import {
  buildGeneratedProject,
  createGeneratedViteTanStackStarterFiles,
} from "@/lib/projects/generated-source";
import { getFormattedShadcnRegistryPrompt } from "@/lib/projects/scaffold/component-catalog";
import { SHADCN_COMPONENT_BY_NAME } from "@/lib/projects/scaffold/shadcn-components";

export type AgenticGeneratedSourceResult = {
  files: GeneratedProjectFile[];
  generationMode: "agentic";
  summary: string;
  touchedFiles: string[];
  repairAttempts: number;
  operationTrace: Array<{
    id: string;
    type: string;
    title: string;
    detail: string;
    state: "succeeded" | "failed";
  }>;
};

export async function runAgenticGenerate(input: {
  abortSignal?: AbortSignal;
  attemptId: string;
  brief: {
    prompt: string;
    businessName?: string | null;
    targetCustomer?: string | null;
    offer?: string | null;
    address?: string | null;
    hours?: unknown;
    priceRange?: string | null;
  };
  buildId?: string | null;
  onEvent?: (
    type:
      | "error"
      | "progress"
      | "operation"
      | "energy"
      | "energy_exhausted"
      | "done",
    data: Record<string, unknown>,
  ) => void;
  onFileStaged?: (file: GeneratedProjectFile) => void;
  projectId: string;
  schema: ProjectSiteSchema;
  stepCharger?: StepCharger;
  userId: string;
}): Promise<AgenticGeneratedSourceResult> {
  const {
    abortSignal,
    brief,
    onEvent,
    onFileStaged,
    projectId,
    schema,
    stepCharger,
  } = input;

  devLog("generate", "agentic-start", { projectId });

  const starterFiles = createGeneratedViteTanStackStarterFiles(
    projectId,
    schema,
  );
  const fileMap = new Map<string, string>();
  for (const f of starterFiles) {
    fileMap.set(f.path, f.content);
  }

  // Pre-seed site.ts
  const siteTsContent = `export const site = ${JSON.stringify(schema, null, 2)} as const;\n`;
  fileMap.set("src/content/site.ts", siteTsContent);
  if (onFileStaged) {
    onFileStaged({ path: "src/content/site.ts", content: siteTsContent });
  }

  const touched = new Set<string>();
  const operationTrace: AgenticGeneratedSourceResult["operationTrace"] = [];
  let opSeq = 0;

  const tools = {
    read_file: tool({
      description:
        "Read the full raw content of a file in the project scaffold or shadcn library.",
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            "Relative file path, e.g. 'src/routes/index.tsx' or 'src/components/ui/button.tsx'",
          ),
      }),
      execute: async ({ path }: { path: string }) => {
        if (fileMap.has(path)) {
          return { content: fileMap.get(path)! };
        }
        if (path.startsWith("src/components/ui/")) {
          const compName = path
            .replace("src/components/ui/", "")
            .replace(/\.tsx?$/, "");
          if (SHADCN_COMPONENT_BY_NAME.has(compName)) {
            const comp = SHADCN_COMPONENT_BY_NAME.get(compName)!;
            return {
              content: comp.content,
              note: "Pre-bundled shadcn component available to write.",
            };
          }
        }
        return { error: `File not found: ${path}` };
      },
    }),

    write_file: tool({
      description:
        "Create or overwrite a source file in the project (routes, components, utilities).",
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            "Target file path under src/, e.g. 'src/routes/index.tsx' or 'src/components/site/ValueShowcase.tsx'",
          ),
        content: z
          .string()
          .describe("Full raw TypeScript/TSX code without markdown fences."),
      }),
      execute: async ({ path, content }: { path: string; content: string }) => {
        if (!path.startsWith("src/") && !path.startsWith("public/")) {
          return {
            error:
              "Security restriction: Only files under src/ and public/ can be written.",
          };
        }
        fileMap.set(path, content);
        touched.add(path);
        opSeq++;
        const op = {
          id: `op-${opSeq}`,
          type: "write_file",
          title: `Menulis ${path}`,
          detail: `Menyimpan file ${path} (${content.length} bytes)`,
          state: "succeeded" as const,
        };
        operationTrace.push(op);
        if (onEvent) {
          onEvent("operation", op);
        }
        if (onFileStaged) {
          onFileStaged({ path, content });
        }
        if (stepCharger) {
          void stepCharger.onStepFinish({
            usage: { inputTokens: 100, outputTokens: 200 },
          });
        }
        return { success: true, path, bytes: content.length };
      },
    }),

    check_app: tool({
      description:
        "Compile and test the website build to verify TypeScript and Vite compilation.",
      inputSchema: z.object({}),
      execute: async () => {
        const currentFiles: GeneratedProjectFile[] = Array.from(
          fileMap.entries(),
        ).map(([path, content]) => ({
          path,
          content,
        }));
        opSeq++;
        const buildResult = await buildGeneratedProject(currentFiles, {
          workspaceKey: `${projectId}-agentic-check`,
        });
        const op = {
          id: `op-${opSeq}`,
          type: "check_app",
          title: "Memeriksa build website",
          detail: buildResult.ok
            ? "Build sukses dan terverifikasi!"
            : `Build gagal: ${buildResult.log?.slice(0, 300)}`,
          state: (buildResult.ok ? "succeeded" : "failed") as
            "succeeded" | "failed",
        };
        operationTrace.push(op);
        if (onEvent) {
          onEvent("operation", op);
        }
        return {
          ok: buildResult.ok,
          errors: buildResult.ok
            ? []
            : [buildResult.log?.slice(0, 1000) ?? "Compile error"],
        };
      },
    }),
  };

  const systemPrompt = `You are a world-class Indonesian website designer and senior React frontend developer.
Your goal is to build an extraordinary, high-converting, creative landing page (rating 9.5+/10) for an Indonesian UMKM business.

${getFormattedShadcnRegistryPrompt()}

DESIGN DIRECTIVES & PRINCIPLES:
1. ANTI-SLOP VISUAL HIERARCHY:
   - Break monotony! Build asymmetrical Bento Grids (<BentoGrid>, <BentoCard colSpan={2}> for flagship items).
   - Hero Section: Do NOT draw crude SVG doodles. Instead, build a stunning Value Showcase panel with live metric counters (<StatCounter>), trust badges (<BadgePill>), and Lucide icons.
   - Clean rhythm: alternating background surfaces (bg-background, bg-muted/40, and surface="contrast" with text-background for logistics).
   - Prominent conversion: High-contrast WhatsApp CTA with icon (<MessageCircle className="mr-2 size-4" />) and full touch targets (min-h-11).

2. TECHNICAL EXECUTION:
   - Data Source: Read from "@/content/site" with import { site } from "@/content/site". Never hardcode fake contact details or prices.
   - Primitives: Use layout primitives from "@/components/site/layout" (SiteSection, SiteStack, SiteSplit, SiteCluster) and UI components from "@/components/ui/*" or "@/components/site/primitives".
   - Preview Hook: MUST call import { usePreviewReady } from "@/lib/preview-ready" inside src/routes/index.tsx: usePreviewReady();
   - Export: In src/routes/index.tsx, export function HomeRouteComponent() { ... } (do not default export).

3. WORKFLOW:
   - Write src/routes/index.tsx with all rich sections.
   - Create modular helper components under src/components/site/* if helpful.
   - Call check_app to verify compilation. If errors occur, fix them with write_file until check_app returns ok: true.`;

  const userPrompt = `Build the complete website for:
Business Name: ${brief.businessName || schema.businessName}
Prompt: ${brief.prompt}
Target Customer: ${brief.targetCustomer || "Pelanggan umum"}
Primary Offer: ${brief.offer || schema.offer}
Address / Location: ${brief.address || schema.address || "Indonesia"}
Hours: ${brief.hours || schema.hours || "08.00-21.00 WIB"}
Price: ${brief.priceRange || schema.priceRange || "Terjangkau"}

Start by writing src/routes/index.tsx now, check the build, and finish.`;

  const requestedModel = getGenerationModel();
  const _maxSteps =
    Number(getSettingSync("ai.agent.generate_max_steps", 30)) || 30;

  if (onEvent) {
    onEvent("progress", {
      label: "Menyiapkan pembuatan interaktif",
      detail: "AI Agent sedang merancang arsitektur dan komponen website.",
    });
  }

  await generateText({
    model: getAiModel(requestedModel),
    system: systemPrompt,
    prompt: userPrompt,
    tools,
    stopSequences: [],
    abortSignal,
    ...getNoReasoningCallOptions(),
    telemetry: getAiTelemetry("project-agentic-generate", {
      projectId,
      userId: input.userId,
    }),
  });

  const finalFiles: GeneratedProjectFile[] = Array.from(fileMap.entries()).map(
    ([path, content]) => ({
      path,
      content,
    }),
  );

  devLog("generate", "agentic-finish", {
    projectId,
    touched: Array.from(touched),
    fileCount: finalFiles.length,
  });

  return {
    files: finalFiles,
    generationMode: "agentic",
    summary: `Website successfully generated by Agent with ${touched.size} custom files.`,
    touchedFiles: Array.from(touched),
    repairAttempts: 0,
    operationTrace,
  };
}
