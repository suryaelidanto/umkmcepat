import { describe, expect, it } from "vitest";

import { evaluateBuildReadiness } from "@/lib/projects/build-readiness";
import {
  applyAiBriefPatch,
  createInitialCanonicalBrief,
} from "@/lib/projects/canonical-brief";
import { createFactLedgerEntriesFromPatch } from "@/lib/projects/fact-ledger";

function createOwnerConfirmedBrief(patch: Record<string, unknown>) {
  const ledgerPatch = {
    ...patch,
    visualDirection: patch.visualDirection ?? patch.stylePreference,
  };
  return applyAiBriefPatch(
    {
      ...createInitialCanonicalBrief(),
      factLedger: {
        version: 1,
        entries: createFactLedgerEntriesFromPatch(ledgerPatch),
      },
    },
    patch,
  );
}

describe("discussion readiness end-to-end", () => {
  it("keeps an incomplete retail brief blocked", () => {
    const brief = applyAiBriefPatch(createInitialCanonicalBrief(), {
      businessName: "Kopi Tuku",
      umkmType: "retail",
      productOrService: [{ name: "Kopi Susu", isPrimary: true }],
    });

    expect(evaluateBuildReadiness(brief).state).toBe("blocked");
  });

  it("authorizes only after every canonical requirement resolves", () => {
    const brief = createOwnerConfirmedBrief({
      businessName: "Kopi Tuku",
      umkmType: "jasa_online",
      productOrService: [{ name: "Kopi Susu", isPrimary: true }],
      targetCustomer: "Pekerja remote",
      contact: {
        channel: "whatsapp",
        label: "Pesan sekarang",
        value: "08123456789",
      },
      stylePreference: "Hangat dan tenang",
      fieldState: { visuals: "declined" },
    });

    expect(evaluateBuildReadiness(brief)).toEqual({
      state: "ready",
      blockers: [],
    });
  });

  it("keeps a contact label as a browse action without inventing a destination", () => {
    const brief = createOwnerConfirmedBrief({
      businessName: "Kopi Tuku",
      umkmType: "jasa_online",
      productOrService: [{ name: "Kopi Susu", isPrimary: true }],
      targetCustomer: "Pekerja remote",
      contactOrCta: "Pesan sekarang",
      stylePreference: "Hangat dan tenang",
      fieldState: { visuals: "declined" },
    });
    expect(brief.primaryAction).toEqual({
      kind: "browse",
      label: "Pesan sekarang",
      target: null,
    });
    expect(evaluateBuildReadiness(brief).state).toBe("ready");
  });
});
