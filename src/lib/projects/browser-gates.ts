// src/lib/projects/browser-gates.ts

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

export type ProfessionalBrowserAssertionName =
  | BrowserAssertionName
  | "first-view-contract"
  | "section-coverage"
  | "section-order"
  | "typography-bounds"
  | "content-hidden-by-navigation"
  | "empty-media-frame"
  | "signature-presence";

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

export type ProfessionalBrowserSignal = {
  code: string;
  route: string;
  viewport: "mobile" | "desktop";
  detail: string;
};

export type BrowserGateReportV2 = {
  version: 2;
  status: BrowserGateStatus;
  routes: Array<{
    route: string;
    viewport: "mobile" | "desktop";
    assertions: Array<{
      name: ProfessionalBrowserAssertionName;
      status: "pass" | "fail" | "infrastructure_error";
      detail?: string;
    }>;
    professionalSignals: ProfessionalBrowserSignal[];
  }>;
  evidenceIds: string[];
  overheadMs: number;
};

export type ProfessionalBrowserPolicy = {
  routes: Array<{
    path: string;
    sections: Array<{
      id: string;
      requiredVisibleTexts: string[];
    }>;
    firstView: {
      identityText: string;
      offerTexts: string[];
      primaryCtaLabel: string;
      primaryCtaHref: string;
    };
  }>;
  signatureRoute: string;
  typography: {
    maxDisplayPx: 96;
    minDisplayLetterSpacingEm: -0.04;
    minBodyPx: 15;
    minBodyLineHeight: 1.4;
    maxBodyCh: 78;
  };
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

export const REQUIRED_PROFESSIONAL_BROWSER_ASSERTIONS = [
  ...REQUIRED_BROWSER_ASSERTIONS,
  "first-view-contract",
  "section-coverage",
  "section-order",
  "typography-bounds",
  "content-hidden-by-navigation",
  "empty-media-frame",
  "signature-presence",
] as const satisfies readonly ProfessionalBrowserAssertionName[];

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

export function classifyProfessionalBrowserReport(
  report: BrowserGateReportV2,
  expectedRoutes: string[],
): "pass" | "fail" {
  if (
    report.version !== 2 ||
    report.status !== "pass" ||
    !Array.isArray(report.routes) ||
    !Array.isArray(report.evidenceIds) ||
    expectedRoutes.length === 0 ||
    new Set(expectedRoutes).size !== expectedRoutes.length ||
    report.routes.length !== expectedRoutes.length * 2 ||
    report.evidenceIds.length < report.routes.length
  ) {
    return "fail";
  }
  const expected = new Set(expectedRoutes);
  const seen = new Set<string>();
  for (const route of report.routes) {
    if (
      !expected.has(route.route) ||
      (route.viewport !== "mobile" && route.viewport !== "desktop") ||
      !Array.isArray(route.assertions) ||
      !Array.isArray(route.professionalSignals) ||
      route.professionalSignals.length > 20
    ) {
      return "fail";
    }
    const routeKey = `${route.route}:${route.viewport}`;
    if (seen.has(routeKey)) {
      return "fail";
    }
    seen.add(routeKey);
    const assertionNames = new Set<string>();
    for (const assertion of route.assertions) {
      if (
        !REQUIRED_PROFESSIONAL_BROWSER_ASSERTIONS.includes(
          assertion.name as (typeof REQUIRED_PROFESSIONAL_BROWSER_ASSERTIONS)[number],
        ) ||
        assertionNames.has(assertion.name) ||
        assertion.status !== "pass" ||
        (assertion.detail !== undefined && typeof assertion.detail !== "string")
      ) {
        return "fail";
      }
      assertionNames.add(assertion.name);
    }
    if (
      assertionNames.size !== REQUIRED_PROFESSIONAL_BROWSER_ASSERTIONS.length ||
      REQUIRED_PROFESSIONAL_BROWSER_ASSERTIONS.some(
        (name) => !assertionNames.has(name),
      )
    ) {
      return "fail";
    }
    for (const signal of route.professionalSignals) {
      if (
        !signal ||
        typeof signal.code !== "string" ||
        signal.code.trim().length === 0 ||
        signal.route !== route.route ||
        signal.viewport !== route.viewport ||
        typeof signal.detail !== "string" ||
        signal.detail.trim().length === 0
      ) {
        return "fail";
      }
    }
  }
  return expectedRoutes.every(
    (route) => seen.has(`${route}:mobile`) && seen.has(`${route}:desktop`),
  )
    ? "pass"
    : "fail";
}

export const BROWSER_ROUTE_MAX = 6;
export const BROWSER_NAVIGATION_TIMEOUT_MS = 10_000;
export const BROWSER_INFRA_RETRIES = 1;
