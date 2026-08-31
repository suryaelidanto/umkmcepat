export const SCRIPT_TIMEOUT_MS = 12_000;
export const MAX_SCRIPT_OUTPUT_BYTES = 2 * 1024 * 1024;
export const SCRIPT_SPAWN_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
export const SCRIPT_OUTPUT_TRUNCATION_MARKER =
  "\n[umkm:skill-output-truncated]\n";

const FLAG_ALLOWLIST: Record<string, ReadonlySet<string>> = {
  palette: new Set(["id"]),
  "concept-seed": new Set(["scope", "mode", "register", "reroll", "from"]),
  context: new Set(["target"]),
  "context-signals": new Set([]),
  detect: new Set(["json", "scope"]),
};

export function getAllowlistedFlags(
  entrypointId: string,
): ReadonlySet<string> | null {
  return FLAG_ALLOWLIST[entrypointId] ?? null;
}
