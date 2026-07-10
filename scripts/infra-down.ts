import { spawnSync } from "node:child_process";

const run = (args: string[], allowFailure = false) => {
  const result = spawnSync("docker", args, { stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status && !allowFailure) {
    process.exit(result.status);
  }
};

run(["compose", "down", "--remove-orphans"]);

const network = "umkmcepat_default";
const containers = spawnSync(
  "docker",
  ["ps", "-aq", "--filter", `network=${network}`],
  { encoding: "utf8" },
);

if (containers.error) {
  throw containers.error;
}
if (containers.status) {
  process.exit(containers.status);
}

const ids = containers.stdout.trim().split(/\s+/).filter(Boolean);
if (ids.length) {
  run(["rm", "-f", ...ids]);
}

const networkExists = spawnSync("docker", ["network", "inspect", network], {
  stdio: "ignore",
});
if (networkExists.status === 0) {
  run(["network", "rm", network]);
}
