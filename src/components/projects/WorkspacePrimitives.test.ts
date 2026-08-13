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
    expect(markup).toContain(
      "AI sedang menyiapkan file website dan tampilannya.",
    );
  });

  it("ignores the current build step in Diskusi mode", () => {
    const markup = renderToStaticMarkup(
      createElement(ProcessingControl, {
        currentStep: { detail: "src/routes/index.tsx", label: "Menulis file" },
        mode: "Diskusi" as const,
        onStop: vi.fn(),
      }),
    );

    expect(markup).toContain("AI sedang memproses...");
    expect(markup).not.toContain("Menulis file");
  });
});

describe("WorkspaceCardView action copy", () => {
  it("invites the owner to make the website", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceCardView, {
        card: {
          type: "build_recommendation",
          engine: "legacy-v1",
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

describe("PreviewIssueState restart button", () => {
  it("shows a restart button when onRestart is provided", () => {
    const markup = renderToStaticMarkup(
      createElement(PreviewIssueState, {
        detail: "Tampilan website belum bisa dimuat.",
        onRestart: vi.fn(),
        title: "Tampilan website belum bisa dimuat",
      }),
    );
    expect(markup).toContain("Mulai ulang tampilan");
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

  it("renders three named sections: Tampilan, Tampilan perangkat, Aksi", () => {
    const markup = renderMenu();
    expect(markup).toContain(">Tampilan<");
    expect(markup).toContain(">Tampilan perangkat<");
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

  it("hides the Tampilan perangkat section when activeTab is code", () => {
    const markup = renderMenu({ activeTab: "code" });
    expect(markup).not.toContain(">Tampilan perangkat<");
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
