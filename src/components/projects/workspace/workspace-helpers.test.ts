import { describe, expect, it } from "vitest";

import {
  MAX_CHAT_BYTES,
  canStartBuild,
  canStartBuildFromBrief,
  filterDiscussionMessagesWithWorkspaceUi,
  resolveBuildAction,
  resolveBuildRequestMode,
  resolvePendingEditInstruction,
  resolvePrimaryComposerIntent,
  sanitizeWorkspaceCard,
} from "./workspace-helpers";

describe("workspace-helpers", () => {
  it("verifies MAX_CHAT_BYTES is 16KiB", () => {
    expect(MAX_CHAT_BYTES).toBe(16384);
  });

  it("handles canStartBuild validation", () => {
    expect(canStartBuild(null)).toBe(false);
    expect(canStartBuild(undefined)).toBe(false);
    expect(canStartBuild({ type: "none" })).toBe(false);
    expect(
      canStartBuild({
        type: "build_recommendation",
        title: "Test",
        summary: [],
      }),
    ).toBe(false);
    expect(
      canStartBuild({
        type: "build_recommendation",
        title: "Test",
        summary: [],
        handoffId: "h1",
        reviewHash: "0".repeat(64),
      }),
    ).toBe(true);
  });

  it("handles canStartBuildFromBrief", () => {
    expect(canStartBuildFromBrief(null)).toBe(false);
    expect(canStartBuildFromBrief(undefined)).toBe(false);
    expect(canStartBuildFromBrief({} as never)).toBe(true);
  });

  it("resolves build action and mode correctly", () => {
    expect(
      resolveBuildAction({
        buildComplete: true,
        buildStatus: "ready",
        hasPendingChatEdit: false,
        hasPostBuildUpdate: true,
      }),
    ).toBe("edit");
    expect(
      resolveBuildAction({
        buildComplete: false,
        buildStatus: "failed",
        hasPendingChatEdit: false,
        hasPostBuildUpdate: false,
      }),
    ).toBe("generate");
    expect(resolveBuildRequestMode("failed")).toBe("retry_build");
    expect(resolveBuildRequestMode("ready")).toBe("first_generate");
  });

  it("resolves primary composer intent correctly", () => {
    expect(
      resolvePrimaryComposerIntent({
        buildComplete: true,
        hasActionableRecommendation: false,
        hasDraft: false,
      }),
    ).toBe("prepare_update");
    expect(
      resolvePrimaryComposerIntent({
        buildComplete: false,
        hasActionableRecommendation: false,
        hasDraft: false,
      }),
    ).toBe("prepare_build");
    expect(
      resolvePrimaryComposerIntent({
        buildComplete: true,
        hasActionableRecommendation: true,
        hasDraft: false,
      }),
    ).toBeNull();
  });

  it("resolves pending edit instructions", () => {
    expect(resolvePendingEditInstruction("current", "oke")).toBe("current");
    expect(
      resolvePendingEditInstruction("current", "ubah tombol jadi biru"),
    ).toBe("ubah tombol jadi biru");
  });

  it("sanitizes workspace card", () => {
    expect(
      sanitizeWorkspaceCard({
        type: "build_recommendation",
        title: "Test",
        summary: [],
      }),
    ).toEqual({ type: "none" });
  });

  it("filters discussion messages when enabled", () => {
    const messages = [
      {
        id: "1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Halo" }],
      },
      {
        id: "2",
        role: "assistant" as const,
        parts: [
          { type: "text" as const, text: "Halo, ada yang bisa dibantu?" },
        ],
      },
    ];
    expect(
      filterDiscussionMessagesWithWorkspaceUi(messages, false),
    ).toHaveLength(2);
    expect(
      filterDiscussionMessagesWithWorkspaceUi(messages, true),
    ).toHaveLength(2);
  });
});
