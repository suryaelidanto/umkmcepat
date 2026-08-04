// scripts/ab-build-engine.ts
// Manual A/B harness: runs a fixed brief corpus through the legacy
// agent-loop source generator and (when BATCHED_ENGINE=1) the batched
// writer, then builds both and prints a JSON summary line per run.
// Manual runner only — not wired into CI, package.json, or any test.
//
//   bun scripts/ab-build-engine.ts                 # legacy engine only
//   BATCHED_ENGINE=1 bun scripts/ab-build-engine.ts
//
// ponytail: batched arm is gated on a module that lands in Phase 1; until
// then the harness skips it with a log line. Add the real import when
// src/lib/projects/batched-generator.ts exists.
// ponytail: energy comes from a step charger whose userId is a non-existent
// A/B sentinel. chargeEnergyForStep no-ops on a missing user, so totals()
// stay honest (0 when charging cannot run) without touching UserCredit.
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getGenerationModel } from "../src/lib/ai-models";
import { type ProjectBrief } from "../src/lib/projects/brief";
import { createStepCharger } from "../src/lib/projects/energy-step-charger";
import {
  buildGeneratedProject,
  runCommand,
} from "../src/lib/projects/generated-source";
import { type GeneratedProjectFile } from "../src/lib/projects/generated-types";
import {
  createProjectSiteSchemaFromBrief,
  type ProjectSiteSchema,
} from "../src/lib/projects/site-schema";

type HarnessRun = {
  energy: { inputTokens: number; outputTokens: number; energyUsed: number };
  engine: "legacy" | "batched";
  fileCount: number;
  firstBuildGreen: boolean;
  skipped?: string;
  wallMs: number;
};

const BRIEFS: Array<Partial<ProjectBrief> & { prompt: string }> = [
  {
    prompt: "buatkan website coffee shop kecil untuk kerja remote",
    businessName: "Kopi Sela",
    businessType: "Coffee shop kecil",
    offer: "Espresso based, manual brew, pastry, area kerja nyaman",
    targetCustomer: "Mahasiswa dan pekerja remote",
    contactOrCta: "Pesan dan tanya lokasi lewat WhatsApp",
    stylePreference: "Hangat premium sederhana dengan suasana tenang",
  },
  {
    prompt: "buatkan website laundry kiloan antar jemput",
    businessName: "Laundry Cerah",
    businessType: "Laundry kiloan dan satuan",
    offer: "Cuci setrika, laundry ekspres, antar jemput",
    targetCustomer: "Karyawan dan penghuni kos",
    contactOrCta: "Booking pickup lewat WhatsApp",
    stylePreference: "Bersih modern, rapi, dan ringan",
  },
  {
    prompt: "buatkan website barber shop booking whatsapp",
    businessName: "Barber Djaja",
    businessType: "Barber shop pria",
    offer: "Haircut, shave, styling",
    targetCustomer: "Pria dewasa dan pekerja sekitar",
    contactOrCta: "Booking jadwal lewat WhatsApp",
    stylePreference: "Tegas, maskulin, bersih",
  },
];

function briefIndexToProjectId(briefIndex: number, engine: string) {
  return `ab-${engine}-${briefIndex}`;
}

async function buildAndCollect(
  files: GeneratedProjectFile[],
  workspaceKey: string,
  workspaceRoot: string,
): Promise<{ firstBuildGreen: boolean; log: string }> {
  // Real build path; fast + deterministic because the same dependency
  // signature reuses the golden node_modules across runs.
  const result = await buildGeneratedProject(files, {
    commandRunner: runCommand,
    workspaceKey,
    workspaceRoot,
  });
  return { firstBuildGreen: result.ok, log: result.log };
}

async function runLegacy(
  brief: Partial<ProjectBrief> & { prompt: string },
  briefIndex: number,
  workspaceRoot: string,
): Promise<HarnessRun> {
  const { generateCustomProjectFilesWithAgent } =
    await import("../src/lib/projects/custom-source-generator");
  const projectId = briefIndexToProjectId(briefIndex, "legacy");
  const schema: ProjectSiteSchema = createProjectSiteSchemaFromBrief({
    version: 1,
    notes: [],
    readyForBuild: true,
    ...brief,
  } as ProjectBrief);
  const stepCharger = createStepCharger({
    modelId: getGenerationModel(),
    projectId,
    reason: "build:step",
    recordMeta: { phase: "ab-harness" },
    userId: "ab-harness",
  });

  const startedAt = performance.now();
  let files: GeneratedProjectFile[] = [];
  let firstBuildGreen = false;
  try {
    const source = await generateCustomProjectFilesWithAgent({
      implementationBrief: brief.prompt,
      projectId,
      schema,
      stepCharger,
    });
    files = source.files;
    const build = await buildAndCollect(files, projectId, workspaceRoot);
    firstBuildGreen = build.firstBuildGreen;
  } catch (error) {
    console.error(
      `legacy run failed for brief ${briefIndex}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    energy: stepCharger.totals(),
    engine: "legacy",
    fileCount: files.length,
    firstBuildGreen,
    wallMs: Math.round(performance.now() - startedAt),
  };
}

async function runBatched(
  brief: Partial<ProjectBrief> & { prompt: string },
  briefIndex: number,
  workspaceRoot: string,
): Promise<HarnessRun> {
  if (process.env.BATCHED_ENGINE !== "1") {
    return {
      energy: { energyUsed: 0, inputTokens: 0, outputTokens: 0 },
      engine: "batched",
      fileCount: 0,
      firstBuildGreen: false,
      skipped:
        "batched engine not implemented; skipping (set BATCHED_ENGINE=1 once Phase 1 lands)",
      wallMs: 0,
    };
  }

  // Phase 1 lands src/lib/projects/batched-generator.ts with a
  // `runBatchedGenerate` entry — wire it here when it exists.
  void brief;
  void briefIndex;
  void workspaceRoot;
  throw new Error(
    "BATCHED_ENGINE=1 but src/lib/projects/batched-generator.ts is not implemented yet.",
  );
}

async function main() {
  const workspaceRoot = await mkdtemp(
    path.join(os.tmpdir(), "umkmcepat-ab-build-"),
  );
  const runs: HarnessRun[] = [];

  try {
    await mkdir(workspaceRoot, { recursive: true });

    for (const [index, brief] of BRIEFS.entries()) {
      for (const run of [
        await runLegacy(brief, index, workspaceRoot),
        await runBatched(brief, index, workspaceRoot),
      ]) {
        runs.push(run);
        if (run.skipped) {
          process.stdout.write(
            `[ab-harness] brief=${index} engine=batched ${run.skipped}\n`,
          );
          continue;
        }
        // AiCallRecord-adjacent console summary + one JSON line per run.
        process.stdout.write(
          `[ab-harness] brief=${index} engine=${run.engine} wallMs=${run.wallMs} energy=${run.energy.energyUsed} tokens=${run.energy.inputTokens}+${run.energy.outputTokens} files=${run.fileCount} firstBuildGreen=${run.firstBuildGreen}\n`,
        );
        process.stdout.write(`${JSON.stringify({ brief: index, ...run })}\n`);
      }
    }
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }

  return runs;
}

if (import.meta.main) {
  await main();
}
