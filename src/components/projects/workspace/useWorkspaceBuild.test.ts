import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useWorkspaceBuild } from "./useWorkspaceBuild";

function HookProbe(props: {
  onRender: (hook: ReturnType<typeof useWorkspaceBuild>) => void;
}) {
  const hook = useWorkspaceBuild({
    activeTab: "preview",
    initialStatus: "ready",
    projectId: "test-proj",
  });
  props.onRender(hook);
  return createElement("div", null, hook.buildStatus);
}

describe("useWorkspaceBuild", () => {
  it("initializes with initialStatus and empty progress", () => {
    const queryClient = new QueryClient();
    let captured: ReturnType<typeof useWorkspaceBuild> | null = null;

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

    expect(html).toContain("ready");
    expect(captured).not.toBeNull();
    expect(captured!.buildStatus).toBe("ready");
    expect(captured!.buildProgress).toEqual([]);
    expect(captured!.isCanceling).toBe(false);
    expect(captured!.isPublishing).toBe(false);
    expect(typeof captured!.cancelBuild).toBe("function");
    expect(typeof captured!.publishProject).toBe("function");
    expect(typeof captured!.recoverPreviewRuntime).toBe("function");
    expect(typeof captured!.loadRuntimeState).toBe("function");
  });
});
