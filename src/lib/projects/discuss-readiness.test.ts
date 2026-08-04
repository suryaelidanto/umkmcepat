import { describe, expect, it } from "vitest";

import { parseProjectBrief } from "./brief";
import { evaluateDiscussReadiness } from "./discuss-readiness";

function readyBrief() {
  return parseProjectBrief({
    businessName: "Geprek Bu Sri",
    productOrService: [{ name: "Ayam geprek", isPrimary: true }],
    targetCustomer: "Pekerja dan mahasiswa",
    contact: { channel: "whatsapp", value: "08123456789" },
    visuals: false,
    address: "Jl. Cihampelas 21",
    hours: [{ dayRange: "Senin-Minggu", open: "10:00", close: "21:00" }],
    deliveryArea: "Radius 5 km",
    stylePreference: "Hangat dan merakyat",
    fieldState: {
      contact: "answered",
      targetCustomer: "answered",
      visuals: "answered",
      address: "answered",
      hours: "answered",
      deliveryArea: "answered",
    },
  });
}

describe("evaluateDiscussReadiness", () => {
  it("blocks local businesses when address is unresolved", () => {
    const input = readyBrief();
    input.address = null;
    delete input.fieldState?.address;

    const result = evaluateDiscussReadiness({
      brief: input,
      umkmType: "fnb",
    });

    expect(result.state).toBe("needs_question");
    expect(result.blockers).toContain("address");
    expect(result.nextFieldId).toBe("address");
  });

  it("does not require an address for online services", () => {
    const input = readyBrief();
    input.address = null;
    delete input.fieldState?.address;

    const result = evaluateDiscussReadiness({
      brief: input,
      umkmType: "jasa_online",
    });

    expect(result.blockers).not.toContain("address");
  });

  it("treats explicit decline as resolved", () => {
    const input = readyBrief();
    input.address = null;
    input.fieldState = { ...input.fieldState, address: "declined" };

    const result = evaluateDiscussReadiness({
      brief: input,
      umkmType: "fnb",
    });

    expect(result.blockers).not.toContain("address");
  });

  it("blocks multiple offers without a primary offer", () => {
    const input = readyBrief();
    input.productOrService = [{ name: "Ayam geprek" }, { name: "Es teh" }];

    const result = evaluateDiscussReadiness({
      brief: input,
      umkmType: "fnb",
    });

    expect(result.blockers).toContain("primaryOffer");
  });

  it("is ready when every structural decision is resolved", () => {
    expect(
      evaluateDiscussReadiness({ brief: readyBrief(), umkmType: "fnb" }),
    ).toEqual({ state: "ready_for_build", blockers: [], nextFieldId: null });
  });
});
