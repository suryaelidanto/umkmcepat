import { stepCountIs, tool, ToolLoopAgent } from "ai";
import { z } from "zod";

import { getAiModel } from "@/lib/ai";
import {
  runGeneratedAppAgentTools,
  type GeneratedAppAgentOperation,
  type GeneratedAppAgentToolCommand,
} from "@/lib/projects/agent-tool-runner";
import {
  buildGeneratedProject,
  createGeneratedProjectFiles,
  createGeneratedViteTanStackStarterFiles,
  type GeneratedProjectFile,
} from "@/lib/projects/generated-source";
import { type ImplementationSpec } from "@/lib/projects/implementation-spec";
import { type ProjectSiteSchema } from "@/lib/projects/site-schema";

export type CustomGeneratedSourceResult =
  | {
      buildSpec: string;
      files: GeneratedProjectFile[];
      generationMode: "agent-custom";
      operationTrace: GeneratedAppAgentOperation[];
      repairAttempts: number;
      summary: string;
      touchedFiles: string[];
    }
  | {
      buildSpec: string;
      fallbackReason: string;
      files: GeneratedProjectFile[];
      generationMode: "deterministic-fallback";
      operationTrace: GeneratedAppAgentOperation[];
      repairAttempts: number;
      summary: string;
      touchedFiles: string[];
    };

export async function generateCustomProjectFilesWithAgent({
  implementationBrief,
  onOperation,
  projectId,
  implementationSpec,
  schema,
}: {
  implementationBrief?: string;
  implementationSpec?: ImplementationSpec;
  onOperation?: (operation: GeneratedAppAgentOperation) => void;
  projectId: string;
  schema: ProjectSiteSchema;
}): Promise<CustomGeneratedSourceResult> {
  const starterFiles = createGeneratedViteTanStackStarterFiles(
    projectId,
    schema,
  );
  const fallbackFiles = createGeneratedProjectFiles(projectId, schema);
  const appSpec = buildGeneratedAppBuildSpec({
    conversationBrief: implementationBrief,
    implementationSpec,
    schema,
  });
  let files = starterFiles;
  const operationTrace: GeneratedAppAgentOperation[] = [];
  const touchedFiles = new Set<string>();

  const runCommand = (command: GeneratedAppAgentToolCommand) => {
    const result = runGeneratedAppAgentTools({
      commands: [command],
      files,
      onOperation(operation) {
        const traced = { ...operation, id: `${operationTrace.length + 1}` };
        operationTrace.push(traced);
        onOperation?.(traced);
      },
    });
    files = result.files;

    for (const effect of result.sideEffects) {
      if (effect.path) {
        touchedFiles.add(effect.path);
      }
    }

    return result.outputs.at(-1) ?? { type: command.type };
  };

  try {
    const agent = new ToolLoopAgent({
      model: getAiModel(),
      instructions: buildGeneratedAppAgentInstructions(
        schema,
        implementationSpec,
      ),
      stopWhen: stepCountIs(28),
      tools: createAgentTools(runCommand),
    });

    const result = await agent.generate({ prompt: buildAgentPrompt(appSpec) });
    let quality = checkAgentSourceQuality(files, touchedFiles);

    if (!quality.ok) {
      return fallback(fallbackFiles, quality.issues.join(", "), 0, {
        buildSpec: appSpec,
        operationTrace,
        touchedFiles,
      });
    }

    let repairAttempts = 0;

    if (!process.env.VITEST) {
      const build = await buildGeneratedProject(files);

      if (!build.ok) {
        repairAttempts = 1;
        await agent.generate({
          prompt: `${buildAgentPrompt(appSpec)}\n\nPrevious build failed. Repair the source using this build log, then run check_app.\n\n${build.log.slice(-6000)}`,
        });
        quality = checkAgentSourceQuality(files, touchedFiles);

        if (!quality.ok) {
          return fallback(
            fallbackFiles,
            `repair failed: ${quality.issues.join(", ")}`,
            repairAttempts,
            { buildSpec: appSpec, operationTrace, touchedFiles },
          );
        }

        const repairedBuild = await buildGeneratedProject(files);

        if (!repairedBuild.ok) {
          return fallback(
            fallbackFiles,
            `repair build failed: ${repairedBuild.log.slice(-1000)}`,
            repairAttempts,
            { buildSpec: appSpec, operationTrace, touchedFiles },
          );
        }
      }
    }

    return {
      buildSpec: appSpec,
      files,
      generationMode: "agent-custom",
      operationTrace,
      repairAttempts,
      summary: result.text || "AI coding agent generated custom source files.",
      touchedFiles: [...touchedFiles].sort(),
    };
  } catch (error) {
    return fallback(
      fallbackFiles,
      error instanceof Error ? error.message : "agent failed",
      0,
      { buildSpec: appSpec, operationTrace, touchedFiles },
    );
  }
}

