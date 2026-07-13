import { describe, expect, it } from "vitest";

import { type WorkspaceCard } from "@/lib/projects/brief";
import {
  getBuildRecommendationHoldSignature,
  getWorkspacePreviewIssue,
  getWorkspaceComposerState,
  isBuildRecommendationHeld,
  isFreshWorkspaceCard,
  isWorkspaceBuildComplete,
  PREPARING_POLL_INTERVAL_MS,
  PREPARING_TIMEOUT_MS,
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

  it("chooses one primary workspace composer state at a time", () => {
    const card: WorkspaceCard = {
      type: "build_recommendation",
      title: "Brief sudah siap dibuild",
      summary: ["Warung fisik", "Menu klasik"],
    };

    expect(
      getWorkspaceComposerState({
        buildComplete: false,
        card,
        held: false,
        postBuildChatOpen: false,
      }),
    ).toBe("build_recommendation");
    expect(
      getWorkspaceComposerState({
        buildComplete: false,
        card,
        held: true,
        postBuildChatOpen: false,
      }),
    ).toBe("held_build_recommendation");
    expect(
      getWorkspaceComposerState({
        buildComplete: true,
        card,
        held: false,
        postBuildChatOpen: false,
      }),
    ).toBe("post_build_review");
    expect(
      getWorkspaceComposerState({
        buildComplete: true,
        card,
        hasFailedLatestAttemptWithLastGood: true,
        held: false,
        postBuildChatOpen: false,
      }),
    ).toBe("build_failed_with_last_good");
    expect(
      getWorkspaceComposerState({
        buildComplete: true,
        card,
        held: false,
        postBuildChatOpen: true,
      }),
    ).toBe("post_build_chat");
  });

  it("hides stale review cards after the website has been built", () => {
    const card: WorkspaceCard = {
      actions: [{ label: "Build sekarang", prompt: "build" }],
      summary: ["Agency", "CTA WA"],
      title: "Ringkasan Brief",
      type: "brief_review",
    };

    expect(
      getWorkspaceComposerState({
        buildComplete: true,
        card,
        held: false,
        postBuildChatOpen: false,
      }),
    ).toBe("post_build_review");
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

  it("keeps the preview loading while a successful build recovers its runtime", () => {
    expect(
      getWorkspacePreviewIssue({
        deploymentStatus: "failed",
        buildStatus: "ready",
        sourceStatus: "passed",
      }),
    ).toBeNull();
    expect(
      getWorkspacePreviewIssue({
        runtimeUserFacingState: "preview_failed",
        runtimeBuildStatus: "succeeded",
      }),
    ).toBeNull();
  });

  it("hides internal preview errors behind safe user-facing copy", () => {
    expect(
      getWorkspacePreviewIssue({
        buildStatus: "ready",
        runtimeError:
          "Error: Cannot find module './611.js'\nRequire stack:\n- .next/server/webpack-runtime.js",
        sourceStatus: "passed",
      }),
    ).toEqual({
      detail:
        "Tampilan website belum bisa dimuat. Coba muat ulang tampilan atau build ulang kalau masih gagal.",
      title: "Tampilan website belum bisa dimuat",
    });
  });

  it("maps runtime summary states to clear preview panels", () => {
    expect(
      getWorkspacePreviewIssue({
        runtimeUserFacingState: "building",
      }),
    ).toEqual({
      detail: "Tampilan website akan muncul setelah build selesai.",
      title: "Build website sedang berjalan",
    });
    expect(
      getWorkspacePreviewIssue({
        runtimeUserFacingState: "preview_starting",
      }),
    ).toBeNull();
    expect(
      getWorkspacePreviewIssue({
        runtimeUserFacingState: "build_failed_without_last_good",
      }),
    ).toEqual({
      detail:
        "Build website belum berhasil dan belum ada tampilan sebelumnya. Coba build ulang setelah brief siap.",
      title: "Build website belum selesai",
    });
  });

  it("does not hide the last good preview when a newer build failed", () => {
    expect(
      getWorkspacePreviewIssue({
        buildStatus: "failed",
        deploymentStatus: "running",
        runtimeBuildStatus: "succeeded",
        sourceStatus: "not_started",
      }),
    ).toBeNull();
    expect(
      getWorkspacePreviewIssue({
        buildStatus: "failed",
        deploymentStatus: "running",
        sourceStatus: "passed",
      }),
    ).toBeNull();
  });
});

describe("isFreshWorkspaceCard", () => {
  const questionCard = (id: string): WorkspaceCard => ({
    type: "question",
    question: {
      id,
      question: "Apa nama bisnisnya?",
      answerMode: "text",
      options: [],
      placeholder: "",
      selectionMode: "single",
      whyThisQuestionMatters: "",
    },
  });

  const buildRecommendationCard = (
    title: string,
    summary: string[],
  ): WorkspaceCard => ({
    type: "build_recommendation",
    title,
    summary,
  });

  it("treats a none card as not fresh", () => {
    expect(
      isFreshWorkspaceCard(
        { type: "none" } as WorkspaceCard,
        questionCard("nama_bisnis"),
      ),
    ).toBe(false);
  });

  it("treats a different card type as fresh", () => {
    expect(
      isFreshWorkspaceCard(
        buildRecommendationCard("Bangun sekarang", ["Ringkasan"]),
        questionCard("nama_bisnis"),
      ),
    ).toBe(true);
  });

  it("treats a question with a new id as fresh", () => {
    expect(
      isFreshWorkspaceCard(questionCard("lokasi"), questionCard("nama_bisnis")),
    ).toBe(true);
  });

  it("treats a question with the same id as not fresh", () => {
    expect(
      isFreshWorkspaceCard(
        questionCard("nama_bisnis"),
        questionCard("nama_bisnis"),
      ),
    ).toBe(false);
  });

  it("treats a build recommendation with a different signature as fresh", () => {
    expect(
      isFreshWorkspaceCard(
        buildRecommendationCard("Bangun sekarang", ["Ringkasan baru"]),
        buildRecommendationCard("Bangun sekarang", ["Ringkasan lama"]),
      ),
    ).toBe(true);
  });

  it("treats a build recommendation with the same signature as not fresh", () => {
    expect(
      isFreshWorkspaceCard(
        buildRecommendationCard("Bangun sekarang", ["Ringkasan"]),
        buildRecommendationCard("Bangun sekarang", ["Ringkasan"]),
      ),
    ).toBe(false);
  });

  it("exposes bounded poll and timeout constants", () => {
    expect(PREPARING_POLL_INTERVAL_MS).toBeGreaterThan(0);
    expect(PREPARING_TIMEOUT_MS).toBeGreaterThan(PREPARING_POLL_INTERVAL_MS);
  });
});
