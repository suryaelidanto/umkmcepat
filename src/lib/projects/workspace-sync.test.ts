import { describe, expect, it } from "vitest";

import { type WorkspaceCard } from "@/lib/projects/brief";
import {
  getBuildRecommendationHoldSignature,
  getWorkspacePreviewIssue,
  isBuildRecommendationHeld,
  isWorkspaceBuildComplete,
  shouldShowBuildRecommendationComposer,
  shouldRefreshWorkspaceAfterChatStatus,
  shouldUseGeneratedPreviewFrame,
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

  it("does not show the build recommendation composer after a build has completed", () => {
    const card: WorkspaceCard = {
      type: "build_recommendation",
      title: "Brief sudah siap dibuild",
      summary: ["Warung fisik", "Menu klasik"],
    };

    expect(
      isWorkspaceBuildComplete({
        buildStatus: "ready",
        runtimeBuildStatus: "succeeded",
        sourceStatus: "passed",
      }),
    ).toBe(true);
    expect(
      shouldShowBuildRecommendationComposer({
        buildComplete: true,
        card,
        held: false,
      }),
    ).toBe(false);
    expect(
      shouldShowBuildRecommendationComposer({
        buildComplete: false,
        card,
        held: false,
      }),
    ).toBe(true);
  });

  it("uses the generated iframe after any successful build status", () => {
    expect(
      shouldUseGeneratedPreviewFrame({
        buildComplete: true,
        sourceStatus: "not_started",
      }),
    ).toBe(true);
    expect(
      shouldUseGeneratedPreviewFrame({
        buildComplete: false,
        sourceStatus: "passed",
      }),
    ).toBe(true);
    expect(
      shouldUseGeneratedPreviewFrame({
        buildComplete: false,
        sourceStatus: "not_started",
      }),
    ).toBe(false);
  });

  it("surfaces actionable website view issues for failed runtime states", () => {
    expect(
      getWorkspacePreviewIssue({
        deploymentStatus: "failed",
        buildStatus: "ready",
        sourceStatus: "passed",
      }),
    ).toEqual({
      detail:
        "Tampilan website gagal dimuat. Coba muat ulang tampilan atau build ulang kalau masih gagal.",
      title: "Tampilan website gagal dimuat",
    });
    expect(
      getWorkspacePreviewIssue({
        deploymentStatus: "running",
        buildStatus: "ready",
        sourceStatus: "passed",
      }),
    ).toBeNull();
  });
});