function createAgentTools(
  runCommand: (command: GeneratedAppAgentToolCommand) => unknown,
) {
  return {
    list_files: tool({
      description: "List generated project files.",
      inputSchema: z.object({ pathPrefix: z.string().optional() }),
      execute: ({ pathPrefix }) =>
        runCommand({ pathPrefix, type: "list_files" }),
    }),
    read_file: tool({
      description: "Read one generated project file.",
      inputSchema: z.object({
        endLineOneIndexedInclusive: z.number().int().min(1).optional(),
        path: z.string(),
        startLineOneIndexed: z.number().int().min(1).optional(),
      }),
      execute: ({ endLineOneIndexedInclusive, path, startLineOneIndexed }) =>
        runCommand({
          endLineOneIndexedInclusive,
          path,
          startLineOneIndexed,
          type: "read_file",
        }),
    }),
    search_files: tool({
      description: "Search generated project files by exact text.",
      inputSchema: z.object({
        pathPrefix: z.string().optional(),
        query: z.string(),
      }),
      execute: ({ pathPrefix, query }) =>
        runCommand({ pathPrefix, query, type: "search_files" }),
    }),
    write_file: tool({
      description: "Create or overwrite a generated project file.",
      inputSchema: z.object({ content: z.string(), path: z.string() }),
      execute: ({ content, path }) =>
        runCommand({ content, path, type: "write_file" }),
    }),
    replace_in_file: tool({
      description: "Replace exact text in a generated project file.",
      inputSchema: z.object({
        find: z.string(),
        path: z.string(),
        replace: z.string(),
      }),
      execute: ({ find, path, replace }) =>
        runCommand({ find, path, replace, type: "replace_in_file" }),
    }),
    check_app: tool({
      description:
        "Validate manifest, package policy, and source safety after edits.",
      inputSchema: z.object({}),
      execute: () => runCommand({ type: "check_app" }),
    }),
  };
}

function checkAgentSourceQuality(
  files: GeneratedProjectFile[],
  touchedFiles: Set<string>,
): { issues: string[]; ok: false } | { issues: []; ok: true } {
  const check = runGeneratedAppAgentTools({
    commands: [{ type: "check_app" }],
    files,
  });
  const issues = [...(check.check?.issues ?? [])];

  if (!check.ok) {
    issues.push("agent check failed");
  }

  if (touchedFiles.size < 2) {
    issues.push("agent did not edit enough files");
  }

  if (!files.some((file) => file.path.startsWith("src/routes/"))) {
    issues.push("missing route files");
  }

  const routeEdited = [...touchedFiles].some((path) =>
    path.startsWith("src/routes/"),
  );
  const presentationEdited = [...touchedFiles].some(
    (path) => path.startsWith("src/components/") || path === "src/styles.css",
  );
  const contentEdited = [...touchedFiles].some((path) =>
    path.startsWith("src/content/"),
  );

  if (!routeEdited) {
    issues.push("agent did not edit route files");
  }

  if (!presentationEdited) {
    issues.push("agent did not edit presentation files");
  }

  if (!contentEdited) {
    issues.push("agent did not edit content files");
  }

  if (!files.some((file) => file.path.startsWith("src/content/"))) {
    issues.push("missing content files");
  }

  const sourceText = files
    .filter((file) =>
      /^(src\/(routes|components|content|lib)\/|src\/styles\.css)/.test(
        file.path,
      ),
    )
    .map((file) => file.content)
    .join("\n")
    .toLowerCase();

  if (/checkout|payment|login|register|api\//i.test(sourceText)) {
    issues.push("unsupported fake backend/auth/payment language detected");
  }

  if (!sourceText.includes("generated-app-preview-ready")) {
    issues.push("preview-ready signal missing");
  }

  return issues.length ? { issues, ok: false } : { issues: [], ok: true };
}

function fallback(
  files: GeneratedProjectFile[],
  fallbackReason: string,
  repairAttempts: number,
  trace?: {
    buildSpec: string;
    operationTrace: GeneratedAppAgentOperation[];
    touchedFiles: Set<string>;
  },
): CustomGeneratedSourceResult {
  return {
    buildSpec: trace?.buildSpec ?? "",
    fallbackReason,
    files,
    generationMode: "deterministic-fallback",
    operationTrace: trace?.operationTrace ?? [],
    repairAttempts,
    summary:
      "AI coding agent did not produce valid custom source; deterministic source was used.",
    touchedFiles: trace ? [...trace.touchedFiles].sort() : [],
  };
}

