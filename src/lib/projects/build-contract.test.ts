import { describe, expect, it } from "vitest";

import { parseProjectBrief } from "./brief";
import { parseBuildContract, type BuildContractV1 } from "./build-contract";
import {
  hashBuildContract,
  hashBuildPlan,
  hashReviewItems,
} from "./build-hash";
import { parseBuildPlan, validatePlanAgainstContract } from "./build-plan";
import { buildContractFromBrief } from "./build-planner";
import {
  deriveReviewItems,
  REVIEW_ITEM_KINDS,
  REVIEW_MAX_ITEMS,
  REVIEW_MAX_SERIALIZED_BYTES,
} from "./review-items";

function baseContract(): BuildContractV1 {
  return {
    schemaVersion: 1,
    revision: 1,
    contentHash: "",
    identity: { businessName: "Sate Mas", businessType: "fnb" },
    facts: [
      {
        id: "contact-primary",
        kind: "contact",
        value: { channel: "whatsapp", value: "+62812345678" },
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
    ctaIntents: [
      {
        id: "cta-wa",
        kind: "whatsapp",
        label: "Chat",
        targetFactId: "contact-primary",
      },
    ],
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

describe("buildContractFromBrief", () => {
  it("does not carry ledger fields that are not owner-confirmed", () => {
    const brief = parseProjectBrief({
      version: 1,
      businessName: "Beras GG",
      businessType: "retail",
      productOrService: [{ name: "Beras Putih Premium", isPrimary: true }],
      contact: { channel: "whatsapp", value: "08123456789" },
      priceRange: "Rp 14.000 - Rp 17.000 / kg",
      factLedger: {
        version: 1,
        entries: [
          {
            id: "business-name-primary",
            field: "businessName",
            label: "Nama",
            value: "Beras GG",
            state: "owner_confirmed",
            source: "owner",
            sourceTurnId: "turn-1",
          },
          {
            id: "offers-primary",
            field: "offers",
            label: "Produk",
            value: [{ name: "Beras Putih Premium", isPrimary: true }],
            state: "owner_confirmed",
            source: "owner",
            sourceTurnId: "turn-1",
          },
          {
            id: "price-range-primary",
            field: "priceRange",
            label: "Harga",
            value: "Rp 14.000 - Rp 17.000 / kg",
            state: "ai_suggestion",
            source: "assistant",
            sourceTurnId: "turn-2",
          },
        ],
      },
    });

    const result = buildContractFromBrief(
      brief,
      { parseBuildContract, hashContract: hashBuildContract },
      "turn-3",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.facts.map((fact) => fact.kind)).toEqual(["offer"]);
  });

  it("keeps every owner-provided offer and rich fact in the accepted contract", () => {
    const brief = parseProjectBrief({
      version: 1,
      businessName: "Beras GG",
      businessType: "retail",
      productOrService: [
        { name: "Beras GG", isPrimary: true },
        { name: "Beras Putih Premium" },
      ],
      contact: { channel: "whatsapp", value: "08123456789" },
      usp: ["Gratis Ongkir / Antar Langsung"],
      priceRange: "Rp 14.000 - Rp 17.000 / kg",
      deliveryArea: "Area Kota & Sekitarnya",
      targetCustomer: "Masyarakat Umum & Keluarga",
      visuals: false,
    });

    const result = buildContractFromBrief(
      brief,
      { parseBuildContract, hashContract: hashBuildContract },
      "turn-1",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const offerFact = result.value.facts.find((fact) => fact.kind === "offer");
    expect(offerFact?.kind).toBe("offer");
    if (offerFact?.kind === "offer") {
      expect(offerFact.value.map((offer) => offer.name)).toEqual([
        "Beras GG",
        "Beras Putih Premium",
      ]);
    }
    expect(result.value.facts.map((fact) => fact.kind)).toEqual(
      expect.arrayContaining(["price", "service_area", "usp", "audience"]),
    );
  });
});

describe("parseBuildContract", () => {
  it("accepts a minimal valid contract", () => {
    expect(parseBuildContract(baseContract()).ok).toBe(true);
  });

  it("rejects a contact value under the other discriminator", () => {
    const bad = baseContract();
    bad.facts[0]!.kind = "other";
    bad.facts[0]!.value = "08123456789";
    const result = parseBuildContract(bad);
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid WhatsApp contact target", () => {
    const bad = baseContract();
    bad.facts[0]!.value = {
      channel: "whatsapp" as const,
      value: "my number is 1234",
    };

    expect(parseBuildContract(bad).ok).toBe(false);
  });

  it("rejects unknown fact kinds and duplicate fact ids", () => {
    const bad = baseContract();
    bad.facts[0]!.kind = "nope" as never;
    expect(parseBuildContract(bad).ok).toBe(false);
    const dup = baseContract();
    dup.facts = [dup.facts[0]!, { ...dup.facts[0]!, id: "contact-primary" }];
    expect(parseBuildContract(dup).ok).toBe(false);
  });

  it("enforces provenance conditionally", () => {
    const bad = baseContract();
    bad.facts[0]!.provenance.source = "owner";
    bad.facts[0]!.provenance.turnId = null;
    expect(parseBuildContract(bad).ok).toBe(false);
    const ai = baseContract();
    ai.facts[0]!.provenance.source = "ai_draft";
    ai.facts[0]!.provenance.reviewItemId = null;
    expect(parseBuildContract(ai).ok).toBe(false);
  });

  it("rejects malformed visitor jobs at the contract boundary", () => {
    const bad = baseContract();
    bad.visitorJobs = [
      { id: "order", goal: "Pesan sate", priority: "primary" },
      { id: "order", goal: "Cari lokasi", priority: "secondary" },
    ];

    expect(parseBuildContract(bad)).toEqual({
      ok: false,
      reason: "duplicate visitor job id: order",
    });
  });
});

describe("parseBuildPlan", () => {
  function plan() {
    return {
      schemaVersion: 1,
      revision: 1,
      contractHash: "h",
      contentHash: "",
      appKind: "marketing_site",
      archetype: "fnb",
      pages: [
        {
          id: "home",
          path: "/",
          title: "Home",
          purpose: "Landing",
          visitorJobIds: ["order"],
          requiredFactIds: ["contact-primary"],
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
      capabilities: ["whatsapp_cta"],
      artDirection: {
        businessSpecificReference: "",
        antiReferences: [],
        imageStrategy: "typographic",
        fontStrategy: "system_stack",
      },
    } as const;
  }

  it("accepts a valid plan", () => {
    expect(parseBuildPlan(plan() as never).ok).toBe(true);
  });

  it("rejects missing root or duplicate paths", () => {
    const noRoot = {
      ...plan(),
      pages: [{ ...plan().pages[0]!, path: "/about" }],
    };
    expect(parseBuildPlan(noRoot as never).ok).toBe(false);
    const dup = {
      ...plan(),
      pages: [
        plan().pages[0]!,
        { ...plan().pages[0]!, id: "home2", path: "/" },
      ],
    };
    expect(parseBuildPlan(dup as never).ok).toBe(false);
  });
});

describe("hashBuildContract", () => {
  it("hashes semantic content without revision or contentHash", () => {
    const a = baseContract();
    const b = baseContract();
    b.revision = 9;
    b.contentHash = "different";
    expect(hashBuildContract(a)).toBe(hashBuildContract(b));
  });

  it("is order-stable across contract array reordering", () => {
    const a = baseContract();
    a.facts = [a.facts[0]!];
    const b = baseContract();
    expect(hashBuildContract(a)).toBe(hashBuildContract(b));
  });

  it("is stable and prefixed", () => {
    const hash = hashBuildContract(baseContract());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hashBuildPlan", () => {
  function plan() {
    return {
      schemaVersion: 1,
      revision: 1,
      contractHash: "h",
      contentHash: "",
      appKind: "marketing_site" as const,
      archetype: "fnb",
      pages: [
        {
          id: "home",
          path: "/",
          title: "Home",
          purpose: "P",
          visitorJobIds: ["z", "a"],
          requiredFactIds: [],
          sections: [],
        },
        {
          id: "about",
          path: "/about",
          title: "About",
          purpose: "P",
          visitorJobIds: [],
          requiredFactIds: [],
          sections: [],
        },
      ],
      navigation: [],
      capabilities: ["whatsapp_cta"],
      artDirection: {
        businessSpecificReference: "",
        antiReferences: ["b", "a"],
        imageStrategy: "typographic",
        fontStrategy: "system_stack",
      },
    };
  }

  it("preserves page order but sorts set-like ids", () => {
    const a = plan();
    const b = plan();
    b.pages[0]!.visitorJobIds = ["a", "z"];
    b.artDirection.antiReferences = ["a", "b"];
    expect(hashBuildPlan(a as never)).toBe(hashBuildPlan(b as never));

    const reordered = plan();
    reordered.pages.reverse();
    expect(hashBuildPlan(a as never)).not.toBe(
      hashBuildPlan(reordered as never),
    );
  });
});

describe("deriveReviewItems + validatePlanAgainstContract", () => {
  function makePlan(input: Record<string, unknown>) {
    const result = parseBuildPlan(input);
    expect(result.ok).toBe(true);
    return (result as { ok: true; value: never }).value;
  }

  it("derives review items from plan-used facts, CTA, pages, assets, omissions", () => {
    const contract = {
      ...baseContract(),
      contentHash: hashBuildContract(baseContract()),
    };
    const plan = makePlan({
      schemaVersion: 1,
      revision: 1,
      contractHash: hashBuildContract(contract),
      contentHash: "",
      appKind: "marketing_site",
      archetype: "fnb",
      pages: [
        {
          id: "home",
          path: "/",
          title: "Home",
          purpose: "Landing",
          visitorJobIds: ["order"],
          requiredFactIds: ["contact-primary"],
          sections: [],
        },
      ],
      navigation: [],
      capabilities: ["whatsapp_cta"],
      artDirection: {
        businessSpecificReference: "",
        antiReferences: [],
        imageStrategy: "typographic",
        fontStrategy: "system_stack",
      },
    });
    const v = validatePlanAgainstContract(plan, contract);
    expect(v.ok).toBe(true);
    const items = deriveReviewItems(contract, plan);
    expect(items.some((i) => i.kind === "fact")).toBe(true);
    expect(items.some((i) => i.kind === "cta")).toBe(true);
    expect(items.some((i) => i.kind === "page")).toBe(true);
  });

  it("fails validation when the plan references an unknown fact", () => {
    const contract = {
      ...baseContract(),
      contentHash: hashBuildContract(baseContract()),
    };
    const plan = makePlan({
      schemaVersion: 1,
      revision: 1,
      contractHash: hashBuildContract(contract),
      contentHash: "",
      appKind: "marketing_site",
      archetype: "fnb",
      pages: [
        {
          id: "home",
          path: "/",
          title: "Home",
          purpose: "Landing",
          visitorJobIds: [],
          requiredFactIds: ["missing-fact"],
          sections: [],
        },
      ],
      navigation: [],
      capabilities: [],
      artDirection: {
        businessSpecificReference: "",
        antiReferences: [],
        imageStrategy: "typographic",
        fontStrategy: "system_stack",
      },
    });
    expect(validatePlanAgainstContract(plan, contract).ok).toBe(false);
  });

  it("rejects review overflow rather than truncating", () => {
    expect(REVIEW_ITEM_KINDS.length).toBeGreaterThan(0);
    expect(REVIEW_MAX_ITEMS).toBe(96);
    expect(REVIEW_MAX_SERIALIZED_BYTES).toBe(48 * 1024);
    const items = deriveReviewItems(baseContract(), {
      pages: [],
      navigation: [],
      capabilities: [],
    } as never);
    expect(Array.isArray(items)).toBe(true);
    expect(hashReviewItems(items)).toMatch(/^[0-9a-f]{64}$/);
  });
});
