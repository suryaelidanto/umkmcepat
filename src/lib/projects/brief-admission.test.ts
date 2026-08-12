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

  it("admits a minimal brief with only businessName + offer + readyForBuild", () => {
    // The 2-field minimum: contact, style, target customer are optional now.
    // A build can start as soon as identity + offering are known.
    const minimal = readyBrief({
      contactOrCta: "",
      stylePreference: "",
      targetCustomer: "",
    });
    const result = checkBatchedGenerateAdmission({ brief: minimal });
    expect(result.ok).toBe(true);
  });

  it("does not block when contactOrCta / stylePreference / targetCustomer are missing (optional fields)", () => {
    // These are rich fields now — the writer prompt + completeness gate skip
    // empty ones. Admission only enforces the core: businessName + offer.
    for (const patch of [
      { contactOrCta: "" },
      { stylePreference: "" },
      { targetCustomer: "" },
    ]) {
      const result = checkBatchedGenerateAdmission({
        brief: readyBrief(patch),
      });
      expect(result.ok).toBe(true);
    }
  });

  it("does not throw on null brief fields", () => {
    const brief = readyBrief();
    delete (brief as { productOrService?: unknown }).productOrService;
    brief.businessName = null as unknown as string;
    const result = checkBatchedGenerateAdmission({ brief });
    expect(result.ok).toBe(false);
  });
});
