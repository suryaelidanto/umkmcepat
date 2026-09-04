import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/auth-client", () => ({
  useSession: () => ({ data: { user: { id: "u1" } }, status: "authenticated" }),
}));

vi.mock("@/lib/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/config/use-feature-flag", () => ({
  useFeatureFlag: () => true,
}));

vi.mock("@/lib/projects/use-project-limit", () => ({
  useProjectLimit: () => ({
    isAtLimit: false,
    projectCount: 1,
    projectLimit: 3,
    remaining: 2,
  }),
}));

import { HomePromptForm } from "./HomePromptForm";

describe("HomePromptForm", () => {
  it("renders textarea input with placeholder and submit button", () => {
    const queryClient = new QueryClient();
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(HomePromptForm),
      ),
    );

    expect(html).toContain("textarea");
    expect(html).toContain("button");
  });
});
