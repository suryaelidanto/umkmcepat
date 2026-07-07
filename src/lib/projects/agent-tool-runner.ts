import { validateGeneratedAppManifest } from "@/lib/projects/generated-app-manifest";
import { validateGeneratedPackagePolicy } from "@/lib/projects/generated-package-policy";
import {
  assertSafeProjectFilePath,
  type GeneratedProjectFile,
} from "@/lib/projects/generated-source";

export type GeneratedAppAgentToolCommand =
  | { type: "check_app" }
  | { pathPrefix?: string; type: "list_files" }
  | { path: string; type: "read_file" }
  | { query: string; pathPrefix?: string; type: "search_files" }
  | { content: string; path: string; type: "write_file" }
  | {
      find: string;
      path: string;
      replace: string;
      type: "replace_in_file";
    };

export type GeneratedAppAgentToolSideEffect = {
  path?: string;
  type: GeneratedAppAgentToolCommand["type"];
};

export type GeneratedAppAgentToolOutput = {
  error?: string;
  paths?: string[];
  result?: string;
  type: GeneratedAppAgentToolCommand["type"];
};

export type GeneratedAppAgentCheckResult = {
  issues: string[];
  ok: boolean;
};

export function runGeneratedAppAgentTools({
  commands,
  files,
}: {
  commands: GeneratedAppAgentToolCommand[];
  files: GeneratedProjectFile[];
}) {
  let currentFiles = normalizeFiles(files);
  let check: GeneratedAppAgentCheckResult | null = null;
  let changedSinceLastCheck = false;
  let hasToolError = false;
  const outputs: GeneratedAppAgentToolOutput[] = [];
  const sideEffects: GeneratedAppAgentToolSideEffect[] = [];

  for (const command of commands) {
    if (command.type === "list_files") {
      const safePathPrefix = getSafeOptionalPathPrefix(command.pathPrefix);

      if (!safePathPrefix.ok) {
        hasToolError = true;
        outputs.push({ error: safePathPrefix.error, type: command.type });
        continue;
      }

      const pathPrefix = safePathPrefix.pathPrefix;
      outputs.push({
        paths: currentFiles
          .map((file) => file.path)
          .filter((filePath) =>
            pathPrefix ? filePath.startsWith(pathPrefix) : true,
          )
          .sort(),
        type: command.type,
      });
      continue;
    }

    if (command.type === "read_file") {
      const safePath = getSafeCommandPath(command.path);

      if (!safePath.ok) {
        hasToolError = true;
        outputs.push({ error: safePath.error, type: command.type });
        continue;
      }

      const filePath = safePath.path;
      outputs.push({
        result: currentFiles.find((file) => file.path === filePath)?.content,
        type: command.type,
      });
      continue;
    }

    if (command.type === "search_files") {
      const safePathPrefix = getSafeOptionalPathPrefix(command.pathPrefix);

      if (!safePathPrefix.ok) {
        hasToolError = true;
        outputs.push({ error: safePathPrefix.error, type: command.type });
        continue;
      }

      const pathPrefix = safePathPrefix.pathPrefix;
      outputs.push({
        paths: currentFiles
          .filter((file) =>
            pathPrefix ? file.path.startsWith(pathPrefix) : true,
          )
          .filter((file) => file.content.includes(command.query))
          .map((file) => file.path)
          .sort(),
        type: command.type,
      });
      continue;
    }

    if (command.type === "write_file") {
      const safePath = getSafeCommandPath(command.path);

      if (!safePath.ok) {
        hasToolError = true;
        outputs.push({ error: safePath.error, type: command.type });
        continue;
      }

      const filePath = safePath.path;
      currentFiles = upsertFile(currentFiles, {
        content: command.content,
        path: filePath,
      });
      changedSinceLastCheck = true;
      sideEffects.push({ path: filePath, type: command.type });
      outputs.push({ result: "written", type: command.type });
      continue;
    }

    if (command.type === "replace_in_file") {
      const safePath = getSafeCommandPath(command.path);

      if (!safePath.ok) {
        hasToolError = true;
        outputs.push({ error: safePath.error, type: command.type });
        continue;
      }

      const filePath = safePath.path;
      const file = currentFiles.find((item) => item.path === filePath);

      if (!file) {
        hasToolError = true;
        outputs.push({
          error: `File not found: ${filePath}`,
          type: command.type,
        });
        continue;
      }

      if (!command.find) {
        hasToolError = true;
        outputs.push({
          error: "Replacement target cannot be empty.",
          type: command.type,
        });
        continue;
      }

      if (!file.content.includes(command.find)) {
        hasToolError = true;
        outputs.push({
          error: `Replacement target not found in ${filePath}.`,
          type: command.type,
        });
        continue;
      }

      currentFiles = upsertFile(currentFiles, {
        content: file.content.replaceAll(command.find, command.replace),
        path: filePath,
      });
      changedSinceLastCheck = true;
      sideEffects.push({ path: filePath, type: command.type });
      outputs.push({ result: "replaced", type: command.type });
      continue;
    }

    check = checkGeneratedApp(currentFiles);
    changedSinceLastCheck = false;
    sideEffects.push({ type: command.type });
    outputs.push({
      result: check.ok ? "passed" : check.issues.join("\n"),
      type: command.type,
    });
  }

  if (changedSinceLastCheck) {
    check = {
      issues: ["App check must run after source changes."],
      ok: false,
    };
  }

  return {
    check,
    files: currentFiles,
    ok: check?.ok === true && !hasToolError,
    outputs,
    sideEffects,
  };
}

function checkGeneratedApp(
  files: GeneratedProjectFile[],
): GeneratedAppAgentCheckResult {
  const manifestResult = validateGeneratedAppManifest(files);

  if (!manifestResult.ok) {
    return { issues: manifestResult.issues, ok: false };
  }

  const packagePolicyResult = validateGeneratedPackagePolicy(
    files,
    manifestResult.manifest.runtimeProfile,
  );

  if (!packagePolicyResult.ok) {
    return { issues: packagePolicyResult.issues, ok: false };
  }

  return { issues: [], ok: true };
}

function normalizeFiles(files: GeneratedProjectFile[]) {
  return files.map((file) => ({
    content: file.content,
    path: assertAgentPath(file.path),
  }));
}

function assertAgentPath(filePath: string) {
  assertSafeProjectFilePath(filePath);
  return filePath;
}

function getSafeCommandPath(
  filePath: string,
): { ok: true; path: string } | { error: string; ok: false } {
  try {
    return { ok: true, path: assertAgentPath(filePath) };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Generated path is unsafe.",
      ok: false,
    };
  }
}

function getSafeOptionalPathPrefix(
  pathPrefix?: string,
): { ok: true; pathPrefix: string } | { error: string; ok: false } {
  if (!pathPrefix) {
    return { ok: true, pathPrefix: "" };
  }

  const safePath = getSafeCommandPath(
    pathPrefix.endsWith("/") ? `${pathPrefix}index` : pathPrefix,
  );

  return safePath.ok
    ? { ok: true, pathPrefix }
    : { error: safePath.error, ok: false };
}

function upsertFile(files: GeneratedProjectFile[], next: GeneratedProjectFile) {
  const found = files.some((file) => file.path === next.path);

  if (!found) {
    return [...files, next].sort((left, right) =>
      left.path.localeCompare(right.path),
    );
  }

  return files.map((file) => (file.path === next.path ? next : file));
}
