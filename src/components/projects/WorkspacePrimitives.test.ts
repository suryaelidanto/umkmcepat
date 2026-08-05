import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  PreviewIssueState,
  ProcessingControl,
  WorkspaceTopBar,
} from "./WorkspacePrimitives";
import { DirectEditToolbar } from "./WorkspacePrimitives";

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

    expect(markup).toContain("Menyusun jawaban");
    expect(markup).not.toContain("Menulis file");
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

describe("DirectEditToolbar", () => {
  it("renders undo/redo/save/discard actions", () => {
    const markup = renderToStaticMarkup(
      createElement(DirectEditToolbar, {
        canUndo: true,
        canRedo: false,
        onUndo: vi.fn(),
        onRedo: vi.fn(),
        onSave: vi.fn(),
        onDiscard: vi.fn(),
      }),
    );
    expect(markup).toMatch(/aria-label="Undo"/);
    expect(markup).toMatch(/aria-label="Redo"/);
    expect(markup).toMatch(/Simpan/);
    expect(markup).toMatch(/Batalkan/);
  });
});
