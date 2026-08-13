import { describe, expect, it } from "vitest";

import { hashBuildContract, hashBuildPlan } from "./build-hash";
import { parseCanonicalBrief } from "./canonical-brief";
import { compileGeneratedSiteContract } from "./generated-site-contract";
import { selectGeneratedSiteRecipe } from "./generated-site-recipes";

import type { BuildContractV1 } from "./build-contract";
import type { BuildPlanV1 } from "./build-plan";

function handoff() {
  const briefSnapshot = parseCanonicalBrief({
    businessName: "SuryaPhone",
    productOrService: [{ name: "iPhone 13", isPrimary: true }],
    targetCustomer: "Pembeli",
    contactOrCta: "Chat WA",
    stylePreference: "rapi",
    tagline: "Cek unit dengan jelas",
    usp: ["Garansi 7 hari"],
  });
  const contract: BuildContractV1 = {
    schemaVersion: 1,
    revision: 1,
    contentHash: "",
    identity: { businessName: "SuryaPhone", businessType: "retail" },
    facts: [
      {
        id: "offer-1",
        kind: "offer",
        value: [{ name: "iPhone 13", isPrimary: true }],
        provenance: {
          source: "owner",
          turnId: "t1",
          assetId: null,
          supersedesFactId: null,
          reviewItemId: null,
        },
      },
      {
        id: "contact-1",
        kind: "contact",
        value: { channel: "whatsapp", value: "081" },
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
    visitorJobs: [{ id: "job", goal: "Beli", priority: "primary" }],
    ctaIntents: [
      {
        id: "cta",
        kind: "whatsapp",
        label: "Chat WA",
        targetFactId: "contact-1",
      },
    ],
    hardRequirements: [],
    prohibitedClaims: [],
    preferences: {
      visualDirection: "rapi",
      tone: null,
      density: null,
      motion: null,
    },
    assets: [],
    blockers: [],
    omissions: [],
  };
  contract.contentHash = hashBuildContract(contract);
  const plan: BuildPlanV1 = {
    schemaVersion: 1,
    revision: 1,
    contractHash: contract.contentHash,
    contentHash: "",
    appKind: "landing",
    archetype: "retail-catalog",
    pages: [
      {
        id: "home",
        path: "/",
        title: "SuryaPhone",
        purpose: "jual",
        visitorJobIds: ["job"],
        requiredFactIds: ["offer-1"],
        sections: [
          {
            id: "hero",
            purpose: "Intro",
            surfaceIntent: "full_bleed",
            requiredFactIds: [],
            requiredAssetIds: [],
          },
        ],
      },
    ],
    navigation: [],
    capabilities: ["catalog"],
    artDirection: {
      businessSpecificReference: "retail",
      antiReferences: [],
      imageStrategy: "typographic",
      fontStrategy: "system_stack",
    },
  };
  plan.contentHash = hashBuildPlan(plan);
  return { briefSnapshot, contract, plan };
}

describe("accepted snapshot is the only generation fact source", () => {
  it("a mutated live brief does not change the accepted contract compilation", () => {
    const { briefSnapshot, contract, plan } = handoff();
    const mutated = JSON.parse(JSON.stringify(briefSnapshot));
    mutated.business.name = "HackerPhone";
    mutated.content.tagline = "Hacked!";
    mutated.offers[0].name = "Hacker Offer";

    const recipe = selectGeneratedSiteRecipe(plan.archetype);
    const fromAccepted = compileGeneratedSiteContract({
      contract,
      plan,
      briefSnapshot,
      photoEnabled: false,
      recipe,
    });
    const fromMutated = compileGeneratedSiteContract({
      contract,
      plan,
      briefSnapshot: mutated,
      photoEnabled: false,
      recipe,
    });

    expect(fromAccepted.content.headline).not.toBe(
      fromMutated.content.headline,
    );
    expect(fromAccepted.content.headline).toBe("Cek unit dengan jelas");
    expect(fromMutated.content.headline).toBe("Hacked!");
    expect(fromAccepted.business.name).toBe("SuryaPhone");
  });
});
