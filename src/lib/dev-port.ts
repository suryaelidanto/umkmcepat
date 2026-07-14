export function parseWindowsNetstatListeningPids(output: string, port: number) {
  const pids = new Set<number>();

  for (const line of output.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);

    if (columns.length < 5 || columns[0].toUpperCase() !== "TCP") {
      continue;
    }

    const [, localAddress, , state, pidText] = columns;

    if (state.toUpperCase() !== "LISTENING") {
      continue;
    }

    if (getAddressPort(localAddress) !== port) {
      continue;
    }

    const pid = Number(pidText);

    if (Number.isInteger(pid) && pid > 0) {
      pids.add(pid);
    }
  }

  return [...pids].sort((left, right) => left - right);
}

export function isRepoOwnedPortCommand({
  commandLine,
  repoRoot,
}: {
  commandLine: string;
  repoRoot: string;
}) {
  const command = normalizeForOwnership(commandLine);
  const root = normalizeForOwnership(repoRoot);

  if (!command || !root || !command.includes(root)) {
    return false;
  }

  return (
    command.includes("/node_modules/next/") ||
    command.includes("/.next/") ||
    /\bbun(\.exe)?\s+run\s+dev\b/.test(command) ||
    /\bnext(\.cmd)?\s+dev\b/.test(command)
  );
}

function getAddressPort(localAddress: string) {
  const match = localAddress.match(/:(\d+)$/);
  return match ? Number(match[1]) : null;
}

function normalizeForOwnership(value: string) {
  return value.replace(/\\/g, "/").toLowerCase();
}
