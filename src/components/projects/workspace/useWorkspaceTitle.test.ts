import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useWorkspaceTitle } from "./useWorkspaceTitle";

function TitleProbe(props: {
  onRender: (hook: ReturnType<typeof useWorkspaceTitle>) => void;
}) {
  const hook = useWorkspaceTitle({
    initialTitle: "Warung Kopi",
    projectId: "test-proj",
  });
  props.onRender(hook);
  return null;
}

describe("useWorkspaceTitle", () => {
  it("initializes projectTitle and draftTitle correctly", () => {
    let captured!: ReturnType<typeof useWorkspaceTitle>;
    const queryClient = new QueryClient();

    renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(TitleProbe, {
          onRender: (h) => {
            captured = h;
          },
        }),
      ),
    );

    expect(captured.projectTitle).toBe("Warung Kopi");
    expect(captured.draftTitle).toBe("Warung Kopi");
  });
});
