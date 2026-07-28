export type SettingEntry = {
  category: string;
  dbValue: unknown;
  effectiveValue: unknown;
  fallback: boolean | number | string;
  key: string;
  label: string;
  source: string;
  type: "boolean" | "number" | "string";
};

export function isDirtyEntry(
  entry: SettingEntry,
  draftValue: unknown,
): boolean {
  if (draftValue === undefined) {
    return false;
  }
  return draftValue !== entry.effectiveValue;
}

export function getDirtyKeys(
  entries: SettingEntry[],
  draft: Record<string, unknown>,
): Set<string> {
  const dirty = new Set<string>();
  for (const entry of entries) {
    if (entry.key in draft && isDirtyEntry(entry, draft[entry.key])) {
      dirty.add(entry.key);
    }
  }
  return dirty;
}
