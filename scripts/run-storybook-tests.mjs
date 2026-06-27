import { spawnSync } from "node:child_process";

const project = `storybook:${process.cwd().replace(/\\/g, "/")}/.storybook`;
const args = ["vitest", "--project", project, "--browser.api.port=0"];

if (process.argv.includes("--coverage")) {
  args.push("--teardownTimeout=0");
}

const result = spawnSync("bunx", [...args, ...process.argv.slice(2)], {
  encoding: "utf8",
  shell: process.platform === "win32",
});

const ignoredNoise = [
  "Runtime config is deprecated and will be removed in Next.js 16",
  "close timed out after",
  "Tests closed successfully but something prevents",
  "You can try to identify the cause by enabling",
];

function printFiltered(output, write) {
  if (!output) {
    return;
  }

  const filtered = output
    .split(/\r?\n/)
    .filter((line) => !ignoredNoise.some((noise) => line.includes(noise)))
    .join("\n");

  if (filtered.trim()) {
    write(`${filtered}\n`);
  }
}

printFiltered(result.stdout, (value) => process.stdout.write(value));
printFiltered(result.stderr, (value) => process.stderr.write(value));

process.exit(result.status ?? 1);
