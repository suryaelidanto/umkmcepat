import { describe, expect, it } from "vitest";

import {
  auditHorizontalOverflow,
  auditInputFontSizes,
  auditTouchTargets,
} from "@/lib/mobile-audit";

// Minimal jsdom-ish stub: the auditors read getBoundingClientRect +
// getComputedStyle off elements. Provide a tiny fake document.
function fakeEl(opts: {
  height?: number;
  width?: number;
  fontSize?: number;
  scrollWidth?: number;
  tagName?: string;
  role?: string;
}): Element {
  return {
    fontSize: opts.fontSize,
    getBoundingClientRect: () => ({
      height: opts.height ?? 20,
      left: 0,
      top: 0,
      width: opts.width ?? 20,
    }),
    getComputedStyle: undefined,
    tagName: opts.tagName ?? "DIV",
    getAttribute: (name: string) =>
      name === "role" ? (opts.role ?? null) : null,
  } as unknown as Element;
}

describe("auditTouchTargets", () => {
  it("flags interactive elements below 44px", () => {
    const small = fakeEl({ height: 30, tagName: "BUTTON", width: 30 });
    const big = fakeEl({ height: 48, tagName: "A", width: 48 });
    const result = auditTouchTargets({
      querySelectorAll: () => [small, big],
    } as unknown as Document);
    expect(result).toHaveLength(1);
    expect(result[0].size).toBe(30);
  });

  it("ignores non-interactive elements", () => {
    const div = fakeEl({ height: 10, tagName: "DIV", width: 10 });
    const result = auditTouchTargets({
      querySelectorAll: () => [div],
    } as unknown as Document);
    expect(result).toHaveLength(0);
  });
});

describe("auditInputFontSizes", () => {
  it("flags inputs below 16px (iOS zoom prevention)", () => {
    const small = fakeEl({ fontSize: 14, tagName: "INPUT" });
    const ok = fakeEl({ fontSize: 16, tagName: "TEXTAREA" });
    const result = auditInputFontSizes(
      {
        querySelectorAll: () => [small, ok],
      } as unknown as Document,
      (el: Element) => ({
        fontSize: `${(el as unknown as { fontSize?: number }).fontSize ?? 16}px`,
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].px).toBe(14);
  });
});

describe("auditHorizontalOverflow", () => {
  it("returns true when scrollWidth exceeds innerWidth", () => {
    const result = auditHorizontalOverflow({
      document: { documentElement: { scrollWidth: 500 } },
      innerWidth: 390,
    } as unknown as Window);
    expect(result).toBe(true);
  });

  it("returns false when content fits", () => {
    const result = auditHorizontalOverflow({
      document: { documentElement: { scrollWidth: 380 } },
      innerWidth: 390,
    } as unknown as Window);
    expect(result).toBe(false);
  });
});
