import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type ReliabilityCaseResult = {
  id: string;
  ok: boolean;
  detail?: string;
  ms?: number;
};

export type ReliabilityReport = {
  startedAt: string;
  finishedAt?: string;
  kind: string;
  results: ReliabilityCaseResult[];
  summary: { pass: number; fail: number; total: number };
};

export function emptyReport(kind: string): ReliabilityReport {
  return {
    startedAt: new Date().toISOString(),
    kind,
    results: [],
    summary: { pass: 0, fail: 0, total: 0 },
  };
}

export function finalizeReport(report: ReliabilityReport): ReliabilityReport {
  const pass = report.results.filter((r) => r.ok).length;
  const fail = report.results.length - pass;
  return {
    ...report,
    finishedAt: new Date().toISOString(),
    summary: { pass, fail, total: report.results.length },
  };
}

export function writeReport(
  report: ReliabilityReport,
  fileName = "reliability-report.json",
) {
  const path = join(process.cwd(), "tmp", fileName);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2));
  return path;
}
