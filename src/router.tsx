import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

import { getNonce } from "@/lib/csp-nonce";

export function getRouter() {
  const nonce = getNonce();

  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    // Keep previous page painted until the next route is ready so
    // project ↔ home navigations don't flash a blank main content area.
    defaultPendingMs: 200,
    defaultPendingMinMs: 0,
    ...(nonce ? { ssr: { nonce } } : {}),
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
