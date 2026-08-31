import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import {
  getAllowlistedFlags,
  kebabFlag,
  MAX_SCRIPT_OUTPUT_BYTES,
  SCRIPT_OUTPUT_TRUNCATION_MARKER,
  SCRIPT_SPAWN_MAX_BUFFER_BYTES,
  SCRIPT_TIMEOUT_MS,
} from "./script-sandbox";

export interface DiscoveredSkill {
  name: string;
  isRootSkill: boolean;
  parentSkillName?: string;
  markdownFiles: Map<string, string>;
  entrypoints: Map<string, string>;
}

export interface SkillExecutionResult {
  ok: boolean;
  output?: unknown;
  error?: string;
}

const SKILLS_ROOT_DIR = path.resolve(process.cwd(), "src/lib/projects/skills");
const execFileAsync = promisify(execFile);

function argsToCli(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, item]) => {
      const flag = key.startsWith("-")
        ? key
        : `--${key.replace(/[A-Z]/gu, (character) => `-${character.toLowerCase()}`)}`;
      if (typeof item === "boolean") {
        return item ? [flag] : [];
      }
      if (typeof item === "string" || typeof item === "number") {
        return [flag, String(item)];
      }
      return [];
    },
  );
}

class DynamicSkillEngine {
  private skills = new Map<string, DiscoveredSkill>();
  private markdownMap = new Map<string, string>();

  constructor() {
    this.refresh();
  }

  public refresh(): void {
    this.skills.clear();
    this.markdownMap.clear();

    if (!fs.existsSync(SKILLS_ROOT_DIR)) {
      return;
    }

    const topLevelEntries = fs.readdirSync(SKILLS_ROOT_DIR, {
      withFileTypes: true,
    });

    for (const entry of topLevelEntries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const skillName = entry.name;
      const skillDir = path.join(SKILLS_ROOT_DIR, skillName);
      const skillFile = path.join(skillDir, "SKILL.md");

      if (!fs.existsSync(skillFile)) {
        continue;
      }

      const discoveredSkill: DiscoveredSkill = {
        name: skillName,
        isRootSkill: true,
        markdownFiles: new Map(),
        entrypoints: new Map(),
      };

      this.scanDirectoryRecursively(skillDir, skillDir, discoveredSkill);
      this.skills.set(skillName, discoveredSkill);
    }
  }

