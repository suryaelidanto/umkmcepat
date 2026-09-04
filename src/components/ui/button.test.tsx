import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button primitive", () => {
  it("renders with default slot, type, and text", () => {
    const markup = renderToStaticMarkup(
      createElement(Button, { className: "custom-btn" }, "Click Me"),
    );

    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain("Click Me");
    expect(markup).toContain("custom-btn");
  });

  it("supports all core variants with semantic classes", () => {
    const defaultBtn = renderToStaticMarkup(
      createElement(Button, { variant: "default" }, "Default"),
    );
    const outlineBtn = renderToStaticMarkup(
      createElement(Button, { variant: "outline" }, "Outline"),
    );
    const secondaryBtn = renderToStaticMarkup(
      createElement(Button, { variant: "secondary" }, "Secondary"),
    );
    const ghostBtn = renderToStaticMarkup(
      createElement(Button, { variant: "ghost" }, "Ghost"),
    );
    const destructiveBtn = renderToStaticMarkup(
      createElement(Button, { variant: "destructive" }, "Destructive"),
    );

    expect(defaultBtn).toContain("bg-primary");
    expect(outlineBtn).toContain("border-border");
    expect(secondaryBtn).toContain("bg-secondary");
    expect(ghostBtn).toContain("hover:bg-muted");
    expect(destructiveBtn).toContain("bg-destructive");
  });

  it("supports asChild rendering for Link wrappers", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Button,
        { asChild: true },
        createElement("a", { href: "/test" }, "Link Button"),
      ),
    );

    expect(markup).toContain("<a");
    expect(markup).toContain('href="/test"');
    expect(markup).toContain("Link Button");
  });
});
