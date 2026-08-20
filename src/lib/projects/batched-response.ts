import {
  normalizeWriterDesignPlanV2Candidate,
  parseWriterDesignPlanV2,
  type WriterDesignPlanV2,
} from "./generated-site-design-plan";
import {
  parseWriterDesignPlanV3,
  type WriterDesignPlanV3,
} from "./professional-site-plan";
import { SHADCN_COMPONENT_BY_NAME } from "./scaffold/shadcn-components";

import type {
  GeneratedSiteDesignKitV1,
  GeneratedSiteKitMediaMode,
} from "./generated-site-design-kits/types";
import type { ProfessionalSiteBlueprintV1 } from "./professional-site-blueprint";
import type { GeneratedSiteDesignKitV2 } from "./professional-site-kits";

export function isAllowedBatchedPath(path: string): boolean {
  if (!path || typeof path !== "string") {
    return false;
  }
  if (path.includes("\\") || path.includes("//") || path.includes("\0")) {
    return false;
  }
  if (/\.env($|\.)/.test(path)) {
    return false;
  }
  for (const segment of path.split("/")) {
    if (!segment || segment === "." || segment === "..") {
      return false;
    }
  }
  if (!(path.startsWith("src/") || path.startsWith("public/"))) {
    return false;
  }
  return true;
}

export type BatchedDiagnostic = {
  code: string;
  message: string;
  offset: number;
  path?: string;
};

export type BatchedFile = { content: string; path: string };

export type WriterDesignPlanV1 = {
  contractHash: string;
  recipeId: string;
  mediaMode: "owner_assets" | "replaceable_slots" | "graphic" | "typographic";
  visualThesis: string;
  hierarchy: string[];
  sectionOrder: string[];
  signatureElement: string;
};

export type BatchedParseResult = {
  designPlan: WriterDesignPlanV1 | null;
  designPlanV2: WriterDesignPlanV2 | null;
  designPlanV3: WriterDesignPlanV3 | null;
  stoppedAfterRequiredFilePaths: boolean;
  diagnostics: BatchedDiagnostic[];
  done: { summary: string } | null;
  files: Map<string, BatchedFile>;
  proposals: { path: string; reason: string }[];
};

export class BatchedParseError extends Error {
  readonly code: string;
  readonly offset: number;
  readonly path?: string;

  constructor(input: {
    code: string;
    message: string;
    offset: number;
    path?: string;
  }) {
    super(input.message);
    this.name = "BatchedParseError";
    this.code = input.code;
    this.offset = input.offset;
    this.path = input.path;
  }
}

export type BatchedResponseParser = {
  push: (chunk: string) => void;
  finalize: () => BatchedParseResult;
  readonly stagedPaths: readonly string[];
  stagedFile: (path: string) => BatchedFile | undefined;
  readonly failed: boolean;
  readonly stoppedAfterFilePath: boolean;
  readonly stoppedAfterRequiredFilePaths: boolean;
};

const MAX_PROSE_SCAN = 199_000;
const MAX_DESIGN_PLAN_CHARS = 8_192;

type TagInfo = {
  attrs: Map<string, string>;
  name: string;
  selfClosing: boolean;
};

function parseWriterDesignPlan(
  raw: string,
  fail: (message: string) => never,
): WriterDesignPlanV1 {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return fail("invalid design-plan JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail("invalid design-plan object.");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set([
    "contractHash",
    "recipeId",
    "mediaMode",
    "visualThesis",
    "hierarchy",
    "sectionOrder",
    "signatureElement",
  ]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    return fail("invalid design-plan fields.");
  }
  const mediaModes = new Set([
    "owner_assets",
    "replaceable_slots",
    "graphic",
    "typographic",
  ]);
  const stringArray = (key: string): string[] | null => {
    const item = record[key];
    return Array.isArray(item) &&
      item.every((value) => typeof value === "string")
      ? item
      : null;
  };
  const hierarchy = stringArray("hierarchy");
  const sectionOrder = stringArray("sectionOrder");
  if (
    typeof record.contractHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.contractHash) ||
    typeof record.recipeId !== "string" ||
    typeof record.mediaMode !== "string" ||
    !mediaModes.has(record.mediaMode) ||
    typeof record.visualThesis !== "string" ||
    !hierarchy ||
    !sectionOrder ||
    typeof record.signatureElement !== "string"
  ) {
    return fail("invalid design-plan shape.");
  }
  return {
    contractHash: record.contractHash,
    recipeId: record.recipeId,
    mediaMode: record.mediaMode as WriterDesignPlanV1["mediaMode"],
    visualThesis: record.visualThesis,
    hierarchy,
    sectionOrder,
    signatureElement: record.signatureElement,
  };
}

