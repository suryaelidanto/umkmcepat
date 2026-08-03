import { describe, expect, it } from "vitest";

import { sanitizeGenerationEvent } from "./generation-observability";

describe("sanitizeGenerationEvent", () => {
  it("never records full contract text, prompts, or private URLs", () => {
    const raw = {
      projectId: "p1",
      prompt: "jualan sate dengan harga Rp 25000 dan telp 08123456789",
      contract: { identity: { businessName: "Sate Mas" }, facts: [] },
      screenshotUrl: "https://private.example/gate-evidence/secret.png",
    };
    const sanitized = sanitizeGenerationEvent(raw);
    const text = JSON.stringify(sanitized);
    expect(text).not.toMatch(/25000|08123456789|Sate Mas|private\.example/);
    expect(sanitized.projectId).toBe("p1");
  });

  it("keeps ids, counts, categories, booleans, timings, and failure classes", () => {
    const sanitized = sanitizeGenerationEvent({
      projectId: "p1",
      candidateId: "snap-1",
      gateCount: 3,
      hardGatePassed: true,
      failureClass: "infrastructure_error",
      overheadMs: 1200,
    });
    expect(sanitized).toMatchObject({
      candidateId: "snap-1",
      gateCount: 3,
      hardGatePassed: true,
      failureClass: "infrastructure_error",
      overheadMs: 1200,
    });
  });
});
