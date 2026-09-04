import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useWorkspaceAnnotations } from "./useWorkspaceAnnotations";

function HookProbe(props: {
  onRender: (hook: ReturnType<typeof useWorkspaceAnnotations>) => void;
}) {
  const hook = useWorkspaceAnnotations({
    isProcessing: false,
    projectId: "test-proj",
    readOnly: false,
  });
  props.onRender(hook);
  return createElement(
    "div",
    { "data-testid": "probe" },
    `${hook.annotations.length}`,
  );
}

describe("useWorkspaceAnnotations", () => {
  it("initializes cleanly in SSR / static render", () => {
    let captured: ReturnType<typeof useWorkspaceAnnotations> | null = null;
    const html = renderToStaticMarkup(
      createElement(HookProbe, {
        onRender: (h) => {
          captured = h;
        },
      }),
    );

    expect(html).toContain("0");
    expect(captured).not.toBeNull();
    expect(captured!.annotations).toEqual([]);
    expect(captured!.pendingAnnotationTarget).toBeNull();
    expect(captured!.annotationInstruction).toBe("");
    expect(typeof captured!.handleAnnotationTarget).toBe("function");
    expect(typeof captured!.addPendingAnnotation).toBe("function");
    expect(typeof captured!.removeAnnotation).toBe("function");
    expect(typeof captured!.sendVisualAnnotations).toBe("function");
  });
});
