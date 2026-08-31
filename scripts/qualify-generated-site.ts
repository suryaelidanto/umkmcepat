import { readFile } from "node:fs/promises";

import {
  parseVisualCandidateEvidence,
  qualifyVisualCandidate,
} from "@/lib/projects/visual-qualification";
import {
  parseVisualReview,
  parseVisualReviewGateRuns,
  qualifyVisualReview,
} from "@/lib/projects/visual-review";

const inputPath = process.argv[2];
const revisionCount = Number(process.argv[3] ?? "0");

if (!inputPath) {
  console.error(
    "Usage: bun scripts/qualify-generated-site.ts <evidence.json> [revision-count]",
  );
  process.exit(1);
}

const input: unknown = JSON.parse(await readFile(inputPath, "utf8"));
const parsed = parseVisualCandidateEvidence(input);
if (!parsed.ok) {
  console.error(JSON.stringify(parsed));
  process.exit(1);
}
const inputRecord = isRecord(input) ? input : null;
const review = parseVisualReview(inputRecord?.visualReview);
if (!review.ok) {
  console.error(JSON.stringify(review));
  process.exit(1);
}

const candidateResult = qualifyVisualCandidate(parsed.value, revisionCount);
const reviewResult = qualifyVisualReview(
  review.value,
  revisionCount,
  parseVisualReviewGateRuns(inputRecord?.gateRuns),
);
const reasons = [...candidateResult.reasons, ...reviewResult.reasons];
const release = candidateResult.release && reviewResult.release;
const result = {
  status: release
    ? "qualified"
    : revisionCount > 0
      ? "rejected"
      : "revision_required",
  release,
  revisionAllowed:
    !release &&
    revisionCount === 0 &&
    (candidateResult.revisionAllowed || reviewResult.revisionAllowed),
  reasons: [...new Set(reasons)],
};
console.log(JSON.stringify(result, null, 2));
if (!result.release) {
  process.exit(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
