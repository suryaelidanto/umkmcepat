import { execFileSync, spawn } from "node:child_process";
import { realpathSync } from "node:fs";

import {
  isRepoOwnedPortCommand,
  parseWindowsNetstatListeningPids,
} from "../src/lib/dev-port";

const DEFAULT_PORT = 3000;
const STOP_TIMEOUT_MS = 5_000;

const port = Number(process.env.PORT || DEFAULT_PORT);
const repoRoot = realpathSync(process.cwd());

async function main() {
  const owners = findListeningPids(port);

  if (owners.length) {
    for (const pid of owners) {
      const commandLine = getCommandLine(pid);

      if (!isRepoOwnedPortCommand({ commandLine, repoRoot })) {
        console.error(
          `Port ${port} is already used by PID ${pid}, but it is not clearly owned by this repo.`,
        );
        console.error(commandLine || "Command line is unavailable.");
        console.error("Stop that process manually, then run bun run dev.");
        process.exit(1);
      }
    }

    console.warn(
      `Stopping repo-owned process on port ${port}: ${owners.join(", ")}`,
    );

    for (const pid of owners) {
      stopProcess(pid, false);
    }

    if (!(await waitForPortRelease(port, STOP_TIMEOUT_MS))) {
      for (const pid of owners) {
        stopProcess(pid, true);
      }

      if (!(await waitForPortRelease(port, STOP_TIMEOUT_MS))) {
        console.error(`Port ${port} is still busy after stopping PID(s).`);
        process.exit(1);
      }
    }
  }

  console.warn(`Starting Next dev server on port ${port}.`);

  const child = spawn("bun", ["run", "dev"], {
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

function findListeningPids(targetPort: number) {
  if (process.platform === "win32") {
    const output = execFileSync("netstat", ["-ano", "-p", "tcp"], {
      encoding: "utf8",
      windowsHide: true,
    });

    return parseWindowsNetstatListeningPids(output, targetPort);
  }

  try {
    const output = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${targetPort}`, "-sTCP:LISTEN", "-t"],
      {
        encoding: "utf8",
      },
    );

    return [...new Set(output.split(/\s+/).map(Number))]
      .filter((pid) => Number.isInteger(pid) && pid > 0)
      .sort((left, right) => left - right);
  } catch {
    return [];
  }
}

function getCommandLine(pid: number) {
  try {
    if (process.platform === "win32") {
      return execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`,
        ],
        { encoding: "utf8", windowsHide: true },
      ).trim();
    }

    return execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function stopProcess(pid: number, force: boolean) {
  try {
    if (force && process.platform === "win32") {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      return;
    }

    process.kill(pid, force ? "SIGKILL" : "SIGTERM");
  } catch {
    // The process may already be gone.
  }
}

async function waitForPortRelease(targetPort: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!findListeningPids(targetPort).length) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 160));
  }

  return !findListeningPids(targetPort).length;
}

void main();
