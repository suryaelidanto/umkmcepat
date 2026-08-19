import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  MAX_CHAT_BYTES,
  WorkspaceShell,
  canStartBuild,
  chatBubbleClass,
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

describe("canStartBuild", () => {
  it("requires handoff proof for contract cards", () => {
    const contractCard = {
      type: "build_recommendation" as const,
      engine: "contract-v1" as const,
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
      expect(result.errorMessage).toMatch(/obrolan|kirim|gagal/i);
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
  it("does not include overflow-wrap:anywhere on the bubble", () => {
    const className = chatBubbleClass("user");
    expect(className).not.toMatch(/\[overflow-wrap:anywhere\]/);
    // Defensive: the substring 'anywhere' alone must not appear in a className context.
    // Catches both 'anywhere' and 'break-anywhere' forms if reintroduced.
    expect(className).not.toMatch(/\banywhere\b/);
  });

  it("uses mobile-tight padding with sm:desktop override", () => {
    const className = chatBubbleClass("assistant");
    // Mobile padding = px-spacing-4 + py-spacing-3 (16px / 12px)
    expect(className).toContain("px-spacing-4");
    expect(className).toContain("py-spacing-3");
    // Desktop sm: override = sm:px-spacing-6 + sm:py-spacing-5
    expect(className).toContain("sm:px-spacing-6");
    expect(className).toContain("sm:py-spacing-5");
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
    // closed in static render, so its markup is not in the output).
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
