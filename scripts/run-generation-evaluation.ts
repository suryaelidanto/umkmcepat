// scripts/run-generation-evaluation.ts
// CLI driver for the frozen generation-evaluation contract. Loads a manifest
// and a trial-results file, validates that every scheduled trial is present,
// and prints the versioned report. Missing/timed-out/infrastructure results
// stay in the denominator.
import { readFileSync } from "node:fs";

import {
  buildEvaluationReport,
  type EvaluationManifestV1,
  type EvaluationTrialResultV1,
} from "../src/lib/projects/generation-evaluation";

type CliArgs = {
  baselineId?: string;
  manifestPath?: string;
  resultsPath?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--baseline-id") {
      args.baselineId = argv[i + 1];
    } else if (key === "--manifest") {
      args.manifestPath = argv[i + 1];
    } else if (key === "--results") {
      args.resultsPath = argv[i + 1];
    }
  }
  return args;
}

function readJson<T>(path: string, label: string): T {
  const text = readFileSync(path, "utf8");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Cannot parse ${label} JSON at ${path}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const baselineId = args.baselineId ?? "contract-v1-baseline-2026-08-03";
  const manifestPath =
    args.manifestPath ?? "fixtures/generation-evaluation/manifest.json";
  const resultsPath =
    args.resultsPath ?? "fixtures/generation-evaluation/results.json";

  const manifest = readJson<EvaluationManifestV1>(manifestPath, "manifest");
  manifest.baselineId = baselineId;
  const results = readJson<EvaluationTrialResultV1[]>(resultsPath, "results");

  const report = buildEvaluationReport(manifest, results);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
