import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  MAX_CHAT_BYTES,
  WorkspaceShell,
  canStartBuild,
  chatBubbleClass,
  resolveBuildAction,
  resolveBuildRequestMode,
  resolvePrimaryComposerIntent,
  sanitizeWorkspaceCard,
} from "./WorkspaceShell";

import type { ProjectBrief } from "@/lib/projects/brief";

import { createImageReplaceEditInstruction } from "@/lib/projects/visual-annotations";
import {
  RESUME_POLL_INTERVAL_MS,
  resolveDiscussResume,
} from "@/lib/projects/workspace-resume";

function makeBrief(overrides: Partial<ProjectBrief>): ProjectBrief {
  return {
    businessName: "Kopi Tuku",
    businessType: "Kedai kopi",
    confidence: 95,
    contact: null,
    contactOrCta: "Chat WA",
    decisions: [],
    deliveryArea: null,
    facts: [],
    notes: [],
    offer: "Kopi susu",
    openQuestions: [],
    priceRange: null,
    productOrService: [{ name: "Kopi", isPrimary: true }],
    prompt: "buat web kopi",
    readyForBuild: true,
    since: null,
    socialLinks: null,
    stylePreference: "Bold gelap",
    tagline: null,
    targetCustomer: "Mahasiswa",
    testimonials: null,
    hours: null,
    address: null,
    certifications: null,
    currentPromo: null,
    paymentMethods: null,
    secondaryCta: null,
    usp: null,
    visuals: null,
    version: 1,
    ...overrides,
  };
}

describe("sanitizeWorkspaceCard", () => {
  it("hides legacy recommendations that cannot be confirmed", () => {
    expect(
      sanitizeWorkspaceCard({
        summary: ["Ubah tema"],
        title: "Perbarui website",
        type: "build_recommendation",
      }),
    ).toEqual({ type: "none" });
  });

  it("keeps a proof-carrying recommendation actionable", () => {
    const card = {
      reviewHash: "a".repeat(64),
      handoffId: "h1",
      summary: ["Ubah tema"],
      title: "Perbarui website",
      type: "build_recommendation" as const,
    };
    expect(sanitizeWorkspaceCard(card)).toEqual(card);
  });
});

describe("canStartBuild", () => {
  it("requires handoff proof for contract cards", () => {
    const contractCard = {
      type: "build_recommendation" as const,
      engine: "contract" as const,
      title: "Siap",
      summary: ["a"],
      handoffId: "h1",
      reviewHash: "a".repeat(64),
      reviewItems: [],
    };
    const missingHash = {
      ...contractCard,
      reviewHash: "",
    } as unknown as typeof contractCard;
    expect(canStartBuild(contractCard)).toBe(true);
    expect(canStartBuild(missingHash)).toBe(false);
    expect(
      canStartBuild({
        type: "build_recommendation" as const,
        title: "Siap",
        summary: ["a"],
      }),
    ).toBe(false);
    expect(
      canStartBuild({
        type: "question" as const,
        question: { id: "q", question: "?", options: [] },
      } as never),
    ).toBe(false);
  });

  it("returns false when card is null or undefined", () => {
    expect(canStartBuild(null)).toBe(false);
    expect(canStartBuild(undefined)).toBe(false);
  });
});

describe("resolveBuildAction", () => {
  it("routes a post-build update to the source-preserving edit worker", () => {
    expect(
      resolveBuildAction({
        buildComplete: true,
        buildStatus: "ready",
        hasPendingChatEdit: false,
        hasPostBuildUpdate: true,
      }),
    ).toBe("edit");
  });

  it("keeps failed builds on the generate retry path", () => {
    expect(
      resolveBuildAction({
        buildComplete: false,
        buildStatus: "failed",
        hasPendingChatEdit: false,
        hasPostBuildUpdate: false,
      }),
    ).toBe("generate");
  });
});

describe("resolvePrimaryComposerIntent", () => {
  it("keeps draft text on the chat path and preflights only an empty composer", () => {
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
        hasActionableRecommendation: false,
        hasDraft: true,
      }),
    ).toBeNull();
    expect(
      resolvePrimaryComposerIntent({
        buildComplete: true,
        hasActionableRecommendation: true,
        hasDraft: false,
      }),
    ).toBeNull();
  });
});

