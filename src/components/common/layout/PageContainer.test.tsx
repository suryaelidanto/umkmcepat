import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageContainer, SectionContainer } from "./PageContainer";

describe("PageContainer", () => {
  it("exports valid component functions", () => {
    expect(typeof PageContainer).toBe("function");
    expect(typeof SectionContainer).toBe("function");
  });

  it("renders children inside PageContainer", () => {
    const markup = renderToStaticMarkup(
      createElement(
        PageContainer,
        { size: "default" },
        createElement("span", null, "Hello Container"),
      ),
    );

    expect(markup).toContain("Hello Container");
    expect(markup.startsWith("<div")).toBe(true);
  });

  it("supports polymorphic element types", () => {
    const markup = renderToStaticMarkup(
      createElement(
        PageContainer,
        { as: "main", "data-testid": "main-container" },
        createElement("p", null, "Main content"),
      ),
    );

    expect(markup).toContain("Main content");
    expect(markup.startsWith("<main")).toBe(true);
    expect(markup).toContain('data-testid="main-container"');
  });

  it("renders SectionContainer with inner page container", () => {
    const markup = renderToStaticMarkup(
      createElement(
        SectionContainer,
        { id: "test-section", size: "sm" },
        createElement("h2", null, "Section Heading"),
      ),
    );

    expect(markup).toContain("Section Heading");
    expect(markup.startsWith("<section")).toBe(true);
    expect(markup).toContain('id="test-section"');
  });
});
