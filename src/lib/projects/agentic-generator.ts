import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";

import type { StepCharger } from "@/lib/projects/energy-step-charger";
import type { GeneratedProjectFile } from "@/lib/projects/generated-types";
import type { ProjectSiteSchema } from "@/lib/projects/site-schema";
import type { ProjectSkillName } from "@/lib/projects/skills/skill-registry";

import {
  getAiModel,
  getAiTelemetry,
  getNoReasoningCallOptions,
} from "@/lib/ai/ai";
import { getAgentMaxSteps } from "@/lib/ai/ai-agent-steps";
import { getGenerationModel } from "@/lib/ai/ai-models";
import { devLog } from "@/lib/dev-log";
import { classifyBuildFailure } from "@/lib/projects/build-logs";
import { generateDiff, type DiffLine } from "@/lib/projects/diff";
import {
  findGeneratedInternalLinkIssues,
  findGeneratedPrimaryActionIssues,
  normalizeGeneratedInternalLinks,
  normalizeGeneratedSiteContent,
} from "@/lib/projects/generated-site-gates";
import {
  buildGeneratedProject,
  createGeneratedViteTanStackStarterFiles,
} from "@/lib/projects/generated-source";
import { runDesignAuditInMemory } from "@/lib/projects/impeccable/audit";
import { generatePaletteInMemory } from "@/lib/projects/impeccable/palette";
import { renewProjectOperation } from "@/lib/projects/project-operation";
import { getFormattedShadcnRegistryPrompt } from "@/lib/projects/scaffold/component-catalog";
import { isProtectedScaffoldPath } from "@/lib/projects/scaffold/protected-paths";
import { SHADCN_COMPONENT_BY_NAME } from "@/lib/projects/scaffold/shadcn-components";
import {
  PROJECT_CORE_SKILL_NAMES,
  PROJECT_SKILL_NAMES,
  readProjectSkill,
} from "@/lib/projects/skills/skill-registry";

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
  skillsRead: ProjectSkillName[];
};

