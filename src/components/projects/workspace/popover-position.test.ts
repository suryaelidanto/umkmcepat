import { describe, expect, it } from "vitest";

import {
  calculateFloatingPopoverPosition,
  formatHierarchyBreadcrumb,
} from "./popover-position";

describe("calculateFloatingPopoverPosition", () => {
  it("positions popover below target when there is enough vertical room", () => {
    const pos = calculateFloatingPopoverPosition({
      boundingBox: { height: 40, width: 120, x: 100, y: 100 },
      containerHeight: 800,
      containerWidth: 1000,
      popoverHeight: 200,
      popoverWidth: 320,
    });

    expect(pos.top).toBe(148);
    expect(pos.left).toBe(100);
    expect(pos.placement).toBe("bottom");
  });

  it("flips popover above target when bottom overflows container", () => {
    const pos = calculateFloatingPopoverPosition({
      boundingBox: { height: 50, width: 200, x: 100, y: 650 },
      containerHeight: 800,
      containerWidth: 1000,
      popoverHeight: 200,
      popoverWidth: 320,
    });

    expect(pos.top).toBe(442);
    expect(pos.placement).toBe("top");
  });

  it("clamps horizontal position to stay strictly within container bounds", () => {
    const posRightOverflow = calculateFloatingPopoverPosition({
      boundingBox: { height: 40, width: 200, x: 850, y: 100 },
      containerHeight: 800,
      containerWidth: 1000,
      popoverHeight: 200,
      popoverWidth: 320,
    });

    expect(posRightOverflow.left + 320).toBeLessThanOrEqual(1000);
    expect(posRightOverflow.left).toBe(668); // 1000 - 320 - 12 margin

    const posLeftOverflow = calculateFloatingPopoverPosition({
      boundingBox: { height: 40, width: 200, x: -20, y: 100 },
      containerHeight: 800,
      containerWidth: 1000,
      popoverHeight: 200,
      popoverWidth: 320,
    });

    expect(posLeftOverflow.left).toBeGreaterThanOrEqual(12);
  });
});

describe("formatHierarchyBreadcrumb", () => {
  it("formats component ancestry and tag into clear clickable steps", () => {
    const breadcrumb = formatHierarchyBreadcrumb({
      componentHierarchy: ["LandingPage", "HeroSection", "PrimaryCTA"],
      label: 'Tombol — "Pesan Sekarang"',
      tag: "button",
    });

    expect(breadcrumb.length).toBeGreaterThanOrEqual(2);
    expect(breadcrumb[0].name).toBe("HeroSection");
    expect(breadcrumb.at(-1)?.name).toBe("PrimaryCTA");
  });

  it("falls back gracefully when component hierarchy is empty", () => {
    const breadcrumb = formatHierarchyBreadcrumb({
      componentHierarchy: [],
      label: 'Judul utama — "Kopi Senja"',
      tag: "h1",
    });

    expect(breadcrumb).toEqual([{ level: "leaf", name: "Judul utama" }]);
  });
});
