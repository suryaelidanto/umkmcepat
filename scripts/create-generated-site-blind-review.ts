import { randomInt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { GeneratedSiteEvaluationTrialV3 } from "../src/lib/projects/generation-evaluation";

type Pair = {
  key: string;
  left: GeneratedSiteEvaluationTrialV3;
  right: GeneratedSiteEvaluationTrialV3;
  leftArm: "control" | "treatment";
  rightArm: "control" | "treatment";
};

type Args = { runId?: string; root?: string };

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.runId) {
    throw new Error("--run-id is required");
  }
  const root = path.resolve(
    process.cwd(),
    args.root ?? path.join(".data", "generation-evaluation"),
  );
  const runDir = path.join(root, args.runId);
  const trials = JSON.parse(
    await readFile(path.join(runDir, "trials.json"), "utf8"),
  ) as GeneratedSiteEvaluationTrialV3[];
  const pairs = pairTrials(trials);
  const blindDir = path.join(runDir, "blind");
  await mkdir(blindDir, { recursive: true });
  const mapping: Record<
    string,
    { leftArm: "control" | "treatment"; rightArm: "control" | "treatment" }
  > = {};
  const sections = pairs
    .map((pair) => {
      mapping[pair.key] = { leftArm: pair.leftArm, rightArm: pair.rightArm };
      const leftDesktop = relativeEvidence(
        blindDir,
        pair.left.desktopEvidenceRef,
      );
      const leftMobile = relativeEvidence(
        blindDir,
        pair.left.mobileEvidenceRef,
      );
      const rightDesktop = relativeEvidence(
        blindDir,
        pair.right.desktopEvidenceRef,
      );
      const rightMobile = relativeEvidence(
        blindDir,
        pair.right.mobileEvidenceRef,
      );
      return `<section class="case" data-key="${escapeHtml(pair.key)}"><h2>Kasus ${escapeHtml(pair.key)}</h2><div class="pair"><figure><figcaption>A</figcaption><img src="${escapeHtml(leftDesktop)}" alt="Tampilan desktop A"><img src="${escapeHtml(leftMobile)}" alt="Tampilan mobile A"></figure><figure><figcaption>B</figcaption><img src="${escapeHtml(rightDesktop)}" alt="Tampilan desktop B"><img src="${escapeHtml(rightMobile)}" alt="Tampilan mobile B"></figure></div><fieldset><legend>Pilihan</legend><label><input type="radio" name="${escapeHtml(pair.key)}" value="left"> A lebih meyakinkan</label><label><input type="radio" name="${escapeHtml(pair.key)}" value="right"> B lebih meyakinkan</label><label><input type="radio" name="${escapeHtml(pair.key)}" value="tie"> Sama kuat</label></fieldset></section>`;
    })
    .join("\n");
  await writeFile(
    path.join(blindDir, "mapping.json"),
    JSON.stringify({ schemaVersion: 1, mapping }, null, 2) + "\n",
  );
  await writeFile(path.join(blindDir, "review.html"), html(sections));
  process.stdout.write(
    JSON.stringify(
      {
        runId: args.runId,
        review: path.join(blindDir, "review.html"),
        pairs: pairs.length,
      },
      null,
      2,
    ) + "\n",
  );
}

function pairTrials(trials: GeneratedSiteEvaluationTrialV3[]): Pair[] {
  const keys = new Set(
    trials
      .filter((trial) => trial.arm === "reference-calibrated-v2")
      .map(keyOf),
  );
  return [...keys].sort().map((key) => {
    const treatment = trials.find(
      (trial) =>
        trial.arm === "reference-calibrated-v2" && keyOf(trial) === key,
    );
    const control = trials.find(
      (trial) =>
        trial.arm === "deterministic-control-v1" && keyOf(trial) === key,
    );
    if (!treatment || !control) {
      throw new Error(`control/treatment pair missing: ${key}`);
    }
    const treatmentLeft = randomInt(2) === 0;
    return treatmentLeft
      ? {
          key,
          left: treatment,
          right: control,
          leftArm: "treatment",
          rightArm: "control",
        }
      : {
          key,
          left: control,
          right: treatment,
          leftArm: "control",
          rightArm: "treatment",
        };
  });
}

function html(sections: string): string {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Review tampilan website</title><style>body{font:16px system-ui,sans-serif;max-width:1200px;margin:0 auto;padding:24px;background:#f5f3ef;color:#171717}.case{background:white;border:1px solid #ddd6ce;border-radius:16px;padding:20px;margin:24px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}figcaption{text-align:center;font-weight:700;margin:4px}img{display:block;width:100%;margin:8px 0;border:1px solid #e5e0da;border-radius:8px;background:#eee;min-height:120px;object-fit:contain}label{display:inline-block;margin:8px 16px 0 0}button{position:sticky;bottom:20px;padding:12px 18px;border:0;border-radius:999px;background:#171717;color:#fff;font-weight:700}@media(max-width:720px){.pair{grid-template-columns:1fr}}</style></head><body><h1>Pilih tampilan yang lebih meyakinkan</h1><p>Bandingkan A dan B untuk setiap kasus. Tidak ada jawaban benar; nilai kejelasan, rasa percaya, dan kecocokan dengan usaha.</p>${sections}<button id="save">Unduh hasil review</button><script>const save=()=>{const choices={};let complete=true;document.querySelectorAll('.case').forEach((section)=>{const key=section.dataset.key;const choice=section.querySelector('input:checked')?.value;if(!key||!choice)complete=false;else choices[key]=choice});if(!complete){alert('Pilih satu jawaban untuk setiap kasus.');return}const output={schemaVersion:1,choices:Object.entries(choices).map(([key,value])=>({key,choice:value==='tie'?'tie':value==='left'?'left':'right'}))};const blob=new Blob([JSON.stringify(output,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='preferences.json';link.click();URL.revokeObjectURL(link.href)};document.querySelector('#save').addEventListener('click',save);</script></body></html>`;
}

function keyOf(
  trial: Pick<GeneratedSiteEvaluationTrialV3, "briefId" | "trial">,
): string {
  return `${trial.briefId}:${trial.trial}`;
}
function relativeEvidence(from: string, value: string): string {
  return value ? path.relative(from, value).split(path.sep).join("/") : "";
}
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function parseArgs(argv: string[]): Args {
  const result: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--run-id") {
      result.runId = argv[++index];
    } else if (argv[index] === "--root") {
      result.root = argv[++index];
    }
  }
  return result;
}

await main();
