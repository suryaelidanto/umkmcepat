import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";

const target = process.argv[2] || "all";
const configs =
  target === "mobile"
    ? ["lighthouserc.mobile.cjs"]
    : target === "desktop"
      ? ["lighthouserc.desktop.cjs"]
      : target === "auth-mobile"
        ? ["lighthouserc.auth.mobile.cjs"]
        : target === "auth-desktop"
          ? ["lighthouserc.auth.desktop.cjs"]
          : target === "auth"
            ? ["lighthouserc.auth.mobile.cjs", "lighthouserc.auth.desktop.cjs"]
            : ["lighthouserc.mobile.cjs", "lighthouserc.desktop.cjs"];

const env = {
  ...process.env,
  AUTH_TRUST_HOST: "true",
  NEXTAUTH_URL: "http://localhost:3005",
  NEXT_PUBLIC_APP_URL: "http://localhost:3005",
};

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      shell: true,
      stdio: "inherit",
      ...options,
    });

    child.on("exit", (code) => {
      if (code) {
        reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
        return;
      }

      resolve();
    });
  });
}

function killPort3005() {
  if (platform() !== "win32") {
    return;
  }

  try {
    const output = execSync("netstat -ano", { encoding: "utf8" });
    const pids = new Set(
      output
        .split(/\r?\n/)
        .filter((line) => line.includes(":3005") && line.includes("LISTENING"))
        .map((line) => line.trim().split(/\s+/).at(-1))
        .filter(Boolean),
    );

    for (const pid of pids) {
      execSync(`taskkill /pid ${pid} /f /t`, { stdio: "ignore" });
    }
  } catch {
    // Best effort cleanup only.
  }
}

function startServer() {
  return spawn("bun", ["run", "start", "--", "-p", "3005"], {
    env,
    shell: true,
    stdio: "inherit",
  });
}

async function waitForServer() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const response = await fetch("http://localhost:3005/", {
        signal: AbortSignal.timeout(3000),
      });

      if (response.ok) {
        return;
      }
    } catch {
      // Retry until Next is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("Lighthouse server did not become ready on port 3005");
}

killPort3005();

if (process.env.LIGHTHOUSE_SKIP_BUILD === "1" || existsSync(".next/BUILD_ID")) {
  console.warn("Using existing .next build for Lighthouse.");
} else {
  await run("bun", ["run", "build"]);
}

const server = startServer();

try {
  await waitForServer();

  for (const config of configs) {
    await run("bunx", ["lhci", "autorun", "--config", config]);
  }
} finally {
  if (platform() === "win32") {
    killPort3005();
  } else {
    server.kill("SIGTERM");
  }
}