  private scanDirectoryRecursively(
    currentDir: string,
    skillBaseDir: string,
    skillRecord: DiscoveredSkill,
  ): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        this.scanDirectoryRecursively(fullPath, skillBaseDir, skillRecord);
      } else if (entry.isFile()) {
        const relPath = path
          .relative(skillBaseDir, fullPath)
          .replace(/\\/g, "/");

        if (entry.name.endsWith(".md")) {
          const content = fs.readFileSync(fullPath, "utf8");
          skillRecord.markdownFiles.set(relPath, content);

          const docName = path.basename(entry.name, ".md");
          const isMainSkillFile = docName === "SKILL";

          if (isMainSkillFile) {
            this.markdownMap.set(skillRecord.name, content);
          } else {
            // 1. Full path slug: "impeccable/reference/layout"
            const fullSlug = `${skillRecord.name}/${relPath.replace(/\.md$/, "")}`;
            this.markdownMap.set(fullSlug, content);

            // 2. Kebab path: "impeccable-reference-layout"
            const kebabFull = fullSlug.replace(/\//g, "-");
            this.markdownMap.set(kebabFull, content);

            // 3. Short direct alias: "impeccable-layout" and "impeccable/layout"
            const shortKebab = `${skillRecord.name}-${docName}`;
            const shortPath = `${skillRecord.name}/${docName}`;
            this.markdownMap.set(shortKebab, content);
            this.markdownMap.set(shortPath, content);
          }
        } else if (
          currentDir === path.join(skillBaseDir, "scripts") &&
          /\.(mjs|js)$/u.test(entry.name)
        ) {
          const entrypointId = entry.name.replace(/\.(mjs|js)$/u, "");
          skillRecord.entrypoints.set(entrypointId, fullPath);
        }
      }
    }
  }

  public getRootSkillNames(): string[] {
    return Array.from(this.skills.keys()).sort();
  }

  public getScriptSkillNames(): string[] {
    return Array.from(this.skills.values())
      .filter((skill) => skill.entrypoints.size > 0)
      .map((skill) => skill.name)
      .sort();
  }

  public getAllMarkdownTopics(): string[] {
    return Array.from(this.markdownMap.keys()).sort();
  }

  public readSkillDocument(topicOrSlug: string): {
    content: string;
    name: string;
  } {
    const content = this.markdownMap.get(topicOrSlug);
    if (!content) {
      throw new Error(
        `Skill or sub-reference not found: ${topicOrSlug}. Available topics: ${this.getAllMarkdownTopics().join(", ")}`,
      );
    }
    return { content, name: topicOrSlug };
  }

  public async executeSkillScript(
    skillName: string,
    scriptId: string,
    args?: unknown,
    options?: { timeoutMs?: number },
  ): Promise<SkillExecutionResult> {
    const skill = this.skills.get(skillName);
    if (!skill) {
      return { ok: false, error: `Skill "${skillName}" not found.` };
    }

    const normalized = scriptId
      .trim()
      .replaceAll("\\", "/")
      .replace(/^\.\//u, "")
      .replace(/^\/+/u, "")
      .replace(/\.(mjs|js)$/iu, "");
    const withoutSkillPrefix = normalized.startsWith(`${skillName}/`)
      ? normalized.slice(skillName.length + 1)
      : normalized;
    const withoutScriptsPrefix = withoutSkillPrefix.replace(/^scripts\//u, "");

    const scriptPath =
      skill.entrypoints.get(withoutScriptsPrefix) ??
      skill.entrypoints.get(withoutSkillPrefix) ??
      skill.entrypoints.get(normalized);

    if (!scriptPath) {
      return {
        ok: false,
        error: `Script "${scriptId}" is not a callable entrypoint of skill "${skillName}". Only direct entrypoints are callable; helper and nested scripts cannot be invoked.`,
      };
    }

    const flags = getAllowlistedFlags(withoutScriptsPrefix);
    const rawKeys =
      args && typeof args === "object" && !Array.isArray(args)
        ? Object.keys(args)
        : [];
    const stringArgs =
      typeof args === "string"
        ? args
            .split(/\s+/)
            .filter((token) => token.startsWith("--"))
            .map((token) => token.slice(2))
        : [];
    const flagKeys = [...rawKeys, ...stringArgs];
    if (
      flagKeys.length > 0 &&
      (flags === null ||
        flagKeys.some(
          (key) =>
            !flags.has(kebabFlag(key).replace(/^-+/u, "")) && !flags.has(key),
        ))
    ) {
      return {
        ok: false,
        error: `Arguments for entrypoint "${withoutScriptsPrefix}" are outside the allowlist; rejected before spawn.`,
      };
    }

    const timeoutMs = options?.timeoutMs ?? SCRIPT_TIMEOUT_MS;
    const cliArgs =
      typeof args === "string"
        ? args.split(/\s+/).filter(Boolean)
        : argsToCli(args);
    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        [scriptPath, ...cliArgs],
        {
          cwd: process.cwd(),
          env: {
            PATH: process.env.PATH ?? process.env.Path ?? "",
            DO_NOT_TRACK: "1",
          },
          maxBuffer: SCRIPT_SPAWN_MAX_BUFFER_BYTES,
          timeout: timeoutMs,
          killSignal: "SIGKILL",
        },
      );
      let output = stderr.trim() ? `${stdout}${stderr}` : stdout;
      if (output.length > MAX_SCRIPT_OUTPUT_BYTES) {
        output =
          output.slice(0, MAX_SCRIPT_OUTPUT_BYTES) +
          SCRIPT_OUTPUT_TRUNCATION_MARKER;
      }
      return {
        ok: true,
        output,
      };
    } catch (err: unknown) {
      const killed = (err as { killed?: boolean }).killed === true;
      return {
        ok: false,
        error: killed
          ? `Skill script "${scriptId}" timed out after ${timeoutMs}ms.`
          : err instanceof Error
            ? err.message
            : String(err),
      };
    }
  }
}

export const skillEngine = new DynamicSkillEngine();

export const PROJECT_SKILL_NAMES = skillEngine.getAllMarkdownTopics();

export const PROJECT_CORE_SKILL_NAMES = [
  "impeccable",
  "shadcn",
  "unslop",
  "impeccable/reference/new-work",
  "impeccable/reference/layout",
  "impeccable/reference/typeset",
  "impeccable/reference/animate",
  "impeccable/reference/polish",
  "impeccable/reference/craft-floor",
] as const;

export const PROJECT_SCRIPT_SKILL_NAMES = skillEngine.getScriptSkillNames() as [
  string,
  ...string[],
];

export type ProjectSkillName = string;

export function readProjectSkill(name: string): {
  content: string;
  name: string;
} {
  return skillEngine.readSkillDocument(name);
}

export async function executeSkillScript(
  skillName: string,
  scriptId: string,
  args?: unknown,
  options?: { timeoutMs?: number },
): Promise<SkillExecutionResult> {
  return skillEngine.executeSkillScript(skillName, scriptId, args, options);
}
