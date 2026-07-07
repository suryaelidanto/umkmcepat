import { stepCountIs, tool, ToolLoopAgent } from "ai";
import { z } from "zod";

import { getAiModel } from "@/lib/ai";
import {
  runGeneratedAppAgentTools,
  type GeneratedAppAgentToolCommand,
} from "@/lib/projects/agent-tool-runner";
import {
  buildGeneratedProject,
  createGeneratedProjectFiles,
  createGeneratedViteTanStackStarterFiles,
  type GeneratedProjectFile,
} from "@/lib/projects/generated-source";
import { type ProjectSiteSchema } from "@/lib/projects/site-schema";

export type CustomGeneratedSourceResult =
  | {
      files: GeneratedProjectFile[];
      generationMode: "agent-custom";
      repairAttempts: number;
      summary: string;
      touchedFiles: string[];
    }
  | {
      fallbackReason: string;
      files: GeneratedProjectFile[];
      generationMode: "deterministic-fallback";
      repairAttempts: number;
      summary: string;
      touchedFiles: string[];
    };

export async function generateCustomProjectFilesWithAgent({
  projectId,
  schema,
}: {
  projectId: string;
  schema: ProjectSiteSchema;
}): Promise<CustomGeneratedSourceResult> {
  const starterFiles = createGeneratedViteTanStackStarterFiles(
    projectId,
    schema,
  );
  const fallbackFiles = createGeneratedProjectFiles(projectId, schema);
  let files = starterFiles;
  const touchedFiles = new Set<string>();

  const runCommand = (command: GeneratedAppAgentToolCommand) => {
    const result = runGeneratedAppAgentTools({ commands: [command], files });
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
      instructions: buildGeneratedAppAgentInstructions(schema),
      stopWhen: stepCountIs(28),
      tools: createAgentTools(runCommand),
    });

    const result = await agent.generate({ prompt: buildAgentPrompt(schema) });
    let quality = checkAgentSourceQuality(files, touchedFiles);

    if (!quality.ok) {
      return fallback(fallbackFiles, quality.issues.join(", "), 0);
    }

    let repairAttempts = 0;

    if (!process.env.VITEST) {
      const build = await buildGeneratedProject(files);

      if (!build.ok) {
        repairAttempts = 1;
        await agent.generate({
          prompt: `${buildAgentPrompt(schema)}\n\nPrevious build failed. Repair the source using this build log, then run check_app.\n\n${build.log.slice(-6000)}`,
        });
        quality = checkAgentSourceQuality(files, touchedFiles);

        if (!quality.ok) {
          return fallback(
            fallbackFiles,
            `repair failed: ${quality.issues.join(", ")}`,
            repairAttempts,
          );
        }

        const repairedBuild = await buildGeneratedProject(files);

        if (!repairedBuild.ok) {
          return fallback(
            fallbackFiles,
            `repair build failed: ${repairedBuild.log.slice(-1000)}`,
            repairAttempts,
          );
        }
      }
    }

    return {
      files,
      generationMode: "agent-custom",
      repairAttempts,
      summary: result.text || "AI coding agent generated custom source files.",
      touchedFiles: [...touchedFiles].sort(),
    };
  } catch (error) {
    return fallback(
      fallbackFiles,
      error instanceof Error ? error.message : "agent failed",
      0,
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
      inputSchema: z.object({ path: z.string() }),
      execute: ({ path }) => runCommand({ path, type: "read_file" }),
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

  if (!files.some((file) => file.path.startsWith("src/components/"))) {
    issues.push("missing component files");
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

  if (!sourceText.includes("umkmcepat-preview-ready")) {
    issues.push("preview-ready signal missing");
  }

  return issues.length ? { issues, ok: false } : { issues: [], ok: true };
}

function fallback(
  files: GeneratedProjectFile[],
  fallbackReason: string,
  repairAttempts: number,
): CustomGeneratedSourceResult {
  return {
    fallbackReason,
    files,
    generationMode: "deterministic-fallback",
    repairAttempts,
    summary:
      "AI coding agent did not produce valid custom source; deterministic source was used.",
    touchedFiles: [],
  };
}

function buildAgentPrompt(schema: ProjectSiteSchema) {
  return `Build a custom generated UMKM Cepat app from the starter files.

Business schema:
${JSON.stringify(schema, null, 2)}

Required steps:
1. list_files
2. read the router, index route, content, style files
3. edit/create multiple files so the app feels specific to this business
4. keep static frontend only
5. run check_app after all writes
6. final answer: concise summary and touched files`;
}

function buildGeneratedAppAgentInstructions(schema: ProjectSiteSchema) {
  return `You are an expert frontend coding agent inside a generated Vite React TypeScript TanStack Router project.

Rules:
- Use the provided file tools only.
- Keep all paths inside the generated project.
- Static frontend only: no backend, API routes, DB, auth, payment, checkout, fake persistence, browser automation, or native deps.
- User-facing copy must be Indonesian.
- Do not dump raw brief answers; rewrite into polished customer copy.
- Prefer custom CSS, React components, content modules, and routes.
- Make structure specific to this business: ${schema.businessName} / ${schema.offer} / ${schema.audience}.
- Do not add packages unless already allowed by package policy.
- Keep preview readiness working.
- You must edit or create multiple files.
- You must call check_app after final write.
- If unsure, make the smallest safe custom improvement.`;
}
