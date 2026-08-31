import { describe, expect, it } from "vitest";

import { parseCanonicalBrief } from "./canonical-brief";
import {
  DISCUSSION_DOMAINS,
  evaluateAdaptiveDiscussionReadiness,
  getDiscussionDomainCoverage,
  getUnresolvedDiscussionDomains,
} from "./discussion-domains";

describe("adaptive discussion readiness", () => {
  it("keeps the four minimum safety requirements closed for an empty brief", () => {
    const readiness = evaluateAdaptiveDiscussionReadiness(
      parseCanonicalBrief({}),
    );

    expect(readiness.minimumSatisfied).toBe(false);
    expect(readiness.missingMinimum).toEqual([
      "businessName",
      "offer",
      "primaryAction",
      "actionTarget",
    ]);
    expect(readiness.commercialSatisfied).toBe(false);
  });

  it("opens minimum readiness for identity, offer, and an actionable on-site action", () => {
    const readiness = evaluateAdaptiveDiscussionReadiness(
      parseCanonicalBrief({
        businessName: "Kopi Senja",
        offer: "Kopi susu",
        contactOrCta: "Lihat menu",
      }),
    );

    expect(readiness).toMatchObject({
      commercialDomainCount: 0,
      commercialSatisfied: false,
      minimumSatisfied: true,
      missingMinimum: [],
    });
  });

  it("rejects an external action without its target", () => {
    const readiness = evaluateAdaptiveDiscussionReadiness(
      parseCanonicalBrief({
        businessName: "Kopi Senja",
        offer: "Kopi susu",
        contact: { channel: "whatsapp", label: "Pesan" },
      }),
    );

    expect(readiness.missingMinimum).toEqual(["primaryAction", "actionTarget"]);
  });

  it("requires two commercial domains before a normal recommendation", () => {
    const readiness = evaluateAdaptiveDiscussionReadiness(
      parseCanonicalBrief({
        businessName: "Kopi Senja",
        offer: "Kopi susu",
        contactOrCta: "Lihat menu",
        usp: ["Gula aren asli"],
        targetCustomer: "Pekerja sekitar",
      }),
    );

    expect(readiness.commercialDomainCount).toBe(2);
    expect(readiness.commercialSatisfied).toBe(true);
  });

  it("counts explicit omissions as resolved commercial domains", () => {
    const readiness = evaluateAdaptiveDiscussionReadiness(
      parseCanonicalBrief({
        businessName: "Kopi Senja",
        offer: "Kopi susu",
        contactOrCta: "Lihat menu",
        fieldState: {
          audience: "declined",
          visual_direction: "declined",
        },
      }),
    );

    expect(readiness.commercialDomainCount).toBe(2);
    expect(readiness.commercialSatisfied).toBe(true);
  });

  it("leaves optional domains open even when the safety minimum is complete", () => {
    const readiness = evaluateAdaptiveDiscussionReadiness(
      parseCanonicalBrief({
        businessName: "Kopi Senja",
        offer: "Kopi susu",
        contactOrCta: "Lihat menu",
      }),
    );

    expect(readiness.minimumSatisfied).toBe(true);
    expect(readiness.commercialSatisfied).toBe(false);
  });
});

describe("discussion domain coverage", () => {
  it("exposes six independent discovery domains", () => {
    expect(DISCUSSION_DOMAINS).toHaveLength(6);
    expect(new Set(DISCUSSION_DOMAINS).size).toBe(6);
  });

  it("marks a sparse brief with only its known domains", () => {
    const coverage = getDiscussionDomainCoverage(
      parseCanonicalBrief({
        businessName: "Kopi Senja",
        productOrService: [{ name: "Kopi susu", isPrimary: true }],
        contact: {
          channel: "whatsapp",
          value: "08123456789",
          label: "Pesan",
        },
      }),
    );

    expect(coverage).toEqual({
      identity_transaction: true,
      selling_angle: false,
      audience_decision: false,
      operations: false,
      proof_assets: false,
      visual_direction: false,
    });
  });

  it("requires a target for contact actions that leave the site", () => {
    const brief = parseCanonicalBrief({
      businessName: "Kopi Senja",
      productOrService: [{ name: "Kopi susu", isPrimary: true }],
      contact: { channel: "whatsapp", label: "Pesan" },
    });

    expect(getDiscussionDomainCoverage(brief).identity_transaction).toBe(false);
  });

  it("accepts an on-site browse action without an external target", () => {
    const brief = parseCanonicalBrief({
      businessName: "Kopi Senja",
      productOrService: [{ name: "Kopi susu", isPrimary: true }],
      contactOrCta: "Lihat menu",
    });

    expect(getDiscussionDomainCoverage(brief).identity_transaction).toBe(true);
  });

  it("counts audience and visitor job as one decision domain", () => {
    const withAudience = parseCanonicalBrief({
      targetCustomer: "Pekerja sekitar",
    });
    const withJob = parseCanonicalBrief({
      visitorJobs: [{ id: "order", goal: "Memesan", priority: "primary" }],
    });

    expect(getDiscussionDomainCoverage(withAudience).audience_decision).toBe(
      true,
    );
    expect(getDiscussionDomainCoverage(withJob).audience_decision).toBe(true);
  });

  it("counts operations from location, delivery area, or hours", () => {
    expect(
      getDiscussionDomainCoverage(
        parseCanonicalBrief({ address: "Jakarta Selatan" }),
      ).operations,
    ).toBe(true);
    expect(
      getDiscussionDomainCoverage(
        parseCanonicalBrief({ deliveryArea: "Jakarta" }),
      ).operations,
    ).toBe(true);
    expect(
      getDiscussionDomainCoverage(
        parseCanonicalBrief({
          hours: [{ dayRange: "Setiap hari", open: "08:00", close: "20:00" }],
        }),
      ).operations,
    ).toBe(true);
  });

  it("counts proof or an explicit photo omission as resolved", () => {
    const withProof = parseCanonicalBrief({
      testimonials: [{ quote: "Enak", author: "Pelanggan" }],
    });
    const omitted = parseCanonicalBrief({
      fieldState: { visuals: "declined" },
    });

    expect(getDiscussionDomainCoverage(withProof).proof_assets).toBe(true);
    expect(getDiscussionDomainCoverage(omitted).proof_assets).toBe(true);
  });

  it("counts an explicit visual omission as resolved", () => {
    const brief = parseCanonicalBrief({
      fieldState: { visual_direction: "declined" },
    });

    expect(getDiscussionDomainCoverage(brief).visual_direction).toBe(true);
  });

  it("returns only unresolved domains in stable order", () => {
    const unresolved = getUnresolvedDiscussionDomains(
      parseCanonicalBrief({ targetCustomer: "Pekerja sekitar" }),
    );

    expect(unresolved).toEqual([
      "identity_transaction",
      "selling_angle",
      "operations",
      "proof_assets",
      "visual_direction",
    ]);
  });
});
