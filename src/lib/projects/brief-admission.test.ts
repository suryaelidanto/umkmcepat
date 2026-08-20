import { describe, expect, it } from "vitest";

import { checkBatchedGenerateAdmission } from "./brief-admission";

import type { ProjectBrief } from "./brief";

function readyBrief(overrides: Partial<ProjectBrief> = {}): ProjectBrief {
  return {
    version: 1,
    notes: [],
    readyForBuild: false,
    prompt: "coffee shop untuk kerja remote",
    businessName: "Kopi Sela",
    businessType: "Coffee shop kecil",
    offer: "Espresso",
    productOrService: [{ name: "Espresso", isPrimary: true }],
    targetCustomer: "Mahasiswa dan pekerja remote",
    contactOrCta: "Pesan lewat WhatsApp",
    contact: {
      channel: "whatsapp",
      label: "Pesan lewat WhatsApp",
      value: "08123456789",
    },
    stylePreference: "Hangat premium, tenang",
    umkmType: "jasa_online",
    fieldState: { visuals: "declined" },
    ...overrides,
  } as ProjectBrief;
}

describe("checkBatchedGenerateAdmission", () => {
  it("admits a canonically complete brief without trusting readyForBuild", () => {
    const result = checkBatchedGenerateAdmission({ brief: readyBrief() });

    expect(result).toEqual({ ok: true, blockers: [], reason: null });
  });

  it("blocks when identity or offers are missing", () => {
    for (const brief of [
      readyBrief({ businessName: "" }),
      readyBrief({ offer: "", productOrService: null }),
    ]) {
      const result = checkBatchedGenerateAdmission({ brief });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/belum siap/i);
      }
    }
  });

  it("blocks every canonical core requirement", () => {
    for (const patch of [
      { targetCustomer: "" },
      { contactOrCta: "", contact: null },
      { stylePreference: "" },
    ] satisfies Array<Partial<ProjectBrief>>) {
      const result = checkBatchedGenerateAdmission({
        brief: readyBrief(patch),
      });
      expect(result.ok).toBe(false);
    }
  });

  it("admits a brief whose structural detail was never asked", () => {
    // Mirrors build readiness: nothing schedules the address/hours/photo
    const result = checkBatchedGenerateAdmission({
      brief: readyBrief({ fieldState: {} }),
    });

    expect(result.ok).toBe(true);
  });

  it("does not throw on malformed brief fields", () => {
    const brief = readyBrief({ businessName: null as unknown as string });
    const result = checkBatchedGenerateAdmission({ brief });

    expect(result.ok).toBe(false);
  });
});
