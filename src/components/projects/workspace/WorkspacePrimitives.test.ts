import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  MobileMenuContent,
  PreviewIssueState,
  ProcessingControl,
  WorkspaceCardView,
  WorkspaceTopBar,
} from "./WorkspacePrimitives";

describe("WorkspaceTopBar mobile layout", () => {
  const baseProps = {
    activeTab: "preview" as const,
    setActiveTab: vi.fn(),
    viewport: "desktop" as const,
    setViewport: vi.fn(),
    chatCollapsed: false,
    openChatPanel: vi.fn(),
    closeChatPanel: vi.fn(),
    runtime: undefined,
    projectId: "test-project",
  };

  const render = () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(WorkspaceTopBar, baseProps),
      ),
    );
  };

  it("hides the Tampilan/Kode tab pill on mobile", () => {
    const markup = render();
    const tablistMatch = markup.match(
      /<div[^>]*role="tablist"[^>]*aria-label="Konten tampilan"[^>]*>/,
    );
    expect(tablistMatch).not.toBeNull();
    const className = tablistMatch?.[0] ?? "";
    expect(className).toMatch(/md:flex/);
    expect(className).toMatch(/hidden/);
  });

  it("shows the kebab menu button on mobile", () => {
    const markup = render();
    expect(markup).toMatch(/aria-label="Buka menu"/);
  });

  it("hides the Komputer/HP viewport picker on mobile", () => {
    const markup = render();
    const pickerMatch = markup.match(
      /<div[^>]*role="tablist"[^>]*aria-label="Tampilan viewport"[^>]*>/,
    );
    const className = pickerMatch?.[0] ?? "";
    expect(className).toMatch(/hidden/);
  });
});

describe("ProcessingControl copy", () => {
  it("names the current build step instead of the generic build copy", () => {
    const markup = renderToStaticMarkup(
      createElement(ProcessingControl, {
        currentStep: {
          detail: "src/routes/index.tsx — File dibuat atau ditimpa oleh agent.",
          label: "Menulis file",
        },
        mode: "Buat" as const,
        onStop: vi.fn(),
      }),
    );

    expect(markup).toContain("Menulis file");
    expect(markup).toContain("src/routes/index.tsx");
    expect(markup).not.toContain("Membuat website");
  });

  it("falls back to the generic build copy without a current step", () => {
    const markup = renderToStaticMarkup(
      createElement(ProcessingControl, {
        currentStep: null,
        mode: "Buat" as const,
        onStop: vi.fn(),
      }),
    );

    expect(markup).toContain("Membuat website");
    expect(markup).toContain("Website sedang disiapkan.");
  });

  it("supports granular discuss phases in Diskusi mode", () => {
    const markupStreaming = renderToStaticMarkup(
      createElement(ProcessingControl, {
        mode: "Diskusi" as const,
        discussPhase: "streaming",
        onStop: vi.fn(),
      }),
    );
    expect(markupStreaming).toContain("AI sedang menulis...");
    expect(markupStreaming).toContain("Teks sedang diketik di atas.");

    const markupCard = renderToStaticMarkup(
      createElement(ProcessingControl, {
        mode: "Diskusi" as const,
        discussPhase: "preparing_card",
        onStop: vi.fn(),
      }),
    );
    expect(markupCard).toContain("Menyiapkan pertanyaan...");
    expect(markupCard).toContain("Tunggu sebentar ya.");

    const markupOptions = renderToStaticMarkup(
      createElement(ProcessingControl, {
        mode: "Diskusi" as const,
        discussPhase: "preparing_options",
        onStop: vi.fn(),
      }),
    );
    expect(markupOptions).toContain("Menyiapkan pilihan...");
    expect(markupOptions).toContain("Menyiapkan opsi jawaban untukmu.");

    const markupRetryingResponse = renderToStaticMarkup(
      createElement(ProcessingControl, {
        mode: "Diskusi" as const,
        discussPhase: "retrying_response",
        onStop: vi.fn(),
      }),
    );
    expect(markupRetryingResponse).toContain("Menyempurnakan balasan...");
    expect(markupRetryingResponse).toContain(
      "Tunggu sebentar, AI sedang menyusun ulang.",
    );

    const markupRetryingCard = renderToStaticMarkup(
      createElement(ProcessingControl, {
        mode: "Diskusi" as const,
        discussPhase: "retrying_card",
        onStop: vi.fn(),
      }),
    );
    expect(markupRetryingCard).toContain("Menata ulang pilihan...");
    expect(markupRetryingCard).toContain("Sedang menyiapkan tombol pilihan.");
  });
});

