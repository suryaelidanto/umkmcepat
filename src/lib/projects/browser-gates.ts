// src/lib/projects/browser-gates.ts
// Browser qualification report for contract-v1 candidates. A bare artifact
// server is never sufficient evidence: gates run against the same preview
// routing base, CSP, asset path, and hash history the user receives. Browser
// execution is bounded (routes, viewports, concurrency, timeouts, one infra
// retry). Results are exactly pass | fail | infrastructure_error; a timeout,
// launch failure, or malformed output is never treated as zero issues.

export type BrowserGateStatus = "pass" | "fail" | "infrastructure_error";

export type BrowserAssertionName =
  | "route-load"
  | "console-clean"
  | "required-content-visible"
  | "primary-cta"
  | "internal-links"
  | "horizontal-overflow"
  | "heading-overflow"
  | "image-health"
  | "media-policy"
  | "computed-contrast"
  | "focus-visible"
  | "touch-target";

export type BrowserAssertion = {
  name: BrowserAssertionName;
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

const REQUIRED_BROWSER_ASSERTIONS = new Set<BrowserAssertionName>([
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
]);

/** Infrastructure or missing evidence never passes the gate. */
export function classifyBrowserReport(
  report: BrowserGateReport,
): "pass" | "fail" {
  if (report.status !== "pass" || report.routes.length < 2) {
    return "fail";
  }
  const routePaths = new Set(report.routes.map((route) => route.route));
  for (const routePath of routePaths) {
    const reports = report.routes.filter((route) => route.route === routePath);
    if (
      !reports.some((route) => route.viewport === "mobile") ||
      !reports.some((route) => route.viewport === "desktop")
    ) {
      return "fail";
    }
  }
  if (report.evidenceIds.length < report.routes.length) {
    return "fail";
  }
  for (const route of report.routes) {
    const assertions = new Map(
      route.assertions.map((assertion) => [assertion.name, assertion.status]),
    );
    for (const name of REQUIRED_BROWSER_ASSERTIONS) {
      if (assertions.get(name) !== "pass") {
        return "fail";
      }
    }
  }
  return "pass";
}

export const BROWSER_ROUTE_MAX = 6;
export const BROWSER_NAVIGATION_TIMEOUT_MS = 10_000;
export const BROWSER_INFRA_RETRIES = 1;
