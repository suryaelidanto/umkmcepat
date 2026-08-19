import { Outlet, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { MainChrome } from "@/components/common/MainChrome";
import { auth } from "@/lib/auth/auth";
import { SessionProvider } from "@/lib/auth/auth-client";
import { checkRouteGates } from "@/server/loaders/check-route-gates";

const runRouteGates = createServerFn({ method: "GET" })
  .validator((d: { pathname: string }) => d)
  .handler(({ data: { pathname } }) => checkRouteGates(pathname));

const loadSession = createServerFn({ method: "GET" }).handler(async () => {
  return auth();
});

export const Route = createFileRoute("/_main")({
  beforeLoad: async ({ location }) => {
    await runRouteGates({ data: { pathname: location.pathname } });
  },
  loader: async () => {
    const session =
      typeof window === "undefined" ? await loadSession() : undefined;
    return { session };
  },
  component: MainLayout,
});

function MainLayout() {
  const { session } = Route.useLoaderData();
  return (
    <SessionProvider session={session}>
      <MainChrome>
        <Outlet />
      </MainChrome>
    </SessionProvider>
  );
}
