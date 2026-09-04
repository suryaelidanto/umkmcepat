import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useWorkspaceLayout } from "./useWorkspaceLayout";

function LayoutProbe(props: {
  onRender: (hook: ReturnType<typeof useWorkspaceLayout>) => void;
}) {
  const hook = useWorkspaceLayout({
    activeTab: "preview",
    hasInitialPreview: true,
  });
  props.onRender(hook);
  return null;
}

describe("useWorkspaceLayout", () => {
  it("initializes mobileSurface to preview when hasInitialPreview is true", () => {
    let captured!: ReturnType<typeof useWorkspaceLayout>;

    renderToStaticMarkup(
      createElement(LayoutProbe, {
        onRender: (h) => {
          captured = h;
        },
      }),
    );

    expect(captured.mobileSurface).toBe("preview");
    expect(captured.previewCollapsed).toBe(false);
  });
});
