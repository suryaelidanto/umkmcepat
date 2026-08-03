import { describe, expect, it } from "vitest";

import {
  BUILD_DECISIONS,
  findDecision,
  selectNextBuildDecision,
} from "./build-decisions";
import {
  evaluateContractReadiness,
  type ContractReadiness,
} from "./contract-readiness";

import type { BuildContractV1 } from "./build-contract";

function baseContract(): BuildContractV1 {
  return {
    schemaVersion: 1,
    revision: 1,
    contentHash: "c",
    identity: { businessName: "Sate Mas", businessType: "fnb" },
    facts: [
      {
        id: "offer-main",
        kind: "offer",
        value: [{ name: "Sate Ayam", isPrimary: true }],
        provenance: {
          source: "owner",
          turnId: "t1",
          assetId: null,
          supersedesFactId: null,
          reviewItemId: null,
        },
      },
      {
        id: "address-main",
        kind: "address",
        value: { line1: "Jl. Merdeka 1", city: "Jakarta" },
        provenance: {
          source: "owner",
          turnId: "t1",
          assetId: null,
          supersedesFactId: null,
          reviewItemId: null,
        },
      },
    ],
    decisions: [],
    visitorJobs: [{ id: "order", goal: "Pesan sate", priority: "primary" }],
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
  };
}

describe("BUILD_DECISIONS registry", () => {
  it("has unique decision ids", () => {
    const ids = BUILD_DECISIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every blocking decision declares a skip policy", () => {
    for (const d of BUILD_DECISIONS) {
      expect(d.skipPolicy).toMatch(
        /forbidden|safe_omission|not_applicable_only/,
      );
    }
  });

  it("selects the highest-value unanswered applicable decision", () => {
    const next = selectNextBuildDecision({
      applicable: ["business_identity", "primary_cta", "location_operations"],
      answered: ["business_identity"],
    });
    expect(next).toMatch(/^[a-z_]+$/);
  });

  it("resolves every registry entry through findDecision", () => {
    for (const d of BUILD_DECISIONS) {
      expect(findDecision(d.id)?.id).toBe(d.id);
    }
  });
});

describe("evaluateContractReadiness", () => {
  it("requires a concrete CTA destination when the CTA kind needs one", () => {
    const contract = baseContract();
    contract.ctaIntents = [
      {
        id: "cta-wa",
        kind: "whatsapp",
        label: "Chat",
        targetFactId: "contact-primary",
      },
    ];
    const result: ContractReadiness = evaluateContractReadiness(contract);
    expect(result.state).toBe("needs_decision");
  });

  it("allows a registry-approved safe omission without inflating confidence", () => {
    const contract = baseContract();
    contract.ctaIntents = [
      { id: "cta-browse", kind: "browse", label: "Lihat" },
    ];
    contract.decisions = [
      {
        decisionId: "business_identity",
        state: "answered",
        sourceTurnId: "t1",
      },
      { decisionId: "primary_offer", state: "answered", sourceTurnId: "t1" },
      {
        decisionId: "primary_visitor_job",
        state: "answered",
        sourceTurnId: "t1",
      },
      { decisionId: "primary_cta", state: "answered", sourceTurnId: "t1" },
      { decisionId: "cta_destination", state: "answered", sourceTurnId: "t1" },
      {
        decisionId: "location_operations",
        state: "skipped_safe",
        sourceTurnId: "t1",
      },
    ];
    contract.omissions = [
      { decisionId: "location_operations", reason: "skipped" },
    ];
    const result: ContractReadiness = evaluateContractReadiness(contract);
    expect(result.state).toBe("ready_for_plan");
    if (result.state === "ready_for_plan") {
      expect(result.omissions).toContainEqual(
        expect.objectContaining({ decisionId: "location_operations" }),
      );
    }
  });

  it("does not fabricate readiness for an unknown blocked decision", () => {
    const contract = baseContract();
    contract.ctaIntents = [
      { id: "cta-browse", kind: "browse", label: "Lihat" },
    ];
    const result = evaluateContractReadiness(contract);
    expect(result.state).toBe("needs_decision");
    expect(result.blockers.length).toBeGreaterThan(0);
  });
});
