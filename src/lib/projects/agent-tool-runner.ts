import { devLog } from "@/lib/dev-log";
import { validateGeneratedAppManifest } from "@/lib/projects/generated-app-manifest";
import {
  isPlatformOwnedGeneratedPath,
  validateGeneratedBuildPolicy,
} from "@/lib/projects/generated-build-policy";
import { assertGeneratedResourceBudget } from "@/lib/projects/generated-resource-budget";
import { assertSafeProjectFilePath } from "@/lib/projects/generated-source";
import { type GeneratedProjectFile } from "@/lib/projects/generated-types";

export type GeneratedAppAgentToolCommand =
  | { type: "check_app" }
  | { pathPrefix?: string; type: "list_files" }
  | {
      endLineOneIndexedInclusive?: number;
      path: string;
      startLineOneIndexed?: number;
      type: "read_file";
    }
  | { query: string; pathPrefix?: string; type: "search_files" }
  | { content: string; path: string; type: "write_file" }
  | { find: string; path: string; replace: string; type: "replace_in_file" };

export type GeneratedAppAgentToolSideEffect = {
  path?: string;
  type: GeneratedAppAgentToolCommand["type"];
};

const MAX_OPERATION_TRACE = 80;
const MAX_OPERATION_DETAIL_LENGTH = 500;
const MAX_LIST_PATHS = 200;
const MAX_READ_CHARS = 20_000;
const MAX_SEARCH_PATHS = 100;

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

export type GeneratedAppAgentOperation = {
  detail: string;
  id: string;
  path?: string;
  state: "failed" | "succeeded";
  title: string;
  type: GeneratedAppAgentToolCommand["type"];
};

