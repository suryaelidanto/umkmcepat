const VERBOSE_VALUES = new Set(["1", "true", "yes", "on", "debug"]);

export function isVerboseDevLoggingEnabled() {
  return VERBOSE_VALUES.has(
    String(process.env.UMKM_VERBOSE_DEV ?? "").toLowerCase(),
  );
}

export function devLog(
  scope: string,
  event: string,
  metadata?: Record<string, unknown>,
) {
  if (!isVerboseDevLoggingEnabled()) {
    return;
  }

  const suffix = metadata ? ` ${stableJson(metadata)}` : "";
  console.warn(`[umkm:${scope}] ${event}${suffix}`);
}

function stableJson(value: Record<string, unknown>) {
  return JSON.stringify(value, Object.keys(value).sort());
}
