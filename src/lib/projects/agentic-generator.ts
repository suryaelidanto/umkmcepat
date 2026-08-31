import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";

import type { BuildContractV1 } from "@/lib/projects/build-contract";
import type { BuildPlanV1 } from "@/lib/projects/build-plan";
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
import { getAiTimeoutMs } from "@/lib/ai/ai-timeouts";
import { devLog } from "@/lib/dev-log";
import { classifyBuildFailure } from "@/lib/projects/build-logs";
import { generateDiff, type DiffLine } from "@/lib/projects/diff";
import { classifyEditIntent } from "@/lib/projects/edit-intent";
import {
  compileGeneratedDesignSystem,
  repairDesignSystemContrast,
  type GeneratedDesignSystemProposalV1,
} from "@/lib/projects/generated-design-system";
import {
  buildGeneratedProject,
  createGeneratedViteTanStackStarterFiles,
} from "@/lib/projects/generated-source";
import { scanSourceClaims } from "@/lib/projects/high-risk-claims";
import { renewProjectOperation } from "@/lib/projects/project-operation";
import { isProtectedScaffoldPath } from "@/lib/projects/scaffold/protected-paths";
import {
  resolveShadcnDeps,
  SHADCN_COMPONENT_BY_NAME,
} from "@/lib/projects/scaffold/shadcn-components";
import { normalizeSiteSchemaForEmit } from "@/lib/projects/scaffold/vite-tanstack-shadcn-starter";
import {
  executeSkillScript,
  PROJECT_CORE_SKILL_NAMES,
  PROJECT_SCRIPT_SKILL_NAMES,
  PROJECT_SKILL_NAMES,
  readProjectSkill,
} from "@/lib/projects/skills/skill-registry";

export type AgenticGeneratedSourceResult = {
  files: GeneratedProjectFile[];
  generationMode: "agentic";
  summary: string;
  touchedFiles: string[];
  operationTrace: Array<{
    id: string;
    type: string;
    title: string;
    detail: string;
    diff?: DiffLine[];
    path?: string;
    state: "succeeded" | "failed" | "active";
  }>;
  skillsRead: ProjectSkillName[];
};

