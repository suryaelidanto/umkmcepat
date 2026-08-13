import {
  CATEGORY_ORDER,
  type SettingCategory,
  type SettingTier,
  type SettingType,
} from "@/lib/app-settings-registry";

export type SettingEntry = {
  category: SettingCategory;
  dbValue: unknown;
  display: "percentage" | null;
  effectiveValue: unknown;
  env: null | string;
  fallback: boolean | number | string;
  key: string;
  label: string;
  max: null | number;
  min: null | number;
  optionsSource: "nine_router_models" | null;
  enumOptions: string[] | null;
  requiresRestart: boolean;
  source: string;
  tier: SettingTier;
  type: SettingType;
};

export type CategoryGroup = {
  category: SettingCategory;
  entries: SettingEntry[];
};

export function toDisplayNumber(
  entry: SettingEntry,
  value: unknown,
): number | "" {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return "";
  }
  return entry.display === "percentage" ? numeric * 100 : numeric;
}

export function fromDisplayNumber(
  entry: SettingEntry,
  value: number | "",
): number | "" {
  if (value === "") {
    return "";
  }
  return entry.display === "percentage" ? value / 100 : value;
}

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

export function groupByTier(entries: SettingEntry[]): {
  advanced: CategoryGroup[];
  basic: CategoryGroup[];
} {
  const build = (tier: SettingTier): CategoryGroup[] =>
    CATEGORY_ORDER.map((category) => ({
      category,
      entries: entries.filter(
        (e) => e.category === category && e.tier === tier,
      ),
    })).filter((group) => group.entries.length > 0);

  return { advanced: build("advanced"), basic: build("basic") };
}
