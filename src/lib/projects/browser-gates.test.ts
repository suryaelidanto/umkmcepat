import { describe, expect, it } from "vitest";

import {
  BROWSER_INFRA_RETRIES,
  BROWSER_NAVIGATION_TIMEOUT_MS,
  BROWSER_ROUTE_MAX,
  classifyBrowserReport,
  classifyProfessionalBrowserReport,
  type BrowserGateReport,
  type BrowserGateReportV2,
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

const professionalAssertionNames = [
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
  "first-view-contract",
  "section-coverage",
  "section-order",
  "typography-bounds",
  "content-hidden-by-navigation",
  "empty-media-frame",
  "signature-presence",
] as const;

function professionalReport(routes = ["/"]): BrowserGateReportV2 {
  return {
    version: 2,
    status: "pass",
    routes: routes.flatMap((route) =>
      (["mobile", "desktop"] as const).map((viewport) => ({
        route,
        viewport,
        assertions: professionalAssertionNames.map((name) => ({
          name,
          status: "pass" as const,
        })),
        professionalSignals: [],
      })),
    ),
    evidenceIds: routes.flatMap((route) => [
      `${route}-mobile`,
      `${route}-desktop`,
    ]),
    overheadMs: 1,
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

  it("fails a rendered contrast assertion even when the report says pass", () => {
    const value = report("pass");
    value.routes = [
      ...(["mobile", "desktop"] as const).map((viewport) => ({
        route: "/",
        viewport,
        assertions: [
          {
            name: "computed-contrast" as const,
            status: "fail" as const,
            detail: "p: text 1.2<4.5",
          },
        ],
      })),
    ];
    value.evidenceIds = ["mobile-report", "desktop-report"];
    expect(classifyBrowserReport(value)).toBe("fail");
  });

  it("exposes bounded browser execution constants", () => {
    expect(BROWSER_ROUTE_MAX).toBe(6);
    expect(BROWSER_NAVIGATION_TIMEOUT_MS).toBe(10_000);
    expect(BROWSER_INFRA_RETRIES).toBe(1);
  });
});

describe("classifyProfessionalBrowserReport", () => {
  it("requires both viewports, all V1/V2 assertions, and evidence for every route", () => {
    expect(
      classifyProfessionalBrowserReport(professionalReport(["/", "/kelas"]), [
        "/",
        "/kelas",
      ]),
    ).toBe("pass");
    const missingViewport = professionalReport();
    missingViewport.routes = missingViewport.routes.filter(
      (route) => route.viewport === "mobile",
    );
    expect(classifyProfessionalBrowserReport(missingViewport, ["/"])).toBe(
      "fail",
    );
  });

  it.each([
    [
      "missing assertion",
      (report: BrowserGateReportV2) => {
        report.routes[0]!.assertions.pop();
      },
    ],
    [
      "unknown assertion",
      (report: BrowserGateReportV2) => {
        report.routes[0]!.assertions[0]!.name = "unknown" as never;
      },
    ],
    [
      "duplicate route viewport",
      (report: BrowserGateReportV2) => {
        report.routes[1]!.viewport = "mobile";
      },
    ],
    [
      "malformed signal",
      (report: BrowserGateReportV2) => {
        report.routes[0]!.professionalSignals.push({
          code: "bad",
          route: "/kelas",
          viewport: "mobile",
          detail: "bad",
        });
      },
    ],
  ])("fails %s evidence", (_name, mutate) => {
    const value = professionalReport();
    mutate(value);
    expect(classifyProfessionalBrowserReport(value, ["/"])).toBe("fail");
  });

  it("fails extra routes and non-pass statuses even when the outer report says pass", () => {
    const value = professionalReport();
    value.routes.push({ ...value.routes[0]!, route: "/extra" });
    expect(classifyProfessionalBrowserReport(value, ["/"])).toBe("fail");
    const failed = professionalReport();
    failed.routes[0]!.assertions[0]!.status = "fail";
    expect(classifyProfessionalBrowserReport(failed, ["/"])).toBe("fail");
  });
});
