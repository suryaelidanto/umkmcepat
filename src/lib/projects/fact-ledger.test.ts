import { describe, expect, it } from "vitest";

import {
  createEmptyFactLedger,
  createFactLedgerEntriesFromPatch,
  getRenderableFactEntries,
  mergeFactLedger,
  normalizeFactLedger,
} from "./fact-ledger";

describe("fact ledger", () => {
  it("maps legacy provenance keys to renderable contract fields", () => {
    const entries = createFactLedgerEntriesFromPatch({
      facts: [
        {
          key: "product_variants",
          label: "Jenis produk",
          value: "Beras Putih Premium",
        },
      ],
    });

    expect(entries).toMatchObject([
      {
        field: "offers",
        value: "Beras Putih Premium",
        state: "owner_confirmed",
      },
    ]);
  });

  it("keeps owner facts renderable and separates suggestions from decisions", () => {
    const ledger = mergeFactLedger(
      createEmptyFactLedger(),
      [
        {
          id: "offer-premium",
          field: "offers",
          label: "Produk",
          value: { name: "Beras Putih Premium" },
          state: "owner_confirmed",
          source: "owner",
          sourceTurnId: "turn-1",
        },
        {
          id: "usp-1",
          field: "usp",
          label: "Keunggulan",
          value: "Beras berkualitas",
          state: "owner_confirmed",
          source: "owner",
          sourceTurnId: "turn-1",
        },
        {
          id: "photos",
          field: "visuals",
          label: "Foto usaha",
          value: null,
          state: "declined",
          source: "owner",
          sourceTurnId: "turn-1",
        },
      ],
      {
        ownerTexts: ["Aku jual Beras Putih Premium. Foto usaha belum ada."],
        sourceTurnId: "turn-1",
      },
    );

    expect(getRenderableFactEntries(ledger).map((entry) => entry.id)).toEqual([
      "offer-premium",
    ]);
    expect(ledger.entries.find((entry) => entry.id === "usp-1")?.state).toBe(
      "ai_suggestion",
    );
    expect(ledger.entries.find((entry) => entry.id === "photos")?.state).toBe(
      "declined",
    );
  });

  it("grounds a structured contact entry from the owner-confirmed number", () => {
    const ledger = mergeFactLedger(
      createEmptyFactLedger(),
      [
        {
          id: "contact-primary",
          field: "contact",
          label: "Kontak",
          value: {
            label: "Chat WhatsApp",
            value: "08123456789",
            channel: "whatsapp",
          },
          state: "owner_confirmed",
          source: "owner",
          sourceTurnId: null,
        },
      ],
      { ownerTexts: ["Nomor WhatsApp toko saya: 08123456789"] },
    );

    expect(ledger.entries[0]).toMatchObject({
      id: "contact-primary",
      state: "owner_confirmed",
      source: "owner",
      value: {
        value: "08123456789",
      },
    });
  });

  it("preserves explicit unknown and declined states when later patches omit them", () => {
    const initial = normalizeFactLedger({
      version: 1,
      entries: [
        {
          id: "address",
          field: "address",
          label: "Alamat",
          value: null,
          state: "unknown",
          source: "system",
          sourceTurnId: null,
        },
        {
          id: "visuals",
          field: "visuals",
          label: "Foto usaha",
          value: null,
          state: "declined",
          source: "owner",
          sourceTurnId: "turn-1",
        },
      ],
    });

    const merged = mergeFactLedger(initial, [], { ownerTexts: [] });

    expect(merged.entries).toEqual(initial.entries);
  });

  it("does not let a suggestion downgrade an owner-confirmed fact", () => {
    const initial = normalizeFactLedger({
      version: 1,
      entries: [
        {
          id: "business-name-primary",
          field: "businessName",
          label: "Nama usaha",
          value: "Beras GG",
          state: "owner_confirmed",
          source: "owner",
          sourceTurnId: "turn-1",
        },
      ],
    });

    const merged = mergeFactLedger(
      initial,
      [
        {
          id: "business-name-primary",
          field: "businessName",
          label: "Nama usaha",
          value: "Nama baru",
          state: "ai_suggestion",
          source: "assistant",
          sourceTurnId: "turn-2",
        },
      ],
      { ownerTexts: [] },
    );

    expect(merged.entries).toEqual(initial.entries);
  });

  it("does not let a model label unsupported text as owner-confirmed", () => {
    const ledger = mergeFactLedger(
      createEmptyFactLedger(),
      [
        {
          id: "tagline",
          field: "tagline",
          label: "Tagline",
          value: "Beras terbaik untuk semua",
          state: "owner_confirmed",
          source: "owner",
          sourceTurnId: "turn-2",
        },
      ],
      {
        ownerTexts: ["Tolong buatkan tagline untuk toko beras."],
        sourceTurnId: "turn-2",
      },
    );

    expect(getRenderableFactEntries(ledger)).toEqual([]);
    expect(ledger.entries[0]?.state).toBe("ai_suggestion");
    expect(ledger.entries[0]?.source).toBe("assistant");
  });
});
