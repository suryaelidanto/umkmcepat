import { isStepCount, tool, ToolLoopAgent } from "ai";
import { z } from "zod";

import {
  runGeneratedAppAgentTools,
  type GeneratedAppAgentOperation,
  type GeneratedAppAgentToolCommand,
  type GeneratedAppAgentToolSideEffect,
} from "./agent-tool-runner";
import { type GeneratedProjectFile } from "./generated-types";

import { getAiModel, getAiTelemetry } from "@/lib/ai";
import { getDefaultAiModel } from "@/lib/ai-models";
import { withAiTimeout } from "@/lib/ai-timeouts";

export async function editGeneratedSourceWithAgent({
  files,
  instruction,
  model,
  onOperation,
  onFilesChanged,
  abortSignal,
}: {
  files: GeneratedProjectFile[];
  instruction: string;
  model?: string;
  onOperation?: (operation: GeneratedAppAgentOperation) => void;
  onFilesChanged?: (files: GeneratedProjectFile[]) => void;
  abortSignal?: AbortSignal;
}) {
  let currentFiles = files;
  const operationTrace: GeneratedAppAgentOperation[] = [];
  let hasEditedFiles = false;

  const runCommand = (command: GeneratedAppAgentToolCommand) => {
    // Guard: block check_app before any edits for edit agent too
    if (command.type === "check_app" && !hasEditedFiles) {
      return {
        type: command.type,
        error:
          "No source files edited yet. You MUST call write_file or replace_in_file BEFORE calling check_app.",
      };
    }

    const result = runGeneratedAppAgentTools({
      commands: [command],
      files: currentFiles,
      onOperation(operation) {
        const next = { ...operation, id: `${operationTrace.length + 1}` };
        operationTrace.push(next);
        onOperation?.(next);
      },
    });
    currentFiles = result.files;

    if (command.type === "write_file" || command.type === "replace_in_file") {
      hasEditedFiles = true;
      onFilesChanged?.(currentFiles);
    }

    return result.outputs.at(-1) ?? { type: command.type };
  };

  const agent = new ToolLoopAgent({
    model: getAiModel(model || getDefaultAiModel()),
    // Reasoning models spend tokens on hidden reasoning_content per step;
    // raise the per-step budget so visible tool calls still land.
    maxOutputTokens: 12_000,
    instructions: EDIT_AGENT_INSTRUCTIONS,
    telemetry: getAiTelemetry("project-source-edit-agent", {
      fileCount: files.length,
      model: model || getDefaultAiModel(),
    }),
    stopWhen: isStepCount(18),
    tools: {
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
        description: "Validate manifest and package policy after edits.",
        inputSchema: z.object({}),
        execute: () => runCommand({ type: "check_app" }),
      }),
    },
  });

  const localAbortController = new AbortController();
  if (abortSignal) {
    abortSignal.addEventListener("abort", () => localAbortController.abort(), {
      once: true,
    });
    if (abortSignal.aborted) {
      localAbortController.abort();
    }
  }

  const result = await withAiTimeout(
    agent.generate({
      prompt: [
        "Edit the generated source to satisfy this user request.",
        "Read files before editing. Make the smallest relevant source changes. Run check_app after edits.",
        instruction,
      ].join("\n\n"),
      abortSignal: localAbortController.signal,
    }),
    model ? "editRepair" : "edit",
    localAbortController,
  );

  const finalCheck = runGeneratedAppAgentTools({
    commands: [{ type: "check_app" }],
    files: currentFiles,
  });

  const sideEffects: GeneratedAppAgentToolSideEffect[] = [
    ...operationTrace
      .filter((operation) =>
        ["write_file", "replace_in_file"].includes(operation.type),
      )
      .map((operation) => ({ path: operation.path, type: operation.type })),
    { type: "check_app" },
  ];

  return {
    ...finalCheck,
    files: currentFiles,
    modelId:
      "response" in result && result.response
        ? result.response.modelId
        : model || getDefaultAiModel(),
    operations: operationTrace.length ? operationTrace : finalCheck.operations,
    sideEffects,
    usage: {
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
    },
  };
}

const EDIT_AGENT_INSTRUCTIONS = `You edit a generated static Vite React app for UMKM Cepat.
Rules:
- User-facing copy must be Indonesian.
- Static frontend only: no auth/session, database, payment gateway, fake /api routes, or new dependencies (package.json is platform-owned). Prefer WA/contact CTA over fake login/checkout systems. Business copy may mention cara bayar.
- Do not expose annotation selectors/classes/DOM metadata in visible UI.
- Build success is not enough. Make concrete changes that satisfy the user's requested targets.
- For visual annotation requests, inspect target text/classes/nearby text, then edit existing rendered JSX/content/CSS.
- Avoid no-op CSS. New CSS selectors must match existing generated JSX/classes/tags.
- Prefer precise edits. Do not rewrite the whole app for small visual fixes.
- STYLING CONTRACT (extremely strict):
  * Tailwind CSS v4 is pre-installed. You MUST write all styles using standard Tailwind utility classes directly in the TSX (e.g. className="flex flex-col gap-4 p-6 bg-slate-900 rounded-xl shadow-lg").
  * Do NOT write custom CSS classNames (like "btn-primary", "nav-link", "contact-form", "hero-section") or custom styles in src/styles.css. Keep styles.css unedited.
  * Do NOT use h-screen. Always use min-h-dvh or min-h-screen for full viewport sections.
- ROUTING & PAGE CONTRACT (strict):
  * src/routes/index.tsx MUST export a component named HomeRouteComponent: "export function HomeRouteComponent() { ... }"
  * Do NOT create new route files under src/routes/ (like tentang.tsx, kontak.tsx, or product detail pages).
  * If you need multiple pages/views, implement them as React state-based tab/view switching (e.g. const [activePage, setActivePage] = useState("home")) directly inside src/routes/index.tsx.
  * Do NOT use TanStack Router's <Link> component or routing tags (like Link from '@tanstack/react-router') for switching pages/tabs. Doing so causes compile errors since those paths are not registered in the static router. Use standard HTML tags (like <button> or <a>) with React state (onClick={() => setActivePage('...')}) instead.
  * Do NOT edit or overwrite src/main.tsx, src/router.tsx, or src/routes/__root.tsx. Keep routing simple, standard, and encapsulated inside HomeRouteComponent.
  * Import usePreviewReady from "../lib/preview-ready" (NOT from hooks).
  * Import the business data using: import { site } from "../content/site" (or import site from "../content/site"). All files under src/content/site.ts must export 'site' as both named and default exports.
- Always run check_app after source changes.`;
