import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useIsDesktopViewport } from "./use-is-desktop-viewport";

// Thin test component that captures the hook's return value during SSR.
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
