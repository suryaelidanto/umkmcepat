import { describe, expect, it } from "vitest";

import {
  SPARSE_EVALUATION_CORPUS,
  evaluateSparseCase,
} from "./sparse-evaluation-corpus";

describe("sparse evaluation corpus", () => {
  it("contains enough varied sparse states for a regression pass", () => {
    expect(SPARSE_EVALUATION_CORPUS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(SPARSE_EVALUATION_CORPUS.map((item) => item.id)).size).toBe(
      SPARSE_EVALUATION_CORPUS.length,
    );
  });

  it("covers empty, partial, minimal, omitted, uploaded, proof, and rich states", () => {
    const ids = new Set(SPARSE_EVALUATION_CORPUS.map((item) => item.id));

    for (const id of [
      "empty-brief",
      "identity-only",
      "offer-only",
      "contact-only",
      "minimal-fnb",
      "owner-omits-photos",
      "owner-uploads-one-asset",
      "proof-without-invention",
      "complete-rich-brief",
    ]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("keeps every corpus case within its declared readiness and omission contract", () => {
    const results = SPARSE_EVALUATION_CORPUS.map(evaluateSparseCase);

    expect(results.every((result) => result.ok)).toBe(true);
    expect(results.flatMap((result) => result.unexpectedFields)).toEqual([]);
  });

  it("keeps Tier 1 closed until identity, offer, and contact are present", () => {
    const incomplete = SPARSE_EVALUATION_CORPUS.filter(
      (item) => !item.expected.tier1Satisfied,
    );

    expect(incomplete.length).toBeGreaterThanOrEqual(4);
    expect(
      incomplete.every((item) => item.expected.missingTier1.length > 0),
    ).toBe(true);
  });

  it("records a complete minimal state without requiring optional proof", () => {
    const minimal = SPARSE_EVALUATION_CORPUS.find(
      (item) => item.id === "minimal-fnb",
    );
    expect(minimal?.expected.tier1Satisfied).toBe(true);
    expect(minimal?.expected.omittedFields).toContain("testimonials");
    expect(minimal?.expected.omittedFields).toContain("assets");
  });

  it("keeps an explicit photo omission distinct from an uploaded asset", () => {
    const omitted = SPARSE_EVALUATION_CORPUS.find(
      (item) => item.id === "owner-omits-photos",
    );
    const uploaded = SPARSE_EVALUATION_CORPUS.find(
      (item) => item.id === "owner-uploads-one-asset",
    );

    expect(omitted?.expected.omittedFields).toContain("assets");
    expect(uploaded?.expected.omittedFields).not.toContain("assets");
  });

  it("does not treat a proof-bearing case as permission to invent location or price", () => {
    const proof = SPARSE_EVALUATION_CORPUS.find(
      (item) => item.id === "proof-without-invention",
    );

    expect(proof?.expected.omittedFields).toContain("address");
    expect(proof?.expected.omittedFields).toContain("priceRange");
  });

  it("keeps the online case free of a fabricated physical address", () => {
    const online = SPARSE_EVALUATION_CORPUS.find(
      (item) => item.id === "online-service-with-area",
    );

    expect(online?.expected.omittedFields).toContain("address");
  });
});
