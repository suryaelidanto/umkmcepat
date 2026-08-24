import { describe, expect, it } from "vitest";

import { hashBuildContract, hashBuildPlan } from "./build-hash";
import { createInitialCanonicalBrief } from "./canonical-brief";
import {
  OutcomeContractCompileError,
  compileOutcomeDirectedSiteContract,
} from "./outcome-site-contract";

import type { BuildContractV1 } from "./build-contract";
import type { BuildPlanV1 } from "./build-plan";
import type { GeneratedSiteHandoffInput } from "./generated-site-contract";

function handoff(): GeneratedSiteHandoffInput {
  const briefSnapshot = createInitialCanonicalBrief("Laundry antar jemput");
  briefSnapshot.business = {
    category: "jasa_lokal",
    name: "Kilau Laundry",
    type: "jasa_lokal",
  };
  briefSnapshot.audience = "Warga sekitar";
  briefSnapshot.offers = [
    {
      description: "Cuci dan setrika pakaian",
      isPrimary: true,
      name: "Laundry reguler",
    },
  ];
  briefSnapshot.visitorJobs = [
    {
      goal: "Pesan antar jemput",
      id: "job-order",
      priority: "primary",
    },
  ];
  briefSnapshot.primaryAction = {
    kind: "whatsapp",
    label: "Pesan lewat WhatsApp",
    target: "+628123456789",
  };

  const contract: BuildContractV1 = {
    assets: [],
    blockers: [],
    contentHash: "",
    ctaIntents: [
      {
        id: "cta-primary",
        kind: "whatsapp",
        label: "Pesan lewat WhatsApp",
        targetFactId: "contact-primary",
      },
    ],
    decisions: [],
    facts: [
      {
        id: "offer-primary",
        kind: "offer",
        provenance: {
          assetId: null,
          reviewItemId: null,
          source: "owner",
          supersedesFactId: null,
          turnId: "turn-1",
        },
        value: briefSnapshot.offers,
      },
      {
        id: "contact-primary",
        kind: "contact",
        provenance: {
          assetId: null,
          reviewItemId: null,
          source: "owner",
          supersedesFactId: null,
          turnId: "turn-1",
        },
        value: { channel: "whatsapp", value: "+628123456789" },
      },
    ],
    hardRequirements: [],
    identity: {
      businessName: "Kilau Laundry",
      businessType: "jasa_lokal",
    },
    omissions: [{ decisionId: "hours", reason: "unknown" }],
    preferences: {
      density: null,
      motion: null,
      tone: null,
      visualDirection: "Segar dan bersih",
    },
    prohibitedClaims: [
      { id: "no-guarantee", statement: "Jangan mengarang jaminan" },
    ],
    revision: 1,
    schemaVersion: 1,
    visitorJobs: briefSnapshot.visitorJobs,
  };
  contract.contentHash = hashBuildContract(contract);

  const plan: BuildPlanV1 = {
    appKind: "landing",
    archetype: "service-area",
    artDirection: {
      antiReferences: [],
      businessSpecificReference: "Laundry harian",
      fontStrategy: "system_stack",
      imageStrategy: "typographic",
    },
    capabilities: ["whatsapp_cta"],
    contentHash: "",
    contractHash: contract.contentHash,
    navigation: [],
    pages: [
      {
        id: "home",
        path: "/",
        purpose: "Pesan layanan laundry",
        requiredFactIds: ["offer-primary", "contact-primary"],
        sections: [
          {
            id: "offer",
            purpose: "Pilihan layanan",
            requiredAssetIds: [],
            requiredFactIds: ["offer-primary"],
            surfaceIntent: "contained",
          },
        ],
        title: "Kilau Laundry",
        visitorJobIds: ["job-order"],
      },
    ],
    revision: 1,
    schemaVersion: 1,
  };
  plan.contentHash = hashBuildPlan(plan);

  return {
    briefHash: "brief-hash",
    briefRevision: 2,
    briefSnapshot,
    contract,
    contractHash: contract.contentHash,
    contractRevision: 1,
    id: "handoff-1",
    plan,
    planHash: plan.contentHash,
    planRevision: 1,
  };
}

function expectMissing(
  field: OutcomeContractCompileError["field"],
  mutate: (value: GeneratedSiteHandoffInput) => void,
) {
  const value = handoff();
  mutate(value);
  try {
    compileOutcomeDirectedSiteContract(value);
    throw new Error("expected contract compilation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(OutcomeContractCompileError);
    expect((error as OutcomeContractCompileError).field).toBe(field);
  }
}

describe("compileOutcomeDirectedSiteContract", () => {
  it("projects accepted facts without customer-facing fallback copy", () => {
    const result = compileOutcomeDirectedSiteContract(handoff());

    expect(result.business).toEqual({
      audience: "Warga sekitar",
      name: "Kilau Laundry",
      type: "jasa_lokal",
    });
    expect(result.actions[0]).toMatchObject({
      href: "https://wa.me/628123456789",
      label: "Pesan lewat WhatsApp",
    });
    expect(result.acceptedContent.hours).toEqual([]);
    expect(result.omissions).toContain("hours");

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(
      /Profesional & Terpercaya|Berkualitas untuk Kebutuhan Anda|Garansi kualitas|Proses mudah dan transparan|Website usaha|Pelanggan baru|#kontak/,
    );
  });

  it("blocks missing identity before generation", () => {
    expectMissing("identity", (value) => {
      value.contract.identity.businessName = "";
    });
  });

  it("blocks missing offers before generation", () => {
    expectMissing("offer", (value) => {
      value.contract.facts = value.contract.facts.filter(
        (fact) => fact.kind !== "offer",
      );
    });
  });

  it("blocks a missing primary visitor job", () => {
    expectMissing("visitor_job", (value) => {
      value.contract.visitorJobs = [];
    });
  });

  it("blocks a secondary route with no accepted facts", () => {
    expectMissing("route", (value) => {
      value.plan.pages.push({
        id: "location",
        path: "/lokasi",
        purpose: "Find the outlet",
        requiredFactIds: [],
        sections: [],
        title: "Lokasi",
        visitorJobIds: ["job-order"],
      });
    });
  });

  it("blocks an unresolved primary action instead of guessing a target", () => {
    expectMissing("action", (value) => {
      value.contract.facts = value.contract.facts.filter(
        (fact) => fact.kind !== "contact",
      );
    });
  });
});
