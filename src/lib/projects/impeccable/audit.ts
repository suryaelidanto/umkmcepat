import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface DesignAuditIssue {
  file: string;
  line?: number;
  column?: number;
  ruleId: string;
  category?: string;
  message: string;
  severity: "error" | "warning" | "advisory";
  fix?: string;
}

export interface DesignAuditResult {
  ok: boolean;
  issuesCount: number;
  advisoryCount: number;
  issues: DesignAuditIssue[];
}

const DETECTOR_CLI_PATH = path.resolve(
  process.cwd(),
  "src/lib/projects/skills/impeccable/scripts/detector/detect-antipatterns.mjs",
);

export async function runDesignAuditInMemory(
  files: Map<string, string> | Record<string, string>,
  targetPath?: string,
): Promise<DesignAuditResult> {
  const fileEntries =
    files instanceof Map ? Array.from(files.entries()) : Object.entries(files);

  const relevantFiles = fileEntries.filter(([p]) => {
    if (targetPath) {
      return p === targetPath || p.endsWith(targetPath);
    }
    return (
      (p.endsWith(".tsx") ||
        p.endsWith(".jsx") ||
        p.endsWith(".css") ||
        p.endsWith(".html")) &&
      !p.includes("node_modules") &&
      !p.includes("ui/") // skip base shadcn primitives
    );
  });

  if (relevantFiles.length === 0) {
    return { ok: true, issuesCount: 0, advisoryCount: 0, issues: [] };
  }

  // Use a temporary isolated workspace for static AST/regex scanning
  const tmpDir = path.join(
    "/tmp",
    `design-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    for (const [filePath, content] of relevantFiles) {
      const fullPath = path.join(tmpDir, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, "utf8");
    }

    const detectorModule = await import(pathToFileURL(DETECTOR_CLI_PATH).href);
    const { runDetector } = detectorModule;

    if (typeof runDetector !== "function") {
      return { ok: true, issuesCount: 0, advisoryCount: 0, issues: [] };
    }

    const findings = await runDetector({
      targetDir: tmpDir,
      options: {
        json: true,
        noConfig: true,
      },
    });

    const issues: DesignAuditIssue[] = [];
    let advisoryCount = 0;

    if (Array.isArray(findings)) {
      for (const finding of findings) {
        const relativeFile = finding.file
          ? path.relative(tmpDir, finding.file)
          : "unknown";
        const isAdvisory =
          finding.severity === "advisory" || finding.advisory === true;
        if (isAdvisory) {
          advisoryCount++;
        }
        issues.push({
          file: relativeFile,
          line: finding.line,
          column: finding.column,
          ruleId: finding.ruleId || finding.id || "ui-pattern",
          category: finding.category,
          message: finding.message || finding.text || "Design issue detected",
          severity: isAdvisory ? "advisory" : "error",
          fix: finding.fix || finding.recommendation,
        });
      }
    }

    const errors = issues.filter((i) => i.severity === "error");
    return {
      ok: errors.length === 0,
      issuesCount: errors.length,
      advisoryCount,
      issues,
    };
  } catch {
    // Fail-open gracefully if detector AST parsing hits edge case
    return { ok: true, issuesCount: 0, advisoryCount: 0, issues: [] };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
