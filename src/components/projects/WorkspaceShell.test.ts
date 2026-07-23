import { describe, expect, it } from "vitest";

import {
  RESUME_POLL_INTERVAL_MS,
  canStartBuild,
  resolveDiscussResume,
} from "./WorkspaceShell";

import type { ProjectBrief } from "@/lib/projects/brief";

function makeBrief(overrides: Partial<ProjectBrief>): ProjectBrief {
  return {
    businessName: "Kopi Tuku",
    businessType: "Kedai kopi",
    confidence: 95,
    contact: null,
    contactOrCta: "Chat WA",
    decisions: [],
    deliveryArea: null,
    facts: [],
    notes: [],
    offer: "Kopi susu",
    openQuestions: [],
    priceRange: null,
    productOrService: [{ name: "Kopi", isPrimary: true }],
    prompt: "buat web kopi",
    readyForBuild: true,
    since: null,
    socialLinks: null,
    stylePreference: "Bold gelap",
    tagline: null,
    targetCustomer: "Mahasiswa",
    testimonials: null,
    hours: null,
    address: null,
    certifications: null,
    currentPromo: null,
    paymentMethods: null,
    secondaryCta: null,
    usp: null,
    visuals: null,
    version: 1,
    ...overrides,
  };
}

describe("canStartBuild", () => {
  it("returns true when brief is present, regardless of completeness gates", () => {
    expect(
      canStartBuild(
        makeBrief({
          productOrService: [{ name: "Kopi", isPrimary: true }],
          readyForBuild: false,
        }),
      ),
    ).toBe(true);

    expect(
      canStartBuild(
        makeBrief({
          businessName: "Kopi Tuku",
          productOrService: [{ name: "Kopi", isPrimary: true }],
          readyForBuild: true,
        }),
      ),
    ).toBe(true);

    expect(
      canStartBuild(
        makeBrief({
          productOrService: [],
          readyForBuild: true,
        }),
      ),
    ).toBe(true);

    expect(
      canStartBuild(
        makeBrief({
          businessName: "",
          productOrService: [{ name: "Kopi", isPrimary: true }],
          readyForBuild: true,
        }),
      ),
    ).toBe(true);
  });

  it("returns false when brief is null or undefined", () => {
    expect(canStartBuild(null)).toBe(false);
    expect(canStartBuild(undefined)).toBe(false);
  });
});

describe("resolveDiscussResume", () => {
  it("returns idle when there is no turn (404 — pre-fix crash before persist)", () => {
    expect(resolveDiscussResume(null)).toEqual({ kind: "idle" });
  });

  it("returns poll when the turn is still running", () => {
    expect(
      resolveDiscussResume({
        turnId: "ct_running",
        status: "running",
        userMessageId: "u1",
      }),
    ).toEqual({ kind: "poll" });
  });

  it("returns reload when the turn succeeded — client replays the persisted reply", () => {
    expect(
      resolveDiscussResume({
        turnId: "ct_done",
        status: "succeeded",
        userMessageId: "u1",
      }),
    ).toEqual({ kind: "reload" });
  });

  it("returns retry with the server's errorMessage for a failed turn", () => {
    const result = resolveDiscussResume({
      turnId: "ct_fail",
      status: "failed",
      userMessageId: "u1",
      errorMessage: "expired",
    });
    expect(result.kind).toBe("retry");
    if (result.kind === "retry") {
      expect(result.errorMessage).toBe("expired");
      expect(result.retryText).toBe("Kirim ulang");
    }
  });

  it("returns retry with a default Indonesian message when errorMessage is empty", () => {
    const result = resolveDiscussResume({
      turnId: "ct_fail",
      status: "cancelled",
      userMessageId: "u1",
      errorMessage: "",
    });
    expect(result.kind).toBe("retry");
    if (result.kind === "retry") {
      expect(result.errorMessage.length).toBeGreaterThan(0);
      expect(result.retryText).toBe("Kirim ulang");
    }
  });

  it("exports a sane poll interval", () => {
    expect(RESUME_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(1_000);
    expect(RESUME_POLL_INTERVAL_MS).toBeLessThanOrEqual(5_000);
  });
});
