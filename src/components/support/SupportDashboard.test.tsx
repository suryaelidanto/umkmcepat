import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => null,
  useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
  useRouterState: () => ({ pathname: "/support" }),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useQuery: () => ({
      data: { tickets: [] },
      isLoading: false,
    }),
    useMutation: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
  };
});

import { SupportDashboard } from "./SupportDashboard";

describe("SupportDashboard", () => {
  it("renders support center heading and empty tickets state cleanly", () => {
    const queryClient = new QueryClient();
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(SupportDashboard),
      ),
    );

    expect(html).toContain("Pusat Bantuan");
    expect(html).toContain("Buat Tiket");
    expect(html).toContain("Belum ada tiket bantuan yang dibuat.");
  });
});
