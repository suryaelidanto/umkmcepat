import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CommunitySection } from "./CommunitySection";

describe("CommunitySection", () => {
  it("renders the FAQ list and questions", () => {
    const markup = renderToStaticMarkup(createElement(CommunitySection));

    expect(markup).toContain("Pertanyaan yang sering muncul");
    expect(markup).toContain("Apakah UMKM Cepat benar-benar gratis?");
    expect(markup).toContain("Bagaimana agar hasilnya maksimal?");
  });
});
