import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/app-settings", () => ({
  getSettingSync: vi.fn(() => false),
}));

import { createInitialBrief } from "./brief";
import { normalizeWorkspaceTurn } from "./brief-flow";

beforeEach(() => vi.clearAllMocks());

describe("photo-disabled workspace-card gate", () => {
  it.each(["visual_direction", "style_preference"])(
    "keeps %s style choice cards",
    (id) => {
      const turn = normalizeWorkspaceTurn(
        {
          workspaceCard: {
            type: "question",
            question: {
              id,
              question: "Tampilan website yang paling cocok seperti apa?",
              answerMode: "choice",
              selectionMode: "single",
              options: [
                { label: "Hangat", description: "Akrab untuk warga." },
                { label: "Bersih", description: "Rapi dan ringan." },
                { label: "Terpercaya", description: "Tenang dan meyakinkan." },
              ],
            },
          },
        },
        createInitialBrief("buat website koperasi"),
      );

      expect(turn.workspaceCard.type).toBe("question");
      if (turn.workspaceCard.type === "question") {
        expect(turn.workspaceCard.question.options).toHaveLength(3);
      }
    },
  );

  it.each(["visuals", "visual", "media_strategy", "product_photo"])(
    "blocks %s photo questions",
    (id) => {
      const turn = normalizeWorkspaceTurn(
        {
          workspaceCard: {
            type: "question",
            question: {
              id,
              question: "Punya foto atau gambar produk?",
              answerMode: "text",
            },
          },
        },
        createInitialBrief("buat website koperasi"),
      );

      expect(turn.workspaceCard.type).toBe("none");
    },
  );
});
