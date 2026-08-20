import {
  useRouterState,
  useRouter as useTanstackRouter,
} from "@tanstack/react-router";

// Compatibility shims for the previous next/navigation client hooks.

export function usePathname(): string {
  try {
    // Prefer the resolved (committed) location over the in-flight target.
    return useRouterState({
      select: (state) =>
        state.resolvedLocation?.pathname ?? state.location.pathname,
    });
  } catch {
    return "/";
  }
}

export function useTargetPathname(): string {
  try {
    return useRouterState({ select: (state) => state.location.pathname });
  } catch {
    return "/";
  }
}

export function useIsRoutePending(): boolean {
  try {
    return useRouterState({
      select: (state) =>
        Boolean(
          state.isLoading ||
          state.isTransitioning ||
          (state.resolvedLocation &&
            state.resolvedLocation.pathname !== state.location.pathname),
        ),
    });
  } catch {
    return false;
  }
}

type PushReplaceOptions = { href: string };

type NavigationRouter = {
  navigate: (options: { replace?: boolean; to: string }) => Promise<void>;
};

export function navigateTo(
  router: NavigationRouter | null,
  href: string,
  replace = false,
): Promise<void> {
  if (!router) {
    return Promise.resolve();
  }

  return router.navigate(replace ? { replace: true, to: href } : { to: href });
}

// next/navigation's useRouter exposed push/replace taking a string href.
export function useRouter() {
  let router: ReturnType<typeof useTanstackRouter> | null = null;
  try {
    router = useTanstackRouter();
  } catch {
    router = null;
  }

  return {
    push: (href: string, _options?: PushReplaceOptions) => {
      return navigateTo(router, href);
    },
    replace: (href: string, _options?: PushReplaceOptions) => {
      return navigateTo(router, href, true);
    },
    refresh: () => {
      void router?.invalidate();
    },
    back: () => {
      router?.history.back();
    },
    forward: () => {
      router?.history.forward();
    },
  };
}
