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
  findGeneratedCustomerLiteralIssues,
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
import {
  compileOutcomeDesignSystem,
  type GeneratedDesignSystemProposalV1,
} from "@/lib/projects/outcome-design-system";
import { renewProjectOperation } from "@/lib/projects/project-operation";
import { getFormattedShadcnRegistryPrompt } from "@/lib/projects/scaffold/component-catalog";
import { isProtectedScaffoldPath } from "@/lib/projects/scaffold/protected-paths";
import {
  resolveShadcnDeps,
  SHADCN_COMPONENT_BY_NAME,
} from "@/lib/projects/scaffold/shadcn-components";
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
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|shadow|outline|divide)-(?:\[#[0-9a-fA-F]{3,8}\]|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?)/;

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
  initialFiles?: GeneratedProjectFile[];
  revisionBrief?: string | null;
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

  const starterFiles =
    input.initialFiles ??
    createGeneratedViteTanStackStarterFiles(projectId, schema);
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

  const isRevisionMode = Boolean(
    input.initialFiles && input.initialFiles.length > 0,
  );
  const touched = new Set<string>();
  const operationTrace: AgenticGeneratedSourceResult["operationTrace"] = [];
  const skillsRead = new Set<ProjectSkillName>();
  let checkAppCalls = 0;
  let lastCheckOk: boolean | null = null;
  let designSystemAccepted = isRevisionMode;
  let opSeq = 0;

  // Pre-seed core design and component skills on startup
  for (const name of PROJECT_CORE_SKILL_NAMES) {
    skillsRead.add(name);
    opSeq++;
    operationTrace.push({
      detail: `Membaca panduan ${name} untuk standar visual dan komponen`,
      id: `op-${opSeq}`,
      state: "succeeded" as const,
      title: `Menyiapkan panduan ${name}`,
      type: "read_skill",
    });
  }

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

    copy_shadcn_component: tool({
      description:
        "Copy one official bundled shadcn/ui component and its local dependencies into the project.",
      inputSchema: z.object({
        name: z
          .string()
          .describe("Official shadcn component name, e.g. accordion or sheet"),
        label: z.string().optional(),
        detail: z.string().optional(),
      }),
      execute: async ({
        name,
        label,
        detail,
      }: {
        name: string;
        label?: string;
        detail?: string;
      }) => {
        const component = SHADCN_COMPONENT_BY_NAME.get(name);
        if (!component) {
          return {
            error: `Unknown shadcn component: ${name}`,
            available: Array.from(SHADCN_COMPONENT_BY_NAME.keys()).sort(),
          };
        }

        const currentFiles = Array.from(fileMap, ([path, content]) => ({
          content,
          path,
        }));
        const filesToCopy = [
          ...resolveShadcnDeps(component, currentFiles),
          component,
        ];
        const copiedPaths: string[] = [];

        for (const file of filesToCopy) {
          if (!fileMap.has(file.path)) {
            fileMap.set(file.path, file.content);
            touched.add(file.path);
            copiedPaths.push(file.path);
          }
        }

        opSeq++;
        const operation = {
          detail:
            detail?.trim() ||
            `Menyalin sumber resmi beserta ${Math.max(0, copiedPaths.length - 1)} dependensi lokal`,
          id: `op-${opSeq}`,
          path: component.path,
          state: "succeeded" as const,
          title: label?.trim() || `Menyiapkan komponen ${name}`,
          type: "copy_component",
        };
        operationTrace.push(operation);
        onEvent?.("operation", operation);

        return { copiedPaths, name };
      },
    }),

    set_design_system: tool({
      description:
        "Choose the complete semantic color, typography, and radius system for this specific business. The platform validates contrast and compiles protected theme CSS.",
      inputSchema: z.object({
        accent: z.string(),
        accentForeground: z.string(),
        background: z.string(),
        bodyFontStackId: z.enum([
          "system-humanist",
          "system-grotesk",
          "system-editorial",
          "system-slab",
        ]),
        border: z.string(),
        card: z.string(),
        cardForeground: z.string(),
        displayFontStackId: z.enum([
          "system-humanist",
          "system-grotesk",
          "system-editorial",
          "system-slab",
        ]),
        foreground: z.string(),
        muted: z.string(),
        mutedForeground: z.string(),
        primary: z.string(),
        primaryForeground: z.string(),
        radiusScale: z.enum(["sharp", "restrained", "soft"]),
        ring: z.string(),
      }),
      execute: async (proposal: GeneratedDesignSystemProposalV1) => {
        const result = compileOutcomeDesignSystem(proposal);
        opSeq++;
        if (!result.ok) {
          const operation = {
            detail: "Kombinasi warna belum cukup nyaman dibaca.",
            id: `op-${opSeq}`,
            state: "failed" as const,
            title: "Menyesuaikan warna website",
            type: "set_design_system",
          };
          operationTrace.push(operation);
          onEvent?.("operation", operation);
          return result;
        }
        fileMap.set("src/index.css", result.css);
        designSystemAccepted = true;
        const operation = {
          detail:
            "Warna dan tipografi sudah nyaman dibaca di seluruh tampilan.",
          id: `op-${opSeq}`,
          state: "succeeded" as const,
          title: "Menetapkan gaya visual website",
          type: "set_design_system",
        };
        operationTrace.push(operation);
        onEvent?.("operation", operation);
        onFileStaged?.({ content: result.css, path: "src/index.css" });
        return { ok: true };
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
        if (!designSystemAccepted) {
          return {
            error:
              "Design restriction: call set_design_system with a contrast-safe business-specific visual system before writing source.",
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
        if (ARBITRARY_TAILWIND_COLOR_PATTERN.test(content)) {
          return {
            error:
              "Design safety restriction: use semantic theme tokens such as bg-accent, text-foreground, and border-border instead of arbitrary color values.",
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
        const normalizedFiles = normalizeGeneratedInternalLinks(
          currentFiles.map((file) => ({
            ...file,
            content:
              file.path.endsWith(".tsx") || file.path.endsWith(".css")
                ? normalizeGeneratedSiteContent(file.content)
                : file.content,
          })),
        );
        for (const file of normalizedFiles) {
          fileMap.set(file.path, file.content);
        }
        const preflightIssues = [
          ...findGeneratedCustomerLiteralIssues(normalizedFiles),
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
1. Call set_design_system on step 1 with your chosen semantic palette, typography, and radius for this business. The platform checks contrast and compiles index.css.
2. Use copy_shadcn_component to pull any needed official UI primitives (e.g. badge, separator, dialog, tabs) before importing them.
3. Write your modular UI components under src/components/ and the complete home route in src/routes/index.tsx using write_file. Use site.* for every customer-facing value. Use read_skill for deep reference docs (impeccable-craft-floor, impeccable-layout, impeccable-typeset) when needed.
4. Write natural, warm, active Indonesian copy. Avoid AI puffery, filler buzzwords ("solusi terbaik", "kualitas terdepan"), em-dashes (—), and decorative badge soup.
5. Call run_design_audit to inspect your UI against Impeccable contrast and anti-pattern rules.
6. Call check_app to verify compilation and preflight checks. Finish after check_app returns ok: true.

FACT AND SAFETY RULES:
- src/content/site.ts is read-only and is the sole customer-facing fact source. You may write concise connective Indonesian copy grounded in those facts, but never add guarantees, rankings, popularity, metrics, prices, turnaround promises, or other factual claims absent from site.*. Absolute unsupported claims fail check_app.
- Do not invent phone numbers, addresses, hours, prices, discounts, testimonials, ratings, awards, certifications, metrics, stock, guarantees, delivery, payment methods, or customer results.
- Do not turn NOT PROVIDED into a confident claim, decorative badge, empty placeholder, or fake state.
- Strictly forbid fake interactive mechanisms: no mock shopping carts, no checkout modals, no dead search/filter bars, no fake booking calendars, and no fake urgency countdowns.
- Sourced facts only: If the business has no customer reviews in site.ts, render ZERO review cards. Do not fabricate testimonials.
- Use only hash links and routes that exist in the scaffold or that you write and register safely.
- Keep the primary action obvious. When site.primaryCtaTarget or site.contact (e.g. WhatsApp wa.me link) is available in src/content/site.ts, primary CTA buttons (in Header, Hero, and Footer/Contact sections) must link directly to it via <a href={site.primaryCtaTarget} target="_blank" rel="noopener noreferrer">.
- Do not add remote images, placeholder media, external URLs, packages, config files, API calls, or platform metadata.
- Keep interactive parent controls at least 44px without enlarging their inner SVG icons. Preserve focus-visible states and reduced motion.
- Avoid nested cards, equal-card soup, gradient-tech styling, technical headings, starter residue, fake progress, and decorative interaction.

BUTTON AND LINK COMPOSITION:
- When using \`Button\` as a link (e.g. CTA or navigation), use either \`render={<a href="..." />}\`, \`<Button asChild><a href="...">...</a></Button>\`, or \`className={cn(buttonVariants({ ... }))}\`. Both \`render\` and \`asChild\` are fully supported and valid.
- Primary CTA buttons (in Header, Hero, and Footer/Contact) must link directly to \`site.primaryCtaTarget\` (e.g. WhatsApp wa.me link) when available.

PROTECTED FILES:
The platform owns src/content/site.ts, src/index.css, src/main.tsx, src/router.tsx, src/routes/__root.tsx, src/routes/not-found.tsx, src/lib/preview-ready.ts, src/lib/utils.ts, src/components/ui/button.tsx, and src/components/ui/card.tsx. Never write them. Write src/routes/index.tsx, modular components under src/components/, supported data modules under src/content/ when needed, and approved public assets only.

${getFormattedShadcnRegistryPrompt()}

USER-FRIENDLY PROGRESS REPORTING RULES:
The website owner is a non-technical Indonesian business owner (UMKM). They watch every progress step live on their screen.
- \`label\` and \`detail\` in EVERY tool call MUST be plain, warm, friendly Indonesian describing customer-facing store features.
- Frame actions around the store and visitor experience:
  - Good label examples: "Menata bagian menu dan harga", "Menyambungkan tombol WhatsApp", "Menyiapkan info lokasi & jam buka", "Menata tampilan utama (Hero)", "Memeriksa kerapian tampilan website".
  - Good detail examples: "Menampilkan daftar produk kopi beserta harga dan catatan rasa", "Memastikan tombol pesan langsung membuka obrolan WhatsApp", "Memeriksa agar tata letak pas dan nyaman dibaca di HP".
- STRICTLY FORBIDDEN in label/detail (will intimidate the owner):
  - No file names or file extensions: \`.tsx\`, \`.css\`, \`.json\`, \`.d.ts\`, \`index.tsx\`, \`site.ts\`, \`button.tsx\`, \`tsconfig\`.
  - No developer/compiler jargon: \`TypeScript\`, \`augmentasi\`, \`props\`, \`interface\`, \`AST\`, \`Vite\`, \`bundler\`, \`scaffold\`, \`component tree\`, \`import\`, \`export\`.
  - Never show raw error traces in progress detail. When checking or repairing, state what visual part is being polished.`;

  const routesInstruction =
    schema.routes && schema.routes.length > 1
      ? `\nREQUIRED ROUTES TO IMPLEMENT:\nThis project has multiple accepted pages. You MUST write and render all required routes:\n${schema.routes.map((r) => `- "${r.path}" (${r.title}) -> write component or route for it`).join("\n")}`
      : `\nREQUIRED ROUTES:\nThis project is a single-page storefront. Implement the complete home page in src/routes/index.tsx with all relevant sections.`;

  const userPrompt = `Build the complete static website from the accepted project data below.

Brief prompt: ${formatPromptValue(brief.prompt)}
Business name from brief: ${formatPromptValue(brief.businessName)}
Target customer from brief: ${formatPromptValue(brief.targetCustomer)}
Primary offer from brief: ${formatPromptValue(brief.offer)}
Address from brief: ${formatPromptValue(brief.address)}
Hours from brief: ${formatPromptValue(brief.hours)}
Price range from brief: ${formatPromptValue(brief.priceRange)}
${routesInstruction}

AUTHORITATIVE SITE SNAPSHOT:
<site-data>
${formatPromptValue(schema)}
</site-data>

FROZEN CREATIVE DIRECTION (taste only; it cannot introduce a fact):
${formatPromptValue(input.creativeDirection)}

REVIEWED REVISION BRIEF:
${formatPromptValue(input.revisionBrief)}
${input.revisionBrief ? "Revise the existing source to resolve only these rendered quality findings. Preserve accepted facts, routes, and actions. Re-check the complete app." : ""}

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

        // Derive specific reason from tool execution
        let toolReason: string | undefined;
        const toolCall = step.toolCalls?.[0] as
          { toolName?: string; args?: Record<string, unknown> } | undefined;
        if (toolCall) {
          if (
            toolCall.toolName === "write_custom_component" &&
            typeof toolCall.args?.path === "string"
          ) {
            const fileName = toolCall.args.path.split("/").pop() || "komponen";
            toolReason = `build:write:${fileName}`;
          } else if (toolCall.toolName === "run_design_audit") {
            toolReason = "build:audit";
          } else if (toolCall.toolName === "check_app") {
            toolReason = "build:check_app";
          } else if (
            toolCall.toolName === "copy_shadcn_component" &&
            typeof toolCall.args?.name === "string"
          ) {
            toolReason = `build:shadcn:${toolCall.args.name}`;
          } else if (
            toolCall.toolName === "read_skill" &&
            typeof toolCall.args?.name === "string"
          ) {
            toolReason = `build:skill:${toolCall.args.name}`;
          }
        }

        await stepCharger.onStepFinish({
          usage: step.usage,
          response: { modelId: servedModelId },
          reason: toolReason,
        });
      }
    },
    telemetry: getAiTelemetry("project-agentic-generate", {
      projectId,
      userId: input.userId,
    }),
  });

  if (!checkAppCalls || lastCheckOk !== true) {
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
