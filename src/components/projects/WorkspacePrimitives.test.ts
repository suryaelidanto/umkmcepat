import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceTopBar } from "./WorkspacePrimitives";

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
