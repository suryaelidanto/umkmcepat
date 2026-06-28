import { describe, expect, it } from "vitest";

import { createInitialBrief, parseProjectBrief } from "./brief";
import { normalizeWorkspaceTurn } from "./brief-flow";

describe("normalizeWorkspaceTurn", () => {
  it("never throws and falls back when the tool input is empty", () => {
    const brief = createInitialBrief("jualan katering sekolah");
    const turn = normalizeWorkspaceTurn(undefined, brief);

    expect(turn.workspaceCard.type).toBe("question");
    expect(turn.projectTitle).toBe("");
  });

  it("ignores empty brief fields instead of failing the turn (regression: offer:'' )", () => {
    const brief = createInitialBrief("jualan katering sekolah");
    const turn = normalizeWorkspaceTurn(
      {
        briefPatch: { businessType: "Katering sekolah", offer: "" },
        projectTitle: "Katering Sekolah",
        workspaceCard: {
          type: "question",
          question: {
            id: "offer",
            question: "Jenis katering apa yang ingin kamu tawarkan?",
            options: [
              { label: "Nasi kotak harian", description: "Dikirim tiap hari." },
              { label: "Snack box", description: "Untuk jam istirahat." },
              { label: "Catering bulanan", description: "Langganan hemat." },
            ],
          },
        },
      },
      brief,
    );

    expect(turn.brief.businessType).toBe("Katering sekolah");
    expect(turn.brief.offer).toBe("");
    expect(turn.projectTitle).toBe("Katering Sekolah");
    expect(turn.workspaceCard.type).toBe("question");
  });

  it("drops a malformed question and falls back to a valid single question", () => {
    const brief = parseProjectBrief(
      { businessType: "Katering", targetCustomer: "Anak sekolah" },
      "jualan katering",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "question",
          question: {
            id: "offer",
            question: "y",
            options: [{ label: "", description: "" }],
          },
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.options.length).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it("migrates a legacy questions[] card to a single question", () => {
    const brief = createInitialBrief("jualan katering");
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "questions",
          questions: [
            {
              id: "businessType",
              question: "Jenis usaha apa yang kamu jalankan?",
              options: [
                { label: "Katering harian", description: "Pesanan rutin." },
                { label: "Katering acara", description: "Untuk hajatan." },
                { label: "Nasi box", description: "Kemasan praktis." },
              ],
            },
          ],
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("question");
    if (turn.workspaceCard.type === "question") {
      expect(turn.workspaceCard.question.id).toBe("businessType");
    }
  });

  it("accepts a build recommendation with a flexible summary", () => {
    const brief = parseProjectBrief(
      {
        businessType: "Katering sekolah",
        offer: "Nasi kotak harian",
        targetCustomer: "Anak sekolah",
        contactOrCta: "Pesan via WhatsApp",
        stylePreference: "Cerah dan ramah",
      },
      "jualan katering",
    );
    const turn = normalizeWorkspaceTurn(
      {
        workspaceCard: {
          type: "build_recommendation",
          title: "Website katering sekolah",
          summary: [
            "Landing page katering untuk anak sekolah",
            "Pemesanan lewat WhatsApp",
          ],
        },
      },
      brief,
    );

    expect(turn.workspaceCard.type).toBe("build_recommendation");
    if (turn.workspaceCard.type === "build_recommendation") {
      expect(turn.workspaceCard.summary.length).toBeGreaterThan(0);
    }
  });
});
