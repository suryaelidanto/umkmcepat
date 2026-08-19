import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  CompletedBuildNotice,
  HeldBuildRecommendationNotice,
} from "./BuildNotices";

describe("build notice copy", () => {
  it("uses friendly website language for a held recommendation", () => {
    const markup = renderToStaticMarkup(
      createElement(HeldBuildRecommendationNotice, {
        canBuild: true,
        onBuild: vi.fn(),
        onOpen: vi.fn(),
      }),
    );

    expect(markup).toContain("Rancangan website disimpan");
    expect(markup).toContain("Mulai buat website");
    expect(markup).not.toContain("Mulai build");
  });

  it("uses friendly website language for a successful result", () => {
    const markup = renderToStaticMarkup(
      createElement(CompletedBuildNotice, {
        onDiscuss: vi.fn(),
        onPreview: vi.fn(),
      }),
    );

    expect(markup).toContain("Website siap dilihat");
    expect(markup).toContain("Lihat website");
    expect(markup).not.toContain("Build terbaru");
  });
});
