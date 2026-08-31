import { describe, expect, it } from "vitest";

import {
  createEmptyFactLedger,
  createExplicitOmissionEntry,
  createFactLedgerEntriesFromPatch,
  getRenderableFactEntries,
  mergeFactLedger,
  normalizeFactLedger,
} from "./fact-ledger";

describe("fact ledger", () => {
  it("preserves each allowed origin while normalizing persisted entries", () => {
    const ledger = normalizeFactLedger({
      version: 1,
      entries: [
        ...[
          "owner_message",
          "uploaded_asset",
          "accepted_decision",
          "safe_derivation",
          "design_only",
          "explicit_omission",
        ].map((origin, index) => ({
          id: `origin-${index}`,
          field: `field-${index}`,
          label: `Field ${index}`,
          origin,
          source:
            index === 1
              ? "uploaded_asset"
              : index === 3
                ? "assistant"
                : index === 4
                  ? "system"
                  : "owner",
          state:
            index === 3
              ? "ai_suggestion"
              : index === 5
                ? "declined"
                : "owner_confirmed",
          value: index === 5 ? null : `value-${index}`,
          sourceTurnId: null,
        })),
      ],
    });

    expect(ledger.entries.map((entry) => entry.origin)).toEqual([
      "owner_message",
      "uploaded_asset",
      "accepted_decision",
      "safe_derivation",
      "design_only",
      "explicit_omission",
    ]);
  });

  it("drops unsupported origin entries before they can become renderable", () => {
    const ledger = normalizeFactLedger({
      version: 1,
      entries: [
        {
          id: "fake-claim",
          field: "claim",
          label: "Claim",
          origin: "unsupported",
          source: "assistant",
          state: "owner_confirmed",
          value: "Tidak terverifikasi",
          sourceTurnId: null,
        },
      ],
    });

    expect(ledger.entries).toHaveLength(0);
    expect(getRenderableFactEntries(ledger)).toHaveLength(0);
  });

  it("rejects an owner origin paired with an assistant source", () => {
    const ledger = normalizeFactLedger({
      version: 1,
      entries: [
        {
          id: "forged-owner",
          field: "offer",
          label: "Offer",
          origin: "owner_message",
          source: "assistant",
          state: "owner_confirmed",
          value: "Unsupported offer",
          sourceTurnId: null,
        },
      ],
    });

    expect(ledger.entries).toEqual([]);
  });

  it("rejects an uploaded origin paired with a normal owner source", () => {
    const ledger = normalizeFactLedger({
      version: 1,
      entries: [
        {
          id: "forged-upload",
          field: "visuals",
          label: "Foto",
          origin: "uploaded_asset",
          source: "owner",
          state: "owner_confirmed",
          value: "remote-image",
          sourceTurnId: null,
        },
      ],
    });

    expect(ledger.entries).toEqual([]);
  });

  it("rejects a safe derivation that claims owner confirmation", () => {
    const ledger = normalizeFactLedger({
      version: 1,
      entries: [
        {
          id: "forged-derivation",
          field: "mood",
          label: "Nuansa",
          origin: "safe_derivation",
          source: "assistant",
          state: "owner_confirmed",
          value: "hangat",
          sourceTurnId: null,
        },
      ],
    });

    expect(ledger.entries).toEqual([]);
  });

  it("creates an explicit omission that cannot render as a business fact", () => {
    const omission = createExplicitOmissionEntry({
      field: "visuals",
      id: "visuals-omitted",
      label: "Foto usaha",
      reason: "owner skipped",
    });

    expect(omission).toMatchObject({
      origin: "explicit_omission",
      state: "declined",
      value: null,
    });
    expect(
      getRenderableFactEntries({ version: 1, entries: [omission] }),
    ).toEqual([]);
  });

  it("marks owner-confirmed values as owner_message after evidence grounding", () => {
    const [entry] = createFactLedgerEntriesFromPatch({
      businessName: "Kopi Senja",
    });

    expect(entry?.origin).toBe("owner_message");
  });

  it("marks uploaded asset values as uploaded_asset", () => {
    const ledger = mergeFactLedger(
      createEmptyFactLedger(),
      [
        {
          id: "logo",
          field: "logo",
          label: "Logo",
          origin: "uploaded_asset",
          value: "asset-1",
          state: "owner_confirmed",
          source: "uploaded_asset",
          sourceTurnId: null,
        },
      ],
      { ownerTexts: [] },
    );

    expect(ledger.entries[0]?.origin).toBe("uploaded_asset");
  });

  it("keeps a safe derivation distinct from owner-confirmed facts", () => {
    const ledger = mergeFactLedger(
      createEmptyFactLedger(),
      [
        {
          id: "mood",
          field: "mood",
          label: "Nuansa",
          origin: "safe_derivation",
          value: "hangat",
          state: "ai_suggestion",
          source: "assistant",
          sourceTurnId: "turn-1",
        },
      ],
      { ownerTexts: [] },
    );

    expect(ledger.entries[0]).toMatchObject({
      origin: "safe_derivation",
      state: "ai_suggestion",
    });
    expect(getRenderableFactEntries(ledger)).toHaveLength(0);
  });

  it("does not accept another owner's text as evidence", () => {
    const ledger = mergeFactLedger(
      createEmptyFactLedger(),
      [
        {
          id: "address",
          field: "address",
          label: "Alamat",
          origin: "owner_message",
          value: "Jl. Milik Toko Lain No. 1",
          state: "owner_confirmed",
          source: "owner",
          sourceTurnId: "turn-1",
        },
      ],
      { ownerTexts: ["Saya punya Kopi Senja di Jakarta Selatan."] },
    );

    expect(ledger.entries[0]).toMatchObject({
      origin: "safe_derivation",
      state: "ai_suggestion",
    });
  });

  it("preserves explicit omissions when later patches contain no replacement", () => {
    const omission = createExplicitOmissionEntry({
      field: "hours",
      id: "hours-omitted",
      label: "Jam buka",
      reason: "owner skipped",
    });
    const ledger = mergeFactLedger({ version: 1, entries: [omission] }, [], {
      ownerTexts: [],
    });

    expect(ledger.entries).toEqual([omission]);
  });

  it("keeps design-only values out of the renderable fact collection", () => {
    const ledger = normalizeFactLedger({
      version: 1,
      entries: [
        {
          id: "composition",
          field: "composition",
          label: "Komposisi",
          origin: "design_only",
          source: "system",
          state: "owner_confirmed",
          value: "editorial",
          sourceTurnId: null,
        },
      ],
    });

    expect(ledger.entries[0]?.origin).toBe("design_only");
    expect(getRenderableFactEntries(ledger)).toHaveLength(0);
  });

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
