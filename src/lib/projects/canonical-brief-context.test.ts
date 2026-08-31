import { describe, expect, it } from "vitest";

import { parseCanonicalBrief } from "./canonical-brief";

describe("canonical brief context", () => {
  it("round-trips the fact ledger and raw discussion snapshot", () => {
    const brief = parseCanonicalBrief({
      version: 2,
      prompt: "buat website",
      business: { name: "Beras GG", type: "retail", category: "retail" },
      offers: [{ name: "Beras Putih Premium", isPrimary: true }],
      factLedger: {
        version: 1,
        entries: [
          {
            id: "offer-premium",
            field: "offers",
            label: "Produk",
            value: { name: "Beras Putih Premium" },
            state: "owner_confirmed",
            source: "owner",
            sourceTurnId: "turn-1",
          },
        ],
      },
      discussionContext: {
        version: 1,
        messages: [
          {
            id: "message-1",
            role: "user",
            parts: [{ type: "text", text: "Beras Putih Premium" }],
          },
        ],
        summary: { text: "", compactedMessageCount: 0 },
        memoryFacts: { facts: [], decisions: [], preferences: [] },
        capturedAt: "2026-08-30T00:00:00.000Z",
      },
    });

    expect(brief.factLedger?.entries).toHaveLength(1);
    expect(brief.factLedger?.entries[0]?.state).toBe("owner_confirmed");
    expect(brief.discussionContext?.messages).toHaveLength(1);
    expect(brief.discussionContext?.messages[0]?.id).toBe("message-1");
  });
});
