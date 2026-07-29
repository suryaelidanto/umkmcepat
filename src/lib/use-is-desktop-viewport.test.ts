import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useIsDesktopViewport } from "./use-is-desktop-viewport";

// Thin test component that captures the hook's return value during SSR.
// useEffect never runs during SSR, so window.matchMedia is never called —
// the hook's SSR-safe default (false) is the only observable path here.
function TestWrapper() {
  const isDesktop = useIsDesktopViewport();
  return createElement("span", null, String(isDesktop));
}

describe("useIsDesktopViewport", () => {
  it("is a function", () => {
    expect(typeof useIsDesktopViewport).toBe("function");
  });

  it("defaults to false during SSR (SSR-safe)", () => {
    const html = renderToStaticMarkup(createElement(TestWrapper));
    expect(html).toContain("false");
  });
});
