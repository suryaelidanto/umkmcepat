import { describe, expect, it } from "vitest";

import {
  createUpdateIntentQuestion,
  ensureUpdatePreflightCard,
  getDiscussPreflightInstruction,
  resolvePreflightBuildReadiness,
} from "./discuss-preflight";

describe("discuss preflight", () => {
  it("only blocks build readiness when an update still needs clarification", () => {
    expect(
      resolvePreflightBuildReadiness({
        hasPendingUpdate: false,
        preflight: "update",
        readyForBuild: true,
      }),
    ).toBe(false);
    expect(
      resolvePreflightBuildReadiness({
        hasPendingUpdate: true,
        preflight: "update",
        readyForBuild: true,
      }),
    ).toBe(true);
    expect(
      resolvePreflightBuildReadiness({
        hasPendingUpdate: false,
        preflight: "build",
        readyForBuild: true,
      }),
    ).toBe(true);
  });

  it("provides a single-select update intent question with a custom path", () => {
    const card = createUpdateIntentQuestion();

    expect(card.type).toBe("question");
    expect(card.question.answerMode).toBe("choice");
    expect(card.question.selectionMode).toBe("single");
    expect(card.question.options.length).toBeGreaterThanOrEqual(4);
    expect(
      card.question.options.every((option) => option.label.length > 0),
    ).toBe(true);
  });

  it("replaces non-question output with the update intent question unless a pending request can be recommended", () => {
    expect(ensureUpdatePreflightCard({ type: "none" }).type).toBe("question");
    expect(
      ensureUpdatePreflightCard({
        summary: [],
        title: "Update",
        type: "build_recommendation",
      }).type,
    ).toBe("question");
    expect(
      ensureUpdatePreflightCard(
        {
          summary: [],
          title: "Update",
          type: "build_recommendation",
        },
        { allowRecommendation: true },
      ).type,
    ).toBe("build_recommendation");
  });

  it("has a distinct instruction for each preflight direction", () => {
    const build = getDiscussPreflightInstruction("build");
    const update = getDiscussPreflightInstruction("update");

    expect(build).not.toBe(update);
    expect(build.length).toBeGreaterThan(0);
    expect(update.length).toBeGreaterThan(0);
  });
});
