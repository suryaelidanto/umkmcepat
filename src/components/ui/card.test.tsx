import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

describe("Card primitive", () => {
  it("renders with default slot and container structure", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Card,
        { className: "test-custom" },
        createElement(
          CardHeader,
          null,
          createElement(CardTitle, null, "Card Title"),
        ),
        createElement(CardContent, null, "Card Body"),
        createElement(CardFooter, null, "Card Footer"),
      ),
    );

    expect(markup).toContain('data-slot="card"');
    expect(markup).toContain('data-slot="card-header"');
    expect(markup).toContain('data-slot="card-title"');
    expect(markup).toContain('data-slot="card-content"');
    expect(markup).toContain('data-slot="card-footer"');
    expect(markup).toContain("Card Title");
    expect(markup).toContain("Card Body");
    expect(markup).toContain("Card Footer");
  });

  it("supports variants: default, muted, outline, and interactive", () => {
    const defaultMarkup = renderToStaticMarkup(
      createElement(Card, { variant: "default" }, "Default"),
    );
    const mutedMarkup = renderToStaticMarkup(
      createElement(Card, { variant: "muted" }, "Muted"),
    );
    const outlineMarkup = renderToStaticMarkup(
      createElement(Card, { variant: "outline" }, "Outline"),
    );
    const interactiveMarkup = renderToStaticMarkup(
      createElement(Card, { interactive: true }, "Interactive"),
    );

    expect(defaultMarkup).toContain("bg-card");
    expect(mutedMarkup).toContain("bg-muted");
    expect(outlineMarkup).toContain("bg-transparent");
    expect(interactiveMarkup).toContain('data-interactive="true"');
  });

  it("renders CardAction and CardDescription correctly", () => {
    const markup = renderToStaticMarkup(
      createElement(
        CardHeader,
        null,
        createElement(CardTitle, null, "Title"),
        createElement(CardDescription, null, "Description"),
        createElement(
          CardAction,
          null,
          createElement("button", null, "Action"),
        ),
      ),
    );

    expect(markup).toContain('data-slot="card-description"');
    expect(markup).toContain('data-slot="card-action"');
    expect(markup).toContain("Description");
    expect(markup).toContain("Action");
  });
});
