import { Outlet, createFileRoute } from "@tanstack/react-router";

import { MainChrome } from "@/components/common/MainChrome";

// Pathless layout route: wraps every page under it in MainChrome (header,
// footer, verification gate), matching the previous (main) route group layout.
export const Route = createFileRoute("/_main")({
  component: MainLayout,
});

function MainLayout() {
  return (
    <MainChrome>
      <Outlet />
    </MainChrome>
  );
}
