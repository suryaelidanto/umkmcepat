import { existsSync, readFileSync } from "node:fs";

import {
  buildEvaluationReport,
  buildGeneratedSiteEvaluationReport,
  type EvaluationManifestV1,
  type EvaluationTrialResultV1,
  type GeneratedSiteEvaluationManifestV2,
  type GeneratedSiteEvaluationTrialV2,
} from "../src/lib/projects/generation-evaluation";

type CliArgs = {
  baselineId?: string;
  manifestPath?: string;
  resultsPath?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--baseline-id") {
      args.baselineId = argv[index + 1];
    }
    if (key === "--manifest") {
      args.manifestPath = argv[index + 1];
    }
    if (key === "--results") {
      args.resultsPath = argv[index + 1];
    }
  }
  return args;
}

function readJson<T>(filePath: string, label: string): T {
  if (!existsSync(filePath)) {
    throw new Error(`${label} JSON is missing at ${filePath}`);
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    throw new Error(`Cannot parse ${label} JSON at ${filePath}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath =
    args.manifestPath ?? "fixtures/generation-evaluation/manifest.json";
  const manifest = readJson<
    EvaluationManifestV1 | GeneratedSiteEvaluationManifestV2
  >(manifestPath, "manifest");

  if (manifest.schemaVersion === 2) {
    const resultsPath =
      args.resultsPath ?? ".data/generation-evaluation/results.json";
    const results = readJson<GeneratedSiteEvaluationTrialV2[]>(
      resultsPath,
      "runtime results",
    );
    const report = buildGeneratedSiteEvaluationReport(manifest, results);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.release.pass) {
      process.exitCode = 1;
    }
    return;
  }

  const resultsPath =
    args.resultsPath ?? "fixtures/generation-evaluation/results.json";
  const results = readJson<EvaluationTrialResultV1[]>(resultsPath, "results");
  const report = buildEvaluationReport(
    {
      ...manifest,
      baselineId:
        args.baselineId ??
        manifest.baselineId ??
        "contract-v1-baseline-2026-08-03",
    },
    results,
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
