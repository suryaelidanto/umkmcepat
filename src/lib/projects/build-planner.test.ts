import { describe, expect, it } from "vitest";

import { parseBuildContract } from "./build-contract";
import { hashBuildContract, hashBuildPlan } from "./build-hash";
import {
  buildContractFromBrief,
  buildPlanFromContract,
  type PlannerDeps,
} from "./build-planner";

import type { ProjectBrief } from "./brief";

function brief(): ProjectBrief {
  return {
    version: 1 as const,
    prompt: "jualan sate ayam",
    facts: [],
    decisions: [],
    businessName: "Sate Mas",
    businessType: "fnb",
    offer: "Sate ayam dan kambing",
    targetCustomer: "Karyawan kantoran",
    contactOrCta: "WhatsApp 08123456789",
    stylePreference: "hangat",
    notes: [],
    confidence: 96,
    openQuestions: [],
    productOrService: [{ name: "Sate Ayam", isPrimary: true }],
    contact: { channel: "whatsapp", value: "+628123456789" },
    tagline: "Sate enak",
    usp: ["Bumbu kacang original"],
    priceRange: "15rb",
    visuals: true,
    hours: [{ dayRange: "Senin-Sabtu", open: "09:00", close: "21:00" }],
    address: "Jl. Merdeka 1",
    deliveryArea: "Kota",
    since: "2015",
    testimonials: null,
    certifications: null,
    paymentMethods: [{ method: "cash" }],
    socialLinks: null,
    currentPromo: null,
    secondaryCta: null,
    readyForBuild: true,
  };
}

function deps(): PlannerDeps {
  return {
    parseBuildContract,
    hashContract: hashBuildContract,
  };
}

describe("buildContractFromBrief", () => {
  it("maps a ready brief into a valid contract draft", () => {
    const result = buildContractFromBrief(brief(), deps(), "t1");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.identity.businessName).toBe("Sate Mas");
    expect(result.value.facts.some((f) => f.kind === "contact")).toBe(true);
    expect(result.value.facts.some((f) => f.kind === "offer")).toBe(true);
    expect(result.value.ctaIntents.length).toBeGreaterThan(0);
    // The draft carries a content hash.
    expect(result.value.contentHash).toMatch(/^[0-9a-f]{64}$/);
    const plan = buildPlanFromContract(result.value);
    expect(plan.contentHash).toBe(hashBuildPlan(plan));
  });

  it("uses valid server provenance when no chat turn is available", () => {
    const result = buildContractFromBrief(brief(), deps());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(
      result.value.facts.every((fact) => fact.provenance.turnId === "server"),
    ).toBe(true);
  });

  it("preserves explicit visitor jobs and derives one route per distinct job", () => {
    const multi = brief();
    multi.visitorJobs = [
      {
        id: "primary",
        goal: "Memahami menu dan memesan",
        priority: "primary",
      },
      {
        id: "browse-menu",
        goal: "Membandingkan menu",
        priority: "secondary",
      },
    ];

    const result = buildContractFromBrief(multi, deps(), "turn-multi");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.visitorJobs).toEqual(multi.visitorJobs);
    const plan = buildPlanFromContract(result.value);
    expect(plan.pages.map((page) => page.path)).toEqual(["/", "/katalog"]);
    expect(plan.pages[0]?.visitorJobIds).toEqual(["primary"]);
    expect(plan.pages[1]?.visitorJobIds).toEqual(["browse-menu"]);
    expect(plan.navigation).toEqual([
      { fromPageId: "home", toPageId: "browse-menu", label: "Katalog" },
    ]);
  });

  it("does not split a single visitor job because its goal mentions a catalog", () => {
    const single = brief();
    single.visitorJobs = [
      {
        id: "primary",
        goal: "Melihat katalog menu dan memesan",
        priority: "primary",
      },
    ];

    const result = buildContractFromBrief(single, deps(), "turn-single");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(buildPlanFromContract(result.value).pages).toHaveLength(1);
  });

  it("rejects malformed explicit visitor jobs before creating a handoff", () => {
    const invalid = brief();
    Object.assign(invalid, {
      visitorJobs: [
        {
          id: "primary",
          goal: "Memahami menu",
          priority: "primary",
        },
        {
          id: "primary",
          goal: "Menemukan lokasi",
          priority: "secondary",
        },
      ],
    });

    const result = buildContractFromBrief(invalid, deps(), "turn-invalid");
    expect(result).toEqual({
      ok: false,
      reason: "duplicate visitor job id: primary",
    });
  });

  it("keeps secondary routes unique when two jobs share the same intent", () => {
    const multi = brief();
    multi.visitorJobs = [
      {
        id: "primary",
        goal: "Memahami menu",
        priority: "primary",
      },
      {
        id: "browse-one",
        goal: "Membandingkan menu pertama",
        priority: "secondary",
      },
      {
        id: "browse-two",
        goal: "Membandingkan menu kedua",
        priority: "secondary",
      },
    ];

    const result = buildContractFromBrief(multi, deps(), "turn-collision");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(
      buildPlanFromContract(result.value).pages.map((page) => page.path),
    ).toEqual(["/", "/katalog", "/katalog-2"]);
  });

  it("fails without a concrete business name or offer", () => {
    const b = brief();
    b.businessName = "";
    const result = buildContractFromBrief(b, deps(), "t1");
    expect(result.ok).toBe(false);
  });
});