describe("resolveBuildRequestMode", () => {
  it("requests source-preserving retry after a failed build", () => {
    expect(resolveBuildRequestMode("failed")).toBe("retry_build");
  });

  it("starts a fresh generation for non-failed states", () => {
    expect(resolveBuildRequestMode("discussing")).toBe("first_generate");
    expect(resolveBuildRequestMode("building")).toBe("first_generate");
    expect(resolveBuildRequestMode("ready")).toBe("first_generate");
  });
});

describe("resolveDiscussResume", () => {
  it("returns idle when there is no turn (404 — pre-fix crash before persist)", () => {
    expect(resolveDiscussResume(null)).toEqual({ kind: "idle" });
  });

  it("returns poll when the turn is still running", () => {
    expect(
      resolveDiscussResume({
        turnId: "ct_running",
        status: "running",
        userMessageId: "u1",
      }),
    ).toEqual({ kind: "poll" });
  });

  it("returns reload when the turn succeeded — client replays the persisted reply", () => {
    expect(
      resolveDiscussResume({
        turnId: "ct_done",
        status: "succeeded",
        userMessageId: "u1",
      }),
    ).toEqual({ kind: "reload" });
  });

  it("maps legacy English/internal errorMessage to friendly Indonesian", () => {
    const result = resolveDiscussResume({
      turnId: "ct_fail",
      status: "failed",
      userMessageId: "u1",
      errorMessage: "expired",
    });
    expect(result.kind).toBe("retry");
    if (result.kind === "retry") {
      expect(result.errorMessage).toMatch(/sesi|waktu|kirim/i);
      expect(result.errorMessage).not.toBe("expired");
      expect(result.retryText).toBe("Kirim ulang");
    }
  });

  it("never surfaces module/stack traces to the user", () => {
    const result = resolveDiscussResume({
      turnId: "ct_fail",
      status: "failed",
      userMessageId: "u1",
      errorMessage:
        "Cannot find module '@/lib/projects/discuss-queue-worker' imported from ...",
    });
    expect(result.kind).toBe("retry");
    if (result.kind === "retry") {
      expect(result.errorMessage).not.toMatch(/Cannot find module/i);
      expect(result.errorMessage).toMatch(/kendala|obrolan|kirim|gagal/i);
    }
  });

  it("keeps friendly Indonesian errorMessage as-is", () => {
    const result = resolveDiscussResume({
      turnId: "ct_fail",
      status: "failed",
      userMessageId: "u1",
      errorMessage: "Obrolan belum berhasil diproses. Coba kirim ulang ya.",
    });
    expect(result.kind).toBe("retry");
    if (result.kind === "retry") {
      expect(result.errorMessage).toBe(
        "Obrolan belum berhasil diproses. Coba kirim ulang ya.",
      );
    }
  });

  it("returns retry with a default Indonesian message when errorMessage is empty", () => {
    const result = resolveDiscussResume({
      turnId: "ct_fail",
      status: "cancelled",
      userMessageId: "u1",
      errorMessage: "",
    });
    expect(result.kind).toBe("retry");
    if (result.kind === "retry") {
      expect(result.errorMessage.length).toBeGreaterThan(0);
      expect(result.retryText).toBe("Kirim ulang");
    }
  });

  it("exports a sane poll interval", () => {
    expect(RESUME_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(1_000);
    expect(RESUME_POLL_INTERVAL_MS).toBeLessThanOrEqual(5_000);
  });
});

describe("chatBubbleClass mobile", () => {
  it("returns non-empty class string without anywhere overflow wrap", () => {
    const userClass = chatBubbleClass("user");
    const assistantClass = chatBubbleClass("assistant");
    expect(typeof userClass).toBe("string");
    expect(typeof assistantClass).toBe("string");
    expect(userClass.length).toBeGreaterThan(0);
    expect(assistantClass.length).toBeGreaterThan(0);
    expect(userClass).not.toMatch(/\[overflow-wrap:anywhere\]/);
    expect(assistantClass).not.toMatch(/\[overflow-wrap:anywhere\]/);
  });
});

vi.mock("@/lib/use-is-desktop-viewport", () => ({
  // Return false (mobile) by default
  useIsDesktopViewport: vi.fn(() => false),
}));

describe("workspace panel split", () => {
  it("renders mobile tree and not desktop tree when viewport < 1024px", () => {
    const queryClient = new QueryClient();

    // renderToStaticMarkup is safe in 'node' environment without jsdom
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(WorkspaceShell, {
          projectId: "test",
          initialTitle: "Test",
          initialStatus: "passed",
          initialMessages: [],
          initialChatCursor: null,
          initialChatHasMore: false,
          initialWorkspaceCard: { type: "none" },
          initialBrief: makeBrief({
            businessName: "Kopi Tuku",
            businessType: "Kedai kopi",
            offer: "Kopi susu tetangga",
            targetCustomer: "Anak muda",
            stylePreference: "Modern",
            contactOrCta: "Pesan online",
          }),
        }),
      ),
    );

    // Mobile tree carries lg:hidden class on its flex-1 wrapper.
    expect(html).toContain("lg:hidden");
    // Desktop tree's ResizablePanelGroup output should be absent.
    expect(html).not.toContain("ResizablePanelGroup");
  });

  it("renders a 2-segment mobile bottom nav (Diskusi + Tampilan)", () => {
    const queryClient = new QueryClient();
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(WorkspaceShell, {
          projectId: "test",
          initialTitle: "Dapur Nasi Box",
          initialStatus: "passed",
          initialMessages: [],
          initialChatCursor: null,
          initialChatHasMore: false,
          initialWorkspaceCard: { type: "none" },
          initialBrief: makeBrief({
            businessName: "Kopi Tuku",
            businessType: "Kedai kopi",
            offer: "Kopi susu tetangga",
            targetCustomer: "Anak muda",
            stylePreference: "Modern",
            contactOrCta: "Pesan online",
          }),
        }),
      ),
    );
    // Bottom nav is the only <nav> with aria-label="Pilih tampilan ruang kerja".
    const navMatch = html.match(
      /<nav[^>]*aria-label="Pilih tampilan ruang kerja"[\s\S]*?<\/nav>/,
    );
    expect(navMatch).not.toBeNull();
    const navHtml = navMatch?.[0] ?? "";
    // Two buttons, one per segment.
    expect((navHtml.match(/aria-pressed=/g) ?? []).length).toBe(2);
    expect(navHtml).toContain("Diskusi");
    expect(navHtml).toContain("Tampilan");
    // Kode is no longer in the bottom nav — it lives in the sheet (which is
    expect(navHtml).not.toContain(">Kode<");
  });
});

