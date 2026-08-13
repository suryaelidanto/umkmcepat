import { describe, expect, it, vi } from "vitest";

import { GeneratedSiteCallBudget } from "./generated-site-call-budget";
import {
  qualifyGeneratedSite,
  qualifyReferenceCalibratedSite,
} from "./generated-site-qualification";

import type { BrowserGateReport } from "./browser-gates";
import type { GeneratedSiteRiskReportV1 } from "./generated-site-risk";
import type { GeneratedProjectFile } from "./generated-types";
import type { VisualCriticReport } from "./visual-critic";

const files: GeneratedProjectFile[] = [
  { path: "src/routes/index.tsx", content: "export const page = true" },
];
const assertionNames = [
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
const browser: BrowserGateReport = {
  version: 1,
  status: "pass",
  routes: (["mobile", "desktop"] as const).map((viewport) => ({
    route: "/",
    viewport,
    assertions: assertionNames.map((name) => ({ name, status: "pass" })),
  })),
  evidenceIds: ["mobile", "desktop"],
  overheadMs: 1,
};
const clean: GeneratedSiteRiskReportV1 = {
  version: 1,
  risky: false,
  reasons: [],
};
const risky: GeneratedSiteRiskReportV1 = {
  version: 1,
  risky: true,
  reasons: [
    {
      category: "genericness",
      route: "/",
      viewport: "desktop",
      evidence: "narrow",
    },
  ],
};
const criticPass: VisualCriticReport = {
  status: "complete",
  mode: "shadow",
  modelId: "critic",
  findings: [],
};
const criticFail: VisualCriticReport = {
  status: "complete",
  mode: "shadow",
  modelId: "critic",
  findings: [
    {
      category: "genericness",
      severity: "high",
      route: "/",
      viewport: "desktop",
      evidence: "starter-like",
      proposedCorrection: "vary composition",
      confidence: 0.9,
    },
  ],
};

describe("qualifyReferenceCalibratedSite", () => {
  it("requires one review and does not repair a clean candidate", async () => {
    const review = vi.fn(async () => ({
      status: "complete" as const,
      findings: [],
      modelId: "critic",
    }));
    const result = await qualifyReferenceCalibratedSite(files, {
      runBrowser: async () => browser,
      loadScreenshots: async () => [new Uint8Array([1])],
      review,
      repair: vi.fn(),
      budget: new GeneratedSiteCallBudget(),
    });
    expect(result.ok).toBe(true);
    expect(review).toHaveBeenCalledTimes(1);
  });

  it("fails human-only visual findings without auto-repair", async () => {
    const result = await qualifyReferenceCalibratedSite(files, {
      runBrowser: async () => browser,
      loadScreenshots: async () => [new Uint8Array([1])],
      review: async () => ({
        status: "complete",
        modelId: "critic",
        findings: [
          {
            category: "genericness",
            severity: "high",
            route: "/",
            viewport: "desktop",
            evidence: "generic",
            kitReference: "reference",
            proposedCorrection: "change",
            verificationMode: "human_only",
            verificationAssertions: [],
            confidence: 0.9,
          },
        ],
      }),
      repair: vi.fn(),
      budget: new GeneratedSiteCallBudget(),
    });
    expect(result).toMatchObject({ ok: false, visualRepairCount: 0 });
  });

  it("uses one machine-verifiable correction and does not call review again", async () => {
    const runBrowser = vi.fn(async () => browser);
    const review = vi.fn(async () => ({
      status: "complete" as const,
      modelId: "critic",
      findings: [
        {
          category: "color_contrast" as const,
          severity: "high" as const,
          route: "/",
          viewport: "desktop" as const,
          evidence: "contrast",
          kitReference: "kit",
          proposedCorrection: "fix",
          verificationMode: "browser_assertion" as const,
          verificationAssertions: ["computed-contrast"],
          confidence: 0.9,
        },
      ],
    }));
    const result = await qualifyReferenceCalibratedSite(files, {
      runBrowser,
      loadScreenshots: async () => [new Uint8Array([1])],
      review,
      repair: vi.fn(async () => files),
      budget: new GeneratedSiteCallBudget(),
    });
    expect(result.ok).toBe(true);
    expect(result.visualRepairCount).toBe(1);
    expect(review).toHaveBeenCalledTimes(1);
    expect(runBrowser).toHaveBeenCalledTimes(2);
  });
});

describe("qualifyGeneratedSite", () => {
  it("keeps the clean path to browser gates only", async () => {
    const critic = vi.fn();
    const repair = vi.fn();
    const result = await qualifyGeneratedSite(files, {
      runBrowser: async () => browser,
      classifyRisk: () => clean,
      runCritic: critic,
      repair,
    });
    expect(result.ok).toBe(true);
    expect(critic).not.toHaveBeenCalled();
    expect(repair).not.toHaveBeenCalled();
  });

  it("accepts a risky candidate when the critic has no findings", async () => {
    const result = await qualifyGeneratedSite(files, {
      runBrowser: async () => browser,
      classifyRisk: () => risky,
      runCritic: async () => criticPass,
      repair: vi.fn(),
    });
    expect(result.ok).toBe(true);
    expect(result.visualRepairCount).toBe(0);
  });

  it("repairs once and reruns browser, risk, and critic", async () => {
    const runBrowser = vi.fn(async () => browser);
    const classifyRisk = vi
      .fn<() => GeneratedSiteRiskReportV1>()
      .mockReturnValueOnce(risky)
      .mockReturnValueOnce(clean);
    const runCritic = vi.fn(async () => criticFail);
    const repair = vi.fn(async () => [
      { path: "src/routes/index.tsx", content: "export const fixed = true" },
    ]);
    const result = await qualifyGeneratedSite(files, {
      runBrowser,
      classifyRisk,
      runCritic,
      repair,
    });
    expect(result.ok).toBe(true);
    expect(result.visualRepairCount).toBe(1);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(runBrowser).toHaveBeenCalledTimes(2);
  });

  it("fails honestly when evidence is unavailable", async () => {
    const result = await qualifyGeneratedSite(files, {
      runBrowser: async () => browser,
      classifyRisk: () => risky,
      runCritic: async () => ({
        status: "unavailable",
        mode: "shadow",
        findings: [],
      }),
      repair: vi.fn(),
    });
    expect(result).toMatchObject({ ok: false, visualRepairCount: 0 });
  });

  it("accepts a clean build when the critic cannot run (vision infra unavailable)", async () => {
    // The vision model returned 0 tokens — no quality verdict, but the
    // deterministic browser gate passed. Fail-closing every risky build when
    // vision is broken blocks the whole pipeline; accept and flag for offline
    // corpus review instead.
    const result = await qualifyGeneratedSite(files, {
      runBrowser: async () => browser,
      classifyRisk: () => risky,
      runCritic: async () => ({
        status: "unknown",
        mode: "shadow",
        findings: [],
      }),
      repair: vi.fn(),
    });
    expect(result).toMatchObject({ ok: true, visualRepairCount: 0 });
  });
});
