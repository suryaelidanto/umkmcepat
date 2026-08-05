import { describe, expect, it } from "vitest";

import {
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
