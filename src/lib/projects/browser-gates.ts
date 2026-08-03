// src/lib/projects/browser-gates.ts
// Browser qualification report for contract-v1 candidates. A bare artifact
// server is never sufficient evidence: gates run against the same preview
// routing base, CSP, asset path, and hash history the user receives. Browser
// execution is bounded (routes, viewports, concurrency, timeouts, one infra
// retry). Results are exactly pass | fail | infrastructure_error; a timeout,
// launch failure, or malformed output is never treated as zero issues.

export type BrowserGateStatus = "pass" | "fail" | "infrastructure_error";

export type BrowserAssertion = {
  name: string;
  status: "pass" | "fail" | "infrastructure_error";
  detail?: string;
};

export type BrowserRouteReport = {
  route: string;
  viewport: "mobile" | "desktop";
  assertions: BrowserAssertion[];
};

export type BrowserGateReport = {
  version: 1;
  status: BrowserGateStatus;
  routes: BrowserRouteReport[];
  evidenceIds: string[];
  overheadMs: number;
};

/** Infrastructure or missing evidence never passes the gate. */
export function classifyBrowserReport(
  report: BrowserGateReport,
): "pass" | "fail" {
  if (report.status === "pass") {
    return "pass";
  }
  return "fail";
}

export const BROWSER_ROUTE_MAX = 6;
export const BROWSER_NAVIGATION_TIMEOUT_MS = 10_000;
export const BROWSER_INFRA_RETRIES = 1;
