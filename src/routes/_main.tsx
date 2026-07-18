import { Outlet, createFileRoute } from "@tanstack/react-router";

import { CHROME_KEYS, type ChromeSkin } from "@/components/common/chrome-skin";
import { MainChrome } from "@/components/common/MainChrome";

// Pathless layout route: wraps every page under it in MainChrome (header,
// footer, verification gate), matching the previous (main) route group layout.
// PROTOTYPE: optional ?variant=A|B|C|D|E skins header/menu/footer together.
export const Route = createFileRoute("/_main")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    variant?: ChromeSkin;
  } => {
    const raw = typeof search.variant === "string" ? search.variant : undefined;
    if (!raw || !CHROME_KEYS.has(raw)) {
      return {};
    }
    return { variant: raw as ChromeSkin };
  },
  component: MainLayout,
});

function MainLayout() {
  return (
    <MainChrome>
      <Outlet />
    </MainChrome>
  );
}
