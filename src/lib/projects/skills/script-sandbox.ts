export const SCRIPT_TIMEOUT_MS = 12_000;
export const MAX_SCRIPT_OUTPUT_BYTES = 2 * 1024 * 1024;
export const SCRIPT_SPAWN_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
export const SCRIPT_OUTPUT_TRUNCATION_MARKER =
  "\n[umkm:skill-output-truncated]\n";

const FLAG_ALLOWLIST: Record<string, ReadonlySet<string>> = {
  palette: new Set(["id", "from"]),
  "concept-seed": new Set([
    "scope",
    "mode",
    "grain",
    "platform",
    "reroll",
    "from",
    "register",
    "candidate-count",
    "chosen",
    "kind",
  ]),
  context: new Set(["target", "json"]),
  "context-signals": new Set([]),
  detect: new Set(["json", "scope", "target"]),
};

export function kebabFlag(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

export function getAllowlistedFlags(
  entrypointId: string,
): ReadonlySet<string> | null {
  return FLAG_ALLOWLIST[entrypointId] ?? null;
}
