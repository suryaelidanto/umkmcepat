import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Footer } from "./Footer";

describe("Footer", () => {
  it("renders brand name, navigation links, and copyright", () => {
    const markup = renderToStaticMarkup(createElement(Footer));

    expect(markup).toContain("UMKM Cepat");
    expect(markup).toContain('href="/sponsor"');
    expect(markup).toContain('href="/terms"');
    expect(markup).toContain('href="/privacy"');
    expect(markup).toContain('href="/support"');
    expect(markup).toContain('href="/#buat"');
    expect(markup).toContain('href="/#cara-kerja"');
    expect(markup).toContain('href="/#faq"');
    expect(markup).toContain(new Date().getFullYear().toString());
  });
});
