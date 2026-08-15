import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PROFESSIONAL_REVIEW_CATEGORIES } from "../src/lib/projects/professional-site-critic";
import {
  applyProfessionalDefect,
  type ProfessionalDefectDefinition,
} from "../src/lib/projects/professional-site-defects";

import type { GeneratedSiteEvaluationTrialV4 } from "../src/lib/projects/generation-evaluation";

type Args = { runId: string; root: string; defects: string };
type Defect = {
  id: string;
  category: string;
  severity: string;
  operator: string;
  parameters: Record<string, unknown>;
  expectedRatingMaximum: number;
};

type CalibrationSample = {
  sampleId: string;
  defectId?: string;
  expectedRatingMaximum?: 1 | 2;
  briefId?: string;
  trial?: 1 | 2;
  route: string;
  mobileEvidenceRef: string;
  desktopEvidenceRef: string;
  predictedRatings: Partial<Record<string, number>>;
};

function parseArgs(argv: string[]): Args {
  const required = (name: string): string => {
    const index = argv.indexOf(name);
    const value = index >= 0 ? argv[index + 1] : undefined;
    if (!value) {
      throw new Error(`${name} is required`);
    }
    return value;
  };
  return {
    runId: required("--run-id"),
    root: argv.includes("--root")
      ? required("--root")
      : ".data/generation-evaluation",
    defects: argv.includes("--defects")
      ? required("--defects")
      : "fixtures/generation-evaluation/professional-defects.json",
  };
}

function routeFromEvidence(
  ref: string,
  viewport: "mobile" | "desktop",
): string | null {
  const name = path.basename(ref);
  const suffix = `-${viewport}.jpg`;
  if (!name.endsWith(suffix)) {
    return null;
  }
  const route = name.slice(0, -suffix.length);
  return route === "home" ? "/" : `/${route}`;
}

function samplesFromTrial(
  trial: GeneratedSiteEvaluationTrialV4,
): CalibrationSample[] {
  const desktop = trial.desktopEvidenceRefs.filter((ref) =>
    ref.endsWith(".jpg"),
  );
  const mobile = trial.mobileEvidenceRefs.filter((ref) => ref.endsWith(".jpg"));
  const samples: CalibrationSample[] = [];
  for (const desktopRef of desktop) {
    const route = routeFromEvidence(desktopRef, "desktop");
    const mobileRef = mobile.find(
      (ref) => routeFromEvidence(ref, "mobile") === route,
    );
    if (!route || !mobileRef) {
      continue;
    }
    const predictedRatings = Object.fromEntries(
      PROFESSIONAL_REVIEW_CATEGORIES.flatMap((category) => {
        const rating = trial.categoryRatings[category];
        return typeof rating === "number" ? [[category, rating]] : [];
      }),
    );
    samples.push({
      sampleId: `${trial.briefId}:${trial.trial}:${route}`,
      briefId: trial.briefId,
      trial: trial.trial,
      route,
      mobileEvidenceRef: mobileRef,
      desktopEvidenceRef: desktopRef,
      predictedRatings,
    });
  }
  return samples;
}

async function jsonFile<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function main(): Promise<void> {
  const { runId, root, defects } = parseArgs(process.argv.slice(2));
  const runDir = path.resolve(root, runId);
  const trials = JSON.parse(
    await readFile(path.join(runDir, "trials.json"), "utf8"),
  ) as GeneratedSiteEvaluationTrialV4[];
  const defectFile = JSON.parse(
    await readFile(path.resolve(defects), "utf8"),
  ) as { schemaVersion: 1; evaluatorVersion: string; defects: Defect[] };
  if (defectFile.defects.length !== 30) {
    throw new Error(
      "professional calibration requires exactly 30 seeded defects",
    );
  }
  const categories = new Set<string>(PROFESSIONAL_REVIEW_CATEGORIES);
  if (defectFile.defects.some((defect) => !categories.has(defect.category))) {
    throw new Error(
      "seeded defect category is outside the nine-category rubric",
    );
  }
  if (
    defectFile.defects.some(
      (defect) =>
        defect.severity !== "blocker" ||
        (defect.expectedRatingMaximum !== 1 &&
          defect.expectedRatingMaximum !== 2),
    )
  ) {
    throw new Error("seeded defect severity or expected rating is invalid");
  }
  let probeFiles = [
    {
      path: "src/routes/index.tsx",
      content:
        '<main className="min-h-dvh bg-background text-foreground"><section data-first-view data-section-id="hero"><p className="font-body text-base text-foreground">{site.businessName}</p><p>{site.offer}</p><a data-primary-action className="text-foreground" href="#">CTA</a></section></main>',
    },
    { path: "src/index.css", content: ":root { --background: #fff; }" },
  ];
  for (const defect of defectFile.defects as ProfessionalDefectDefinition[]) {
    probeFiles = applyProfessionalDefect(probeFiles, defect);
  }
  const treatmentSamples = trials
    .filter((trial) => trial.arm === "professional-static-v3")
    .flatMap(samplesFromTrial);
  const defectSamples = existsSync(
    path.join(runDir, "calibration", "defect-samples.json"),
  )
    ? (
        await jsonFile<{ samples: CalibrationSample[] }>(
          path.join(runDir, "calibration", "defect-samples.json"),
        )
      ).samples
    : [];
  const samples = [...defectSamples, ...treatmentSamples].filter(
    (sample, index, all) =>
      all.findIndex((candidate) => candidate.sampleId === sample.sampleId) ===
      index,
  );
  if (
    new Set(samples.map((sample) => sample.sampleId)).size !== samples.length
  ) {
    throw new Error("duplicate calibration sample id");
  }
  const outputDir = path.join(runDir, "calibration");
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "samples.json"),
    `${JSON.stringify({ schemaVersion: 1, evaluatorVersion: defectFile.evaluatorVersion, samples }, null, 2)}\n`,
  );
  await writeFile(
    path.join(outputDir, "seeded-defects.json"),
    `${JSON.stringify(defectFile, null, 2)}\n`,
  );
  process.stdout.write(
    `${JSON.stringify({ runId, sampleCount: samples.length, seededDefects: defectFile.defects.length, operatorCount: defectFile.defects.length, calibrationDir: outputDir }, null, 2)}\n`,
  );
}

await main();
