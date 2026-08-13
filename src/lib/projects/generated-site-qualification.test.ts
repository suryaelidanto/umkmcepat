import { describe, expect, it, vi } from "vitest";

import { qualifyGeneratedSite } from "./generated-site-qualification";

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
