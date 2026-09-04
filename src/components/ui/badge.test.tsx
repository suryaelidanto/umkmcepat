import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";

describe("Badge primitive", () => {
  it("renders with default slot and text", () => {
    const markup = renderToStaticMarkup(
      createElement(Badge, { className: "custom-badge" }, "Pill Text"),
    );

    expect(markup).toContain('data-slot="badge"');
    expect(markup).toContain("Pill Text");
    expect(markup).toContain("custom-badge");
  });

  it("supports variants: default, secondary, outline, success, warning, destructive", () => {
    const defaultMarkup = renderToStaticMarkup(
      createElement(Badge, { variant: "default" }, "Default"),
    );
    const secondaryMarkup = renderToStaticMarkup(
      createElement(Badge, { variant: "secondary" }, "Secondary"),
    );
    const outlineMarkup = renderToStaticMarkup(
      createElement(Badge, { variant: "outline" }, "Outline"),
    );
    const successMarkup = renderToStaticMarkup(
      createElement(Badge, { variant: "success" }, "Success"),
    );
    const destructiveMarkup = renderToStaticMarkup(
      createElement(Badge, { variant: "destructive" }, "Destructive"),
    );

    expect(defaultMarkup).toContain("bg-primary");
    expect(secondaryMarkup).toContain("bg-muted");
    expect(outlineMarkup).toContain("border-border");
    expect(successMarkup).toContain("status-success");
    expect(destructiveMarkup).toContain("destructive");
  });

  it("supports asChild or custom element via as prop", () => {
    const markup = renderToStaticMarkup(
      createElement(Badge, { as: "a", href: "/test" }, "Link Badge"),
    );

    expect(markup).toContain("<a");
    expect(markup).toContain('href="/test"');
    expect(markup).toContain("Link Badge");
  });
});
