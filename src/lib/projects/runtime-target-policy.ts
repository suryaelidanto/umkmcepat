import { getEnv } from "@/lib/config";

export function assertRuntimeTargetAllowed(target: string) {
  let url: URL;

  try {
    url = new URL(target);
  } catch {
    throw new Error("Runtime target must be a valid absolute URL.");
  }

  if (url.protocol !== "http:") {
    throw new Error("Runtime target protocol must be http:");
  }

  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Runtime target cannot include credentials or request data.",
    );
  }

  if (!url.port || !isValidPort(url.port)) {
    throw new Error("Runtime target must include a valid explicit port.");
  }

  const allowedHosts = new Set(
    getEnv("PROJECT_RUNTIME_ALLOWED_HOSTS", "127.0.0.1,localhost")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );

  if (!allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error(`Runtime target host is not allowed: ${url.hostname}`);
  }

  return url;
}

function isValidPort(value: string) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1_024 && port <= 65_535;
}