export function runGeneratedAppAgentTools({
  commands,
  files,
  onOperation,
}: {
  commands: GeneratedAppAgentToolCommand[];
  files: GeneratedProjectFile[];
  onOperation?: (operation: GeneratedAppAgentOperation) => void;
}) {
  let currentFiles = normalizeFiles(files);
  let check: GeneratedAppAgentCheckResult | null = null;
  let changedSinceLastCheck = false;
  let hasToolError = false;
  const operations: GeneratedAppAgentOperation[] = [];
  const outputs: GeneratedAppAgentToolOutput[] = [];
  const sideEffects: GeneratedAppAgentToolSideEffect[] = [];

  function emit(operation: Omit<GeneratedAppAgentOperation, "id">) {
    if (operations.length >= MAX_OPERATION_TRACE) {
      return;
    }

    const next = {
      ...operation,
      detail: truncate(operation.detail, MAX_OPERATION_DETAIL_LENGTH),
      id: `${operations.length + 1}`,
    };
    operations.push(next);
    devLog("agent-tool", next.type, {
      path: next.path,
      state: next.state,
      title: next.title,
    });
    onOperation?.(next);
  }

  for (const command of commands) {
    if (command.type === "list_files") {
      const safePathPrefix = getSafeOptionalPathPrefix(command.pathPrefix);

      if (!safePathPrefix.ok) {
        hasToolError = true;
        emitFailed(
          "Gagal membaca struktur file",
          safePathPrefix.error,
          command.type,
        );
        outputs.push({ error: safePathPrefix.error, type: command.type });
        continue;
      }

      const pathPrefix = safePathPrefix.pathPrefix;
      const allPaths = currentFiles
        .map((file) => file.path)
        .filter((filePath) =>
          pathPrefix ? filePath.startsWith(pathPrefix) : true,
        )
        .sort();
      const paths = allPaths.slice(0, MAX_LIST_PATHS);
      emit({
        detail:
          allPaths.length > paths.length
            ? `${paths.length} dari ${allPaths.length} file ditampilkan.`
            : `${paths.length} file ditemukan.`,
        path: pathPrefix || undefined,
        state: "succeeded",
        title: "Membaca struktur file",
        type: command.type,
      });
      outputs.push({ paths, type: command.type });
      continue;
    }

    if (command.type === "read_file") {
      const safePath = getSafeCommandPath(command.path);

      if (!safePath.ok) {
        hasToolError = true;
        emitFailed(
          "Gagal membaca file",
          safePath.error,
          command.type,
          command.path,
        );
        outputs.push({ error: safePath.error, type: command.type });
        continue;
      }

      const filePath = safePath.path;
      const content = currentFiles.find(
        (file) => file.path === filePath,
      )?.content;

      if (content == null) {
        hasToolError = true;
        const error = `File not found: ${filePath}`;
        emitFailed("Gagal membaca file", error, command.type, filePath);
        outputs.push({ error, type: command.type });
        continue;
      }

      const result = truncate(
        sliceLines(
          content,
          command.startLineOneIndexed,
          command.endLineOneIndexedInclusive,
        ),
        MAX_READ_CHARS,
      );
      emit({
        detail: lineReadDetail(content, result),
        path: filePath,
        state: "succeeded",
        title: "Membaca file",
        type: command.type,
      });
      outputs.push({ result, type: command.type });
      continue;
    }

    if (command.type === "search_files") {
      const safePathPrefix = getSafeOptionalPathPrefix(command.pathPrefix);

      if (!safePathPrefix.ok) {
        hasToolError = true;
        emitFailed("Gagal mencari file", safePathPrefix.error, command.type);
        outputs.push({ error: safePathPrefix.error, type: command.type });
        continue;
      }

      const pathPrefix = safePathPrefix.pathPrefix;
      const allPaths = currentFiles
        .filter((file) =>
          pathPrefix ? file.path.startsWith(pathPrefix) : true,
        )
        .filter((file) => file.content.includes(command.query))
        .map((file) => file.path)
        .sort();
      const paths = allPaths.slice(0, MAX_SEARCH_PATHS);
      emit({
        detail:
          allPaths.length > paths.length
            ? `${paths.length} dari ${allPaths.length} hasil pencarian ditampilkan.`
            : `${paths.length} file cocok dengan pencarian.`,
        path: pathPrefix || undefined,
        state: "succeeded",
        title: "Mencari file",
        type: command.type,
      });
      outputs.push({ paths, type: command.type });
      continue;
    }

    if (command.type === "write_file") {
      const safePath = getEditableCommandPath(command.path);

      if (!safePath.ok) {
        hasToolError = true;
        emitFailed(
          "Gagal menulis file",
          safePath.error,
          command.type,
          command.path,
        );
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
      emit({
        detail: "File dibuat atau ditimpa oleh agent.",
        path: filePath,
        state: "succeeded",
        title: "Menulis file",
        type: command.type,
      });
      outputs.push({ result: "written", type: command.type });
      continue;
    }

    if (command.type === "replace_in_file") {
      const safePath = getEditableCommandPath(command.path);

      if (!safePath.ok) {
        hasToolError = true;
        emitFailed(
          "Gagal mengedit file",
          safePath.error,
          command.type,
          command.path,
        );
        outputs.push({ error: safePath.error, type: command.type });
        continue;
      }

      const filePath = safePath.path;
      const file = currentFiles.find((item) => item.path === filePath);

      if (!file) {
        hasToolError = true;
        const error = `File not found: ${filePath}`;
        emitFailed("Gagal mengedit file", error, command.type, filePath);
        outputs.push({ error, type: command.type });
        continue;
      }

      if (!command.find) {
        hasToolError = true;
        const error = "Replacement target cannot be empty.";
        emitFailed("Gagal mengedit file", error, command.type, filePath);
        outputs.push({ error, type: command.type });
        continue;
      }

      const matchCount = countOccurrences(file.content, command.find);

      if (matchCount !== 1) {
        hasToolError = true;
        const error =
          matchCount === 0
            ? `Replacement target not found in ${filePath}.`
            : `Replacement target must be unique in ${filePath}; found ${matchCount} matches.`;
        emitFailed("Gagal mengedit file", error, command.type, filePath);
        outputs.push({ error, type: command.type });
        continue;
      }

      currentFiles = upsertFile(currentFiles, {
        content: file.content.replace(command.find, command.replace),
        path: filePath,
      });
      changedSinceLastCheck = true;
      sideEffects.push({ path: filePath, type: command.type });
      emit({
        detail: "Perubahan presisi diterapkan ke satu lokasi.",
        path: filePath,
        state: "succeeded",
        title: "Mengedit file",
        type: command.type,
      });
      outputs.push({ result: "replaced", type: command.type });
      continue;
    }

    check = checkGeneratedApp(currentFiles);
    changedSinceLastCheck = false;
    sideEffects.push({ type: command.type });
    emit({
      detail: check.ok
        ? "Manifest dan package policy valid."
        : check.issues.join("\n"),
      state: check.ok ? "succeeded" : "failed",
      title: check.ok ? "Mengecek app" : "Check app gagal",
      type: command.type,
    });
    outputs.push({
      result: check.ok ? "passed" : check.issues.join("\n"),
      type: command.type,
    });
  }

  if (changedSinceLastCheck) {
    check = { issues: ["App check must run after source changes."], ok: false };
  }

  return {
    check,
    files: currentFiles,
    ok: check?.ok === true && !hasToolError,
    operations,
    outputs,
    sideEffects,
  };

  function emitFailed(
    title: string,
    detail: string,
    type: GeneratedAppAgentToolCommand["type"],
    path?: string,
  ) {
    emit({ detail, path, state: "failed", title, type });
  }
}

function checkGeneratedApp(
  files: GeneratedProjectFile[],
): GeneratedAppAgentCheckResult {
  try {
    assertGeneratedResourceBudget(files, "source");
  } catch (error) {
    return {
      issues: [
        error instanceof Error
          ? error.message
          : "Generated source exceeds platform limits.",
      ],
      ok: false,
    };
  }

  const manifestResult = validateGeneratedAppManifest(files);

  if (!manifestResult.ok) {
    return { issues: manifestResult.issues, ok: false };
  }

  const buildPolicyResult = validateGeneratedBuildPolicy(
    files,
    manifestResult.manifest.runtimeProfile,
  );

  if (!buildPolicyResult.ok) {
    return { issues: buildPolicyResult.issues, ok: false };
  }

  const designIssues = getGeneratedDesignIssues(files);

  if (designIssues.length) {
    return { issues: designIssues, ok: false };
  }

  return { issues: [], ok: true };
}

function getGeneratedDesignIssues(files: GeneratedProjectFile[]) {
  const issues: string[] = [];
  const paths = new Set(files.map((file) => file.path));
  const sourceText = files
    .filter((file) =>
      /^(src\/|DESIGN\.md$|PRODUCT\.md$|AGENTS\.md$)/.test(file.path),
    )
    .map((file) => file.content)
    .join("\n")
    .toLowerCase();

  if (/\.umkmcepat\//.test([...paths].join("\n"))) {
    issues.push(
      "Generated source must not include platform-branded .umkmcepat files.",
    );
  }

  if (/gradient-?text|background-clip:\s*text|bg-clip-text/.test(sourceText)) {
    issues.push("Generic gradient text is blocked by design policy.");
  }

  if (/h-screen\b/.test(sourceText)) {
    issues.push(
      "Use min-height: 100dvh instead of h-screen for viewport sections.",
    );
  }

  return issues;
}

function normalizeFiles(files: GeneratedProjectFile[]) {
  return files.map((file) => ({
    content: file.content,
    path: assertAgentPath(file.path),
  }));
}

function normalizeAgentPath(filePath: string): string {
  let normalized = filePath.trim();

  if (normalized === "." || normalized === "./" || normalized === "/") {
    return "";
  }

  while (normalized.startsWith("./") || normalized.startsWith("/")) {
    normalized = normalized.replace(/^[./]+/, "");
  }

  return normalized;
}

function assertAgentPath(filePath: string) {
  assertSafeProjectFilePath(filePath);
  return filePath;
}

function getSafeCommandPath(
  filePath: string,
): { ok: true; path: string } | { error: string; ok: false } {
  const normalized = normalizeAgentPath(filePath);
  if (!normalized) {
    return {
      error: "File path cannot be empty or root directory.",
      ok: false,
    };
  }
  try {
    return { ok: true, path: assertAgentPath(normalized) };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Generated path is unsafe.",
      ok: false,
    };
  }
}