function buildAgentPrompt(implementationBrief: string) {
  return `Build a custom standalone generated app from the starter files.

Implementation brief:
${implementationBrief}

Required steps:
1. list_files
2. read PRODUCT.md, DESIGN.md, .agents/skills/impeccable/SKILL.md, router, index route, content, and style files; use line ranges for large files
3. create at least one component under src/components/custom/ unless a better domain folder already exists
4. edit route, content, and CSS files so the app feels designed, not pasted answers
5. keep static frontend only
6. run check_app after all writes
7. final answer: concise summary and touched files`;
}

export function buildGeneratedAppBuildSpec(
  input:
    | ProjectSiteSchema
    | {
        conversationBrief?: string;
        implementationSpec?: ImplementationSpec;
        schema: ProjectSiteSchema;
      },
  legacyConversationBrief = "",
) {
  const { conversationBrief, implementationSpec, schema } =
    "schema" in input
      ? {
          conversationBrief: input.conversationBrief ?? "",
          implementationSpec: input.implementationSpec,
          schema: input.schema,
        }
      : {
          conversationBrief: legacyConversationBrief,
          implementationSpec: undefined,
          schema: input,
        };
  return [
    implementationSpec
      ? `App kind: ${implementationSpec.appKind}`
      : "App kind: landing fallback",
    `Business: ${implementationSpec?.businessName || schema.businessName}`,
    implementationSpec
      ? `Pages: ${implementationSpec.pages.map((page) => `${page.slug} — ${page.title}: ${page.purpose}`).join(" | ")}`
      : `Audience: ${schema.audience}`,
    implementationSpec
      ? `Components: ${implementationSpec.components.map((component) => `${component.name}: ${component.purpose}`).join(" | ")}`
      : `Offer: ${schema.offer}`,
    implementationSpec
      ? `Features: ${implementationSpec.features.join(", ")}`
      : `Primary CTA: ${schema.primaryCta}`,
    `Visual direction: ${implementationSpec?.style.direction || `background ${schema.theme.background}; foreground ${schema.theme.foreground}; muted ${schema.theme.muted}; accent ${schema.theme.accent}`}`,
    conversationBrief ? `Conversation summary:\n${conversationBrief}` : "",
    implementationSpec
      ? `Structured content:\n${JSON.stringify(implementationSpec.content, null, 2)}`
      : "",
    "Build intent:",
    "- Build the structure declared above. Do not force everything into one generic landing page.",
    "- If appKind is interactive_app, create useful static frontend interactions only; no backend persistence.",
    "- Invent layout, hierarchy, cards, flows, pages, and proof points that fit the business.",
    "- Rewrite user answers into customer-facing Indonesian copy; the result must feel designed, not a transcript.",
    "- Use business-specific visual metaphors; avoid generic white cards copied from a schema.",
    "Required source shape:",
    "- Routes own composition only.",
    "- Content module owns structured copy/data.",
    "- CSS owns visual identity.",
    "- Components own specific visual or interactive sections.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildGeneratedAppAgentInstructions(
  schema: ProjectSiteSchema,
  implementationSpec?: ImplementationSpec,
) {
  return `You are an expert frontend coding agent inside a generated Vite React TypeScript TanStack Router project.

Rules:
- Use the provided file tools only.
- Keep all paths inside the generated project.
- Static frontend only: no backend, API routes, DB, auth, payment, checkout, fake persistence, browser automation, or native deps.
- User-facing copy must be Indonesian.
- Do not dump raw brief answers; transform them into the app structure requested by the implementation spec.
- Create React components; do not keep everything in one route file.
- Prefer custom CSS, React components, content modules, and routes.
- Make structure specific to this business: ${implementationSpec?.businessName || schema.businessName} / ${implementationSpec?.appKind || "landing"} / ${(implementationSpec?.features || [schema.offer, schema.audience]).join(", ")}.
- Do not add packages unless already allowed by package policy.
- Follow PRODUCT.md, DESIGN.md, and .agents/skills/impeccable/SKILL.md. Do not run installers or CLIs.
- Keep preview readiness working.
- You must edit route, content, and styling files.
- You should create at least one src/components/custom/*.tsx file for the main visual section.
- You must call check_app after final write.
- If unsure, make the smallest safe custom improvement.`;
}
