import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

export interface DiscoveredSkill {
  name: string;
  isRootSkill: boolean;
  parentSkillName?: string;
  markdownFiles: Map<string, string>;
  executableScripts: Map<string, string>;
}

export interface SkillExecutionResult {
  ok: boolean;
  output?: unknown;
  error?: string;
}

const SKILLS_ROOT_DIR = path.resolve(process.cwd(), "src/lib/projects/skills");
const execFileAsync = promisify(execFile);

function parseScriptCommand(value: string): { path: string; args: string[] } {
  const tokens = value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/gu) ?? [];
  const cleaned = tokens.map((token) => token.replace(/^["']|["']$/gu, ""));
  const scriptIndex = cleaned.findIndex(
    (token, index) =>
      index === 0 ||
      /(?:\\.m?js|\\.ts)$/u.test(token) ||
      token.includes("/scripts/"),
  );
  const index = scriptIndex >= 0 ? scriptIndex : 0;
  return {
    path: cleaned[index] ?? value.trim(),
    args: cleaned.slice(index + 1),
  };
}

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
        executableScripts: new Map(),
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
          entry.name.endsWith(".js") ||
          entry.name.endsWith(".mjs") ||
          entry.name.endsWith(".ts")
        ) {
          skillRecord.executableScripts.set(relPath, fullPath);
          const scriptSlug = `${skillRecord.name}/${relPath}`;
          skillRecord.executableScripts.set(scriptSlug, fullPath);
        }
      }
    }
  }

  public getRootSkillNames(): string[] {
    return Array.from(this.skills.keys()).sort();
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
    scriptRelativePath: string,
    args?: unknown,
  ): Promise<SkillExecutionResult> {
    const skill = this.skills.get(skillName);
    if (!skill) {
      return { ok: false, error: `Skill "${skillName}" not found.` };
    }

    const command = parseScriptCommand(scriptRelativePath);
    const normalizedScript = command.path
      .replaceAll("\\\\", "/")
      .replace(/^\.\//u, "")
      .replace(/^\/+/, "");
    const withoutSkillPrefix = normalizedScript.startsWith(`${skillName}/`)
      ? normalizedScript.slice(skillName.length + 1)
      : normalizedScript;
    const scriptsIndex = withoutSkillPrefix.indexOf("scripts/");
    const scriptFromScriptsDirectory =
      scriptsIndex >= 0
        ? withoutSkillPrefix.slice(scriptsIndex)
        : withoutSkillPrefix;
    const scriptCandidates = [
      normalizedScript,
      withoutSkillPrefix,
      `${skillName}/${withoutSkillPrefix}`,
      scriptFromScriptsDirectory,
      withoutSkillPrefix.includes("/")
        ? withoutSkillPrefix
        : `scripts/${withoutSkillPrefix}`,
      withoutSkillPrefix.endsWith(".mjs") || withoutSkillPrefix.endsWith(".js")
        ? `scripts/${withoutSkillPrefix}`
        : `scripts/${withoutSkillPrefix}.mjs`,
      ...(normalizedScript.toLowerCase().includes("palette")
        ? ["scripts/palette.mjs"]
        : []),
      ...(normalizedScript.toLowerCase().includes("context")
        ? ["scripts/context.mjs"]
        : []),
    ];
    const scriptPath = scriptCandidates.reduce<string | undefined>(
      (found, candidate) => found ?? skill.executableScripts.get(candidate),
      undefined,
    );

    if (!scriptPath) {
      return {
        ok: false,
        error: `Script "${scriptRelativePath}" not found in skill "${skillName}".`,
      };
    }

    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        [scriptPath, ...command.args, ...argsToCli(args)],
        {
          cwd: process.cwd(),
          env: process.env,
          maxBuffer: 2 * 1024 * 1024,
        },
      );
      return {
        ok: true,
        output: stderr.trim() ? `${stdout}${stderr}` : stdout,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
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

export const PROJECT_SCRIPT_SKILL_NAMES = ["impeccable"] as const;

export type ProjectSkillName = string;

export function readProjectSkill(name: string): {
  content: string;
  name: string;
} {
  return skillEngine.readSkillDocument(name);
}

export async function executeSkillScript(
  skillName: string,
  scriptRelPath: string,
  args?: unknown,
): Promise<SkillExecutionResult> {
  return skillEngine.executeSkillScript(skillName, scriptRelPath, args);
}
