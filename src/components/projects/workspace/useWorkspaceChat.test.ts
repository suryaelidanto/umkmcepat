import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { useWorkspaceChat } from "./useWorkspaceChat";

function HookProbe(props: {
  onRender: (hook: ReturnType<typeof useWorkspaceChat>) => void;
}) {
  const hook = useWorkspaceChat({
    authStatus: "authenticated",
    buildComplete: false,
    buildStatus: "ready",
    composerUploadsEnabled: true,
    initialChatCursor: null,
    initialChatHasMore: false,
    initialMessages: [],
    initialWorkspaceCard: { type: "none" },
    isBuilding: false,
    isEditingPreview: false,
    latestBrief: null,
    mode: "discuss",
    postBuildChatOpen: false,
    projectId: "test-proj",
    sessionExpired: false,
    setBuildProgress: vi.fn(),
    setDraftTitle: vi.fn(),
    setLatestBrief: vi.fn(),
    setMode: vi.fn(),
    setPostBuildChatOpen: vi.fn(),
    setProjectTitle: vi.fn(),
    startBuild: vi.fn(),
    submitDirectEdit: vi.fn(),
  });
  props.onRender(hook);
  return createElement("div", null, hook.composerState);
}

describe("useWorkspaceChat", () => {
  it("initializes cleanly in static SSR render", () => {
    let captured: ReturnType<typeof useWorkspaceChat> | null = null;

    const html = renderToStaticMarkup(
      createElement(HookProbe, {
        onRender: (h) => {
          captured = h;
        },
      }),
    );

    expect(html).toContain("free");
    expect(captured).not.toBeNull();
    expect(captured!.messages).toEqual([]);
    expect(captured!.message).toBe("");
    expect(captured!.isSubmittingTurn).toBe(false);
    expect(captured!.hasMoreChat).toBe(false);
    expect(typeof captured!.submitChatText).toBe("function");
    expect(typeof captured!.retryChat).toBe("function");
  });
});
