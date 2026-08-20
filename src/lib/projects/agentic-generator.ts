import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";

import type { StepCharger } from "@/lib/projects/energy-step-charger";
import type { GeneratedProjectFile } from "@/lib/projects/generated-types";
import type { ProjectSiteSchema } from "@/lib/projects/site-schema";

import {
  getAiModel,
  getAiTelemetry,
  getNoReasoningCallOptions,
} from "@/lib/ai/ai";
import { getGenerationModel } from "@/lib/ai/ai-models";
import { getSettingSync } from "@/lib/config/app-settings";
import { devLog } from "@/lib/dev-log";
import { generateDiff, type DiffLine } from "@/lib/projects/diff";
import { normalizeGeneratedSiteContent } from "@/lib/projects/generated-site-gates";
import {
  buildGeneratedProject,
  createGeneratedViteTanStackStarterFiles,
} from "@/lib/projects/generated-source";
import { renewProjectOperation } from "@/lib/projects/project-operation";
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
    diff?: DiffLine[];
    path?: string;
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
  operationToken?: string;
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
    list_files: tool({
      description:
        "List all files currently in the project scaffold or available shadcn components.",
      inputSchema: z.object({
        label: z
          .string()
          .optional()
          .describe(
            "User-friendly Indonesian progress title, e.g. 'Melihat struktur file proyek'",
          ),
        detail: z
          .string()
          .optional()
          .describe(
            "User-friendly Indonesian progress detail, e.g. 'Memeriksa daftar file dan komponen yang tersedia'",
          ),
      }),
      execute: async ({
        label,
        detail,
      }: {
        label?: string;
        detail?: string;
      }) => {
        opSeq++;
        const projectFiles = Array.from(fileMap.keys()).sort();
        const shadcnAvailable = Array.from(SHADCN_COMPONENT_BY_NAME.keys()).map(
          (name) => `src/components/ui/${name}.tsx`,
        );
        const op = {
          id: `op-${opSeq}`,
          type: "list_files",
          title: label?.trim() || "Melihat struktur proyek",
          detail:
            detail?.trim() ||
            `Memeriksa ${projectFiles.length} file dalam proyek`,
          state: "succeeded" as const,
        };
        operationTrace.push(op);
        if (onEvent) {
          onEvent("operation", op);
        }
        return {
          files: projectFiles,
          availableShadcnComponents: shadcnAvailable,
        };
      },
    }),

    read_file: tool({
      description:
        "Read the full raw content of a file in the project scaffold or shadcn library.",
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            "Relative file path, e.g. 'src/routes/index.tsx' or 'src/components/ui/button.tsx'",
          ),
        label: z
          .string()
          .optional()
          .describe(
            "User-friendly Indonesian progress title, e.g. 'Membaca komponen tombol'",
          ),
        detail: z
          .string()
          .optional()
          .describe(
            "User-friendly Indonesian progress detail, e.g. 'Melihat struktur dan varian button yang tersedia'",
          ),
      }),
      execute: async ({
        path,
        label,
        detail,
      }: {
        path: string;
        label?: string;
        detail?: string;
      }) => {
        opSeq++;
        const filename = path.split("/").pop() || path;
        const op = {
          id: `op-${opSeq}`,
          type: "read_file",
          title: label?.trim() || `Membaca ${filename}`,
          detail: detail?.trim() || `Melihat isi ${path}`,
          path,
          state: "succeeded" as const,
        };
        operationTrace.push(op);
        if (onEvent) {
          onEvent("operation", op);
        }

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
        label: z
          .string()
          .optional()
          .describe(
            "User-friendly Indonesian progress title, e.g. 'Membuat Hero & Kartu Donasi'",
          ),
        detail: z
          .string()
          .optional()
          .describe(
            "User-friendly Indonesian progress detail, e.g. 'Menambahkan tombol WhatsApp dan live counter sembako'",
          ),
      }),
      execute: async ({
        path,
        content,
        label,
        detail,
      }: {
        path: string;
        content: string;
        label?: string;
        detail?: string;
      }) => {
        if (!path.startsWith("src/") && !path.startsWith("public/")) {
          return {
            error:
              "Security restriction: Only files under src/ and public/ can be written.",
          };
        }
        const oldContent = fileMap.get(path) ?? "";
        const normalizedContent =
          path.endsWith(".tsx") || path.endsWith(".css")
            ? normalizeGeneratedSiteContent(content)
            : content;
        const diff = generateDiff(oldContent, normalizedContent);
        fileMap.set(path, normalizedContent);
        touched.add(path);
        opSeq++;
        const fallbackTitle = path.endsWith("index.tsx")
          ? "Menyusun halaman utama"
          : path.includes("components/")
            ? `Menyiapkan komponen ${
                path
                  .split("/")
                  .pop()
                  ?.replace(/\.tsx?$/, "") || "tampilan"
              }`
            : `Menyimpan ${path.split("/").pop() || path}`;

        const op = {
          id: `op-${opSeq}`,
          type: "write_file",
          title: label?.trim() || fallbackTitle,
          detail: detail?.trim() || `Menyesuaikan isi ${path}`,
          path,
          diff: diff.length ? diff : undefined,
          state: "succeeded" as const,
        };
        operationTrace.push(op);
        if (onEvent) {
          onEvent("operation", op);
        }
        if (onFileStaged) {
          onFileStaged({ path, content: normalizedContent });
        }
        await renewProjectOperation({
          projectId,
          token: input.operationToken ?? "",
          userId: input.userId,
        }).catch(() => undefined);
        return {
          success: true,
          path,
          bytes: normalizedContent.length,
        };
      },
    }),

    check_app: tool({
      description:
        "Compile and test the website build to verify TypeScript and Vite compilation.",
      inputSchema: z.object({
        label: z
          .string()
          .optional()
          .describe(
            "User-friendly Indonesian progress title, e.g. 'Memeriksa build website'",
          ),
        detail: z
          .string()
          .optional()
          .describe(
            "User-friendly Indonesian progress detail, e.g. 'Memastikan tidak ada error TypeScript dan Vite'",
          ),
      }),
      execute: async ({
        label,
        detail,
      }: {
        label?: string;
        detail?: string;
      }) => {
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
          title: label?.trim() || "Memeriksa build website",
          detail:
            detail?.trim() ||
            (buildResult.ok
              ? "Build sukses dan terverifikasi!"
              : `Build gagal: ${buildResult.log?.slice(0, 300)}`),
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

DESIGN DIRECTIVES & EXAMPLES (GREAT VS BAD):

1. VISUAL HIERARCHY & LAYOUT:
   - BAD (AI Slop): Repetitive 3 identical cards in a row with purple-blue gradients, generic placeholder text, centered text everywhere.
   - GREAT: Asymmetrical Bento Grids (<BentoGrid>, <BentoCard colSpan={2}> for flagship items), contrasting section surfaces (bg-background vs bg-muted/40 vs surface="contrast"), varied visual density, authentic trust badges (<BadgePill>), and crisp typography.

2. HERO & VALUE SHOWCASE:
   - BAD (AI Slop): Crude SVG illustrations, fake cartoon avatars, generic "Selamat Datang di Website Kami".
   - GREAT: Concrete value showcase with live metric counters (<StatCounter>), real business trust points, direct WhatsApp CTA button (<MessageCircle className="mr-2 size-4" />), and crisp typography.

3. ACCESSIBILITY & TECHNICAL RIGOR:
   - BAD: <a> tags with href="/layanan" that don't exist, 'min-h-10', 'h-10', or 'size-10' on any link/button, white text on faint yellow backgrounds, fake pricing or fake address.
   - GREAT: Data from "@/content/site" with import { site } from "@/content/site", every clickable <a>, <Button>, and <button> uses 'min-h-11 min-w-11' (including links inside Button asChild and components under 'src/components/site/*'), hash navigation (href="#kontak" or href="#paket") or valid route links, high contrast text on all backgrounds.

NOTE: Do not blindly copy these examples verbatim. Take smart initiative based on the specific business domain, target customers, and real user requirements.

4. TRANSPARENT USER-FRIENDLY PROGRESS:
   - Every tool call must supply a clear, natural Indonesian 'label' and 'detail' so the user sees exactly what section/feature you are building in real time.
   - Example label: "Membuat Hero & Kartu Donasi", detail: "Menambahkan tombol WhatsApp dan live counter sembako".

5. MULTI-PAGE & MODULAR ROUTING:
   - You can create multiple routes if the business benefits from dedicated pages (e.g. 'src/routes/tentang.tsx', 'src/routes/layanan.tsx', 'src/routes/kontak.tsx').
   - Keep components modular under 'src/components/site/*'.
   - In each route file, export function <Name>RouteComponent() and call usePreviewReady() in index.tsx.

6. WORKFLOW:
   - Inspect files with list_files and read_file if needed.
   - Write modular components under src/components/site/* and assemble in src/routes/*.tsx.
   - Call check_app to verify TypeScript and Vite build. Fix any errors with write_file until check_app returns ok: true.`;

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
  const maxSteps =
    Number(getSettingSync("ai.agent.generate_max_steps", 30)) || 30;

  if (onEvent) {
    onEvent("progress", {
      label: "Menyiapkan pembuatan website",
      detail: "AI Agent sedang merancang arsitektur dan komponen website.",
    });
  }

  await generateText({
    model: getAiModel(requestedModel),
    system: systemPrompt,
    prompt: userPrompt,
    tools,
    stopWhen: isStepCount(maxSteps),
    abortSignal,
    ...getNoReasoningCallOptions(),
    onStepFinish: async (step) => {
      if (stepCharger && step.usage) {
        const servedModelId = (
          await Promise.resolve(step.response).catch(() => null)
        )?.modelId;
        await stepCharger.onStepFinish({
          usage: step.usage,
          response: { modelId: servedModelId },
        });
      }
    },
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
