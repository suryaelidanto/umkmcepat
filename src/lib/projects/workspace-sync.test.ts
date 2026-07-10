import { describe, expect, it } from "vitest";

import { type WorkspaceCard } from "@/lib/projects/brief";
import {
  getBuildRecommendationHoldSignature,
  getWorkspacePreviewIssue,
  getWorkspaceComposerState,
  hasAnsweredWorkspaceQuestion,
  hasMissingWorkspaceUiTurn,
  isBuildRecommendationHeld,
  isWorkspaceBuildComplete,
  shouldShowBuildRecommendationComposer,
  shouldRefreshWorkspaceAfterChatStatus,
  shouldUseGeneratedPreviewFrame,
  isUserVisibleAssistantText,
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

  it("does not show missing workspace UI when stored messages have the next tool card", () => {
    const card: WorkspaceCard = {
      type: "question",
      question: {
        id: "service_area",
        answerMode: "text",
        options: [],
        question: "Area mana saja yang kamu layani?",
        selectionMode: "single",
      },
    };

    expect(
      hasMissingWorkspaceUiTurn({
        card,
        mode: "discuss",
        messages: [
          {
            id: "user_1",
            role: "user",
            parts: [
              {
                type: "text",
                text: "Apa nama usaha nasi box kamu?\nJawaban: Dapur Surya Elidanto",
              },
            ],
          },
          {
            id: "workspace-tool-1",
            role: "assistant",
            parts: [
              {
                type: "tool-setWorkspaceUi",
                state: "output-available",
                toolCallId: "workspace-tool-1",
                input: {},
                output: { workspaceCard: card },
              },
            ],
          },
          {
            id: "transient_assistant",
            role: "assistant",
            parts: [{ type: "text", text: "Sebentar ya..." }],
          },
        ],
      }),
    ).toBe(false);
  });

  it("keeps an unanswered persisted card active after duplicate previous answers", () => {
    const card: WorkspaceCard = {
      type: "question",
      question: {
        id: "next_section",
        answerMode: "choice",
        options: [],
        question: "Selain paket, bagian apa lagi yang kamu mau?",
        selectionMode: "multiple",
      },
    };

    expect(
      hasAnsweredWorkspaceQuestion({
        card,
        mode: "discuss",
        messages: [
          {
            id: "user_1",
            role: "user",
            parts: [
              {
                type: "text",
                text: "Turnamen masih jalan?\nJawaban: Masih jalan rutin",
              },
            ],
          },
          {
            id: "user_2",
            role: "user",
            parts: [
              {
                type: "text",
                text: "Turnamen masih jalan?\nJawaban: Masih jalan rutin",
              },
            ],
          },
          {
            id: "assistant_1",
            role: "assistant",
            parts: [{ type: "text", text: "Oke, aku lanjut tanya." }],
          },
        ],
      }),
    ).toBe(false);
  });

  it("ignores AI transport diagnostics as assistant content", () => {
    const card: WorkspaceCard = {
      type: "question",
      question: {
        id: "opening_hours",
        answerMode: "text",
        options: [],
        question: "Neon Pad buka jam berapa?",
        selectionMode: "single",
      },
    };

    expect(
      isUserVisibleAssistantText(
        '[Provider transport error: {"type":"server_error"}]',
      ),
    ).toBe(false);
    expect(
      hasMissingWorkspaceUiTurn({
        card,
        mode: "discuss",
        messages: [
          {
            id: "user_1",
            role: "user",
            parts: [
              {
                type: "text",
                text: "Neon Pad buka jam berapa?\nJawaban: Senin-Jumat 8-5",
              },
            ],
          },
          {
            id: "assistant_error",
            role: "assistant",
            parts: [
              {
                type: "text",
                text: '[Provider transport error: {"type":"server_error"}]',
              },
            ],
          },
        ],
      }),
    ).toBe(false);
  });

  it("shows missing workspace UI when first-turn text has no tool card", () => {
    expect(
      hasMissingWorkspaceUiTurn({
        card: { type: "none" },
        mode: "discuss",
        messages: [
          {
            id: "user_1",
            role: "user",
            parts: [{ type: "text", text: "Bikin rental PS Neon Pad" }],
          },
          {
            id: "assistant_1",
            role: "assistant",
            parts: [{ type: "text", text: "Nomor WA aktifnya apa?" }],
          },
        ],
      }),
    ).toBe(true);
  });

  it("shows missing workspace UI only when the current answered card has no newer tool", () => {
    const card: WorkspaceCard = {
      type: "question",
      question: {
        id: "business_name",
        answerMode: "text",
        options: [],
        question: "Apa nama usaha nasi box kamu?",
        selectionMode: "single",
      },
    };

    expect(
      hasMissingWorkspaceUiTurn({
        card,
        mode: "discuss",
        messages: [
          {
            id: "user_1",
            role: "user",
            parts: [
              {
                type: "text",
                text: "Apa nama usaha nasi box kamu?\nJawaban: Dapur Surya Elidanto",
              },
            ],
          },
          {
            id: "assistant_1",
            role: "assistant",
            parts: [{ type: "text", text: "Oke aku catat." }],
          },
        ],
      }),
    ).toBe(true);
  });

  it("shows missing workspace UI when a stale recommendation has no current tool output", () => {
    expect(
      hasMissingWorkspaceUiTurn({
        card: {
          type: "build_recommendation",
          title: "Brief lama siap dibangun",
          summary: ["Ringkasan lama"],
        },
        mode: "discuss",
        messages: [
          {
            id: "user_1",
            role: "user",
            parts: [{ type: "text", text: "Aku mau ubah targetnya" }],
          },
          {
            id: "assistant_1",
            role: "assistant",
            parts: [{ type: "text", text: "Oke, target barunya siapa?" }],
          },
        ],
      }),
    ).toBe(true);
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
