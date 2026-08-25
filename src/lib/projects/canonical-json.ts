function canonicalize(v: unknown): unknown {
  if (typeof v === "string") {
    return v.normalize("NFC").replace(/\r\n/g, "\n");
  }
  if (Array.isArray(v)) {
    return v.map(canonicalize);
  }
  if (v !== null && typeof v === "object") {
    const record = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = canonicalize(record[key]);
    }
    return out;
  }
  return v;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? "null";
}
