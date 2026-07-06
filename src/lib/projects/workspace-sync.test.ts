import { describe, expect, it } from "vitest";

import { type WorkspaceCard } from "@/lib/projects/brief";
import {
  getBuildRecommendationHoldSignature,
  isBuildRecommendationHeld,
  shouldRefreshWorkspaceAfterChatStatus,
} from "@/lib/projects/workspace-sync";

describe("workspace chat sync", () => {
  it("refreshes workspace state when a chat stream finishes", () => {
    expect(shouldRefreshWorkspaceAfterChatStatus("streaming", "ready")).toBe(
      true,
    );
    expect(shouldRefreshWorkspaceAfterChatStatus("submitted", "ready")).toBe(
      true,
    );
  });

  it("refreshes workspace state when a chat stream errors after submit", () => {
    expect(shouldRefreshWorkspaceAfterChatStatus("streaming", "error")).toBe(
      true,
    );
  });

  it("does not refresh for idle-to-idle or start transitions", () => {
    expect(shouldRefreshWorkspaceAfterChatStatus("ready", "ready")).toBe(false);
    expect(shouldRefreshWorkspaceAfterChatStatus("ready", "submitted")).toBe(
      false,
    );
  });

  it("holds a build recommendation only while the recommendation content matches", () => {
    const card: WorkspaceCard = {
      type: "build_recommendation",
      title: "Brief sudah siap dibuild",
      summary: ["Warung fisik", "Menu klasik", "WA + Maps"],
    };
    const changedCard: WorkspaceCard = {
      ...card,
      summary: [...card.summary, "Nuansa hangat"],
    };
    const signature = getBuildRecommendationHoldSignature(card);

    expect(isBuildRecommendationHeld(card, signature)).toBe(true);
    expect(isBuildRecommendationHeld(changedCard, signature)).toBe(false);
  });
});
