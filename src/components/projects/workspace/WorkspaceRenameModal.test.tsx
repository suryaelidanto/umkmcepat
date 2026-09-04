import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceRenameContent } from "./WorkspaceRenameModal";

import { Dialog } from "@/components/ui/dialog";

describe("WorkspaceRenameModal", () => {
  it("renders rename dialog content cleanly", () => {
    const html = renderToStaticMarkup(
      createElement(
        Dialog,
        { open: true },
        createElement(WorkspaceRenameContent, {
          draftTitle: "Toko Roti Makmur",
          onOpenChange: vi.fn(),
          onSave: vi.fn(),
          setDraftTitle: vi.fn(),
        }),
      ),
    );

    expect(html).toContain("Ubah nama website");
    expect(html).toContain("Toko Roti Makmur");
  });
});
