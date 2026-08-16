import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CommunitySection, reserveContributorHeight } from "./CommunitySection";

describe("CommunitySection loading layout", () => {
  it("keeps the contributor skeleton chart spacing aligned with loaded charts", () => {
    const markup = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(CommunitySection),
      ),
    );

    expect(markup).toContain(
      "mt-spacing-5 h-16 w-full animate-pulse rounded bg-white/10",
    );
  });

  it("keeps the measured skeleton height when loaded content is shorter", () => {
    expect(reserveContributorHeight(undefined, 453)).toBe(453);
    expect(reserveContributorHeight(453, 290)).toBe(453);
    expect(reserveContributorHeight(453, 468)).toBe(468);
  });
});
