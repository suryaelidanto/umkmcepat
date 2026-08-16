import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

import { getNonce } from "@/lib/csp-nonce";

export function createInitialScrollRestorationPolicy() {
  let hasRenderedInitialLocation = false;

  return () => {
    if (hasRenderedInitialLocation) {
      return true;
    }

    hasRenderedInitialLocation = true;
    return false;
  };
}

export function getRouter() {
  const nonce = getNonce();
  const shouldRestoreScroll = createInitialScrollRestorationPolicy();

  const router = createRouter({
    routeTree,
    scrollRestoration: () => shouldRestoreScroll(),
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
