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

  it("does not treat an AI-suggested offer as owner-confirmed", () => {
    const result = evaluateBuildReadiness(
      readyBrief({
        factLedger: {
          version: 1,
          entries: [
            {
              id: "business-name-primary",
              field: "businessName",
              label: "Nama usaha",
              value: "Toko Sinar",
              state: "owner_confirmed",
              origin: "owner_message",
              source: "owner",
              sourceTurnId: "turn-1",
            },
            {
              id: "offers-primary",
              field: "offers",
              label: "Produk atau layanan",
              value: [{ name: "Laptop bekas", isPrimary: true }],
              state: "ai_suggestion",
              origin: "safe_derivation",
              source: "assistant",
              sourceTurnId: "turn-1",
            },
            {
              id: "audience-primary",
              field: "audience",
              label: "Pelanggan",
              value: "Pelajar dan pekerja",
              state: "owner_confirmed",
              origin: "owner_message",
              source: "owner",
              sourceTurnId: "turn-1",
            },
            {
              id: "contact-primary",
              field: "contact",
              label: "Kontak",
              value: "08123456789",
              state: "owner_confirmed",
              origin: "owner_message",
              source: "owner",
              sourceTurnId: "turn-1",
            },
            {
              id: "visual-direction-primary",
              field: "visualDirection",
              label: "Arah visual",
              value: "Bersih dan modern",
              state: "owner_confirmed",
              origin: "owner_message",
              source: "owner",
              sourceTurnId: "turn-1",
            },
          ],
        },
      }),
    );

    expect(result).toMatchObject({
      state: "blocked",
      blockers: [{ field: "offers" }],
      nextQuestion: { id: "offers" },
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
    const result = evaluateBuildReadiness(
      readyBrief({
        business: { name: "Warung", type: "Kuliner", category: "fnb" },
        fieldState: {},
      }),
    );

    expect(result).toEqual({ state: "ready", blockers: [] });
  });

  it("does not block visualDirection when user declined or delegated in fieldState", () => {
    const result = evaluateBuildReadiness(
      readyBrief({
        visualDirection: null,
        fieldState: { visual_direction: "declined" },
      }),
    );

    expect(result).toEqual({ state: "ready", blockers: [] });
  });

  it("does not block audience when user declined in fieldState", () => {
    const result = evaluateBuildReadiness(
      readyBrief({
        audience: null,
        fieldState: { audience: "declined" },
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
