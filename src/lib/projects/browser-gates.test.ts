import { describe, expect, it } from "vitest";

import {
  BROWSER_INFRA_RETRIES,
  BROWSER_NAVIGATION_TIMEOUT_MS,
  BROWSER_ROUTE_MAX,
  classifyBrowserReport,
  type BrowserGateReport,
} from "./browser-gates";

function report(
  status: "pass" | "fail" | "infrastructure_error",
): BrowserGateReport {
  return {
    version: 1,
    status,
    routes: [],
    evidenceIds: [],
    overheadMs: 0,
  };
}

describe("classifyBrowserReport", () => {
  it("never converts an infrastructure error into a pass", () => {
    expect(classifyBrowserReport(report("infrastructure_error"))).toBe("fail");
  });

  it("keeps a complete hard-gate report as a pass", () => {
    const value = report("pass");
    const assertions = [
      "route-load",
      "console-clean",
      "required-content-visible",
      "primary-cta",
      "internal-links",
      "horizontal-overflow",
      "heading-overflow",
      "image-health",
      "media-policy",
      "computed-contrast",
      "focus-visible",
      "touch-target",
    ] as const;
    value.routes = (["mobile", "desktop"] as const).map((viewport) => ({
      route: "/",
      viewport,
      assertions: assertions.map((name) => ({ name, status: "pass" as const })),
    }));
    value.evidenceIds = ["mobile-report", "desktop-report"];
    expect(classifyBrowserReport(value)).toBe("pass");
  });

  it("fails a pass label with missing route, viewport, assertion, or evidence", () => {
    expect(classifyBrowserReport(report("pass"))).toBe("fail");
  });

  it("keeps a fail as a fail", () => {
    expect(classifyBrowserReport(report("fail"))).toBe("fail");
  });

  it("fails when any route assertion fails", () => {
    const value = report("pass");
    value.routes = [
      {
        route: "/",
        viewport: "mobile",
        assertions: [
          { name: "horizontal-overflow", status: "fail", detail: "20px" },
        ],
      },
    ];
    expect(classifyBrowserReport(value)).toBe("fail");
  });

  it("exposes bounded browser execution constants", () => {
    expect(BROWSER_ROUTE_MAX).toBe(6);
    expect(BROWSER_NAVIGATION_TIMEOUT_MS).toBe(10_000);
    expect(BROWSER_INFRA_RETRIES).toBe(1);
  });
});
