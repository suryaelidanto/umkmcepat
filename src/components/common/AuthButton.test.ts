import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const sessionState = vi.hoisted(() => ({
  data: null,
  status: "loading" as "loading" | "unauthenticated",
}));

vi.mock("@/lib/auth-client", () => ({
  signOut: vi.fn(),
  useSession: () => sessionState,
}));
vi.mock("@/lib/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined }),
}));
vi.mock("@/components/admin/streamer-mode-context", () => ({
  useStreamerMode: () => false,
}));
vi.mock("@/components/common/LoginConsentDialog", () => ({
  LoginConsentDialog: () => null,
}));
vi.mock("@/components/payment/EnergyBoosterModal", () => ({
  EnergyBoosterModal: () => null,
}));

import { AuthButton } from "./AuthButton";

describe("AuthButton", () => {
  function renderAuthButton() {
    return renderToStaticMarkup(createElement(AuthButton));
  }

  it("renders an accessible disabled skeleton while auth hydrates", () => {
    const markup = renderAuthButton();

    expect(markup).toMatch(/<button[^>]*disabled/);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('aria-label="Memuat akses masuk"');
    expect(markup).toContain("animate-pulse");
    expect(markup).toContain("min-w-[4.75rem]");
    expect(markup).not.toMatch(/>Masuk<\/button>/);
  });

  it("keeps the login control in loading state before client hydration", () => {
    sessionState.status = "unauthenticated";

    const markup = renderAuthButton();

    expect(markup).toMatch(/<button[^>]*disabled/);
    expect(markup).toContain('aria-label="Memuat akses masuk"');
    expect(markup).toContain("animate-pulse");
  });
});
