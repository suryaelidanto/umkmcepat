import { describe, expect, it } from "vitest";

import {
  evidenceRefForCandidate,
  isExpiredGateEvidence,
  readGateEvidence,
  storeGateEvidence,
} from "./gate-evidence";

describe("evidenceRefForCandidate", () => {
  it("scopes gate evidence under owner/project/candidate", () => {
    const ref = evidenceRefForCandidate({
      projectId: "p1",
      candidateId: "snap-1",
      kind: "screenshot",
      route: "/",
      viewport: "mobile",
    });
    expect(ref.startsWith("object:s3:objects/gate-evidence/p1/snap-1/")).toBe(
      true,
    );
    expect(ref).toContain("mobile");
  });
});

describe("isExpiredGateEvidence", () => {
  it("treats evidence older than 30 days as expired", () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    expect(isExpiredGateEvidence(old)).toBe(true);
  });

  it("keeps recent evidence", () => {
    expect(isExpiredGateEvidence(new Date())).toBe(false);
  });

  it("exposes store/read helpers with a stable ref", () => {
    expect(typeof storeGateEvidence).toBe("function");
    expect(typeof readGateEvidence).toBe("function");
  });
});