describe("WorkspaceCardView action copy", () => {
  it("invites the owner to make the website", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceCardView, {
        card: {
          type: "build_recommendation",
          engine: "contract",
          title: "Siap dibuat",
          summary: ["Halaman utama"],
        },
        onBuild: vi.fn(),
        onDiscuss: vi.fn(),
      }),
    );

    expect(markup).toContain("Mulai buat website");
    expect(markup).not.toContain("Mulai build");
  });
});

describe("PreviewIssueState recovery actions", () => {
  it("renders one recovery action alongside the separate rebuild action", () => {
    const markup = renderToStaticMarkup(
      createElement(PreviewIssueState, {
        detail: "Tampilan website belum bisa dimuat.",
        onRecover: vi.fn(),
        onRebuild: vi.fn(),
        title: "Tampilan website belum bisa dimuat",
      }),
    );

    expect(markup.match(/Muat ulang tampilan/g)).toHaveLength(1);
    expect(markup).not.toContain("Mulai ulang tampilan");
    expect(markup.match(/Buat ulang website/g)).toHaveLength(1);
    expect(markup).not.toContain("Coba lagi");
  });
});

describe("WorkspaceTopBar direct edit actions", () => {
  const props = {
    activeTab: "preview" as const,
    setActiveTab: vi.fn(),
    viewport: "desktop" as const,
    setViewport: vi.fn(),
    chatCollapsed: false,
    openChatPanel: vi.fn(),
    closeChatPanel: vi.fn(),
    runtime: undefined,
    projectId: "test-project",
  };

  it("renders undo/redo/save/discard when direct edit is active", () => {
    const markup = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        {
          client: new QueryClient({
            defaultOptions: { queries: { retry: false } },
          }),
        },
        createElement(WorkspaceTopBar, {
          ...props,
          directEditActive: true,
          directEditActions: {
            canUndo: true,
            canRedo: false,
            onUndo: vi.fn(),
            onRedo: vi.fn(),
            onSave: vi.fn(),
            onDiscard: vi.fn(),
          },
        }),
      ),
    );
    expect(markup).toMatch(/aria-label="Undo"/);
    expect(markup).toMatch(/aria-label="Redo"/);
    expect(markup).toMatch(/Simpan/);
    expect(markup).toMatch(/Batalkan/);
  });
});

describe("MobileMenuContent", () => {
  const baseProps = {
    activeTab: "preview" as const,
    setActiveTab: vi.fn(),
    viewport: "desktop" as const,
    setViewport: vi.fn(),
    annotationAvailable: false,
    directEditActive: false,
    directEditFlagEnabled: true,
    hasPreview: true,
    onClose: vi.fn(),
  };

  const renderMenu = (overrides: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        {
          client: new QueryClient({
            defaultOptions: { queries: { retry: false } },
          }),
        },
        createElement(MobileMenuContent, {
          ...baseProps,
          ...overrides,
          projectId: "test-project",
        }),
      ),
    );

  it("renders named sections: Tampilan, Aksi", () => {
    const markup = renderMenu();
    expect(markup).toContain(">Navigasi Tampilan<");
    expect(markup).toContain(">Aksi<");
  });

  it("renders the Kode sub-control button inside the sheet", () => {
    const markup = renderMenu();
    // Kode tab is the second child of the Tampilan sub-control.
    expect(markup).toContain(">Kode<");
    expect(markup).toMatch(
      /role="tab"[^>]*aria-selected="false"[^>]*>[\s\S]*?Kode</,
    );
  });

  it("hides the Ubah row when directEditFlagEnabled is false", () => {
    const markup = renderMenu({
      annotationAvailable: true,
      directEditFlagEnabled: false,
    });
    expect(markup).not.toContain(">Ubah<");
    expect(markup).not.toContain("Aktifkan ubah");
  });
});
