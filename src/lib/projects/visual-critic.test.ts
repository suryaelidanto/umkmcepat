import { describe, expect, it } from "vitest";

import { runShadowCritic } from "./visual-critic";

describe("runShadowCritic", () => {
  it("never blocks or repairs a hard-gate-passing candidate", async () => {
    const result = await runShadowCritic({
      contract: {
        schemaVersion: 1,
        revision: 1,
        contentHash: "c",
        identity: { businessName: "Sate", businessType: "fnb" },
        facts: [],
        decisions: [],
        visitorJobs: [],
        ctaIntents: [],
        hardRequirements: [],
        prohibitedClaims: [],
        preferences: {
          visualDirection: null,
          tone: null,
          density: null,
          motion: null,
        },
        assets: [],
        blockers: [],
        omissions: [],
      },
      plan: {} as never,
      hardGateStatus: "pass",
      screenshots: [{ route: "/", viewport: "desktop" }],
    });
    expect(result.status).toBe("complete");
    expect(result.mode).toBe("shadow");
    expect(Array.isArray(result.findings)).toBe(true);
  });

  it("returns unknown when evidence is insufficient", async () => {
    const result = await runShadowCritic({
      contract: null as never,
      plan: null as never,
      hardGateStatus: "pass",
    });
    expect(result.status).toBe("unknown");
    expect(result.findings).toEqual([]);
  });
});
