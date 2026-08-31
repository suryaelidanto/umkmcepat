import { readFile } from "node:fs/promises";

import {
  parseVisualCandidateEvidence,
  qualifyVisualCandidate,
} from "@/lib/projects/visual-qualification";

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

const result = qualifyVisualCandidate(parsed.value, revisionCount);
console.log(JSON.stringify(result, null, 2));
if (!result.release) {
  process.exit(1);
}
