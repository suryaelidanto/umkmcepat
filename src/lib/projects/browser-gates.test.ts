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

  it("keeps a hard-gate pass as a pass", () => {
    expect(classifyBrowserReport(report("pass"))).toBe("pass");
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
