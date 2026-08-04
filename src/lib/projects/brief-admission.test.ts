import { describe, expect, it } from "vitest";

import { checkBatchedGenerateAdmission } from "./brief-admission";

import type { ProjectBrief } from "./brief";

function readyBrief(overrides: Partial<ProjectBrief> = {}): ProjectBrief {
  return {
    version: 1,
    notes: [],
    readyForBuild: true,
    prompt: "coffee shop untuk kerja remote",
    businessName: "Kopi Sela",
    businessType: "Coffee shop kecil",
    offer: "Espresso, manual brew, pastry",
    targetCustomer: "Mahasiswa dan pekerja remote",
    contactOrCta: "Pesan lewat WhatsApp",
    stylePreference: "Hangat premium, tenang",
    ...overrides,
  } as ProjectBrief;
}

describe("checkBatchedGenerateAdmission", () => {
  it("admits a complete brief", () => {
    const result = checkBatchedGenerateAdmission({ brief: readyBrief() });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reason).toBeNull();
    }
  });

  it("blocks when brief is not marked readyForBuild", () => {
    // Guard against generating when discuss-readiness still has structural
    // blockers. brief-flow flips readyForBuild only when the brief is done.
    const brief = readyBrief({ readyForBuild: false });
    brief.fieldState = undefined;
    const result = checkBatchedGenerateAdmission({ brief });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/belum siap|rief belum/i);
      expect(result.blockers.length).toBeGreaterThan(0);
    }
  });

  it("blocks when businessName or offer is empty, with Indonesian reason", () => {
    for (const patch of [
      { businessName: "" },
      { businessName: "   " },
      { offer: "" },
    ]) {
      const result = checkBatchedGenerateAdmission({
        brief: readyBrief(patch),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/[A-Za-z]/);
        expect(result.reason).not.toMatch(/[bf]ailed|error|invalid/i); // Indonesian, not English
      }
    }
  });

  it("blocks when contactOrCta / CTA info is missing", () => {
    const result = checkBatchedGenerateAdmission({
      brief: readyBrief({ contactOrCta: "" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/kontak|cta|whatsapp/i);
    }
  });

  it("blocks when stylePreference is missing", () => {
    const result = checkBatchedGenerateAdmission({
      brief: readyBrief({ stylePreference: "" }),
    });
    expect(result.ok).toBe(false);
  });

  it("blocks when targetCustomer is missing", () => {
    const result = checkBatchedGenerateAdmission({
      brief: readyBrief({ targetCustomer: "" }),
    });
    expect(result.ok).toBe(false);
  });

  it("does not throw on null brief fields", () => {
    const brief = readyBrief();
    delete (brief as { productOrService?: unknown }).productOrService;
    brief.businessName = null as unknown as string;
    const result = checkBatchedGenerateAdmission({ brief });
    expect(result.ok).toBe(false);
  });
});