function getEditableCommandPath(
  filePath: string,
): { ok: true; path: string } | { error: string; ok: false } {
  const safePath = getSafeCommandPath(filePath);

  if (!safePath.ok) {
    return safePath;
  }

  if (isPlatformOwnedGeneratedPath(safePath.path)) {
    return {
      error: `Platform-owned generated file cannot be edited: ${safePath.path}`,
      ok: false,
    };
  }

  return safePath;
}

function getSafeOptionalPathPrefix(
  pathPrefix?: string,
): { ok: true; pathPrefix: string } | { error: string; ok: false } {
  const normalized = pathPrefix ? normalizeAgentPath(pathPrefix) : "";
  if (!normalized) {
    return { ok: true, pathPrefix: "" };
  }

  try {
    const sentinelPath = normalized.endsWith("/")
      ? `${normalized}index`
      : normalized;
    assertAgentPath(sentinelPath);
    return { ok: true, pathPrefix: normalized };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Generated path prefix is unsafe.",
      ok: false,
    };
  }
}

function upsertFile(
  files: GeneratedProjectFile[],
  nextFile: GeneratedProjectFile,
) {
  const withoutExisting = files.filter((file) => file.path !== nextFile.path);
  return [...withoutExisting, nextFile].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
}

function countOccurrences(value: string, needle: string) {
  if (!needle) {
    return 0;
  }

  let count = 0;
  let index = value.indexOf(needle);

  while (index !== -1) {
    count += 1;
    index = value.indexOf(needle, index + needle.length);
  }

  return count;
}

function sliceLines(value: string, start?: number, end?: number) {
  if (start == null && end == null) {
    return value;
  }

  const hasTrailingNewline = value.endsWith("\n");
  const lines = (hasTrailingNewline ? value.slice(0, -1) : value).split("\n");
  const startIndex = Math.max(0, (start ?? 1) - 1);
  const endIndex = Math.min(lines.length, end ?? lines.length);
  const result = lines.slice(startIndex, endIndex).join("\n");
  return endIndex >= lines.length && hasTrailingNewline
    ? `${result}\n`
    : result;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength
    ? `${value.slice(0, maxLength)}\n[truncated]`
    : value;
}

function lineReadDetail(fullContent: string, result: string) {
  const totalLines = fullContent ? fullContent.split("\n").length : 0;
  const readLines = result ? result.split("\n").length : 0;
  return readLines === totalLines
    ? `${totalLines} baris dibaca.`
    : `${readLines} dari ${totalLines} baris dibaca.`;
}