export function createBatchedResponseParser(options?: {
  requireDesignPlan?: boolean;
  designPlanV3Expected?: {
    blueprint: ProfessionalSiteBlueprintV1;
    kit: GeneratedSiteDesignKitV2;
  };
  requiredFilePaths?: string[];
  stopAfterRequiredFilePaths?: boolean;
  designPlanV2Expected?: {
    contractHash: string;
    kit: GeneratedSiteDesignKitV1;
    mediaMode: GeneratedSiteKitMediaMode;
    requiredSectionIds: string[];
  };
  designPlanV2Fallback?: WriterDesignPlanV2;
  implicitDoneSummary?: string;
  stopAfterFilePath?: string;
}): BatchedResponseParser {
  let pending = "";
  let consumedChars = 0;
  const files = new Map<string, BatchedFile>();
  const proposals: { path: string; reason: string }[] = [];
  const diagnostics: BatchedDiagnostic[] = [];
  let designPlan: WriterDesignPlanV1 | null = null;
  let designPlanV2: WriterDesignPlanV2 | null = null;
  let designPlanV3: WriterDesignPlanV3 | null = null;
  let doneSummary: string | null = null;
  let stoppedAfterFilePath = false;
  let stoppedAfterRequiredFilePaths = false;
  const requiredFilePaths = new Set(options?.requiredFilePaths ?? []);
  const closedRequiredFilePaths = new Set<string>();
  let hardError: BatchedParseError | null = null;
  let finalizeCalled = false;
  let finalResult: BatchedParseResult | null = null;

  function fail(input: {
    code: string;
    message: string;
    offset: number;
    path?: string;
  }): never {
    const error = new BatchedParseError(input);
    hardError = error;
    throw error;
  }

  function decodeEntities(value: string): string {
    return value
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#x2F;|&#47;/g, "/")
      .replace(/&amp;/g, "&");
  }

  const ATTR_PATTERN =
    /([^\s="'/>]+)\s*=\s*"([^"]*)"|([^\s="'/>]+)\s*=\s*'([^']*)'/y;
  const WS_PATTERN = /\s+/y;

  function parseTag(inner: string, tagOffset: number): TagInfo {
    const selfClosing = /\/\s*$/.test(inner);
    const body = selfClosing ? inner.replace(/\/\s*$/, "") : inner;
    const nameMatch = body.match(/^\s*([^\s/>]+)/);
    if (!nameMatch) {
      fail({
        code: "malformed-tag",
        message: "Malformed tag: no tag name.",
        offset: tagOffset,
      });
    }
    const name = nameMatch[1];
    const attrs = new Map<string, string>();
    let cursor = nameMatch[0].length;
    while (cursor < body.length) {
      WS_PATTERN.lastIndex = cursor;
      if (WS_PATTERN.test(body)) {
        cursor = WS_PATTERN.lastIndex;
        continue;
      }
      ATTR_PATTERN.lastIndex = cursor;
      const match = ATTR_PATTERN.exec(body);
      if (!match) {
        fail({
          code: "malformed-tag",
          message: `Malformed attributes on <${name}>: "${body.slice(cursor, cursor + 40).trim()}".`,
          offset: tagOffset + cursor,
        });
      }
      const key = match[1] ?? match[3];
      const value = match[2] ?? match[4] ?? "";
      if (attrs.has(key)) {
        fail({
          code: "duplicate-attr",
          message: `Duplicate attribute "${key}" on <${name}>.`,
          offset: tagOffset + cursor,
        });
      }
      attrs.set(key, decodeEntities(value));
      cursor = ATTR_PATTERN.lastIndex;
    }
    return { attrs, name, selfClosing };
  }

  function requireAttr(tag: TagInfo, key: string, tagOffset: number): string {
    const value = tag.attrs.get(key);
    if (value == null || !value.trim()) {
      fail({
        code: `missing-${key}`,
        message: `<${tag.name}> requires a non-empty ${key} attribute.`,
        offset: tagOffset,
      });
    }
    return value.trim();
  }

  function forbidExtraAttrs(
    tag: TagInfo,
    allowed: readonly string[],
    tagOffset: number,
  ): void {
    for (const key of tag.attrs.keys()) {
      if (!allowed.includes(key)) {
        fail({
          code: "unknown-attr",
          message: `<${tag.name}> has unknown attribute "${key}".`,
          offset: tagOffset,
        });
      }
    }
  }

  function cleanContent(raw: string): string {
    return raw.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
  }

  function findTerminator(needle: string, from: number): number {
    let index = from;
    let quote: '"' | "'" | "`" | null = null;
    while (index < pending.length) {
      const char = pending[index];
      if (quote) {
        if (char === "\\") {
          index += 2;
          continue;
        }
        if (char === quote) {
          quote = null;
        }
        index += 1;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") {
        quote = char;
        index += 1;
        continue;
      }
      if (char === "<" && pending.startsWith(needle, index)) {
        return index;
      }
      index += 1;
    }
    return -1;
  }

  function consume(chars: number): void {
    pending = pending.slice(chars);
    consumedChars += chars;
  }

  function step(): boolean {
    if (!pending) {
      return false;
    }
    if (stoppedAfterFilePath || stoppedAfterRequiredFilePaths) {
      consume(pending.length);
      return true;
    }

    const ltIndex = pending.indexOf("<");
    if (ltIndex < 0) {
      // Pure prose tail; hold up to the scan cap, drop as consumed.
      if (!finalizeCalled && pending.length > MAX_PROSE_SCAN) {
        fail({
          code: "runaway-prose",
          message: `No tag found; input over the ${MAX_PROSE_SCAN}-char prose limit — treating as unterminated output.`,
          offset: consumedChars,
        });
      }
      consume(pending.length);
      return true;
    }
    if (ltIndex > 0) {
      // Prose before the next tag is ignorable.
      consume(ltIndex);
      return true;
    }

    // pending starts with '<'. Either a closing tag (stray) or an open tag.
    if (pending[1] === "/") {
      const gt = pending.indexOf(">");
      if (gt < 0) {
        if (finalizeCalled) {
          fail({
            code: "truncated-tag",
            message: "Stream ended mid closing tag.",
            offset: consumedChars,
          });
        }
        return false;
      }
      const name = pending.slice(2, gt).trim();
      fail({
        code: "stray-close-tag",
        message: `Stray closing tag </${name}> outside any block.`,
        offset: consumedChars,
      });
    }

    const gtIndex = pending.indexOf(">");
    if (gtIndex < 0) {
      // Possibly an unterminated "<file path=..." split across chunks.
      if (finalizeCalled) {
        fail({
          code: "truncated-tag",
          message: "Stream ended mid-tag.",
          offset: consumedChars,
        });
      }
      return false;
    }

    const tagOffset = consumedChars;
    const inner = pending.slice(1, gtIndex);
    const tag = parseTag(inner, tagOffset);

    switch (tag.name) {
      case "design-plan": {
        forbidExtraAttrs(tag, [], tagOffset);
        if (tag.selfClosing) {
          fail({
            code: "malformed-tag",
            message: "<design-plan> cannot be self-closing.",
            offset: tagOffset,
          });
        }
        if (designPlan || designPlanV2 || designPlanV3) {
          fail({
            code: "duplicate-design-plan",
            message: "only one design-plan is allowed.",
            offset: tagOffset,
          });
        }
        if (files.size || proposals.length || doneSummary !== null) {
          fail({
            code: "late-design-plan",
            message: "design-plan must precede files and other blocks.",
            offset: tagOffset,
          });
        }
        const contentStart = gtIndex + 1;
        const closeIndex = findTerminator("</design-plan>", contentStart);
        if (closeIndex < 0) {
          if (finalizeCalled) {
            fail({
              code: "truncated-design-plan",
              message: "Stream ended mid-<design-plan> block.",
              offset: tagOffset,
            });
          }
          return false;
        }
        const raw = cleanContent(pending.slice(contentStart, closeIndex));
        if (raw.length > MAX_DESIGN_PLAN_CHARS) {
          fail({
            code: "design-plan-too-large",
            message: `design-plan exceeds ${MAX_DESIGN_PLAN_CHARS} characters.`,
            offset: tagOffset,
          });
        }
        if (options?.designPlanV3Expected) {
          try {
            designPlanV3 = parseWriterDesignPlanV3({
              value: JSON.parse(raw) as unknown,
              blueprint: options.designPlanV3Expected.blueprint,
              kit: options.designPlanV3Expected.kit,
            });
          } catch (error) {
            fail({
              code: "invalid-design-plan",
              message:
                error instanceof Error
                  ? error.message
                  : "invalid V3 design-plan",
              offset: tagOffset,
            });
          }
        } else if (options?.designPlanV2Expected) {
          try {
            const value = JSON.parse(raw) as unknown;
            const frame = options.designPlanV2Fallback;
            designPlanV2 = parseWriterDesignPlanV2({
              value: frame
                ? normalizeWriterDesignPlanV2Candidate({ value, frame })
                : value,
              expected: options.designPlanV2Expected,
            });
          } catch (error) {
            fail({
              code: "invalid-design-plan",
              message:
                error instanceof Error
                  ? error.message
                  : "invalid V2 design-plan",
              offset: tagOffset,
            });
          }
        } else {
          designPlan = parseWriterDesignPlan(raw, (message) =>
            fail({
              code: "invalid-design-plan",
              message,
              offset: tagOffset,
            }),
          );
        }
        consume(closeIndex + "</design-plan>".length);
        return true;
      }

      case "file": {
        if (
          options?.requireDesignPlan &&
          !designPlan &&
          !designPlanV2 &&
          !designPlanV3 &&
          !options.designPlanV2Fallback
        ) {
          fail({
            code: "missing-design-plan",
            message: "design-plan must precede files.",
            offset: tagOffset,
          });
        }
        forbidExtraAttrs(tag, ["path"], tagOffset);
        if (tag.selfClosing) {
          fail({
            code: "malformed-tag",
            message: "<file> cannot be self-closing.",
            offset: tagOffset,
          });
        }
        const path = requireAttr(tag, "path", tagOffset);
        const contentStart = gtIndex + 1;
        const closeIndex = findTerminator("</file>", contentStart);
        if (closeIndex < 0) {
          if (finalizeCalled) {
            fail({
              code: "truncated-file",
              message: `Stream ended mid-<file> block for ${path}.`,
              offset: tagOffset,
              path,
            });
          }
          return false;
        }
        if (!isAllowedBatchedPath(path)) {
          diagnostics.push({
            code: "disallowed-path",
            message: `Path "${path}" is not writable by the batched writer; block dropped.`,
            offset: tagOffset,
            path,
          });
          consume(closeIndex + "</file>".length);
          return true;
        }
        const content = cleanContent(pending.slice(contentStart, closeIndex));
        if (!content.trim()) {
          fail({
            code: "empty-content",
            message: `<file path="${path}"> has empty content.`,
            offset: tagOffset,
            path,
          });
        }
        if (files.has(path)) {
          diagnostics.push({
            code: "duplicate-file",
            message: `Path ${path} written twice; later block wins.`,
            offset: tagOffset,
            path,
          });
        }
        files.set(path, { content, path });
        consume(closeIndex + "</file>".length);
        if (path === options?.stopAfterFilePath) {
          stoppedAfterFilePath = true;
        }
        if (requiredFilePaths.has(path)) {
          closedRequiredFilePaths.add(path);
          if (
            options?.stopAfterRequiredFilePaths &&
            requiredFilePaths.size > 0 &&
            closedRequiredFilePaths.size === requiredFilePaths.size
          ) {
            stoppedAfterRequiredFilePaths = true;
          }
        }
        return true;
      }

      case "propose": {
        forbidExtraAttrs(tag, ["path"], tagOffset);
        if (tag.selfClosing) {
          fail({
            code: "malformed-tag",
            message: "<propose> cannot be self-closing.",
            offset: tagOffset,
          });
        }
        const path = requireAttr(tag, "path", tagOffset);
        const contentStart = gtIndex + 1;
        const closeIndex = findTerminator("</propose>", contentStart);
        if (closeIndex < 0) {
          if (finalizeCalled) {
            fail({
              code: "truncated-propose",
              message: "Stream ended mid-<propose> block.",
              offset: tagOffset,
              path,
            });
          }
          return false;
        }
        const reason = cleanContent(
          pending.slice(contentStart, closeIndex),
        ).trim();
        proposals.push({ path, reason });
        const basename = path.match(/([^/]+)\.tsx$/)?.[1];
        if (!basename || !SHADCN_COMPONENT_BY_NAME.has(basename)) {
          diagnostics.push({
            code: "unknown-component",
            message: `Proposed path "${path}" is not a known shadcn registry component; cannot auto-approve.`,
            offset: tagOffset,
            path,
          });
        } else if (path !== `src/components/ui/${basename}.tsx`) {
          diagnostics.push({
            code: "noncanonical-component-path",
            message: `Component "${basename}" must live at src/components/ui/${basename}.tsx.`,
            offset: tagOffset,
            path,
          });
        }
        consume(closeIndex + "</propose>".length);
        return true;
      }

      case "done": {
        forbidExtraAttrs(tag, ["summary"], tagOffset);
        if (!tag.selfClosing) {
          fail({
            code: "malformed-tag",
            message: "<done> must be self-closing (<done ... />).",
            offset: tagOffset,
          });
        }
        doneSummary = requireAttr(tag, "summary", tagOffset);
        consume(gtIndex + 1);
        return true;
      }

      default:
        fail({
          code: "unknown-tag",
          message: `Unknown top-level tag <${tag.name}>. Only <design-plan>, <file>, <propose>, <done> are allowed.`,
          offset: tagOffset,
        });
    }
  }

  function drive(): void {
    if (hardError) {
      return;
    }
    while (step()) {
      // keep consuming complete units
    }
  }

  return {
    get failed() {
      return hardError !== null;
    },
    get stoppedAfterFilePath() {
      return stoppedAfterFilePath;
    },
    get stoppedAfterRequiredFilePaths() {
      return stoppedAfterRequiredFilePaths;
    },
    get stagedPaths() {
      return [...files.keys()];
    },
    stagedFile(path: string) {
      return files.get(path);
    },
    push(chunk: string): void {
      if (hardError) {
        throw hardError;
      }
      if (finalizeCalled) {
        fail({
          code: "push-after-finalize",
          message: "push() called after finalize().",
          offset: consumedChars,
        });
      }
      if (!chunk) {
        return;
      }
      pending += chunk;
      drive();
    },
    finalize(): BatchedParseResult {
      if (hardError) {
        throw hardError;
      }
      if (finalResult) {
        return finalResult;
      }
      finalizeCalled = true;
      drive();
      if (hardError) {
        throw hardError;
      }
      if (
        options?.requireDesignPlan &&
        !designPlan &&
        !designPlanV2 &&
        !designPlanV3
      ) {
        if (options.designPlanV2Fallback) {
          designPlanV2 = options.designPlanV2Fallback;
        } else {
          fail({
            code: "missing-design-plan",
            message: "design-plan is required.",
            offset: consumedChars,
          });
        }
      }
      if (
        requiredFilePaths.size > 0 &&
        closedRequiredFilePaths.size !== requiredFilePaths.size
      ) {
        fail({
          code: "missing-required-file",
          message: `Stream ended before all required files closed: ${[
            ...requiredFilePaths,
          ]
            .filter((path) => !closedRequiredFilePaths.has(path))
            .join(", ")}`,
          offset: consumedChars,
        });
      }
      finalResult = {
        designPlan,
        designPlanV2,
        designPlanV3,
        stoppedAfterRequiredFilePaths,
        diagnostics,
        done:
          doneSummary !== null
            ? { summary: doneSummary }
            : (stoppedAfterFilePath || stoppedAfterRequiredFilePaths) &&
                options?.implicitDoneSummary
              ? { summary: options.implicitDoneSummary }
              : null,
        files,
        proposals,
      };
      return finalResult;
    },
  };
}