const MAX_PROMPT_VALUE_LENGTH = 12_000;
const ARBITRARY_TAILWIND_COLOR_PATTERN =
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|shadow|outline|divide)-(?:\[#[0-9a-fA-F]{3,8}\]|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?)/;
const ARBITRARY_INLINE_COLOR_PATTERN =
  /(?:^|["'`=:(,\s])#[0-9a-fA-F]{3,8}(?:["'`),;\s]|$)/;
const DATA_IMAGE_PATTERN = /data:image\//i;
const HASH_CTA_FALLBACK_PATTERN = /href\s*=\s*["'`]#\/?["'`]/i;

function collectUnresolvedImports(
  content: string,
  filePath: string,
  fileMap: Map<string, string>,
): string[] {
  const specs = new Set<string>();
  for (const match of content.matchAll(
    /(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g,
  )) {
    specs.add(match[1] ?? "");
  }
  for (const match of content.matchAll(/import\s*["']([^"']+)["']/g)) {
    specs.add(match[1] ?? "");
  }
  const issues: string[] = [];
  for (const spec of specs) {
    if (!spec.startsWith("@/") && !spec.startsWith(".")) {
      continue;
    }
    const base = spec.startsWith("@/")
      ? `src/${spec.slice(2)}`
      : resolveRelativeImport(filePath, spec);
    const candidates = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}/index.ts`,
      `${base}/index.tsx`,
    ];
    if (candidates.some((candidate) => fileMap.has(candidate))) {
      continue;
    }
    const uiName = spec.match(/^@\/components\/ui\/([a-z0-9-]+)$/)?.[1];
    if (uiName && SHADCN_COMPONENT_BY_NAME.has(uiName)) {
      issues.push(
        `${spec} is not in the project yet: call copy_shadcn_component("${uiName}") first.`,
      );
    } else {
      issues.push(
        `${spec} does not exist yet (${base}): write it with write_file first.`,
      );
    }
  }
  return issues;
}

function extractAcceptedFactStrings(schema: ProjectSiteSchema): string[] {
  const strings: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === "string") {
      if (value.trim()) {
        strings.push(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        collect(item);
      }
      return;
    }
    if (value && typeof value === "object") {
      for (const item of Object.values(value)) {
        collect(item);
      }
    }
  };
  collect(schema);
  return [...new Set(strings)];
}

function resolveRelativeImport(filePath: string, spec: string): string {
  const dirParts = filePath.split("/").slice(0, -1);
  for (const part of spec.split("/")) {
    if (part === "." || part === "") {
      continue;
    }
    if (part === "..") {
      dirParts.pop();
      continue;
    }
    dirParts.push(part);
  }
  return dirParts.join("/");
}

function ensureAllShadcnImportsResolved(
  fileMap: Map<string, string>,
  touched?: Set<string>,
): void {
  let added = true;
  while (added) {
    added = false;
    for (const [, content] of Array.from(fileMap.entries())) {
      for (const match of content.matchAll(
        /["']@\/components\/ui\/([a-z0-9-]+)["'/]/g,
      )) {
        const name = match[1];
        const component = name ? SHADCN_COMPONENT_BY_NAME.get(name) : undefined;
        if (!component || fileMap.has(component.path)) {
          continue;
        }
        const currentFiles = Array.from(fileMap, ([p, c]) => ({
          content: c,
          path: p,
        }));
        for (const file of [
          ...resolveShadcnDeps(component, currentFiles),
          component,
        ]) {
          if (!fileMap.has(file.path)) {
            fileMap.set(file.path, file.content);
            touched?.add(file.path);
            added = true;
          }
        }
      }
    }
  }
}

function formatPromptValue(
  value: unknown,
  maxLength = MAX_PROMPT_VALUE_LENGTH,
): string {
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

  if (serialized.length <= maxLength) {
    return serialized;
  }
  return `${serialized.slice(0, maxLength - 1)}…`;
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
    stylePreference?: string | null;
    businessType?: string | null;
    factLedger?: unknown;
    discussionContext?: unknown;
  };
  buildContract?: BuildContractV1;
  buildId?: string | null;
  buildPlan?: BuildPlanV1;
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
  const { abortSignal, onEvent, onFileStaged, projectId, schema, stepCharger } =
    input;

  devLog("generate", "agentic-start", { projectId });

  const isRevisionMode = Boolean(
    input.revisionBrief ||
    input.initialFiles?.some(
      (f) =>
        f.path.startsWith("src/components/site/") ||
        (f.path === "src/routes/index.tsx" &&
          !f.content.includes("data-generated-site-starter")),
    ),
  );
  const baseStarterFiles = createGeneratedViteTanStackStarterFiles(
    projectId,
    schema,
  );
  const fileMap = new Map<string, string>();
  for (const f of baseStarterFiles) {
    fileMap.set(f.path, f.content);
  }
  if (input.initialFiles && input.initialFiles.length > 0) {
    for (const f of input.initialFiles) {
      fileMap.set(f.path, f.content);
    }
  }

  // Preserve the accepted site data when revising an existing project.
  const initialSiteFile = input.initialFiles?.find(
    (file) => file.path === "src/content/site.ts",
  );
  if (!isRevisionMode || !initialSiteFile) {
    const siteTsContent = `export const site = ${JSON.stringify(normalizeSiteSchemaForEmit(schema), null, 2)} as const;
export default site;
`;
    fileMap.set("src/content/site.ts", siteTsContent);
    if (onFileStaged) {
      onFileStaged({ path: "src/content/site.ts", content: siteTsContent });
    }
  }
  const touched = new Set<string>();
  const operationTrace: AgenticGeneratedSourceResult["operationTrace"] = [];
  const skillsRead = new Set<ProjectSkillName>();
  let checkAppCalls = 0;
  let lastCheckOk: boolean | null = null;
  let designSystemAccepted = isRevisionMode;
  let designDirectionAccepted = isRevisionMode;
  let paletteScriptRun = isRevisionMode;
  let conceptSeedScriptRun = isRevisionMode;
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

    run_skill_script: tool({
      description:
        "Run a bundled Impeccable or shadcn skill script when the skill documents call for it.",
      inputSchema: z.object({
        skill: z.enum(PROJECT_SCRIPT_SKILL_NAMES),
        script: z.string().min(1),
        args: z.unknown().optional(),
      }),
      execute: async ({
        skill,
        script,
        args,
      }: {
        skill: (typeof PROJECT_SCRIPT_SKILL_NAMES)[number];
        script: string;
        args?: unknown;
      }) => {
        const result = await executeSkillScript(skill, script, args);
        devLog("generate", "skill.script", {
          error: result.error,
          ok: result.ok,
          script,
          skill,
        });
        const normalizedScript = script.replaceAll("\\", "/").toLowerCase();
        if (
          skill === "impeccable" &&
          normalizedScript.includes("palette") &&
          result.ok
        ) {
          paletteScriptRun = true;
        }
        if (
          skill === "impeccable" &&
          normalizedScript.includes("concept-seed") &&
          result.ok
        ) {
          conceptSeedScriptRun = true;
        }
        opSeq++;
        const operation = {
          detail: result.ok
            ? `Menjalankan panduan ${skill}`
            : `Panduan ${skill} belum dapat dijalankan`,
          id: `op-${opSeq}`,
          state: (result.ok ? "succeeded" : "failed") as "succeeded" | "failed",
          title: result.ok
            ? "Menjalankan panduan desain"
            : "Panduan belum berjalan",
          type: "run_skill_script" as const,
        };
        operationTrace.push(operation);
        onEvent?.("operation", operation);
        return result;
      },
    }),

    list_files: tool({
      description:
        "List all files currently in the project scaffold or available shadcn components.",
      inputSchema: z.object({
        label: z
          .string()
          .optional()
          .describe("Judul progres singkat dalam bahasa Indonesia."),
        detail: z
          .string()
          .optional()
          .describe("Detail progres singkat dalam bahasa Indonesia."),
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
        path: z.string().describe("Path relatif ke file proyek."),
        label: z
          .string()
          .optional()
          .describe("Judul progres singkat dalam bahasa Indonesia."),
        detail: z
          .string()
          .optional()
          .describe("Detail progres singkat dalam bahasa Indonesia."),
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
        name: z.string().describe("Nama komponen resmi yang tersedia."),
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

        return {
          name,
          copiedPaths,
        };
      },
    }),

    set_design_direction: tool({
      description:
        "Commit the visual direction and first-viewport thesis before writing the landing page.",
      inputSchema: z.object({
        thesis: z.string().trim().min(12).max(320),
        ownWorld: z.string().trim().min(12).max(320),
        story: z.string().trim().min(12).max(320),
        firstViewport: z.string().trim().min(12).max(420),
        form: z.string().trim().min(4).max(160),
        seedKey: z.string().trim().min(2).max(80),
        motionThesis: z.string().trim().min(8).max(240),
      }),
      execute: async (direction: {
        thesis: string;
        ownWorld: string;
        story: string;
        firstViewport: string;
        form: string;
        seedKey: string;
        motionThesis: string;
      }) => {
        designDirectionAccepted = true;
        opSeq++;
        const operation = {
          detail: "Arah visual, komposisi awal, dan gerak utama sudah dipilih.",
          id: `op-${opSeq}`,
          state: "succeeded" as const,
          title: "Menetapkan arah visual",
          type: "set_design_direction" as const,
        };
        operationTrace.push(operation);
        onEvent?.("operation", operation);
        return { ok: true, direction };
      },
    }),

    set_design_system: tool({
      description:
        "Apply a semantic theme to the protected stylesheet. The platform validates contrast before accepting it.",
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
        let result = compileGeneratedDesignSystem(proposal);
        if (!result.ok) {
          const repairedProposal = repairDesignSystemContrast(proposal);
          result = compileGeneratedDesignSystem(repairedProposal);
        }
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
          return {
            ok: false,
            error: `Kombinasi warna belum memenuhi standar kontras: ${result.issues.map((i) => `${i.pair} (rasio ${i.ratio.toFixed(1)}, butuh ${i.required})`).join(", ")}. Pilih kombinasi warna dengan kontras yang lebih tinggi.`,
            issues: result.issues,
          };
        }
        fileMap.set("src/index.css", result.css);
        touched.add("src/index.css");
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
        return {
          ok: true,
        };
      },
    }),

    write_file: tool({
      description:
        "Create or overwrite a source file in the project (routes, components, utilities).",
      inputSchema: z.object({
        path: z.string().describe("Path file di bawah src/."),
        content: z
          .string()
          .describe("Full raw TypeScript/TSX code without markdown fences."),
        label: z
          .string()
          .optional()
          .describe("Judul progres singkat dalam bahasa Indonesia."),
        detail: z
          .string()
          .optional()
          .describe("Detail progres singkat dalam bahasa Indonesia."),
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
        if (!designDirectionAccepted) {
          return {
            error:
              "Design restriction: commit a design direction with set_design_direction before writing source.",
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
        if (HASH_CTA_FALLBACK_PATTERN.test(content)) {
          return {
            error:
              "Action restriction: use site.primaryCtaTarget or omit the business action instead of a hash CTA fallback.",
          };
        }
        if (
          ARBITRARY_TAILWIND_COLOR_PATTERN.test(content) ||
          ARBITRARY_INLINE_COLOR_PATTERN.test(content)
        ) {
          const err =
            "Design safety restriction: use semantic theme tokens and the protected design system instead of hardcoded color values.";
          devLog("generate", "write_file.rejected", {
            path,
            reason: "arbitrary_color",
            error: err,
          });
          return {
            error: err,
          };
        }
        if (DATA_IMAGE_PATTERN.test(content)) {
          const err =
            "Asset restriction: do not embed data-image assets. Use approved media paths or CSS-only decoration.";
          devLog("generate", "write_file.rejected", {
            path,
            reason: "embedded_asset",
            error: err,
          });
          return {
            error: err,
          };
        }
        const acceptedFactStrings = extractAcceptedFactStrings(schema);
        const unsupportedClaims = scanSourceClaims(
          content,
          { file: path },
          acceptedFactStrings,
        );
        if (unsupportedClaims.length > 0) {
          const err =
            "Fact restriction: high-risk literals must come from accepted facts in src/content/site.ts.";
          devLog("generate", "write_file.rejected", {
            path,
            reason: "unsupported_claims",
            categories: unsupportedClaims.map((c) => c.category),
          });
          return {
            error: err,
            categories: Array.from(
              new Set(unsupportedClaims.map((claim) => claim.category)),
            ),
            examples: unsupportedClaims.map((claim) => ({
              category: claim.category,
              text: claim.normalizedValue.slice(0, 160),
            })),
          };
        }
        for (const match of content.matchAll(
          /['\"]@\/components\/ui\/([a-z0-9-]+)['\"/]/g,
        )) {
          const name = match[1];
          const component = name
            ? SHADCN_COMPONENT_BY_NAME.get(name)
            : undefined;
          if (!component || fileMap.has(component.path)) {
            continue;
          }
          const currentFiles = Array.from(fileMap, ([p, c]) => ({
            content: c,
            path: p,
          }));
          for (const file of [
            ...resolveShadcnDeps(component, currentFiles),
            component,
          ]) {
            if (!fileMap.has(file.path)) {
              fileMap.set(file.path, file.content);
              touched.add(file.path);
            }
          }
          opSeq++;
          const operation = {
            detail: `Disalin otomatis karena diimpor oleh ${path}`,
            id: `op-${opSeq}`,
            path: component.path,
            state: "succeeded" as const,
            title: `Menyiapkan komponen ${name}`,
            type: "copy_component" as const,
          };
          operationTrace.push(operation);
          onEvent?.("operation", operation);
        }
        const unresolvedImports = collectUnresolvedImports(
          content,
          path,
          fileMap,
        );
        if (unresolvedImports.length > 0) {
          const err = `Unresolved imports in ${path}: ${unresolvedImports.join(" ")}`;
          devLog("generate", "write_file.rejected", {
            path,
            reason: "unresolved_imports",
            unresolved: unresolvedImports,
          });
          return {
            error: err,
            unresolved: unresolvedImports,
          };
        }
        const oldContent = fileMap.get(path) ?? "";
        // Only strip any remote font imports if model accidentally added them
        const cleanedContent = content.replace(
          /@import\s+url\(\s*["']https:\/\/fonts\.googleapis\.com\/[^)]*["']\s*\)\s*;?/gi,
          "",
        );
        const diff = generateDiff(oldContent, cleanedContent);
        fileMap.set(path, cleanedContent);
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
          onFileStaged({ path, content: cleanedContent });
        }
        await renewProjectOperation({
          projectId,
          token: input.operationToken ?? "",
          userId: input.userId,
        }).catch(() => undefined);
        return {
          success: true,
          path,
          bytes: cleanedContent.length,
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
          .describe("Judul progres singkat dalam bahasa Indonesia."),
        detail: z
          .string()
          .optional()
          .describe("Detail progres singkat dalam bahasa Indonesia."),
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
        if (!designDirectionAccepted) {
          return {
            errors: [
              "Design restriction: commit a design direction before checking the website.",
            ],
            failureReason: "design_direction_required",
            ok: false,
          };
        }
        if (!conceptSeedScriptRun) {
          return {
            errors: [
              "Design restriction: run the Impeccable concept-seed script before checking the website.",
            ],
            failureReason: "design_script_required",
            ok: false,
          };
        }
        if (!paletteScriptRun) {
          return {
            errors: [
              "Design restriction: run the applicable Impeccable palette script before checking the website.",
            ],
            failureReason: "design_script_required",
            ok: false,
          };
        }
        checkAppCalls += 1;
        opSeq++;
        const dummyPlaceholders = [
          /\blorem\s+ipsum\b/i,
          /\bcontoh\s+menu\b/i,
          /\bdeskripsi\s+disini\b/i,
          /\[nama\s+(produk|toko|menu)\]/i,
          /\btidak\s+ada\s+(foto|gambar)\b/i,
          /\b(foto|gambar)\s+belum\s+(tersedia|diunggah|ada)\b/i,
          /data:image\/(png|jpeg|webp|gif);base64/i,
        ];
        const placeholderIssues: string[] = [];
        for (const [path, content] of fileMap.entries()) {
          if (
            path.startsWith("src/components/") ||
            path.startsWith("src/routes/")
          ) {
            for (const re of dummyPlaceholders) {
              if (re.test(content)) {
                placeholderIssues.push(
                  `Dummy placeholder copy '${content.match(re)?.[0]}' detected in ${path}. Replace with real, grounded Indonesian text based on src/content/site.ts.`,
                );
              }
            }
          }
        }
        if (placeholderIssues.length > 0) {
          return {
            ok: false,
            failureReason: "placeholder_copy_detected",
            errors: placeholderIssues,
          };
        }

        ensureAllShadcnImportsResolved(fileMap, touched);
        const unsafeDesignFiles = Array.from(fileMap.entries())
          .filter(
            ([file, content]) =>
              file !== "src/index.css" &&
              (file.startsWith("src/components/") ||
                file.startsWith("src/routes/")) &&
              (ARBITRARY_INLINE_COLOR_PATTERN.test(content) ||
                DATA_IMAGE_PATTERN.test(content)),
          )
          .map(([file]) => file);
        if (unsafeDesignFiles.length > 0) {
          return {
            ok: false,
            failureReason: "unsafe_generated_design",
            errors: [
              `Generated source uses unapproved inline colors or embedded image data in ${unsafeDesignFiles.join(", ")}. Use semantic theme tokens and CSS-only decoration.`,
            ],
          };
        }
        const acceptedFactStrings = extractAcceptedFactStrings(schema);
        const hashCtaFiles = Array.from(fileMap.entries())
          .filter(
            ([file, content]) =>
              file !== "src/routes/not-found.tsx" &&
              HASH_CTA_FALLBACK_PATTERN.test(content),
          )
          .map(([file]) => file);
        if (hashCtaFiles.length > 0) {
          return {
            ok: false,
            failureReason: "hash_cta_fallback",
            errors: [
              `Business CTA fallback found in ${hashCtaFiles.join(", ")}.`,
            ],
          };
        }
        const sourceClaimIssues = Array.from(fileMap.entries()).flatMap(
          ([file, content]) =>
            scanSourceClaims(content, { file }, acceptedFactStrings),
        );
        if (sourceClaimIssues.length > 0) {
          return {
            ok: false,
            failureReason: "unsupported_source_claims",
            errors: sourceClaimIssues.map(
              (claim) =>
                `${claim.category} claim in ${claim.location.file}: remove or bind this unsupported literal (${claim.normalizedValue.slice(0, 160)}).`,
            ),
          };
        }
        const homeRouteContent = fileMap.get("src/routes/index.tsx") ?? "";
        if (
          !homeRouteContent.trim() ||
          homeRouteContent.includes("data-generated-site-starter")
        ) {
          return {
            ok: false,
            failureReason: "home_route_not_assembled",
            errors: [
              "Home route has not been written yet. Write the complete home route before checking.",
            ],
          };
        }

        const incompleteRoutes = (schema.routes ?? [])
          .map((route) => ({
            path: route.path,
            filePath:
              route.path === "/"
                ? "src/routes/index.tsx"
                : `src/routes/${route.path.slice(1)}.tsx`,
          }))
          .filter(({ filePath }) => {
            const content = fileMap.get(filePath) ?? "";
            return (
              !content.trim() || content.includes("data-route-placeholder")
            );
          });
        if (incompleteRoutes.length > 0) {
          return {
            ok: false,
            failureReason: "route_not_assembled",
            errors: [
              `Accepted route files are incomplete: ${incompleteRoutes.map((route) => route.path).join(", ")}.`,
            ],
          };
        }

        const currentFiles: GeneratedProjectFile[] = Array.from(
          fileMap.entries(),
        ).map(([path, content]) => ({
          path,
          content,
        }));

        const buildResult = await buildGeneratedProject(currentFiles, {
          workspaceKey: `${projectId}-agentic-check`,
        });
        lastCheckOk = buildResult.ok;
        const op = {
          id: `op-${opSeq}`,
          type: "check_app",
          title:
            label?.trim() ||
            (buildResult.ok
              ? "Memeriksa kesiapan website"
              : "Memeriksa & menyesuaikan website"),
          detail:
            detail?.trim() ||
            (buildResult.ok
              ? "Build sukses dan terverifikasi"
              : "Menyesuaikan kode website"),
          state: (buildResult.ok ? "succeeded" : "active") as
            "succeeded" | "active",
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
  };

  const availableImagesSection =
    schema.images && schema.images.length > 0
      ? `\n\nAPPROVED ASSETS:\n${formatPromptValue(schema.images)}`
      : "\n\nAPPROVED ASSETS: none";
  const acceptedFactsSection = `\n\nACCEPTED OWNER FACTS (the only customer-facing source of truth):\n${formatPromptValue(input.buildContract?.facts ?? schema, 50_000)}`;
  const ledgerSection = `\n\nFACT LEDGER (owner_confirmed entries only may render; ai_suggestion, unknown, and declined entries are non-renderable):\n${formatPromptValue(input.brief.factLedger, 50_000)}`;
  const discussionSection = `\n\nRAW DISCUSSION CONTEXT (preserve nuance, but never treat assistant text or an unconfirmed suggestion as a business fact):\n${formatPromptValue(input.brief.discussionContext, 50_000)}`;

  const workflowInstructions = isRevisionMode
    ? "Read the supplied project files, make the requested change, preserve unrelated work, and finish with check_app."
    : "Read every required skill, run the applicable design workflow, commit a direction, write the required source, and finish with check_app.";

  const systemPrompt = `You implement a standalone static Vite + React + TanStack Router website for an Indonesian UMKM.

The accepted build contract and plan are authoritative. Use their facts, approved assets, actions, omissions, and routes. Do not invent business information or capabilities. Use your own design judgment and the available Impeccable and shadcn skills.

Use the tools to read skills, inspect or write source, and run check_app before finishing. Do not stop with a conversational response. The platform owns protected scaffold files and validates source, claims, imports, and compilation.

For a new site, read the Unslop skill and every listed Impeccable reference, run concept-seed.mjs with --scope direction --mode persuade and the applicable palette script, call set_design_direction with a specific visual thesis, then call set_design_system before writing. Sparse facts constrain claims, not craft: avoid generic SaaS cards, default gradients, stock imagery, and filler copy. Use the business facts to make a deliberate visual world without inventing benefits, proof, prices, places, or capabilities. Use Unslop rules on every customer-facing string and progress label.

${workflowInstructions}${acceptedFactsSection}${ledgerSection}${discussionSection}${availableImagesSection}

Protected files are read-only: src/content/site.ts, src/index.css, src/main.tsx, src/router.tsx, src/routes/__root.tsx, src/routes/not-found.tsx, src/lib/preview-ready.ts, src/lib/utils.ts, src/components/ui/button.tsx, and src/components/ui/card.tsx.

Keep customer-facing copy grounded in site data. Omit unknown facts. Use approved /media paths only. Never use href=\"#\" or href=\"#/\" as a business CTA fallback. Use site.primaryCtaTarget when it exists; otherwise omit the action or render it as non-interactive text. Do not add packages, APIs, remote assets, fake transactions, login, persistence, or unsupported interactions. Use semantic theme tokens and preserve keyboard access, readable contrast, reduced motion, and safe mobile overflow. Do not invent package sizes, quantities, dates, hours, addresses, ratings, certifications, guarantees, or promotional adjectives. Bind every price, phone number, delivery area, product fact, and USP directly from site; do not repeat those literals in JSX. If a source write is rejected for a fact restriction, remove the reported unsupported literal rather than moving the same claim to another file.

Progress labels and details must be plain Indonesian. Do not expose file names, compiler terms, implementation jargon, or raw errors.`;

  const acceptedRoutes = input.buildPlan?.pages ?? schema.routes ?? [];
  const routesInstruction =
    acceptedRoutes.length > 0
      ? `\nACCEPTED ROUTES:\n${acceptedRoutes.map((route) => `- ${route.path}: ${route.title}`).join("\n")}`
      : "\nACCEPTED ROUTES: /";

  const hasExistingComponents = Boolean(
    isRevisionMode &&
    input.initialFiles?.some(
      (f) =>
        f.path.startsWith("src/components/site/") ||
        (f.path === "src/routes/index.tsx" &&
          !f.content.includes("data-generated-site-starter")),
    ),
  );

  const editIntent = isRevisionMode
    ? classifyEditIntent({
        existingFiles: Array.from(fileMap.keys()),
        hasUploadedImages: Boolean(schema.images && schema.images.length > 0),
        instruction:
          input.brief.prompt ||
          (typeof input.revisionBrief === "string" ? input.revisionBrief : ""),
      })
    : null;

  let targetFilesPreload = "";
  if (isRevisionMode && editIntent) {
    const preloadedBlocks: string[] = [];
    for (const targetPath of editIntent.targetFiles) {
      const content = fileMap.get(targetPath);
      if (
        content &&
        targetPath !== "src/content/site.ts" &&
        targetPath !== "src/index.css"
      ) {
        preloadedBlocks.push(
          `=== CURRENT CODE: ${targetPath} ===\n${content}\n=== END OF ${targetPath} ===`,
        );
      }
    }
    if (preloadedBlocks.length > 0) {
      targetFilesPreload =
        `\n\nPRE-LOADED TARGET FILES (DO NOT CALL read_file — CODE IS ALREADY PROVIDED BELOW):\n` +
        preloadedBlocks.join("\n\n");
    }
  }

  const existingFileList =
    input.initialFiles
      ?.filter(
        (f) =>
          f.path.startsWith("src/components/site/") ||
          f.path === "src/routes/index.tsx" ||
          f.path === "src/index.css",
      )
      .map((f) => `- ${f.path}`)
      .join("\n") || "";

  const executionContext = hasExistingComponents
    ? `EXISTING SITE FILES:\n${existingFileList}${targetFilesPreload}\n\nEDIT CATEGORY: ${editIntent?.category ?? "site update"}\nPreserve unrelated files, behavior, facts, routes, and working component boundaries.`
    : "Create the source required by the accepted routes and facts. Choose the composition and component boundaries yourself.";

  const contractContext = input.buildContract
    ? `\n\nACCEPTED BUILD CONTRACT:\n${formatPromptValue(input.buildContract)}`
    : "";
  const planContext = input.buildPlan
    ? `\n\nACCEPTED ROUTE PLAN:\n${formatPromptValue({
        capabilities: input.buildPlan.capabilities,
        navigation: input.buildPlan.navigation,
        pages: input.buildPlan.pages.map((page) => ({
          id: page.id,
          path: page.path,
          title: page.title,
          visitorJobIds: page.visitorJobIds,
          requiredFactIds: page.requiredFactIds,
        })),
      })}`
    : "";
  const userPrompt = input.revisionBrief
    ? `Update the existing static website for this user request:\n${formatPromptValue(input.revisionBrief)}\n\n${executionContext}`
    : `Build the static website for an Indonesian UMKM from the accepted data below.

${routesInstruction}

AUTHORITATIVE SITE DATA:
<site-data>
${formatPromptValue(schema)}
</site-data>${contractContext}${planContext}

${executionContext}`;

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
    toolChoice: "required",
    stopWhen: (step) => lastCheckOk === true || isStepCount(maxSteps)(step),
    abortSignal,
    ...getNoReasoningCallOptions(),
    timeout: {
      chunkMs: getAiTimeoutMs("agenticGenerate"),
      firstChunkMs: getAiTimeoutMs("agenticGenerate"),
      stepMs: getAiTimeoutMs("agenticGenerate"),
    },
    onStepFinish: async (step) => {
      devLog("generate", "step.detail", {
        toolCallsCount: step.toolCalls?.length,
        toolNames: step.toolCalls?.map((t) => t.toolName),
        text: step.text?.slice(0, 200),
      });
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
            toolCall.toolName === "write_file" &&
            typeof toolCall.args?.path === "string"
          ) {
            const fileName = toolCall.args.path.split("/").pop() || "komponen";
            toolReason = `build:write:${fileName}`;
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

        if (stepCharger.isExhausted()) {
          throw new Error(
            "Energi akun telah habis. Silakan isi ulang energi untuk melanjutkan pembuatan website.",
          );
        }
      }
    },
    telemetry: getAiTelemetry("project-agentic-generate", {
      projectId,
      userId: input.userId,
    }),
  });

  ensureAllShadcnImportsResolved(fileMap, touched);

  if (!checkAppCalls || lastCheckOk !== true) {
    const finalCheckRes = (await tools.check_app.execute(
      {
        detail: "Verifikasi deterministik setelah respons AI selesai.",
        label: "Memeriksa build akhir",
      },
      { context: {}, messages: [], toolCallId: "final-check" },
    )) as { errors?: string[]; ok?: boolean };
    if (!finalCheckRes.ok) {
      throw new Error(
        `Agent did not finish with a passing check_app: ${finalCheckRes.errors?.join("; ") || "Build failed"}`,
      );
    }
  }

  const missing = missingCoreSkills();
  if (missing.length) {
    throw new Error(
      `Agent did not read required skills before finishing: ${missing.join(", ")}.`,
    );
  }
  const customFilesWritten = isRevisionMode
    ? touched.size > 0
    : Array.from(touched).some((p) => p !== "src/index.css");

  if (!customFilesWritten) {
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
    operationTrace,
    skillsRead: PROJECT_SKILL_NAMES.filter((name) => skillsRead.has(name)),
  };
}
