import { randomInt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PROFESSIONAL_REVIEW_CATEGORIES } from "../src/lib/projects/professional-site-critic";

type Sample = {
  sampleId: string;
  route: string;
  mobileEvidenceRef: string;
  desktopEvidenceRef: string;
};

type ReviewInput = { samples: Sample[] };

type Args = { runId: string; root: string };

function args(argv: string[]): Args {
  const value = (name: string): string => {
    const index = argv.indexOf(name);
    const result = index >= 0 ? argv[index + 1] : undefined;
    if (!result) {
      throw new Error(`${name} is required`);
    }
    return result;
  };
  return {
    runId: value("--run-id"),
    root: argv.includes("--root")
      ? value("--root")
      : ".data/generation-evaluation",
  };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>\"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ??
      character,
  );
}

function shuffled<T>(values: T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

async function main(): Promise<void> {
  const { runId, root } = args(process.argv.slice(2));
  const runDir = path.resolve(root, runId);
  const input = JSON.parse(
    await readFile(path.join(runDir, "calibration", "samples.json"), "utf8"),
  ) as ReviewInput;
  if (!Array.isArray(input.samples) || input.samples.length === 0) {
    throw new Error("calibration samples are empty");
  }
  const samples = shuffled(input.samples);
  const categoryMarkup = PROFESSIONAL_REVIEW_CATEGORIES.map(
    (category) =>
      `<fieldset><legend>${category}</legend>${[1, 2, 3, 4].map((rating) => `<label><input required type="radio" name="${category}" value="${rating}">${rating}</label>`).join(" ")}</fieldset>`,
  ).join("");
  const cards = samples
    .map(
      (sample, index) =>
        `<article data-sample-id="${escapeHtml(sample.sampleId)}"><h2>Sample ${index + 1}</h2><p>${escapeHtml(sample.route)}</p><div class="evidence"><figure><figcaption>Mobile</figcaption><img src="${escapeHtml(sample.mobileEvidenceRef)}" alt="Mobile evidence"></figure><figure><figcaption>Desktop</figcaption><img src="${escapeHtml(sample.desktopEvidenceRef)}" alt="Desktop evidence"></figure></div>${categoryMarkup}</article>`,
    )
    .join("");
  const html = `<!doctype html><meta charset="utf-8"><title>Private professional calibration</title><style>body{font:16px system-ui;max-width:1100px;margin:2rem auto}article{border:1px solid #ccc;padding:1rem;margin:2rem 0}.evidence{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.evidence img{max-width:100%;max-height:500px}fieldset{display:inline-block;margin:.5rem;padding:.5rem}button{font:inherit;padding:.75rem 1rem}</style><h1>Private calibration review</h1><p>Review only the evidence shown. This file is not a release decision.</p><form id="review">${cards}<button>Export labels</button></form><script>document.querySelector('#review').addEventListener('submit',event=>{event.preventDefault();const labels=[...document.querySelectorAll('article')].map(card=>{const ratings=Object.fromEntries([...card.querySelectorAll('fieldset')].map(field=>[field.firstChild.textContent,Number(field.querySelector('input:checked').value)]));return{sampleId:card.dataset.sampleId,ratings}});const blob=new Blob([JSON.stringify({schemaVersion:1,runId:${JSON.stringify(runId)},reviewerId:'REPLACE_WITH_PRIVATE_REVIEWER_ID',labels},null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='professional-calibration-labels.json';link.click()})</script>`;
  const outputDir = path.join(runDir, "calibration", "review");
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "review.html"), html);
  await writeFile(
    path.join(outputDir, "randomization.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        runId,
        sampleIds: samples.map((sample) => sample.sampleId),
      },
      null,
      2,
    ),
  );
  process.stdout.write(
    `Wrote private calibration review to ${path.join(outputDir, "review.html")}\n`,
  );
}

await main();
