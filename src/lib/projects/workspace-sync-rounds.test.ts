import { describe, expect, it } from "vitest";

import {
  getWorkspaceComposerState,
  isFreshWorkspaceCard,
} from "./workspace-sync";

describe("workspace-sync questions variant", () => {
  const batch = {
    type: "questions" as const,
    questions: [
      {
        id: "a",
        question: "A?",
        options: [
          { label: "x", description: "" },
          { label: "y", description: "" },
        ],
      },
      {
        id: "b",
        question: "B?",
        options: [
          { label: "x", description: "" },
          { label: "y", description: "" },
        ],
      },
    ],
  };

  it("treats a questions card as composer state question", () => {
    const state = getWorkspaceComposerState({
      buildComplete: false,
      card: batch,
      held: false,
      postBuildChatOpen: false,
    });
    expect(state).toBe("question");
  });

  it("isFreshWorkspaceCard detects changed id set", () => {
    const prev = {
      type: "questions" as const,
      questions: [
        {
          id: "a",
          question: "A?",
          options: [
            { label: "x", description: "" },
            { label: "y", description: "" },
          ],
        },
      ],
    };
    expect(isFreshWorkspaceCard(batch, prev)).toBe(true);
    expect(isFreshWorkspaceCard(batch, batch)).toBe(false);
  });
});
