import { stepCountIs, tool, ToolLoopAgent } from "ai";
import { z } from "zod";

import { getAiModel, getAiTelemetry } from "@/lib/ai";
import { getDefaultAiModel } from "@/lib/ai-models";
import { withAiTimeout } from "@/lib/ai-timeouts";
import { AI_MAX_TOKENS_EDIT } from "@/lib/user-credits";

import {
  runGeneratedAppAgentTools,
  type GeneratedAppAgentOperation,
  type GeneratedAppAgentToolCommand,
  type GeneratedAppAgentToolSideEffect,
} from "./agent-tool-runner";
import { type GeneratedProjectFile } from "./generated-types";

export async function editGeneratedSourceWithAgent({
  files,
  instruction,
  model,
}: {
  files: GeneratedProjectFile[];
  instruction: string;
  model?: string;
}) {
  let currentFiles = files;
  const operationTrace: GeneratedAppAgentOperation[] = [];

  const runCommand = (command: GeneratedAppAgentToolCommand) => {
    const result = runGeneratedAppAgentTools({
      commands: [command],
      files: currentFiles,
      onOperation(operation) {
        operationTrace.push({
          ...operation,
          id: `${operationTrace.length + 1}`,
        });
      },
    });
    currentFiles = result.files;
    return result.outputs.at(-1) ?? { type: command.type };
  };

  const agent = new ToolLoopAgent({
    model: getAiModel(model || getDefaultAiModel()),
    instructions: EDIT_AGENT_INSTRUCTIONS,
    maxOutputTokens: AI_MAX_TOKENS_EDIT,
    experimental_telemetry: getAiTelemetry("project-source-edit-agent", {
      fileCount: files.length,
      model: model || getDefaultAiModel(),
    }),
    stopWhen: stepCountIs(18),
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

  await withAiTimeout(
    agent.generate({
      prompt: [
        "Edit the generated source to satisfy this user request.",
        "Read files before editing. Make the smallest relevant source changes. Run check_app after edits.",
        instruction,
      ].join("\n\n"),
    }),
    model ? "editRepair" : "edit",
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
    operations: operationTrace.length ? operationTrace : finalCheck.operations,
    sideEffects,
  };
}

const EDIT_AGENT_INSTRUCTIONS = `You edit a generated static Vite React app for UMKM Cepat.
Rules:
- User-facing copy must be Indonesian.
- Do not add backend/auth/payment/database code or dependencies.
- Do not expose annotation selectors/classes/DOM metadata in visible UI.
- Build success is not enough. Make concrete changes that satisfy the user's requested targets.
- For visual annotation requests, inspect target text/classes/nearby text, then edit existing rendered JSX/content/CSS.
- Avoid no-op CSS. New CSS selectors must match existing generated JSX/classes/tags.
- Prefer precise edits. Do not rewrite the whole app for small visual fixes.
- Always run check_app after source changes.`;
