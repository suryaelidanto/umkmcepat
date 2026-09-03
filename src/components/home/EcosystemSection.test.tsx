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
  it("renders the single sponsor chip and tech links", () => {
    const markup = render(0);

    expect(markup).toContain("Didukung oleh");
    expect(markup).toContain('href="https://zenhosta.com/"');
    expect(markup).toContain(
      "Dibangun &amp; dijalankan dengan teknologi terbuka",
    );
    for (const url of [
      "https://react.dev/",
      "https://tailwindcss.com/",
      "https://ui.shadcn.com/",
      "https://tanstack.com/",
      "https://vite.dev/",
      "https://www.cloudflare.com/",
      "https://www.postgresql.org/",
      "https://redis.io/",
      "https://www.docker.com/",
    ]) {
      expect(markup).toContain(`href="${url}"`);
    }

    expect(markup).not.toContain("status.umkmcepat.com");
    expect(markup).not.toContain("commit terbuka");
    expect(markup).not.toContain("github.com");
  });

  it("hides the published-sites stat below the minimum threshold", () => {
    const hidden = render(9);
    expect(hidden).not.toContain("website dibuat lewat");

    const shown = render(42);
    expect(shown).toContain("42 website dibuat lewat");
  });
});
