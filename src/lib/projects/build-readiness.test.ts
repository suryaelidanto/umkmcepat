import { describe, expect, it } from "vitest";

import {
  evaluateBuildReadiness,
  type BuildReadinessField,
} from "./build-readiness";
import {
  createInitialCanonicalBrief,
  type ProjectBriefV2,
} from "./canonical-brief";

function readyBrief(overrides: Partial<ProjectBriefV2> = {}): ProjectBriefV2 {
  const initial = createInitialCanonicalBrief("Buat situs");
  return {
    ...initial,
    business: { name: "Toko Sinar", type: "Retail", category: "other" },
    offers: [{ name: "Laptop bekas", isPrimary: true }],
    audience: "Pelajar dan pekerja",
    primaryAction: {
      kind: "whatsapp",
      label: "Chat WhatsApp",
      target: "08123456789",
    },
    visualDirection: "Bersih dan modern",
    fieldState: { visuals: "declined" },
    ...overrides,
  };
}

describe("evaluateBuildReadiness", () => {
  it.each<[BuildReadinessField, Partial<ProjectBriefV2>]>([
    ["business.name", { business: { name: "", type: "", category: "other" } }],
    ["offers", { offers: [] }],
    ["audience", { audience: null }],
    ["primaryAction", { primaryAction: null }],
    ["visualDirection", { visualDirection: null }],
  ])("blocks the missing core field %s", (field, overrides) => {
    const result = evaluateBuildReadiness(readyBrief(overrides));

    expect(result).toMatchObject({
      state: "blocked",
      blockers: [{ field }],
      nextQuestion: { id: field },
    });
  });

  it("requires one primary offer when several offers exist", () => {
    const result = evaluateBuildReadiness(
      readyBrief({
        offers: [{ name: "Laptop" }, { name: "Ponsel" }],
      }),
    );

    expect(result).toMatchObject({
      state: "blocked",
      blockers: [{ field: "primaryOffer" }],
    });
  });

  it("requires a destination for contact actions", () => {
    const result = evaluateBuildReadiness(
      readyBrief({
        primaryAction: {
          kind: "whatsapp",
          label: "Chat WhatsApp",
          target: null,
        },
      }),
    );

    expect(result).toMatchObject({
      state: "blocked",
      blockers: [{ field: "primaryAction" }],
    });
  });

  it("accepts an explicit browse action without a destination", () => {
    const result = evaluateBuildReadiness(
      readyBrief({
        primaryAction: {
          kind: "browse",
          label: "Lihat stok & harga",
          target: null,
        },
      }),
    );

    expect(result).toEqual({ state: "ready", blockers: [] });
  });

  it("stays buildable when structural detail was never asked", () => {
    // Nothing schedules the address/hours/photo questions, so blocking on them
    // deadlocked the build with no way for the owner to resolve it. The
    // blueprint already omits sections it has no facts for.
    const result = evaluateBuildReadiness(
      readyBrief({
        business: { name: "Warung", type: "Kuliner", category: "fnb" },
        fieldState: {},
      }),
    );

    expect(result).toEqual({ state: "ready", blockers: [] });
  });

  it("still blocks a missing core field for a category business", () => {
    const result = evaluateBuildReadiness(
      readyBrief({
        business: { name: "Warung", type: "Kuliner", category: "fnb" },
        fieldState: {},
        audience: null,
      }),
    );

    expect(result).toMatchObject({
      state: "blocked",
      blockers: [{ field: "audience" }],
      nextQuestion: { id: "audience" },
    });
  });

  it.each(["answered", "declined", "explicitly_empty"] as const)(
    "stays ready for a category business when detail is %s",
    (state) => {
      const result = evaluateBuildReadiness(
        readyBrief({
          business: { name: "Warung", type: "Kuliner", category: "fnb" },
          fieldState: {
            address: state,
            hours: state,
            deliveryArea: state,
            visuals: state,
          },
        }),
      );

      expect(result).toEqual({ state: "ready", blockers: [] });
    },
  );

  it("does not use AI confidence or a persisted ready flag", () => {
    const input = {
      ...readyBrief({ offers: [] }),
      confidence: 100,
      readyForBuild: true,
      openQuestions: [],
    };

    expect(evaluateBuildReadiness(input)).toMatchObject({
      state: "blocked",
      blockers: [{ field: "offers" }],
    });
  });
});
