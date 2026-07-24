import { type UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import { DISCUSS_CARD_SERVER_DEADLINE_MS } from "@/lib/ai-timeouts";
import { type WorkspaceCard } from "@/lib/projects/brief";
import {
  getBuildRecommendationHoldSignature,
  getWorkspacePreviewIssue,
  getWorkspaceComposerState,
  hasAnsweredWorkspaceQuestion,
  isBuildRecommendationConsumed,
  isBuildRecommendationHeld,
  isFreshWorkspaceCard,
  isWorkspaceBuildComplete,
  messagesEqualForRender,
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
        card: { type: "none" },
        held: false,
        postBuildChatOpen: true,
      }),
    ).toBe("post_build_chat");
    expect(
      getWorkspaceComposerState({
        buildComplete: true,
        card,
        held: true,
        postBuildChatOpen: true,
      }),
    ).toBe("held_build_recommendation");
    expect(
      getWorkspaceComposerState({
        buildComplete: true,
        card,
        held: false,
        postBuildChatOpen: true,
      }),
    ).toBe("build_recommendation");
  });

  it("hides stale build_recommendation cards after the website has been built", () => {
    const card: WorkspaceCard = {
      summary: ["Agency", "CTA WA"],
      title: "Ringkasan Brief",
      type: "build_recommendation",
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

  it("never resurfaces a build_recommendation signature that was already used to start a build", () => {
    const card: WorkspaceCard = {
      summary: ["Warung fisik", "Menu klasik"],
      title: "Brief sudah siap dibuild",
      type: "build_recommendation",
    };
    const consumed = new Set([getBuildRecommendationHoldSignature(card)]);

    // helper
    expect(isBuildRecommendationConsumed(card, consumed)).toBe(true);
    expect(isBuildRecommendationConsumed(card, new Set())).toBe(false);
    expect(isBuildRecommendationConsumed({ type: "none" }, consumed)).toBe(
      false,
    );

    // pre-build path: card was a rancangan, got consumed → falls back to free_chat
    expect(
      getWorkspaceComposerState({
        buildComplete: false,
        card,
        consumedSignatures: consumed,
        held: false,
        postBuildChatOpen: false,
      }),
    ).toBe("free_chat");

    // post-build with chat open: card would normally be build_recommendation,
    // but signature was consumed → falls back to post_build_chat
    expect(
      getWorkspaceComposerState({
        buildComplete: true,
        card,
        consumedSignatures: consumed,
        held: false,
        postBuildChatOpen: true,
      }),
    ).toBe("post_build_chat");

    // held branch is suppressed too (held != effective when consumed)
    expect(
      getWorkspaceComposerState({
        buildComplete: true,
        card,
        consumedSignatures: consumed,
        held: true,
        postBuildChatOpen: true,
      }),
    ).toBe("post_build_chat");
    expect(
      getWorkspaceComposerState({
        buildComplete: false,
        card,
        consumedSignatures: consumed,
        held: true,
        postBuildChatOpen: false,
      }),
    ).toBe("free_chat");
  });

  it("still allows a brand-new build_recommendation signature post-build", () => {
    const oldCard: WorkspaceCard = {
      summary: ["Lama"],
      title: "Rancangan lama",
      type: "build_recommendation",
    };
    const freshCard: WorkspaceCard = {
      summary: ["Baru"],
      title: "Rancangan baru",
      type: "build_recommendation",
    };
    const consumed = new Set([getBuildRecommendationHoldSignature(oldCard)]);

    expect(
      getWorkspaceComposerState({
        buildComplete: true,
        card: freshCard,
        consumedSignatures: consumed,
        held: false,
        postBuildChatOpen: true,
      }),
    ).toBe("build_recommendation");
  });

  it("accepts an iterable of signatures for consumedSignatures", () => {
    const card: WorkspaceCard = {
      summary: ["X"],
      title: "Y",
      type: "build_recommendation",
    };
    const signature = getBuildRecommendationHoldSignature(card);

    expect(
      getWorkspaceComposerState({
        buildComplete: false,
        card,
        consumedSignatures: [signature],
        held: false,
        postBuildChatOpen: false,
      }),
    ).toBe("free_chat");
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
        "Build website belum berhasil dan belum ada tampilan sebelumnya. Tekan Build ulang untuk mencoba lagi.",
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

  it("ensures the client-side poll timeout exceeds the server-side worst case AI deadline, preventing false-positive timeouts under slow but successful LLM generation", () => {
    expect(PREPARING_TIMEOUT_MS).toBeGreaterThan(
      DISCUSS_CARD_SERVER_DEADLINE_MS,
    );
  });
});

describe("hasAnsweredWorkspaceQuestion", () => {
  const questionCard: WorkspaceCard = {
    type: "question",
    question: {
      id: "business_hours",
      question: "Jam berapa biasanya buka?",
      options: [
        { label: "Setiap hari", description: "09:00 - 22:00" },
        { label: "Senin - Jumat", description: "09:00 - 18:00" },
      ],
    },
  };

  function userMessage(text: string): UIMessage {
    return {
      id: "msg-1",
      role: "user",
      parts: [{ type: "text", text }],
    };
  }

  it("returns true once the user answers the exact question shown on the stored card", () => {
    const messages = [
      userMessage(
        "Jam berapa biasanya buka?\nJawaban: Setiap hari (09:00 - 22:00)",
      ),
    ];

    expect(
      hasAnsweredWorkspaceQuestion({
        card: questionCard,
        messages,
        mode: "discuss",
      }),
    ).toBe(true);
  });

  it("returns false once the site is built and the stored card is 'none' — the post-build 'waiting for next question' trap can never engage, since there is no question left to answer", () => {
    const messages = [
      userMessage("ganti varian warna dong\nJawaban: Dark Espresso"),
    ];

    expect(
      hasAnsweredWorkspaceQuestion({
        card: { type: "none" },
        messages,
        mode: "discuss",
      }),
    ).toBe(false);
  });
});

describe("messagesEqualForRender", () => {
  function userMsg(id: string, text: string): UIMessage {
    return { id, role: "user", parts: [{ type: "text", text }] };
  }

  function assistantMsg(
    id: string,
    opts: {
      text?: string;
      toolCallId?: string;
      toolState?: string;
      toolOutput?: unknown;
    } = {},
  ): UIMessage {
    const parts: UIMessage["parts"] = [];
    if (opts.text !== undefined) {
      parts.push({ type: "text", text: opts.text });
    }
    if (opts.toolCallId) {
      parts.push({
        type: "tool-presentWorkspaceCard",
        toolCallId: opts.toolCallId,
        state: opts.toolState ?? "output-available",
        input: {},
        output: opts.toolOutput ?? { workspaceCard: { type: "none" } },
      } as UIMessage["parts"][number]);
    }
    return { id, role: "assistant", parts };
  }

  it("treats the same array as equal (lets reloadLatestChat skip a no-op replace)", () => {
    const a = [
      userMsg("u1", "Halo"),
      assistantMsg("a1", { text: "Halo balik" }),
    ];
    expect(messagesEqualForRender(a, a)).toBe(true);
    expect(messagesEqualForRender(a, [...a])).toBe(true);
  });

  it("returns false when the last assistant text differs (stream grew)", () => {
    const current = [assistantMsg("a1", { text: "Ha" })];
    const incoming = [assistantMsg("a1", { text: "Halo balik!" })];
    expect(messagesEqualForRender(current, incoming)).toBe(false);
  });

  it("returns false when the server has an extra message (turn persisted a reply)", () => {
    const current = [userMsg("u1", "Halo")];
    const incoming = [
      userMsg("u1", "Halo"),
      assistantMsg("a1", { text: "balik" }),
    ];
    expect(messagesEqualForRender(current, incoming)).toBe(false);
  });

  it("returns false when ids or roles mismatch at the same index", () => {
    const current = [userMsg("u1", "Halo")];
    const incoming = [userMsg("u2", "Halo")];
    expect(messagesEqualForRender(current, incoming)).toBe(false);
  });

  it("returns false when the tool-card part identity differs (new card arrived)", () => {
    const current = [
      assistantMsg("a1", {
        text: "x",
        toolCallId: "t1",
        toolState: "input-available",
      }),
    ];
    const incoming = [
      assistantMsg("a1", {
        text: "x",
        toolCallId: "t1",
        toolState: "output-available",
      }),
    ];
    expect(messagesEqualForRender(current, incoming)).toBe(false);
  });

  it("returns true when only non-render-affecting fields change (metadata) — no re-key", () => {
    const current = [assistantMsg("a1", { text: "x", toolCallId: "t1" })];
    const incoming = [
      {
        ...assistantMsg("a1", { text: "x", toolCallId: "t1" }),
        metadata: { ts: 1 },
      },
    ];
    expect(messagesEqualForRender(current, incoming)).toBe(true);
  });
});