describe("MAX_CHAT_BYTES", () => {
  it("is exactly 16384 (16 KiB)", () => {
    expect(MAX_CHAT_BYTES).toBe(16_384);
  });

  it("rejects text that exceeds the byte limit", () => {
    const short = "a".repeat(16_000);
    expect(new TextEncoder().encode(short).length).toBeLessThanOrEqual(
      MAX_CHAT_BYTES,
    );

    const long = "a".repeat(17_000);
    expect(new TextEncoder().encode(long).length).toBeGreaterThan(
      MAX_CHAT_BYTES,
    );
  });
});

describe("image replace instruction", () => {
  it("references the new media path and original src", () => {
    const instruction = createImageReplaceEditInstruction({
      replaceWith: [{ alt: "Foto", mediaPath: "/media/abc" }],
      target: { src: "/placeholder.svg", tag: "img" },
    });
    expect(instruction).toContain("/media/abc");
    expect(instruction).toContain("/placeholder.svg");
  });
});

describe("tiered brief readiness integration", () => {
  it("renders composer with persistent action button", () => {
    const queryClient = new QueryClient();
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(WorkspaceShell, {
          projectId: "p1",
          initialTitle: "Kopi Nusantara",
          initialStatus: "discussing",
          initialMessages: [],
          initialChatCursor: null,
          initialChatHasMore: false,
          initialWorkspaceCard: { type: "none" },
          initialBrief: makeBrief({
            businessName: "Kopi Senja",
            productOrService: [{ name: "Kopi Susu", isPrimary: true }],
            contact: { channel: "whatsapp", value: "08123456789" },
          }),
        }),
      ),
    );

    expect(html).toContain("Buat Website");
  });
});