const MAX_PROMPT_VALUE_LENGTH = 12_000;
const ARBITRARY_TAILWIND_COLOR_PATTERN =
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|shadow|outline|divide)-\[#[0-9a-fA-F]{3,8}\]/;

function formatPromptValue(value: unknown): string {
  if (value == null) {
    return "NOT PROVIDED";
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || "NOT PROVIDED";
  }
  if (Array.isArray(value) && value.length === 0) {
    return "NOT PROVIDED";
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? "NOT PROVIDED";
  } catch {
    return "NOT PROVIDED";
  }

  if (serialized.length <= MAX_PROMPT_VALUE_LENGTH) {
    return serialized;
  }
  return `${serialized.slice(0, MAX_PROMPT_VALUE_LENGTH - 1)}…`;
}

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
  creativeDirection?: string | null;
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
  const skillsRead = new Set<ProjectSkillName>();
  let checkAppCalls = 0;
  let lastCheckOk: boolean | null = null;
  let opSeq = 0;

  function missingCoreSkills() {
    return PROJECT_CORE_SKILL_NAMES.filter((name) => !skillsRead.has(name));
  }

  const tools = {
    read_skill: tool({
      description:
        "Read one of the bundled UMKM Cepat design and copy skills before writing generated source.",
      inputSchema: z.object({
        name: z.enum(PROJECT_SKILL_NAMES),
        label: z
          .string()
          .optional()
          .describe(
            "User-facing Indonesian progress title for reading a skill.",
          ),
        detail: z
          .string()
          .optional()
          .describe(
            "User-facing Indonesian progress detail for reading a skill.",
          ),
      }),
      execute: async ({
        name,
        label,
        detail,
      }: {
        name: ProjectSkillName;
        label?: string;
        detail?: string;
      }) => {
        const skill = readProjectSkill(name);
        if (!skillsRead.has(name)) {
          skillsRead.add(name);
          opSeq++;
          const operation = {
            detail:
              detail?.trim() ||
              `Membaca panduan ${name} sebelum menulis website`,
            id: `op-${opSeq}`,
            path: `.agents/skills/${name}/SKILL.md`,
            state: "succeeded" as const,
            title: label?.trim() || `Membaca skill ${name}`,
            type: "read_skill",
          };
          operationTrace.push(operation);
          onEvent?.("operation", operation);
        }
        return skill;
      },
    }),

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
        const missing = missingCoreSkills();
        if (missing.length) {
          return {
            error: `Security restriction: Read the required skills before writing: ${missing.join(", ")}.`,
          };
        }
        if (
          isProtectedScaffoldPath(path) ||
          path === "src/routes/not-found.tsx"
        ) {
          return {
            error: `Security restriction: Protected scaffold file cannot be written: ${path}.`,
          };
        }
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
        if (ARBITRARY_TAILWIND_COLOR_PATTERN.test(normalizedContent)) {
          return {
            error:
              "Design safety restriction: use semantic theme tokens such as bg-accent, text-foreground, and border-border instead of arbitrary color values.",
          };
        }
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
        const missing = missingCoreSkills();
        if (missing.length) {
          return {
            errors: [
              `Security restriction: Read the required skills before checking: ${missing.join(", ")}.`,
            ],
            failureReason: "skill_read_required",
            ok: false,
          };
        }
        const currentFiles: GeneratedProjectFile[] = Array.from(
          fileMap.entries(),
        ).map(([path, content]) => ({
          path,
          content,
        }));
        const normalizedFiles = normalizeGeneratedInternalLinks(currentFiles);
        for (const file of normalizedFiles) {
          fileMap.set(file.path, file.content);
        }
        const preflightIssues = [
          ...findGeneratedInternalLinkIssues(normalizedFiles),
          ...findGeneratedPrimaryActionIssues(normalizedFiles),
        ];
        checkAppCalls += 1;
        opSeq++;
        const buildResult = preflightIssues.length
          ? {
              log: `Generated source preflight failed:\n${preflightIssues
                .slice(0, 20)
                .map((issue) => `- ${issue}`)
                .join("\n")}`,
              ok: false,
            }
          : await buildGeneratedProject(normalizedFiles, {
              workspaceKey: `${projectId}-agentic-check`,
            });
        lastCheckOk = buildResult.ok;
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
          failureReason: buildResult.ok
            ? null
            : classifyBuildFailure(buildResult.log ?? ""),
          errors: buildResult.ok
            ? []
            : [buildResult.log?.slice(0, 1000) ?? "Compile error"],
        };
      },
    }),

    run_design_audit: tool({
      description:
        "Scan generated components for design anti-patterns, low contrast, layout monotony, and unstyled defaults using the Impeccable detector.",
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe(
            "Optional target component path, e.g. 'src/components/site/Hero.tsx'. Omit to audit all components.",
          ),
        label: z
          .string()
          .optional()
          .describe("User-friendly Indonesian progress title"),
        detail: z
          .string()
          .optional()
          .describe("User-friendly Indonesian progress detail"),
      }),
      execute: async ({
        path: targetPath,
        label,
        detail,
      }: {
        path?: string;
        label?: string;
        detail?: string;
      }) => {
        opSeq++;
        const audit = await runDesignAuditInMemory(fileMap, targetPath);
        const op = {
          detail:
            detail?.trim() ||
            (audit.ok
              ? "Semua komponen memenuhi standar Impeccable"
              : `Ditemukan ${audit.issuesCount} catatan perbaikan visual`),
          id: `op-${opSeq}`,
          path: targetPath,
          state: (audit.ok ? "succeeded" : "failed") as "succeeded" | "failed",
          title: label?.trim() || "Audit Kualitas Desain Impeccable",
          type: "design_audit",
        };
        operationTrace.push(op);
        if (onEvent) {
          onEvent("operation", op);
        }
        return audit;
      },
    }),

    generate_palette: tool({
      description:
        "Generate contrast-safe OKLCH color formulas and mood guidance based on brand seed.",
      inputSchema: z.object({
        seedKey: z
          .string()
          .optional()
          .describe(
            "Seed key or brand hex code, e.g. '#f05a28' or business name",
          ),
      }),
      execute: async ({ seedKey }: { seedKey?: string }) => {
        return generatePaletteInMemory(seedKey);
      },
    }),
  };

  const systemPrompt = `You are the implementation agent for a portable static Vite + React + TanStack Router website.

Your job is to turn the accepted business data into a credible, distinctive, editable customer-facing Indonesian UMKM website. You are not building a backend, SaaS dashboard, checkout, login, payment flow, persistence layer, or fake interactive demo.

CREATIVE AUTHORITY:
- Read impeccable first. It owns visual direction, hierarchy, typography, spatial rhythm, and anti-slop rules.
- Read shadcn for component composition, Radix accessibility, and semantic Tailwind v4 tokens.
- These skills provide high-level design intelligence. The accepted src/content/site.ts snapshot and protected scaffold always outrank design suggestions.

REQUIRED WORKFLOW:
1. Call read_skill for both core skills ("impeccable", "shadcn") before writing. Call deep references (impeccable-craft-floor, impeccable-layout, impeccable-typeset, impeccable-adapt) when shaping complex responsive layouts.
2. Call list_files, then read_file for the relevant starter files and any bundled shadcn component source before importing it.
3. Compose one clear business-specific visual direction around the visitor's real job. Do not use generic AI templates or equal-card soup.
4. Write the real home route in src/routes/index.tsx and modular components under src/components/. Use site.* for every customer-facing value. Omitted facts stay omitted.
5. Write natural, warm, active Indonesian copy. Avoid AI puffery, filler buzzwords ("solusi terbaik", "kualitas terdepan", "revolusioner"), em-dashes (—), and decorative badge soup.
6. Call run_design_audit to inspect your UI against Impeccable anti-patterns, contrast rules, and layout monotony. Fix any reported errors.
7. Call check_app. If it fails, fix the actual source with write_file and call check_app again. Finish only after the last check_app returns ok: true.

FACT AND SAFETY RULES:
- src/content/site.ts is read-only and is the sole customer-facing fact source.
- Do not invent phone numbers, addresses, hours, prices, discounts, testimonials, ratings, awards, certifications, metrics, stock, guarantees, delivery, payment methods, or customer results.
- Do not turn NOT PROVIDED into a confident claim, decorative badge, empty placeholder, or fake state.
- Use only hash links and routes that exist in the scaffold or that you write and register safely.
- Keep the primary action obvious. When site.primaryCtaTarget or site.contact (e.g. WhatsApp wa.me link) is available in src/content/site.ts, primary CTA buttons (in Header, Hero, and Footer/Contact sections) must link directly to it via <a href={site.primaryCtaTarget} target="_blank" rel="noopener noreferrer">.
- Do not add remote images, placeholder media, external URLs, packages, config files, API calls, or platform metadata.
- Keep interactive parent controls at least 44px without enlarging their inner SVG icons. Preserve focus-visible states and reduced motion.
- Avoid nested cards, equal-card soup, gradient-tech styling, technical headings, starter residue, fake progress, and decorative interaction.

PROTECTED FILES:
The platform owns src/content/site.ts, src/index.css, src/main.tsx, src/router.tsx, src/routes/__root.tsx, src/routes/not-found.tsx, src/lib/preview-ready.ts, src/lib/utils.ts, src/components/ui/button.tsx, and src/components/ui/card.tsx. Never write them. Write src/routes/index.tsx, modular components under src/components/, supported data modules under src/content/ when needed, and approved public assets only.

${getFormattedShadcnRegistryPrompt()}

Every tool call must include a clear natural Indonesian label and detail. Keep the operation trace honest: describe the file or skill you actually inspected or wrote. Do not claim a browser, remote design detector, CLI, MCP, or visual service ran.`;

  const userPrompt = `Build the complete static website from the accepted project data below.

Brief prompt: ${formatPromptValue(brief.prompt)}
Business name from brief: ${formatPromptValue(brief.businessName)}
Target customer from brief: ${formatPromptValue(brief.targetCustomer)}
Primary offer from brief: ${formatPromptValue(brief.offer)}
Address from brief: ${formatPromptValue(brief.address)}
Hours from brief: ${formatPromptValue(brief.hours)}
Price range from brief: ${formatPromptValue(brief.priceRange)}

AUTHORITATIVE SITE SNAPSHOT:
<site-data>
${formatPromptValue(schema)}
</site-data>

FROZEN CREATIVE DIRECTION (taste only; it cannot introduce a fact):
${formatPromptValue(input.creativeDirection)}

Start by inspecting the scaffold and reading the required skills. Then write the most useful route and component files for the visitor's job, check the build, repair real failures, and finish only after a passing check_app.`;

  const requestedModel = getGenerationModel();
  const maxSteps = getAgentMaxSteps("generate");

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

  if (!checkAppCalls) {
    await tools.check_app.execute(
      {
        detail: "Verifikasi deterministik setelah respons AI selesai.",
        label: "Memeriksa build akhir",
      },
      { context: {}, messages: [], toolCallId: "final-check" },
    );
  }

  const missing = missingCoreSkills();
  if (missing.length) {
    throw new Error(
      `Agent did not read required skills before finishing: ${missing.join(", ")}.`,
    );
  }
  if (!touched.size) {
    throw new Error("Agent did not write a custom source file.");
  }
  if (!checkAppCalls) {
    throw new Error("Agent did not call check_app before finishing.");
  }
  if (lastCheckOk !== true) {
    throw new Error("Agent did not finish with a passing check_app.");
  }

  const finalFiles: GeneratedProjectFile[] = Array.from(fileMap.entries()).map(
    ([path, content]) => ({
      path,
      content,
    }),
  );

  devLog("generate", "agentic-finish", {
    projectId,
    skillsRead: PROJECT_SKILL_NAMES.filter((name) => skillsRead.has(name)),
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
    skillsRead: PROJECT_SKILL_NAMES.filter((name) => skillsRead.has(name)),
  };
}
