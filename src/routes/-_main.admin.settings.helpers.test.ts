import { describe, expect, test } from "vitest";

import { getDirtyKeys, isDirtyEntry } from "./-_main.admin.settings.helpers";

import type { SettingEntry } from "./-_main.admin.settings.helpers";

const baseEntry = (overrides: Partial<SettingEntry> = {}): SettingEntry => ({
  category: "feature_flag",
  dbValue: null,
  effectiveValue: false,
  fallback: false,
  key: "feature.test",
  label: "Test",
  source: "fallback",
  type: "boolean",
  ...overrides,
});

describe("isDirtyEntry", () => {
  test("returns false when no draft value", () => {
    expect(isDirtyEntry(baseEntry(), undefined)).toBe(false);
  });

  test("returns false when draft equals effective", () => {
    expect(isDirtyEntry(baseEntry(), false)).toBe(false);
  });

  test("returns true when boolean flips", () => {
    expect(isDirtyEntry(baseEntry({ effectiveValue: false }), true)).toBe(true);
  });

  test("returns true when number changes", () => {
    expect(
      isDirtyEntry(baseEntry({ type: "number", effectiveValue: 100 }), 200),
    ).toBe(true);
  });

  test("returns false when number reverted to baseline", () => {
    expect(
      isDirtyEntry(baseEntry({ type: "number", effectiveValue: 100 }), 100),
    ).toBe(false);
  });

  test("returns true when string changes", () => {
    expect(
      isDirtyEntry(baseEntry({ type: "string", effectiveValue: "a" }), "b"),
    ).toBe(true);
  });
});

describe("getDirtyKeys", () => {
  test("returns empty set when no drafts", () => {
    const entries = [baseEntry({ key: "a" }), baseEntry({ key: "b" })];
    expect(getDirtyKeys(entries, {})).toEqual(new Set());
  });

  test("returns only keys whose draft differs from baseline", () => {
    const entries = [
      baseEntry({ key: "a", effectiveValue: false }),
      baseEntry({ key: "b", effectiveValue: false }),
    ];
    const dirty = getDirtyKeys(entries, { a: true, b: false });
    expect(dirty).toEqual(new Set(["a"]));
  });

  test("skips keys whose draft is undefined", () => {
    const entries = [baseEntry({ key: "a", effectiveValue: false })];
    const dirty = getDirtyKeys(entries, { a: undefined });
    expect(dirty).toEqual(new Set());
  });
});
