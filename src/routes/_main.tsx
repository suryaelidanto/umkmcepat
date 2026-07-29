import { Outlet, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { MainChrome } from "@/components/common/MainChrome";
import { checkRouteGates } from "@/server/loaders/check-route-gates";

const runRouteGates = createServerFn({ method: "GET" })
  .validator((d: { pathname: string }) => d)
  .handler(({ data: { pathname } }) => checkRouteGates(pathname));

export const Route = createFileRoute("/_main")({
  beforeLoad: async ({ location }) => {
    await runRouteGates({ data: { pathname: location.pathname } });
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
