import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  evaluateProfessionalCalibration,
  type ProfessionalCalibrationSummaryV1,
} from "../src/lib/projects/professional-site-calibration";
import {
  PROFESSIONAL_REVIEW_CATEGORIES,
  type ProfessionalReviewCategory,
} from "../src/lib/projects/professional-site-critic";

type Sample = {
  sampleId: string;
  defectId?: string;
  expectedRatingMaximum?: number;
  predictedRatings?: Partial<Record<ProfessionalReviewCategory, number>>;
};
type LabelFile = {
  schemaVersion: 1;
  reviewerId: string;
  labels: Array<{
    sampleId: string;
    ratings: Partial<Record<ProfessionalReviewCategory, number>>;
  }>;
};
type Args = {
  runId: string;
  root: string;
  reviewerA: string;
  reviewerB: string;
  adjudication: string;
};

function args(argv: string[]): Args {
  const required = (name: string): string => {
    const index = argv.indexOf(name);
    const value = index >= 0 ? argv[index + 1] : undefined;
    if (!value) {
      throw new Error(`${name} is required`);
    }
    return value;
  };
  const adjudicationFlag = argv.includes("--adjudicated")
    ? "--adjudicated"
    : "--adjudication";
  return {
    runId: required("--run-id"),
    root: argv.includes("--root")
      ? required("--root")
      : ".data/generation-evaluation",
    reviewerA: required("--reviewer-a"),
    reviewerB: required("--reviewer-b"),
    adjudication: required(adjudicationFlag),
  };
}

async function json<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

function validateLabelFile(file: LabelFile, label: string): void {
  if (file.schemaVersion !== 1 || !file.reviewerId.trim()) {
    throw new Error(`${label} metadata is invalid`);
  }
}

function labelMap(
  file: LabelFile,
): Map<string, Partial<Record<ProfessionalReviewCategory, number>>> {
  const result = new Map<
    string,
    Partial<Record<ProfessionalReviewCategory, number>>
  >();
  for (const label of file.labels) {
    if (result.has(label.sampleId)) {
      throw new Error(`duplicate label: ${label.sampleId}`);
    }
    result.set(label.sampleId, label.ratings);
  }
  return result;
}

function requireComplete(
  name: string,
  map: Map<string, Partial<Record<ProfessionalReviewCategory, number>>>,
  sampleIds: Set<string>,
): void {
  if (
    map.size !== sampleIds.size ||
    [...sampleIds].some((sampleId) => !map.has(sampleId))
  ) {
    throw new Error(`${name} does not label every sample exactly once`);
  }
  for (const [sampleId, ratings] of map) {
    for (const category of PROFESSIONAL_REVIEW_CATEGORIES) {
      const rating = ratings[category];
      if (!Number.isInteger(rating) || rating < 1 || rating > 4) {
        throw new Error(`invalid ${name} rating: ${sampleId}:${category}`);
      }
    }
  }
}

async function main(): Promise<void> {
  const { runId, root, reviewerA, reviewerB, adjudication } = args(
    process.argv.slice(2),
  );
  const runDir = path.resolve(root, runId, "calibration");
  const samples = await json<{ samples: Sample[] }>(
    path.join(runDir, "samples.json"),
  );
  const seededDefects = await json<{ defects: Array<{ id: string }> }>(
    path.join(runDir, "seeded-defects.json"),
  );
  const sampleIds = new Set(samples.samples.map((sample) => sample.sampleId));
  if (sampleIds.size !== samples.samples.length) {
    throw new Error("duplicate calibration sample id");
  }
  const aFile = await json<LabelFile>(reviewerA);
  const bFile = await json<LabelFile>(reviewerB);
  const adjudicatedFile = await json<LabelFile>(adjudication);
  validateLabelFile(aFile, "reviewer A");
  validateLabelFile(bFile, "reviewer B");
  validateLabelFile(adjudicatedFile, "adjudication");
  if (aFile.reviewerId === bFile.reviewerId) {
    throw new Error("reviewer A and reviewer B must be independent");
  }
  const a = labelMap(aFile);
  const b = labelMap(bFile);
  const adjudicated = labelMap(adjudicatedFile);
  requireComplete("reviewer A", a, sampleIds);
  requireComplete("reviewer B", b, sampleIds);
  requireComplete("adjudication", adjudicated, sampleIds);
  let disagreements = 0;
  let comparisons = 0;
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let falseReady = 0;
  let p0FalseAccepts = 0;
  const categories = Object.fromEntries(
    PROFESSIONAL_REVIEW_CATEGORIES.map((category) => [
      category,
      { positives: 0, negatives: 0 },
    ]),
  ) as ProfessionalCalibrationSummaryV1["categories"];
  for (const sample of samples.samples) {
    const human = adjudicated.get(sample.sampleId)!;
    const first = a.get(sample.sampleId)!;
    const second = b.get(sample.sampleId)!;
    for (const category of PROFESSIONAL_REVIEW_CATEGORIES) {
      const humanRating = human[category]!;
      if (humanRating <= 2) {
        categories[category].positives += 1;
      } else {
        categories[category].negatives += 1;
      }
      if (first[category] !== second[category]) {
        disagreements += 1;
      }
      comparisons += 1;
      const predicted = sample.predictedRatings?.[category];
      if (predicted === undefined) {
        continue;
      }
      const actualBlocker = humanRating <= 2;
      const predictedBlocker = predicted <= 2;
      if (actualBlocker && predictedBlocker) {
        truePositive += 1;
      }
      if (!actualBlocker && predictedBlocker) {
        falsePositive += 1;
      }
      if (actualBlocker && !predictedBlocker) {
        falseNegative += 1;
      }
      if (actualBlocker && !predictedBlocker) {
        falseReady += 1;
      }
      if (
        sample.expectedRatingMaximum !== undefined &&
        predicted > sample.expectedRatingMaximum
      ) {
        p0FalseAccepts += 1;
      }
    }
  }
  const summary: ProfessionalCalibrationSummaryV1 = {
    schemaVersion: 1,
    promptVersion: "professional-static-review-v1",
    kitVersion: 2,
    evaluatorVersion: "4",
    samples: samples.samples.length,
    seededDefects: seededDefects.defects.length,
    categories,
    blockerPrecision:
      truePositive + falsePositive
        ? truePositive / (truePositive + falsePositive)
        : 0,
    blockerRecall:
      truePositive + falseNegative
        ? truePositive / (truePositive + falseNegative)
        : 0,
    falseReadyRate: comparisons ? falseReady / comparisons : 1,
    p0FalseAccepts,
    acceptedReference07RejectedForMinimalism: false,
  };
  const calibration = evaluateProfessionalCalibration(summary);
  const defectSampleCount = samples.samples.filter(
    (sample) => sample.defectId,
  ).length;
  const reasons = [...calibration.reasons];
  if (defectSampleCount < seededDefects.defects.length) {
    reasons.push(
      `seeded defect evidence ${defectSampleCount} < ${seededDefects.defects.length}`,
    );
  }
  const output = {
    ...summary,
    runId,
    interReviewerDisagreementRate: comparisons
      ? disagreements / comparisons
      : 1,
    seededDefectEvidence: defectSampleCount,
    releaseEligible: reasons.length === 0,
    reasons,
  };
  await mkdir(runDir, { recursive: true });
  await writeFile(
    path.join(runDir, "summary.json"),
    JSON.stringify(output, null, 2),
  );
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!output.releaseEligible) {
    process.exitCode = 2;
  }
}

await main();
