import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useWorkspaceDirectEdit } from "./useWorkspaceDirectEdit";

import type { WorkspaceCard } from "@/lib/projects/brief";

function HookProbe(props: {
  onRender: (hook: ReturnType<typeof useWorkspaceDirectEdit>) => void;
}) {
  const cardRef = useRef<WorkspaceCard>({ type: "none" });
  const hook = useWorkspaceDirectEdit({
    directEditFlagEnabled: true,
    isProcessing: false,
    onAnnotationTarget: () => {},
    projectId: "test-proj",
    readOnly: false,
    workspaceCardRef: cardRef,
  });
  props.onRender(hook);
  return createElement("div", null, String(hook.effectiveDirectEditMode));
}

describe("useWorkspaceDirectEdit", () => {
  it("initializes cleanly in static SSR render", () => {
    const queryClient = new QueryClient();
    let captured: ReturnType<typeof useWorkspaceDirectEdit> | null = null;

    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(HookProbe, {
          onRender: (h) => {
            captured = h;
          },
        }),
      ),
    );

    expect(html).toContain("false");
    expect(captured).not.toBeNull();
    expect(captured!.directEditMode).toBe(false);
    expect(captured!.effectiveDirectEditMode).toBe(false);
    expect(typeof captured!.toggleDirectEdit).toBe("function");
    expect(typeof captured!.handleUndo).toBe("function");
    expect(typeof captured!.handleRedo).toBe("function");
    expect(typeof captured!.handleDiscard).toBe("function");
  });
});
