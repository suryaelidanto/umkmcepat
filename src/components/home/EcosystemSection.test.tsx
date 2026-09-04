import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EcosystemSection } from "./EcosystemSection";

function render(publishedSiteCount: number) {
  return renderToStaticMarkup(
    createElement(EcosystemSection, { publishedSiteCount }),
  );
}

describe("EcosystemSection", () => {
  it("renders the sponsor chip and become-sponsor link", () => {
    const markup = render(0);

    expect(markup).toContain("Didukung oleh");
    expect(markup).toContain('href="https://zenhosta.com/"');
    expect(markup).toContain('href="/sponsor"');
    expect(markup).toContain("Zenhosta");
    expect(markup).toContain("Menjadi Sponsor");
  });

  it("hides the published-sites stat below the minimum threshold", () => {
    const hidden = render(9);
    expect(hidden).not.toContain("website dibuat lewat");

    const shown = render(42);
    expect(shown).toContain("42 website dibuat lewat");
  });
});
