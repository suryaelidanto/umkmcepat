import { describe, expect, it } from "vitest";

import {
  alignAssistantTextWithCard,
  nextPartialWorkspaceCardFromToolJson,
  presentWorkspaceCardInputSchema,
} from "./discuss-tool";

// Regression: the combo model (default-combo) double-encodes briefPatch and
// workspaceCard as JSON strings instead of nested objects, e.g.
//   { "briefPatch": "{\"businessType\":\"retail\"}", "workspaceCard": "{\"type\":\"q..." }
// The strict z.object() schema rejected these (AI_TypeValidationError), and every
// repair attempt churned on the same bad shape. The schema must accept both shapes.
describe("presentWorkspaceCard inputSchema tolerates stringified JSON fields", () => {
  const parse = (input: unknown) =>
    presentWorkspaceCardInputSchema.safeParse(input);

  it("accepts briefPatch and workspaceCard as nested objects (the happy path)", () => {
    const result = parse({
      assistantText: "Aku siap bantu. Nama usahanya apa?",
      projectTitle: "Surya Thrift",
      briefPatch: { businessName: "Surya Thrift", businessType: "retail" },
      workspaceCard: {
        type: "question",
        question: {
          id: "business_name",
          question: "Nama brand thriftnya apa?",
          options: [
            { label: "Surya Thrift", description: "Pakai nama ini." },
            { label: "Lainnya", description: "Tulis sendiri." },
          ],
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts briefPatch and workspaceCard as JSON strings (the combo model failure mode)", () => {
    const result = parse({
      assistantText: "Aku siap bantu. Nama usahanya apa?",
      projectTitle: "Jual Beli Baju Thrifting",
      briefPatch: JSON.stringify({
        businessName: "Surya Thrift",
        businessType: "retail",
      }),
      workspaceCard: JSON.stringify({
        type: "question",
        question: {
          id: "business_name",
          question: "Nama brand thriftnya apa?",
          options: [
            { label: "Surya Thrift", description: "Pakai nama ini." },
            { label: "Lainnya", description: "Tulis sendiri." },
          ],
        },
      }),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.briefPatch).toMatchObject({
        businessName: "Surya Thrift",
        businessType: "retail",
      });
      expect(result.data.workspaceCard.type).toBe("question");
    }
  });

  it("still rejects a briefPatch string that is not parseable JSON", () => {
    const result = parse({
      assistantText: "Aku siap bantu.",
      briefPatch: "not-json",
      workspaceCard: { type: "none" },
    });

    // Non-object, non-JSON-string briefPatch must not silently pass through.
    expect(result.success).toBe(false);
  });

  it("accepts assistantText for forced-tool chat prose", () => {
    const result = parse({
      assistantText: "Oke, siap bantu bikin halaman jualan sayur!",
      workspaceCard: {
        type: "question",
        question: {
          id: "business_name",
          question: "Nama usahanya apa?",
          answerMode: "text",
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assistantText).toBe(
        "Oke, siap bantu bikin halaman jualan sayur!",
      );
    }
  });

  it("rejects a tool call without user-visible assistantText", () => {
    const result = parse({
      workspaceCard: { type: "none" },
    });

    expect(result.success).toBe(false);
  });
});

describe("nextAssistantTextDeltaFromPartialToolJson", () => {
  it("emits only newly completed assistantText characters across partial JSON", async () => {
    const { nextAssistantTextDeltaFromPartialToolJson } =
      await import("./discuss-tool");
    let seen = "";

    const first = await nextAssistantTextDeltaFromPartialToolJson(
      '{"assistantText":"Oke, siap',
      seen,
    );
    expect(first.delta).toBe("Oke, siap");
    seen = first.seenText;

    const second = await nextAssistantTextDeltaFromPartialToolJson(
      '{"assistantText":"Oke, siap bantu","workspaceCard":{"type":"ques',
      seen,
    );
    expect(second.delta).toBe(" bantu");
    seen = second.seenText;

    const third = await nextAssistantTextDeltaFromPartialToolJson(
      '{"assistantText":"Oke, siap bantu","workspaceCard":{"type":"question"}}',
      seen,
    );
    expect(third.delta).toBe("");
    expect(third.seenText).toBe("Oke, siap bantu");
  });
});

describe("nextPartialWorkspaceCardFromToolJson", () => {
  it("returns the partial workspaceCard object when parseable", async () => {
    const card = await nextPartialWorkspaceCardFromToolJson(
      '{"assistantText":"Oke","workspaceCard":{"type":"question","question":{"id":"q1"}}}',
    );
    expect(card).toEqual({
      type: "question",
      question: { id: "q1" },
    });
  });

  it("returns null when workspaceCard is not yet parseable", async () => {
    expect(
      await nextPartialWorkspaceCardFromToolJson('{"assistantText":"Oke"}'),
    ).toBeNull();
    expect(await nextPartialWorkspaceCardFromToolJson("")).toBeNull();
  });
});

describe("alignAssistantTextWithCard", () => {
  const cardFor = (question: string) => ({
    type: "question" as const,
    question: {
      id: "price_range",
      question,
      answerMode: "text" as const,
      selectionMode: "single" as const,
      required: false,
      options: [],
    },
  });

  it("replaces a chat question that contradicts the card", () => {
    // Observed live: the model asked about visual style in the message while
    // the card asked about price, so the owner answered a question they were
    // never shown.
    const aligned = alignAssistantTextWithCard(
      "Targetnya sudah jelas; karena foto belum tersedia, kamu mau tampilan tipografi pedas tanpa foto atau ilustrasi makanan?",
      cardFor("Kisaran harga menu Seblak Surya biasanya berapa?"),
    );

    expect(aligned).toBe(
      "Targetnya sudah jelas. Kisaran harga menu Seblak Surya biasanya berapa?",
    );
  });

  it("keeps the model's own wording when it asks the same question", () => {
    // Rewriting every paraphrase would flatten warmer, more specific phrasing;
    // only a materially different question is replaced.
    const text =
      "Sip, gaya pedasnya pas; nomor WhatsApp yang dipakai pelanggan untuk memesan berapa?";

    expect(
      alignAssistantTextWithCard(
        text,
        cardFor("Nomor WhatsApp pemesanan Seblak Surya berapa?"),
      ),
    ).toBe(text);
  });

  it("keeps a paraphrase that adds concrete options", () => {
    const text =
      "Nomor WhatsApp sudah siap; saat membuka halaman, pelanggan paling ingin langsung pesan atau melihat menu dulu?";

    expect(
      alignAssistantTextWithCard(
        text,
        cardFor("Saat membuka halaman, pelanggan paling ingin melakukan apa?"),
      ),
    ).toBe(text);
  });

  it("leaves a message that already asks the card's question", () => {
    const text =
      "Sip, areanya sudah dicatat; Kisaran harga menu Seblak Surya biasanya berapa?";

    expect(
      alignAssistantTextWithCard(
        text,
        cardFor("Kisaran harga menu Seblak Surya biasanya berapa?"),
      ),
    ).toBe(text);
  });

  it("falls back to the card question when there is no acknowledgement", () => {
    expect(
      alignAssistantTextWithCard(
        "Mau pakai foto atau ilustrasi?",
        cardFor("Jam bukanya kapan?"),
      ),
    ).toBe("Jam bukanya kapan?");
  });

  it("keeps a plain acknowledgement untouched", () => {
    expect(
      alignAssistantTextWithCard(
        "Oke, sudah aku catat.",
        cardFor("Jam bukanya kapan?"),
      ),
    ).toBe("Oke, sudah aku catat. Jam bukanya kapan?");
  });

  it("drops a question the build card cannot answer", () => {
    // Observed live: the message asked the owner to pick a visual style while
    // the card underneath already declared the site ready to build.
    expect(
      alignAssistantTextWithCard(
        "Kisaran harganya sudah dicatat; kamu pilih tampilan tipografi pedas atau ilustrasi makanan tanpa foto?",
        {
          type: "build_recommendation",
          title: "Website siap dibuat",
          summary: [],
        },
      ),
    ).toBe("Kisaran harganya sudah dicatat.");
  });

  it("keeps a build card message that asks nothing", () => {
    const text = "Semua sudah lengkap, tinggal buat websitenya.";

    expect(
      alignAssistantTextWithCard(text, {
        type: "build_recommendation",
        title: "Website siap dibuat",
        summary: [],
      }),
    ).toBe(text);
  });

  it("falls back to a neutral line when only a question remains", () => {
    expect(
      alignAssistantTextWithCard("Mau pakai foto atau ilustrasi?", {
        type: "build_recommendation",
        title: "Website siap dibuat",
        summary: [],
      }),
    ).toBe("Semua yang penting sudah aku catat.");
  });

  it("aligns to an image upload card's own question", () => {
    expect(
      alignAssistantTextWithCard("Oke, dicatat; jam bukanya kapan?", {
        type: "image_upload",
        imageUpload: {
          id: "logo",
          question: "Punya foto produk yang mau dipakai?",
        },
      }),
    ).toBe("Oke, dicatat. Punya foto produk yang mau dipakai?");
  });
});
