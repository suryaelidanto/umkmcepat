import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceNavigation } from "./WorkspaceNavigation";

describe("WorkspaceNavigation", () => {
  it("renders a 2-segment mobile bottom nav (Diskusi + Tampilan) when preview is available", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceNavigation, {
        hasPreview: true,
        mobileSurface: "chat",
        onOpenChat: vi.fn(),
        onOpenMenu: vi.fn(),
        onOpenPreview: vi.fn(),
        onOpenRename: vi.fn(),
        projectTitle: "Kopi Nusantara",
      }),
    );

    const navMatch = html.match(
      /<nav[^>]*aria-label="Pilih tampilan ruang kerja"[\s\S]*?<\/nav>/,
    );
    expect(navMatch).not.toBeNull();
    const navHtml = navMatch?.[0] ?? "";
    expect((navHtml.match(/aria-pressed=/g) ?? []).length).toBe(2);
    expect(navHtml).toContain("Diskusi");
    expect(navHtml).toContain("Tampilan");
    expect(navHtml).not.toContain(">Kode<");
  });

  it("renders project title when preview is not available", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceNavigation, {
        hasPreview: false,
        mobileSurface: "chat",
        onOpenChat: vi.fn(),
        onOpenMenu: vi.fn(),
        onOpenPreview: vi.fn(),
        onOpenRename: vi.fn(),
        projectTitle: "Kopi Nusantara",
      }),
    );

    expect(html).toContain("Kopi Nusantara");
  });
});
