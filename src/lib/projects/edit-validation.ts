import { type GeneratedProjectFile } from "./generated-source";

export type EditValidationResult =
  | { issues: string[]; ok: false }
  | { issues: []; ok: true };

const RENDERED_SOURCE_PREFIXES = ["src/"];
const NON_RENDERED_PATHS = new Set(["src/lib/preview-ready.ts"]);
const MIN_RELEVANCE_TOKEN_LENGTH = 4;

export function validateGeneratedEdit({
  baseFiles,
  instruction,
  nextFiles,
  touchedFiles,
}: {
  baseFiles: GeneratedProjectFile[];
  instruction: string;
  nextFiles: GeneratedProjectFile[];
  touchedFiles: string[];
}): EditValidationResult {
  const issues: string[] = [];
  const changedFiles = getChangedFiles(baseFiles, nextFiles);
  const renderedChangedFiles = changedFiles.filter(isRenderedSourcePath);

  if (!renderedChangedFiles.length) {
    issues.push("No rendered source files changed.");
  }

  const meaningfulTouchedFiles = touchedFiles.filter(isRenderedSourcePath);

  if (!meaningfulTouchedFiles.length) {
    issues.push("No rendered source files were touched by the edit agent.");
  }

  const cssIssues = getNoopCssSelectorIssues(baseFiles, nextFiles);
  issues.push(...cssIssues);

  if (isVisualAnnotationInstruction(instruction)) {
    const relevanceIssues = getVisualInstructionRelevanceIssues({
      changedFiles: renderedChangedFiles,
      instruction,
      nextFiles,
    });
    issues.push(...relevanceIssues);
  }

  return issues.length ? { issues, ok: false } : { issues: [], ok: true };
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

function getNoopCssSelectorIssues(
  baseFiles: GeneratedProjectFile[],
  nextFiles: GeneratedProjectFile[],
) {
  const issues: string[] = [];
  const baseByPath = new Map(
    baseFiles.map((file) => [file.path, file.content]),
  );
  const sourceText = nextFiles
    .filter(
      (file) => file.path.startsWith("src/") && !file.path.endsWith(".css"),
    )
    .map((file) => file.content)
    .join("\n");

  for (const file of nextFiles.filter((item) => item.path.endsWith(".css"))) {
    const previous = baseByPath.get(file.path) ?? "";
    const addedCss = getAddedLines(previous, file.content).join("\n");

    for (const selector of extractCssSelectors(addedCss)) {
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

function extractCssSelectors(css: string) {
  const selectors = new Set<string>();
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectorPattern = /([^{}@][^{}]*)\{/g;
  let match: RegExpExecArray | null;

  while ((match = selectorPattern.exec(withoutComments))) {
    for (const selector of match[1].split(",")) {
      const normalized = selector.trim();

      if (
        normalized &&
        !normalized.includes("from") &&
        !normalized.includes("to")
      ) {
        selectors.add(normalized);
      }
    }
  }

  return [...selectors];
}

function selectorHasSourceMatch(selector: string, sourceText: string) {
  const simple = selector.replace(
    /:(hover|focus|active|visited|disabled|before|after|focus-visible|focus-within)\b/g,
    "",
  );
  const classNames = [...simple.matchAll(/\.([_a-zA-Z][-_a-zA-Z0-9]*)/g)].map(
    (match) => match[1],
  );
  const ids = [...simple.matchAll(/#([_a-zA-Z][-_a-zA-Z0-9]*)/g)].map(
    (match) => match[1],
  );

  if (classNames.length || ids.length) {
    return [...classNames, ...ids].some((token) => sourceText.includes(token));
  }

  const tag = simple.match(/^([a-z][a-z0-9-]*)\b/i)?.[1];
  return tag ? new RegExp(`<${tag}\\b`, "i").test(sourceText) : true;
}

function isVisualAnnotationInstruction(instruction: string) {
  return /Visual comments:/i.test(instruction);
}

function getVisualInstructionRelevanceIssues({
  changedFiles,
  instruction,
  nextFiles,
}: {
  changedFiles: string[];
  instruction: string;
  nextFiles: GeneratedProjectFile[];
}) {
  const issues: string[] = [];
  const tokens = extractRelevanceTokens(instruction);
  const changedText = nextFiles
    .filter((file) => changedFiles.includes(file.path))
    .map((file) => file.content)
    .join("\n")
    .toLowerCase();

  if (tokens.length && !tokens.some((token) => changedText.includes(token))) {
    issues.push(
      "Changed files do not reference the visual annotation targets.",
    );
  }

  return issues;
}

function extractRelevanceTokens(instruction: string) {
  const tokens = new Set<string>();
  const jsonStart = instruction.indexOf("[");
  const jsonText = jsonStart >= 0 ? instruction.slice(jsonStart) : "";

  try {
    const parsed = JSON.parse(jsonText) as Array<{
      label?: string;
      selectedText?: string;
      target?: { classes?: string; selectorPath?: string; text?: string };
    }>;

    for (const item of parsed) {
      addWords(tokens, item.label);
      addWords(tokens, item.selectedText);
      addWords(tokens, item.target?.text);
      addWords(tokens, item.target?.classes);
      addWords(tokens, item.target?.selectorPath?.replace(/[.#>]/g, " "));
    }
  } catch {
    addWords(tokens, instruction);
  }

  return [...tokens].filter(
    (token) =>
      token.length >= MIN_RELEVANCE_TOKEN_LENGTH &&
      !STOP_WORDS.has(token) &&
      !/^\d+$/.test(token),
  );
}

function addWords(tokens: Set<string>, value?: string) {
  for (const token of (value ?? "")
    .toLowerCase()
    .match(/[a-z0-9_-]+|[\p{L}\p{N}_-]+/gu) ?? []) {
    tokens.add(token);
  }
}

const STOP_WORDS = new Set([
  "bagian",
  "website",
  "warna",
  "text",
  "teks",
  "ganti",
  "jangan",
  "dengan",
  "yang",
  "sama",
  "jadi",
  "coba",
  "dong",
  "untuk",
  "visual",
  "comments",
  "comment",
  "target",
  "selectorpath",
  "classes",
  "label",
]);
