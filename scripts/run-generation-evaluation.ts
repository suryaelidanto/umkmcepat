import { existsSync, readFileSync } from "node:fs";

import {
  buildEvaluationReport,
  buildGeneratedSiteEvaluationReport,
  buildGeneratedSiteEvaluationReportV3,
  buildGeneratedSiteEvaluationReportV4,
  type BlindPreference,
  type EvaluationManifestV1,
  type EvaluationTrialResultV1,
  type GeneratedSiteEvaluationManifestV2,
  type GeneratedSiteEvaluationTrialV2,
  type GeneratedSiteEvaluationManifestV3,
  type GeneratedSiteEvaluationTrialV3,
  type GeneratedSiteEvaluationManifestV4,
  type GeneratedSiteEvaluationTrialV4,
} from "../src/lib/projects/generation-evaluation";
import { normalizeBlindPreferencesV2 } from "../src/lib/projects/generation-evaluation-blind";

type CliArgs = {
  baselineId?: string;
  manifestPath?: string;
  resultsPath?: string;
  preferencesPath?: string;
  mappingPath?: string;
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
    if (key === "--preferences") {
      args.preferencesPath = argv[index + 1];
    }
    if (key === "--mapping") {
      args.mappingPath = argv[index + 1];
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
    | EvaluationManifestV1
    | GeneratedSiteEvaluationManifestV2
    | GeneratedSiteEvaluationManifestV3
    | GeneratedSiteEvaluationManifestV4
  >(manifestPath, "manifest");

  if (manifest.schemaVersion === 4) {
    const resultsPath =
      args.resultsPath ?? ".data/generation-evaluation/results.json";
    const results = readJson<GeneratedSiteEvaluationTrialV4[]>(
      resultsPath,
      "runtime results",
    );
    const preferences = args.preferencesPath
      ? readJson<unknown>(args.preferencesPath, "blind preferences")
      : [];
    const mappingPath =
      args.mappingPath ??
      (args.preferencesPath
        ? `${args.preferencesPath.slice(0, args.preferencesPath.lastIndexOf("/"))}/mapping.json`
        : undefined);
    const mapping =
      mappingPath && existsSync(mappingPath)
        ? readJson<unknown>(mappingPath, "blind mapping")
        : null;
    const report = buildGeneratedSiteEvaluationReportV4(
      manifest,
      results,
      normalizeBlindPreferencesV2(preferences, mapping),
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.release.pass) {
      process.exitCode = 1;
    }
    return;
  }

  if (manifest.schemaVersion === 3) {
    const resultsPath =
      args.resultsPath ?? ".data/generation-evaluation/results.json";
    const results = readJson<GeneratedSiteEvaluationTrialV3[]>(
      resultsPath,
      "runtime results",
    );
    const preferences = args.preferencesPath
      ? readJson<unknown>(args.preferencesPath, "blind preferences")
      : [];
    const mappingPath =
      args.mappingPath ??
      (args.preferencesPath
        ? `${args.preferencesPath.slice(0, args.preferencesPath.lastIndexOf("/"))}/mapping.json`
        : undefined);
    const mapping =
      mappingPath && existsSync(mappingPath)
        ? readJson<unknown>(mappingPath, "blind mapping")
        : null;
    const report = buildGeneratedSiteEvaluationReportV3(
      manifest,
      results,
      normalizePreferences(preferences, mapping),
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.release.pass) {
      process.exitCode = 1;
    }
    return;
  }

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

function normalizePreferences(
  value: unknown,
  mapping: unknown,
): BlindPreference[] {
  if (
    Array.isArray(value) &&
    value.every((item) => isNormalizedPreference(item))
  ) {
    return value;
  }
  if (
    !isRecord(value) ||
    !Array.isArray(value.choices) ||
    !isRecord(mapping) ||
    !isRecord(mapping.mapping)
  ) {
    return [];
  }
  const result: BlindPreference[] = [];
  for (const choice of value.choices) {
    if (
      !isRecord(choice) ||
      typeof choice.key !== "string" ||
      (choice.choice !== "left" &&
        choice.choice !== "right" &&
        choice.choice !== "tie")
    ) {
      continue;
    }
    const [briefId, trialText] = choice.key.split(":");
    const trial = trialText === "2" ? 2 : trialText === "1" ? 1 : null;
    const pair = mapping.mapping[choice.key];
    if (
      !trial ||
      !isRecord(pair) ||
      (pair.leftArm !== "control" && pair.leftArm !== "treatment") ||
      (pair.rightArm !== "control" && pair.rightArm !== "treatment")
    ) {
      continue;
    }
    const selectedArm =
      choice.choice === "tie"
        ? "tie"
        : choice.choice === "left"
          ? pair.leftArm
          : pair.rightArm;
    result.push({
      briefId,
      trial,
      choice:
        selectedArm === "tie"
          ? "tie"
          : selectedArm === "treatment"
            ? "treatment"
            : "control",
    });
  }
  return result;
}
function isNormalizedPreference(value: unknown): value is BlindPreference {
  return (
    isRecord(value) &&
    typeof value.briefId === "string" &&
    (value.trial === 1 || value.trial === 2) &&
    (value.choice === "control" ||
      value.choice === "treatment" ||
      value.choice === "tie")
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
