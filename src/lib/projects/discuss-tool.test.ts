import { describe, expect, it } from "vitest";

import { presentWorkspaceCardInputSchema } from "./discuss-tool";

// Regression: the combo model (umkmcepat-combo) double-encodes briefPatch and
// workspaceCard as JSON strings instead of nested objects, e.g.
//   { "briefPatch": "{\"businessType\":\"retail\"}", "workspaceCard": "{\"type\":\"q..." }
// The strict z.object() schema rejected these (AI_TypeValidationError), and every
// repair attempt churned on the same bad shape. The schema must accept both shapes.
describe("presentWorkspaceCard inputSchema tolerates stringified JSON fields", () => {
  const parse = (input: unknown) =>
    presentWorkspaceCardInputSchema.safeParse(input);

  it("accepts briefPatch and workspaceCard as nested objects (the happy path)", () => {
    const result = parse({
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
      briefPatch: "not-json",
      workspaceCard: { type: "none" },
    });

    // Non-object, non-JSON-string briefPatch must not silently pass through.
    expect(result.success).toBe(false);
  });
});
