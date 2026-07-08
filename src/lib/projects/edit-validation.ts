import { type GeneratedProjectFile } from "./generated-source";

export type EditValidationResult = {
  advisoryIssues: string[];
  blockingIssues: string[];
  changedFiles: string[];
  ok: boolean;
};

const RENDERED_SOURCE_PREFIXES = ["src/"];
const NON_RENDERED_PATHS = new Set(["src/lib/preview-ready.ts"]);

export function validateGeneratedEdit({
  baseFiles,
  nextFiles,
  touchedFiles,
}: {
  baseFiles: GeneratedProjectFile[];
  instruction: string;
  nextFiles: GeneratedProjectFile[];
  touchedFiles: string[];
}): EditValidationResult {
  const blockingIssues: string[] = [];
  const advisoryIssues: string[] = [];
  const changedFiles = getChangedFiles(baseFiles, nextFiles);
  const renderedChangedFiles = changedFiles.filter(isRenderedSourcePath);

  if (!renderedChangedFiles.length) {
    blockingIssues.push("No rendered source files changed.");
  }

  const meaningfulTouchedFiles = touchedFiles.filter(isRenderedSourcePath);

  if (!meaningfulTouchedFiles.length) {
    blockingIssues.push(
      "No rendered source files were touched by the edit agent.",
    );
  }

  advisoryIssues.push(...getSuspiciousCssSelectorIssues(baseFiles, nextFiles));

  return {
    advisoryIssues,
    blockingIssues,
    changedFiles,
    ok: blockingIssues.length === 0,
  };
}

export function getChangedFiles(
  baseFiles: GeneratedProjectFile[],
  nextFiles: GeneratedProjectFile[],
) {
  const base = new Map(baseFiles.map((file) => [file.path, file.content]));

  return nextFiles
    .filter((file) => base.get(file.path) !== file.content)
    .map((file) => file.path)
    .sort();
}

function isRenderedSourcePath(path: string) {
  return (
    RENDERED_SOURCE_PREFIXES.some((prefix) => path.startsWith(prefix)) &&
    !NON_RENDERED_PATHS.has(path) &&
    !path.endsWith(".test.ts") &&
    !path.endsWith(".test.tsx")
  );
}

function getSuspiciousCssSelectorIssues(
  baseFiles: GeneratedProjectFile[],
  nextFiles: GeneratedProjectFile[],
) {
  const issues: string[] = [];
  const baseByPath = new Map(
    baseFiles.map((file) => [file.path, file.content]),
  );
  const sourceText = stripSourceNoise(
    nextFiles
      .filter(
        (file) => file.path.startsWith("src/") && !file.path.endsWith(".css"),
      )
      .map((file) => file.content)
      .join("\n"),
  );

  for (const file of nextFiles.filter((item) => item.path.endsWith(".css"))) {
    const previous = baseByPath.get(file.path) ?? "";
    const addedCss = getAddedLines(previous, file.content).join("\n");

    for (const selector of extractSimpleCssSelectors(addedCss)) {
      if (!selectorHasSourceMatch(selector, sourceText)) {
        issues.push(
          `CSS selector ${selector} does not match generated source.`,
        );
      }
    }
  }

  return issues;
}

function getAddedLines(previous: string, next: string) {
  const previousLines = new Map<string, number>();

  for (const line of previous.split("\n")) {
    previousLines.set(line, (previousLines.get(line) ?? 0) + 1);
  }

  return next.split("\n").filter((line) => {
    const count = previousLines.get(line) ?? 0;

    if (count > 0) {
      previousLines.set(line, count - 1);
      return false;
    }

    return line.trim();
  });
}

function extractSimpleCssSelectors(css: string) {
  const selectors = new Set<string>();
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

  for (const line of withoutComments.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("@") || !trimmed.includes("{")) {
      continue;
    }

    const selectorText = trimmed.slice(0, trimmed.indexOf("{")).trim();

    if (!selectorText || selectorText.includes("}")) {
      continue;
    }

    for (const selector of selectorText.split(",")) {
      const normalized = selector.trim();

      if (/^([.#]?[_a-zA-Z][-_a-zA-Z0-9]*)(:[\w-]+)?$/.test(normalized)) {
        selectors.add(normalized.replace(/:[\w-]+$/, ""));
      }
    }
  }

  return [...selectors];
}

function selectorHasSourceMatch(selector: string, sourceText: string) {
  const className = selector.match(/^\.([_a-zA-Z][-_a-zA-Z0-9]*)$/)?.[1];

  if (className) {
    return new RegExp(
      `\\bclassName\\s*=\\s*['\"][^'\"]*\\b${escapeRegExp(className)}\\b`,
      "i",
    ).test(sourceText);
  }

  const id = selector.match(/^#([_a-zA-Z][-_a-zA-Z0-9]*)$/)?.[1];

  if (id) {
    return new RegExp(`\\bid\\s*=\\s*['\"]${escapeRegExp(id)}['\"]`, "i").test(
      sourceText,
    );
  }

  return new RegExp(`<${escapeRegExp(selector)}\\b`, "i").test(sourceText);
}

function stripSourceNoise(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
