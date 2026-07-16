import { describe, expect, it } from "vitest";

import {
  applyBriefValidator,
  isBriefReadyForBuild,
} from "@/lib/projects/brief";
import { validateBrief } from "@/lib/projects/brief-rich-fields";

describe("discussion readiness end-to-end", () => {
  it("a brief with only businessName + productOrService is not ready", () => {
    const brief = applyBriefValidator({
      businessName: "Kopi Tuku",
      productOrService: [{ name: "Kopi Susu", isPrimary: true }],
    });
    expect(isBriefReadyForBuild(brief)).toBe(false);
  });

  it("a brief with valid readyForBuild flag and mandatory fields is ready", () => {
    const brief = applyBriefValidator({
      businessName: "Kopi Tuku",
      productOrService: [{ name: "Kopi Susu", isPrimary: true }],
    });
    brief.readyForBuild = true;
    expect(isBriefReadyForBuild(brief)).toBe(true);
  });

  it("a hallucinated contact is dropped, brief is still buildable when mandatory + flag are present", () => {
    const { cleaned, dropped } = validateBrief({
      businessName: "Kopi Tuku",
      productOrService: [{ name: "Kopi Susu" }],
      contact: { channel: "whatsapp", value: "hello world" },
    });
    expect(dropped).toContain("contact");
    expect(cleaned.contact).toBeNull();
    const brief = applyBriefValidator(cleaned);
    brief.readyForBuild = true;
    expect(isBriefReadyForBuild(brief)).toBe(true);
  });
});
